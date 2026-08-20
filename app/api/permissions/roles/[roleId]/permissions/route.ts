import prisma, { directPrisma } from "@/lib/prisma"
import { ok, bad, requirePermissionsAdmin, writeRbacAudit, AUDIT } from "@/lib/permissions/api"
import { clearPermissionResolverCache } from "@/lib/permissions/resolver"
import { z } from "zod"
import {
  enumerateRegistry,
  type RegistryNode,
} from "@/lib/permissions/permission-registry"

export const dynamic = "force-dynamic"

// ── GET /api/permissions/roles/[roleId]/permissions ──────────────────────
// Returns the role's granted permission keys (rebuilt from the join rows).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const auth = await requirePermissionsAdmin()
  if (auth instanceof Response) return auth
  const { roleId } = await params

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: {
      id: true,
      name: true,
      isSystem: true,
      isSuperAdmin: true,
      permissions: {
        select: {
          permission: { select: { menuGroup: true, page: true, tab: true, action: true } },
        },
      },
    },
  })
  if (!role) return bad("Role not found.", 404)

  const toKey = (p: { menuGroup: string; page: string; tab: string; action: string }) =>
    p.action !== ""
      ? `${p.menuGroup}::${p.page}::${p.tab}::${p.action}`
      : p.tab !== ""
        ? `${p.menuGroup}::${p.page}::${p.tab}`
        : p.page !== ""
          ? `${p.menuGroup}::${p.page}`
          : p.menuGroup

  return ok({
    ...role,
    permissionKeys: role.isSuperAdmin ? ["*"] : role.permissions.map((rp) => toKey(rp.permission)),
  })
}

// ── PUT /api/permissions/roles/[roleId]/permissions → replace full set ────
// Body: { permissionKeys: string[] } — every key the role should grant after
// this call. Resolves each key to its Permission row and replaces the join.
const ReplacePermsSchema = z.object({
  permissionKeys: z.array(z.string()).max(1000),
})

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const auth = await requirePermissionsAdmin()
  if (auth instanceof Response) return auth
  const { roleId } = await params

  const role = await prisma.role.findUnique({ where: { id: roleId } })
  if (!role) return bad("Role not found.", 404)
  if (role.isSuperAdmin) {
    return bad("Super Admin always has full access; its permission set cannot be changed.", 422)
  }

  const body = await request.json().catch(() => null)
  const parsed = ReplacePermsSchema.safeParse(body)
  if (!parsed.success) return bad("Expected { permissionKeys: string[] }.")

  const keys = Array.from(new Set(parsed.data.permissionKeys)) // dedupe

  if (keys.length === 0) {
    // Edge case: user cleared every permission. Just delete all grants.
    try {
      await directPrisma.rolePermission.deleteMany({ where: { roleId } })
      clearPermissionResolverCache()
      await writeRbacAudit({
        actorId: auth.id,
        targetRoleId: roleId,
        action: AUDIT.ROLE_PERMISSIONS_REPLACED,
        details: { roleName: role.name, count: 0 },
      })
      return ok({ roleId, grantedCount: 0 })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to clear permissions."
      console.error("[PUT permissions] clear-all error:", err)
      return bad(message, 500)
    }
  }

  // ── Step 0: Validate every key against the in-code registry FIRST ──────
  // This catches typos / out-of-date UI bundles before touching the DB and
  // produces a much clearer error message than "not found by findMany".
  const registryByKey: Map<string, RegistryNode> = new Map(
    enumerateRegistry().map((n) => [n.key, n]),
  )
  const unknownKeys = keys.filter((k) => !registryByKey.has(k))
  if (unknownKeys.length > 0) {
    return bad(
      `Unknown permission keys (not in code registry): ${unknownKeys.slice(0, 5).join(", ")}${unknownKeys.length > 5 ? "…" : ""}. Run \`npm run seed:rbac\` to sync the DB catalogue if these keys are valid.`,
    )
  }

  // ── Step 1: Resolve ALL keys to Permission IDs in a SINGLE query ───────
  const keyFields = keys.map((key) => keyToFields(key.split("::")))

  let permissions: { id: string; menuGroup: string; page: string; tab: string; action: string }[]
  try {
    permissions = await prisma.permission.findMany({
      where: {
        OR: keyFields.map((f) => ({
          menuGroup: f.menuGroup,
          page: f.page,
          tab: f.tab,
          action: f.action,
        })),
      },
      select: { id: true, menuGroup: true, page: true, tab: true, action: true },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to resolve permission keys."
    console.error("[PUT permissions] findMany error:", err)
    return bad(message, 500)
  }

  // ── Step 1b: SELF-HEAL — auto-create any missing Permission rows ───────
  // The DB catalogue may be out of sync with the code registry if
  // `prisma/seed-permissions.js` hasn't been re-run after a registry change.
  // Rather than failing the whole save, we upsert the missing rows here so
  // role setup never blocks on a stale seed.
  const foundKeys = new Set(permissions.map(permKey))
  const missingKeys = keys.filter((k) => !foundKeys.has(k))

  if (missingKeys.length > 0) {
    const toCreate = missingKeys
      .map((k) => registryByKey.get(k)!)
      .filter(Boolean) as RegistryNode[]

    try {
      // Upsert is idempotent — safe even if a concurrent request inserts first.
      for (const node of toCreate) {
        const created = await prisma.permission.upsert({
          where: {
            menuGroup_page_tab_action: {
              menuGroup: node.menuGroup,
              page: node.page,
              tab: node.tab,
              action: node.action,
            },
          },
          update: {},
          create: {
            menuGroup: node.menuGroup,
            page: node.page,
            tab: node.tab,
            action: node.action,
          },
          select: { id: true, menuGroup: true, page: true, tab: true, action: true },
        })
        permissions.push(created)
      }
      console.warn(
        `[PUT permissions] self-heal: created ${toCreate.length} missing Permission rows for role ${roleId}. Re-run \`npm run seed:rbac\` to keep the catalogue consistent.`,
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to self-heal missing permissions."
      console.error("[PUT permissions] self-heal error:", err)
      return bad(message, 500)
    }
  }

  const permIds = permissions.map((p) => p.id)

  // ── Step 2: Replace the role's grants in a SHORT transaction ───────────
  try {
    const result = await directPrisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } })
      if (permIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permIds.map((permissionId) => ({ roleId, permissionId })),
        })
      }
      return permIds.length
    }, {
      timeout: 15_000,  // max time the transaction may take
      maxWait: 10_000,  // max time to wait for a connection slot
    })
    clearPermissionResolverCache()

    await writeRbacAudit({
      actorId: auth.id,
      targetRoleId: roleId,
      action: AUDIT.ROLE_PERMISSIONS_REPLACED,
      details: { roleName: role.name, count: result },
    })
    return ok({ roleId, grantedCount: result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to replace permissions."
    console.error("[PUT /api/permissions/roles/[roleId]/permissions] transaction error:", err)
    return bad(message, 500)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

// Convert a key's split segments into the Permission natural-key fields.
// tab/action default to "" (empty string), never null — see the Permission
// model note in prisma/schema.prisma.
function keyToFields(parts: string[]): {
  menuGroup: string
  page: string
  tab: string
  action: string
} {
  return {
    menuGroup: parts[0] ?? "",
    page: parts[1] ?? "",
    tab: parts[2] ?? "",
    action: parts[3] ?? "",
  }
}

// Reconstruct the "::"-separated key from a Permission row — used to check
// which requested keys were actually found in the DB.
function permKey(p: { menuGroup: string; page: string; tab: string; action: string }): string {
  return p.action !== ""
    ? `${p.menuGroup}::${p.page}::${p.tab}::${p.action}`
    : p.tab !== ""
      ? `${p.menuGroup}::${p.page}::${p.tab}`
      : p.page !== ""
        ? `${p.menuGroup}::${p.page}`
        : p.menuGroup
}
