import prisma from "@/lib/prisma"
import {
  ok,
  bad,
  requirePermissionsAdmin,
  enforceRoleAssignmentGuards,
  writeRbacAudit,
  AUDIT,
} from "@/lib/permissions/api"
import { clearPermissionResolverCache } from "@/lib/permissions/resolver"
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

  // ── Anti-privilege-escalation guards ──────────────────────────────────
  // 1. No self-targeting
  // 2. No touching super-admin users
  // 3. No assigning super-admin roles
  // 4. Privilege ceiling — role's perms must be subset of actor's
  const guard = await enforceRoleAssignmentGuards(auth, userId, parsed.data.roleId)
  if (guard instanceof Response) {
    // Log the blocked attempt for security audit.
    await writeRbacAudit({
      actorId: auth.id,
      targetUserId: userId,
      targetRoleId: parsed.data.roleId,
      action: AUDIT.PRIVILEGE_ESCALATION_BLOCKED,
      details: { reason: "Role assignment guard blocked the operation." },
    }).catch(() => undefined)
    return guard
  }

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
  clearPermissionResolverCache()
  await writeRbacAudit({
    actorId: auth.id,
    targetUserId: userId,
    targetRoleId: role.id,
    action: AUDIT.ROLE_ASSIGNED,
    details: { roleName: role.name },
  })
  return ok(userRole, 201)
}
