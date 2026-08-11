import prisma from "@/lib/prisma"
import { ok, bad, requirePermissionsAdmin } from "@/lib/permissions/api"

export const dynamic = "force-dynamic"

// ── GET /api/permissions/users/[userId] → roles + overrides for a user ────
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requirePermissionsAdmin()
  if (auth instanceof Response) return auth
  const { userId } = await params

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true, // legacy flat string
      roles: {
        select: {
          role: {
            select: { id: true, name: true, description: true, isSystem: true, isSuperAdmin: true },
          },
          assignedAt: true,
        },
      },
      permOverrides: {
        select: {
          id: true,
          effect: true,
          reason: true,
          permission: { select: { id: true, menuGroup: true, page: true, tab: true, action: true } },
        },
      },
    },
  })
  if (!user) return bad("User not found.", 404)

  return ok(user)
}
