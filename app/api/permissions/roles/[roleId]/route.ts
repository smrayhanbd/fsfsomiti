import prisma from "@/lib/prisma"
import { ok, bad, requirePermissionsAdmin, writeRbacAudit, AUDIT } from "@/lib/permissions/api"
import { z } from "zod"

export const dynamic = "force-dynamic"

const UpdateRoleSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  description: z.string().max(500).optional().nullable(),
})

// ── PATCH /api/permissions/roles/[roleId] → rename / update description ──
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const auth = await requirePermissionsAdmin()
  if (auth instanceof Response) return auth
  const { roleId } = await params

  const role = await prisma.role.findUnique({ where: { id: roleId } })
  if (!role) return bad("Role not found.", 404)

  const body = await request.json().catch(() => null)
  const parsed = UpdateRoleSchema.safeParse(body)
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return bad("Nothing to update.")
  }

  // System roles cannot be renamed (they're referenced by name); description
  // edits are allowed so the help text can be refined.
  if (role.isSystem && parsed.data.name && parsed.data.name !== role.name) {
    return bad("System role names cannot be changed.", 422)
  }

  // Unique-name guard if renaming.
  if (parsed.data.name && parsed.data.name !== role.name) {
    const clash = await prisma.role.findUnique({ where: { name: parsed.data.name } })
    if (clash) return bad(`A role named "${parsed.data.name}" already exists.`, 409)
  }

  const updated = await prisma.role.update({
    where: { id: roleId },
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
    },
  })
  await writeRbacAudit({
    actorId: auth.id,
    targetRoleId: roleId,
    action: AUDIT.ROLE_UPDATED,
    details: { before: { name: role.name, description: role.description }, after: parsed.data },
  })
  return ok(updated)
}

// ── DELETE /api/permissions/roles/[roleId] → delete a non-system role ─────
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const auth = await requirePermissionsAdmin()
  if (auth instanceof Response) return auth
  const { roleId } = await params

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { _count: { select: { users: true } } },
  })
  if (!role) return bad("Role not found.", 404)
  if (role.isSystem) return bad("System roles cannot be deleted.", 422)
  if (role._count.users > 0) {
    return bad(`Cannot delete: ${role._count.users} user(s) still have this role. Remove it from them first.`, 409)
  }

  await prisma.role.delete({ where: { id: roleId } })
  await writeRbacAudit({
    actorId: auth.id,
    targetRoleId: roleId,
    action: AUDIT.ROLE_DELETED,
    details: { name: role.name },
  })
  return ok({ deleted: true })
}
