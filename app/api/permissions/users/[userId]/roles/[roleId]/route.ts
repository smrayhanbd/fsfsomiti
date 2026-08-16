import prisma from "@/lib/prisma"
import {
  ok,
  bad,
  requirePermissionsAdmin,
  preventSelfTarget,
  preventSuperAdminTarget,
  preventSuperAdminRole,
  writeRbacAudit,
  AUDIT,
} from "@/lib/permissions/api"

export const dynamic = "force-dynamic"

// ── DELETE /api/permissions/users/[userId]/roles/[roleId] → revoke role ───
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string; roleId: string }> }
) {
  const auth = await requirePermissionsAdmin()
  if (auth instanceof Response) return auth
  const { userId, roleId } = await params

  // ── Anti-privilege-escalation guards ──────────────────────────────────
  // 1. No self-targeting — prevents a user from removing their own roles.
  const selfCheck = preventSelfTarget(auth, userId)
  if (selfCheck) {
    await writeRbacAudit({
      actorId: auth.id,
      targetUserId: userId,
      targetRoleId: roleId,
      action: AUDIT.PRIVILEGE_ESCALATION_BLOCKED,
      details: { reason: "Self-target role revocation blocked." },
    }).catch(() => undefined)
    return selfCheck
  }
  // 2. No touching super-admin users.
  const targetCheck = await preventSuperAdminTarget(auth, userId)
  if (targetCheck) {
    await writeRbacAudit({
      actorId: auth.id,
      targetUserId: userId,
      targetRoleId: roleId,
      action: AUDIT.PRIVILEGE_ESCALATION_BLOCKED,
      details: { reason: "Super-admin target role revocation blocked." },
    }).catch(() => undefined)
    return targetCheck
  }
  // 3. No touching super-admin roles.
  const roleCheck = await preventSuperAdminRole(auth, roleId)
  if (roleCheck) {
    await writeRbacAudit({
      actorId: auth.id,
      targetUserId: userId,
      targetRoleId: roleId,
      action: AUDIT.PRIVILEGE_ESCALATION_BLOCKED,
      details: { reason: "Super-admin role revocation blocked." },
    }).catch(() => undefined)
    return roleCheck
  }

  // Guardrail: never strip the last super-admin link from the bootstrap admin
  // — would lock everyone out of the permissions API.
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true, name: true, isSuperAdmin: true } })
  if (role?.isSuperAdmin) {
    const superRoleHolders = await prisma.userRole.count({ where: { roleId } })
    if (superRoleHolders <= 1) {
      return bad("Cannot remove the last Super Admin — at least one must remain.", 422)
    }
  }

  const deleted = await prisma.userRole.delete({
    where: { userId_roleId: { userId, roleId } },
  }).catch(() => null)

  if (!deleted) return bad("This role is not assigned to that user.", 404)

  await writeRbacAudit({
    actorId: auth.id,
    targetUserId: userId,
    targetRoleId: roleId,
    action: AUDIT.ROLE_REVOKED,
    details: { roleName: role?.name },
  })
  return ok({ revoked: true })
}
