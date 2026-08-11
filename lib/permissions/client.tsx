"use client"

// ============================================================================
// PERMISSION CLIENT — Context Provider + hooks for Client Components.
// ============================================================================
// Permissions are resolved SERVER-SIDE (lib/permissions/resolver.ts) because
// that's where the DB lives. This module ships the resolved permission set to
// the client via React Context, and exposes hooks that reuse the resolver's
// EXACT inheritance logic (imported, not reimplemented) so client and server
// never disagree on what a user can do.
//
// Usage in a root layout (after the session check):
//   const perms = await getUserPermissions(user.id)
//   <PermissionProvider permissions={[...perms]}>
//     {children}
//   </PermissionProvider>
//
// Then anywhere in a Client Component:
//   const { canDoAction } = usePermissions()
//   {canDoAction("Finance & Accounting", "Loan Management", "approve_loan") && <ApproveBtn/>}

import { createContext, useContext, useMemo, type ReactNode } from "react"
import {
  groupKey,
  pageKey,
  tabKey,
} from "@/lib/permissions/permission-registry"
// Reuse the resolver's inheritance logic — single source of truth.
import { permissionGranted } from "@/lib/permissions/resolver"

// ── Context ───────────────────────────────────────────────────────────────
interface PermissionContextValue {
  /** The resolved permission set (frozen on the client). */
  permissions: Set<string>
  /** Check any "::"-separated key with full inheritance. */
  can: (key: string) => boolean
  /** Group-level visibility (group key or any descendant granted). */
  canAccessGroup: (menuGroup: string) => boolean
  /** Page-level visibility (page key, any tab/action, or group ancestor). */
  canAccessPage: (menuGroup: string, page: string) => boolean
  /** Tab-level visibility. */
  canAccessTab: (menuGroup: string, page: string, tab: string) => boolean
  /** Action-level check, optionally scoped to a tab. */
  canDoAction: (menuGroup: string, page: string, action: string, tab?: string) => boolean
  /** True if the set is the full-access super-admin set (or empty→no). */
  isSuperAdmin: boolean
}

const PermissionContext = createContext<PermissionContextValue | null>(null)

// The super-admin set sentinel: when the server resolves super admin it returns
// ALL_KEYS. Rather than ship ~300 keys to the client, the server passes the
// special marker "*" and we treat it as "everything allowed".
const SUPER_MARKER = "*"

interface ProviderProps {
  /**
   * The resolved permission set, serialized as an array. Pass ["*"] for a
   * super-admin (full access) — far smaller than shipping all keys.
   */
  permissions: string[]
  children: ReactNode
}

/**
 * Wrap the authenticated app with this provider. `permissions` is the array
 * form of the Set returned by getUserPermissions(); pass ["*"] for super admin.
 */
export function PermissionProvider({ permissions, children }: ProviderProps) {
  const value = useMemo<PermissionContextValue>(() => {
    const isSuper = permissions.length === 1 && permissions[0] === SUPER_MARKER
    const set = isSuper ? new Set<string>() : new Set(permissions)

    const can = (key: string): boolean => {
      if (isSuper) return true
      return permissionGranted(set, key)
    }
    const canAccessGroup = (menuGroup: string) => {
      if (isSuper) return true
      return permissionGranted(set, groupKey(menuGroup))
    }
    const canAccessPage = (menuGroup: string, page: string) => {
      if (isSuper) return true
      return permissionGranted(set, pageKey(menuGroup, page))
    }
    const canAccessTab = (menuGroup: string, page: string, tab: string) => {
      if (isSuper) return true
      return permissionGranted(set, tabKey(menuGroup, page, tab))
    }
    const canDoAction = (menuGroup: string, page: string, action: string, tab?: string) => {
      if (isSuper) return true
      return permissionGranted(set, `${menuGroup}::${page}::${tab ?? ""}::${action}`)
    }

    return {
      permissions: set,
      can,
      canAccessGroup,
      canAccessPage,
      canAccessTab,
      canDoAction,
      isSuperAdmin: isSuper,
    }
  }, [permissions])

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>
}

// ── Hook ─────────────────────────────────────────────────────────────────
/**
 * Access the permission helpers inside any Client Component under
 * <PermissionProvider>. Throws if used outside a provider so misuse is
 * caught in dev rather than silently allowing access.
 */
export function usePermissions(): PermissionContextValue {
  const ctx = useContext(PermissionContext)
  if (!ctx) {
    throw new Error("usePermissions must be used inside <PermissionProvider>.")
  }
  return ctx
}

/**
 * Convenience: a single-action boolean check. Returns true for super admin.
 *   const canApprove = useAction("Finance & Accounting", "Loan Management", "approve_loan")
 */
export function useAction(menuGroup: string, page: string, action: string, tab?: string): boolean {
  return usePermissions().canDoAction(menuGroup, page, action, tab)
}

export { SUPER_MARKER }
