import prisma from "@/lib/prisma"
import { ok, bad, requirePermissionsAdmin, writeRbacAudit, AUDIT } from "@/lib/permissions/api"
import { z } from "zod"

export const dynamic = "force-dynamic"

// ── GET /api/permissions/roles → list all roles ──────────────────────────
export async function GET() {
  const auth = await requirePermissionsAdmin()
  if (auth instanceof Response) return auth

  const roles = await prisma.role.findMany({
    orderBy: [{ isSuperAdmin: "desc" }, { name: "asc" }],
    include: { _count: { select: { users: true, permissions: true } } },
  })
  return ok(roles)
}

// ── POST /api/permissions/roles → create a custom role ───────────────────
const CreateRoleSchema = z.object({
  name: z.string().min(2).max(60),
  description: z.string().max(500).optional().nullable(),
})

export async function POST(request: Request) {
  const auth = await requirePermissionsAdmin()
  if (auth instanceof Response) return auth

  const body = await request.json().catch(() => null)
  const parsed = CreateRoleSchema.safeParse(body)
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Invalid input.")

  // System/super-admin flags can NEVER be set via the API — only the seed.
  const existing = await prisma.role.findUnique({ where: { name: parsed.data.name } })
  if (existing) return bad(`A role named "${parsed.data.name}" already exists.`, 409)

  const role = await prisma.role.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      isSystem: false,
      isSuperAdmin: false,
    },
  })
  await writeRbacAudit({
    actorId: auth.id,
    targetRoleId: role.id,
    action: AUDIT.ROLE_CREATED,
    details: { name: role.name },
  })
  return ok(role, 201)
}
