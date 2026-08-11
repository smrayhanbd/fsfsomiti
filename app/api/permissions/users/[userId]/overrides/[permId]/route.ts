import prisma from "@/lib/prisma"
import { ok, bad, requirePermissionsAdmin, writeRbacAudit, AUDIT } from "@/lib/permissions/api"

export const dynamic = "force-dynamic"

// ── DELETE /api/permissions/users/[userId]/overrides/[permId] ────────────
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string; permId: string }> }
) {
  const auth = await requirePermissionsAdmin()
  if (auth instanceof Response) return auth
  const { userId, permId } = await params

  const deleted = await prisma.userPermissionOverride
    .delete({ where: { userId_permissionId: { userId, permissionId: permId } } })
    .catch(() => null)
  if (!deleted) return bad("Override not found for this user/permission.", 404)

  await writeRbacAudit({
    actorId: auth.id,
    targetUserId: userId,
    action: AUDIT.OVERRIDE_REMOVED,
    details: { permissionId: permId },
  })
  return ok({ removed: true })
}
