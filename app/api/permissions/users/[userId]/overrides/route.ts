import prisma from "@/lib/prisma"
import { ok, bad, requirePermissionsAdmin, writeRbacAudit, AUDIT } from "@/lib/permissions/api"
import { z } from "zod"

export const dynamic = "force-dynamic"

const AddOverrideSchema = z.object({
  // Accept EITHER a permissionId OR a permissionKey (the "::"-separated
  // natural key). The UI typically sends a key (easier to enter); the matrix
  // editor may send an id. At least one must be present.
  permissionId: z.string().min(1).optional(),
  permissionKey: z.string().min(1).optional(),
  effect: z.enum(["ALLOW", "DENY"]),
  reason: z.string().max(500).optional().nullable(),
}).refine((d) => d.permissionId || d.permissionKey, {
  message: "Either permissionId or permissionKey is required.",
})

// Resolve a "::"-separated key to Permission natural-key fields.
function keyToFields(key: string) {
  const parts = key.split("::")
  return {
    menuGroup: parts[0] ?? "",
    page: parts[1] ?? "",
    tab: parts[2] ?? "",
    action: parts[3] ?? "",
  }
}

// ── POST /api/permissions/users/[userId]/overrides → add an override ─────
export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requirePermissionsAdmin()
  if (auth instanceof Response) return auth
  const { userId } = await params

  const body = await request.json().catch(() => null)
  const parsed = AddOverrideSchema.safeParse(body)
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid input.")

  // Resolve the Permission row — by id if given, else by natural key.
  const perm = parsed.data.permissionId
    ? await prisma.permission.findUnique({
        where: { id: parsed.data.permissionId },
        select: { id: true, menuGroup: true, page: true, tab: true, action: true },
      })
    : await prisma.permission.findUnique({
        where: { menuGroup_page_tab_action: keyToFields(parsed.data.permissionKey!) },
        select: { id: true, menuGroup: true, page: true, tab: true, action: true },
      })

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) return bad("User not found.", 404)
  if (!perm) return bad("Permission not found. Check the key matches the registry.", 404)

  const override = await prisma.userPermissionOverride.upsert({
    where: { userId_permissionId: { userId, permissionId: perm.id } },
    update: { effect: parsed.data.effect, reason: parsed.data.reason ?? null, createdBy: auth.id },
    create: { userId, permissionId: perm.id, effect: parsed.data.effect, reason: parsed.data.reason ?? null, createdBy: auth.id },
  })
  await writeRbacAudit({
    actorId: auth.id,
    targetUserId: userId,
    action: AUDIT.OVERRIDE_ADDED,
    details: { effect: parsed.data.effect, permissionId: perm.id, reason: parsed.data.reason },
  })
  return ok(override, 201)
}
