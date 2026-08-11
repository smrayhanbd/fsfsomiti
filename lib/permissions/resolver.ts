// ============================================================================
// PERMISSION RESOLVER — server-side effective-permission computation.
// ============================================================================
// Used in Server Components, Route Handlers, and Server Actions. Resolves a
// user's effective permission set ONCE per request (cached via React's
// `cache()`) and exposes fast single-permission checks.
//
// RESOLUTION ORDER (spec Part 3):
//   1. If the user holds the Super Admin role → short-circuit: ALL keys.
//   2. Collect the union of every permission from every role the user has.
//   3. Apply per-user overrides:
//        ALLOW → add a key even if no role granted it
//        DENY  → remove a key even if a role granted it  (DENY wins)
//   4. Return the resulting Set<string> of "::"-separated keys.
//
// INHERITANCE (checked at query time, not stored):
//   Granting a GROUP key implies every page/tab/action under it.
//   Granting a PAGE key implies every tab/action under it.
//   Granting a TAB key implies every action in that tab.
// So `hasPermission("...::Loan Management::::approve_loan")` returns true if
// the set contains the action key OR its page/group ancestor. This keeps the
// stored set small (no need to expand every leaf) while the seed can express
// coarse roles ("all of Transactions") as a single group key.
//
// MIGRATION BRIDGE: during the transition from the flat model, a user whose
// User.role is SUPER_ADMIN is also treated as super admin here, and legacy
// flat UserPermission grants are folded in. Once all call sites are rewired
// this bridge can be removed.

import { cache } from "react"
import prisma from "@/lib/prisma"
import {
  enumerateRegistry,
  groupKey,
  pageKey,
  tabKey,
  type MenuGroupKey,
} from "@/lib/permissions/permission-registry"

// Re-export the registry key builders for callers; everything permission-key
// related should go through one place.
export { groupKey, pageKey, tabKey }

// The "all keys" set, computed once and frozen. Super Admin returns this.
const ALL_KEYS: ReadonlySet<string> = (() => {
  const keys = enumerateRegistry().map((n) => n.key)
  return new Set(keys)
})()

/**
 * A lightweight map describing which nav items the user can see, for sidebar
 * rendering. Each entry: menuGroup → array of visible page labels (including
 * accordion children). An empty array means the whole group is hidden.
 */
export type AccessibleNavMap = Record<string, string[]>

// ── The core resolver, cached per-request via React `cache()` ─────────────
// Within a single server render, many components call hasPermission(); cache()
// ensures the DB query runs at most once per userId per request.
export const getUserPermissions = cache(async (userId: string): Promise<Set<string>> => {
  // ── 1. Load roles, super-admin flag, and legacy role string ──────────
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true, // legacy flat string: SUPER_ADMIN | ADMIN | MEMBER
      roles: {
        select: {
          role: {
            select: { id: true, name: true, isSuperAdmin: true },
          },
        },
      },
    },
  })

  if (!user) return new Set<string>()

  // Super admin via the new RBAC role OR the legacy role string.
  const isSuper =
    user.roles.some((ur) => ur.role.isSuperAdmin) || user.role === "SUPER_ADMIN"
  if (isSuper) {
    return new Set(ALL_KEYS)
  }

  const roleIds = user.roles.map((ur) => ur.role.id)

  // ── 2. Union of all permissions from all roles ───────────────────────
  const [rolePerms, overrides] = await Promise.all([
    roleIds.length === 0
      ? Promise.resolve([])
      : prisma.rolePermission.findMany({
          where: { roleId: { in: roleIds } },
          select: {
            permission: {
              select: { menuGroup: true, page: true, tab: true, action: true },
            },
          },
        }),
    prisma.userPermissionOverride.findMany({
      where: { userId },
      select: {
        effect: true,
        permission: {
          select: { menuGroup: true, page: true, tab: true, action: true },
        },
      },
    }),
  ])

  // Helper: permission row → "::"-separated key (empty segments for "").
  const toKey = (p: { menuGroup: string; page: string; tab: string; action: string }) =>
    p.action !== ""
      ? `${p.menuGroup}::${p.page}::${p.tab}::${p.action}`
      : p.tab !== ""
        ? `${p.menuGroup}::${p.page}::${p.tab}`
        : p.page !== ""
          ? `${p.menuGroup}::${p.page}`
          : p.menuGroup

  const set = new Set<string>(rolePerms.map((rp) => toKey(rp.permission)))

  // ── 3. Apply overrides: ALLOW adds, DENY removes (DENY wins) ─────────
  for (const ov of overrides) {
    const key = toKey(ov.permission)
    if (ov.effect === "ALLOW") {
      set.add(key)
    } else {
      // DENY — remove the exact key AND any descendants, since denying a
      // group/page should wipe everything beneath it even if a role granted
      // the leaves. (Descendant removal is cheap: filter the current set.)
      set.delete(key)
      const prefix = `${key}::`
      for (const k of Array.from(set)) {
        if (k.startsWith(prefix)) set.delete(k)
      }
    }
  }

  return set
})

// ── Single-permission check with upward inheritance ──────────────────────
/**
 * True if the user holds `key` OR any of its ancestor keys (group/page/tab).
 * E.g. holding the "Finance & Accounting" group key grants every action in it.
 *
 * Call via the cached `getUserPermissions` so this is cheap (no extra DB hit
 * beyond the first per request).
 */
export async function hasPermission(userId: string, key: string): Promise<boolean> {
  const set = await getUserPermissions(userId)
  return permissionGranted(set, key)
}

/**
 * Pure (non-DB) check against an already-resolved set. Exported so the client
 * context (Part 4) can reuse the exact same inheritance logic against the set
 * passed from the server, guaranteeing client and server agree.
 *
 * Inheritance: holding an ancestor (group/page/tab) grants everything beneath.
 *   action key G::P::T::A → granted if set has the action, or its tab (if T
 *   non-empty), page, or group ancestor.
 *   tab key    G::P::T    → granted if set has the tab, page, or group.
 *   page key   G::P       → granted if set has the page or group.
 *   group key  G          → granted only if set has it exactly.
 *
 * Level-aware (not prefix matching) so the empty-tab segment in action keys
 * ("G::P::::A") doesn't produce a bogus "G::P::" ancestor.
 */
export function permissionGranted(granted: Set<string>, key: string): boolean {
  if (granted.size === 0) return false
  if (granted.has(key)) return true

  const parts = key.split("::")
  const group = parts[0]

  if (parts.length >= 4) {
    // Action key: G::P::T::A (T may be "").
    const page = parts[1]
    const tab = parts[2]
    if (tab !== "" && granted.has(`${group}::${page}::${tab}`)) return true
    if (granted.has(`${group}::${page}`)) return true
    if (granted.has(group)) return true
  } else if (parts.length === 3) {
    // Tab key: G::P::T
    const page = parts[1]
    if (granted.has(`${group}::${page}`)) return true
    if (granted.has(group)) return true
  } else if (parts.length === 2) {
    // Page key: G::P
    if (granted.has(group)) return true
  }
  // Group key (1 part) or unrecognised → only exact match (already checked).
  return false
}

// ── Convenience builders mirroring the registry, for readable call sites ──
export const canAccessPage = (userId: string, menuGroup: string, page: string) =>
  hasPermission(userId, pageKey(menuGroup, page))

export const canAccessTab = (userId: string, menuGroup: string, page: string, tab: string) =>
  hasPermission(userId, tabKey(menuGroup, page, tab))

export const canDoAction = (
  userId: string,
  menuGroup: string,
  page: string,
  action: string,
  tab?: string
) => hasPermission(userId, `${menuGroup}::${page}::${tab ?? ""}::${action}`)

// ── Sidebar visibility map ───────────────────────────────────────────────
/**
 * Returns which page labels the user can see in each menu group, for sidebar
 * rendering. A page is visible if the user has the page key OR any descendant
 * (a tab/action) under it. A group is included only if at least one of its
 * pages is visible.
 *
 * O(groups × pages) — runs against the cached set, so it's one DB hit total.
 */
export const getAccessibleNavItems = cache(
  async (userId: string): Promise<AccessibleNavMap> => {
    const set = await getUserPermissions(userId)
    const result: AccessibleNavMap = {}

    // Walk the registry (cheap, in-memory) rather than the DB.
    const { PERMISSION_REGISTRY } = await import("@/lib/permissions/permission-registry")
    for (const group of Object.keys(PERMISSION_REGISTRY) as MenuGroupKey[]) {
      const pages = Object.keys(PERMISSION_REGISTRY[group])
      const visiblePages = pages.filter((page) => {
        const pk = pageKey(group, page)
        // Visible if the page key itself is granted, or any key under it is.
        if (set.has(pk)) return true
        const prefix = `${pk}::`
        for (const k of set) {
          if (k.startsWith(prefix)) return true
        }
        return false
      })
      if (visiblePages.length > 0) {
        result[group] = visiblePages
      }
    }
    return result
  }
)

/**
 * True if the user is a super admin (new role OR legacy string). Cheap check
 * that doesn't resolve the full set — use for early-outs in middleware/guards.
 */
export async function isSuperAdminUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      roles: { select: { role: { select: { isSuperAdmin: true } } } },
    },
  })
  if (!user) return false
  return user.role === "SUPER_ADMIN" || user.roles.some((ur) => ur.role.isSuperAdmin)
}

/**
 * Serialize the resolved set for shipping to the client (PermissionProvider).
 * Super admin → ["*"] (tiny), otherwise the array of granted keys. This is
 * what a Server Component passes to <PermissionProvider permissions={...}>.
 *
 * Must be kept in sync with the SUPER_MARKER in lib/permissions/client.tsx.
 */
export async function getPermissionsForClient(userId: string): Promise<string[]> {
  const set = await getUserPermissions(userId)
  if (set.size === ALL_KEYS.size) {
    // Super admin resolved to the full set — ship the marker instead of ~300 keys.
    return ["*"]
  }
  return Array.from(set)
}
