/**
 * Central authorization guard — the single entry point for ALL permission
 * checks in server actions, API route handlers, and server components.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * The project has a complete RBAC engine (lib/permissions/permission-registry.ts
 * + resolver.ts + Prisma Role/Permission/RolePermission/UserPermissionOverride
 * models), but most call sites still used the OLD flat PERMISSIONS map
 * via the legacy bridge in lib/permissions.ts. The bridge checks the
 * UserPermission table (legacy) AND the new resolver, but call sites
 * that did NOT call any permission helper at all (only getCurrentUser)
 * had NO enforcement — meaning a logged-in member could create projects,
 * investments, distributions, etc.
 *
 * This file fixes that by providing a single, ergonomic API:
 *
 *   import { requireAction, requirePageAccess } from "@/lib/auth-guard"
 *
 *   await requireAction(user, "Operations & Management", "Project Management", "create_project")
 *   await requirePageAccess(user, "Operations & Management", "Project Management")
 *
 * Both throw an AuthorizationError on denial, which server actions catch
 * and convert to { ok: false, error: message }.
 *
 * ── Fail-closed ────────────────────────────────────────────────────────────
 * If the user is null, the role lookup fails, or the DB is unreachable,
 * the guard DENIES. Never grants by accident.
 *
 * ── SUPER_ADMIN short-circuit ──────────────────────────────────────────────
 * Users with the SUPER_ADMIN role (via User.role string OR a Role flagged
 * isSuperAdmin) bypass all checks — same as the existing resolver.
 *
 * Server-only.
 */
import { getCurrentUser, type CurrentUser } from "@/lib/permissions"
import { hasPermission as resolverHasPermission, isSuperAdminUser } from "@/lib/permissions/resolver"
import { actionKey, pageKey, tabKey } from "@/lib/permissions/permission-registry"

// ── Error type ───────────────────────────────────────────────────────────
export class AuthorizationError extends Error {
  readonly code: "UNAUTHENTICATED" | "FORBIDDEN"
  constructor(code: "UNAUTHENTICATED" | "FORBIDDEN", message: string) {
    super(message)
    this.name = "AuthorizationError"
    this.code = code
  }
}

// ── Core check: action-level permission ──────────────────────────────────
/**
 * Verify the current user holds the given action permission.
 *
 * Usage:
 *   await requireAction(user, "Operations & Management", "Project Management", "create_project")
 *
 * Returns the user on success (for chaining). Throws AuthorizationError on
 * denial — callers should catch and convert to their preferred error shape:
 *
 *   try {
 *     await requireAction(user, "Operations & Management", "Project Management", "create_project")
 *   } catch (e) {
 *     if (e instanceof AuthorizationError) return { ok: false, error: e.message }
 *     throw e
 *   }
 *
 * Pass `tab` for tab-scoped actions (rarely needed — most actions are page-scoped).
 */
export async function requireAction(
  user: CurrentUser | null | undefined,
  menuGroup: string,
  page: string,
  action: string,
  tab?: string,
): Promise<CurrentUser> {
  if (!user) {
    throw new AuthorizationError("UNAUTHENTICATED", "You must be signed in to perform this action.")
  }

  // Super admin short-circuit — bypasses all permission checks.
  const isSuper = await isSuperAdminUser(user.id)
  if (isSuper) return user

  // Build the "::"-separated key and check via the cached resolver.
  const key = actionKey(menuGroup, page, action, tab)
  const granted = await resolverHasPermission(user.id, key)
  if (!granted) {
    throw new AuthorizationError(
      "FORBIDDEN",
      `You do not have permission to perform "${action}" on ${menuGroup} → ${page}.`,
    )
  }
  return user
}

// ── Page-level access (menu/page visibility) ──────────────────────────────
/**
 * Verify the current user can access a page. Use this in server components
 * at the top of a page render to block direct URL access.
 *
 *   await requirePageAccess(user, "Operations & Management", "Project Management")
 */
export async function requirePageAccess(
  user: CurrentUser | null | undefined,
  menuGroup: string,
  page: string,
): Promise<CurrentUser> {
  if (!user) {
    throw new AuthorizationError("UNAUTHENTICATED", "You must be signed in to access this page.")
  }

  const isSuper = await isSuperAdminUser(user.id)
  if (isSuper) return user

  const key = pageKey(menuGroup, page)
  const granted = await resolverHasPermission(user.id, key)
  if (!granted) {
    throw new AuthorizationError(
      "FORBIDDEN",
      `You do not have access to ${menuGroup} → ${page}.`,
    )
  }
  return user
}

// ── Tab-level access ─────────────────────────────────────────────────────
/**
 * Verify the current user can access a specific tab on a page.
 *
 *   await requireTabAccess(user, "Finance & Accounting", "Loan Management", "pending")
 */
export async function requireTabAccess(
  user: CurrentUser | null | undefined,
  menuGroup: string,
  page: string,
  tab: string,
): Promise<CurrentUser> {
  if (!user) {
    throw new AuthorizationError("UNAUTHENTICATED", "You must be signed in to access this page.")
  }

  const isSuper = await isSuperAdminUser(user.id)
  if (isSuper) return user

  const key = tabKey(menuGroup, page, tab)
  const granted = await resolverHasPermission(user.id, key)
  if (!granted) {
    throw new AuthorizationError(
      "FORBIDDEN",
      `You do not have access to the ${tab} tab on ${menuGroup} → ${page}.`,
    )
  }
  return user
}

// ── Boolean check (non-throwing) ─────────────────────────────────────────
/**
 * Non-throwing version of requireAction — returns true/false. Use this when
 * you need to conditionally render UI or branch logic, not block access.
 *
 *   const canCreate = await canPerformAction(user, "Operations & Management", "Project Management", "create_project")
 *   if (!canCreate) return null
 */
export async function canPerformAction(
  user: CurrentUser | null | undefined,
  menuGroup: string,
  page: string,
  action: string,
  tab?: string,
): Promise<boolean> {
  if (!user) return false
  const isSuper = await isSuperAdminUser(user.id)
  if (isSuper) return true
  const key = actionKey(menuGroup, page, action, tab)
  return resolverHasPermission(user.id, key)
}

/**
 * Non-throwing page access check.
 */
export async function canAccessPage(
  user: CurrentUser | null | undefined,
  menuGroup: string,
  page: string,
): Promise<boolean> {
  if (!user) return false
  const isSuper = await isSuperAdminUser(user.id)
  if (isSuper) return true
  const key = pageKey(menuGroup, page)
  return resolverHasPermission(user.id, key)
}

// ── Convenience: resolve + guard in one call ─────────────────────────────
/**
 * Resolves the current user (from session) AND requires the given action.
 * Combines getCurrentUser() + requireAction() for ergonomic call sites.
 *
 *   const user = await resolveAndRequireAction("Operations & Management", "Project Management", "create_project")
 */
export async function resolveAndRequireAction(
  menuGroup: string,
  page: string,
  action: string,
  tab?: string,
): Promise<CurrentUser> {
  const user = await getCurrentUser()
  return requireAction(user, menuGroup, page, action, tab)
}

/**
 * Resolves the current user AND requires page access.
 */
export async function resolveAndRequirePageAccess(
  menuGroup: string,
  page: string,
): Promise<CurrentUser> {
  const user = await getCurrentUser()
  return requirePageAccess(user, menuGroup, page)
}

// ── Error → ActionResult helper ──────────────────────────────────────────
/**
 * Convert an AuthorizationError (or any error) into the { ok: false, error }
 * shape that server actions return. Use this in catch blocks:
 *
 *   try {
 *     await requireAction(user, ..., "create_project")
 *     // ... do work ...
 *     return { ok: true, data: project }
 *   } catch (e) {
 *     return authErrorResult(e)
 *   }
 */
export function authErrorResult(e: unknown): { ok: false; error: string } {
  if (e instanceof AuthorizationError) {
    return { ok: false, error: e.message }
  }
  if (e instanceof Error) {
    return { ok: false, error: e.message }
  }
  return { ok: false, error: "An unexpected error occurred." }
}
