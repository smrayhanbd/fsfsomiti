import prisma from "@/lib/prisma"
import { ok, bad, requirePermissionsAdmin, writeRbacAudit, AUDIT } from "@/lib/permissions/api"
import { z } from "zod"

export const dynamic = "force-dynamic"

const AssignRoleSchema = z.object({ roleId: z.string().min(1) })

// ── POST /api/permissions/users/[userId]/roles → assign a role ───────────
export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requirePermissionsAdmin()
  if (auth instanceof Response) return auth
  const { userId } = await params

  const body = await request.json().catch(() => null)
  const parsed = AssignRoleSchema.safeParse(body)
  if (!parsed.success) return bad("Expected { roleId: string }.")

  const [user, role] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    prisma.role.findUnique({ where: { id: parsed.data.roleId }, select: { id: true, name: true } }),
  ])
  if (!user) return bad("User not found.", 404)
  if (!role) return bad("Role not found.", 404)

  const userRole = await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id, assignedBy: auth.id },
  })
  await writeRbacAudit({
    actorId: auth.id,
    targetUserId: userId,
    targetRoleId: role.id,
    action: AUDIT.ROLE_ASSIGNED,
    details: { roleName: role.name },
  })
  return ok(userRole, 201)
}
