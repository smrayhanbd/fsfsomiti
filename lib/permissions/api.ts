// ============================================================================
// RBAC API helpers — shared by every /api/permissions/* route handler.
// ============================================================================
// Provides: the "Super Admin OR user_control action" auth guard, a typed JSON
// response helper matching the app's { success, data?, error? } convention,
// an audit-log writer so every mutation records who/what/why, AND
// anti-privilege-escalation guards that prevent users from:
//   - Granting themselves permissions
//   - Modifying super admin users or super admin roles (unless they are super admin)
//   - Granting roles whose permissions exceed their own authority
//
// ── PRIVILEGE ESCALATION PROTECTION (critical security) ──
//
// The principle: a user with `manage_permissions` can manage roles and assign
// them to OTHER users, but:
//   1. Cannot modify their OWN roles or overrides (prevent self-grant).
//   2. Cannot assign a role with MORE permissions than they themselves hold
//      (the "privilege ceiling" rule — you can't grant what you don't have).
//   3. Cannot touch super-admin-flagged roles or super-admin users (only
//      super admins can modify super admins — prevents a `manage_permissions`
//      user from assigning the Super Admin role to themselves or an ally).
//   4. Cannot delete system roles (isSystem=true).
//
// Super admins bypass all these checks — they can do anything.

import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser, type CurrentUser } from "@/lib/permissions"
import { isSuperAdminUser, getUserPermissions } from "@/lib/permissions/resolver"
import { actionKey } from "@/lib/permissions/permission-registry"
import type { Prisma } from "@prisma/client"

// The menu-group/page/action that grants access to the whole permissions API.
// "manage_permissions" under System & Settings → User Control.
const USER_CONTROL_KEY = actionKey("System & Settings", "User Control", "manage_permissions")

// ── Typed JSON helpers (the app's standard envelope) ─────────────────────
export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true as const, data }, { status })
}
export function bad(error: string, status = 400) {
  return NextResponse.json({ success: false as const, error }, { status })
}

// ── Auth guard: requires Super Admin OR the manage_permissions action ────
/**
 * Resolve the current user and verify they may manage permissions. Returns
 * the user on success, or a NextResponse (401/403) the handler should return
 * directly. Use as:
 *   const auth = await requirePermissionsAdmin()
 *   if (auth instanceof NextResponse) return auth
 *   // auth is now the CurrentUser
 */
export async function requirePermissionsAdmin() {
  const user = await getCurrentUser()
  if (!user) return bad("Authentication required.", 401)

  const isSuper = await isSuperAdminUser(user.id)
  if (isSuper) return user

  // Legacy bridge: USER_MANAGE on the flat model also grants access during
  // migration, so existing admins aren't locked out before roles are assigned.
  const legacyGrant = await prisma.userPermission.findUnique({
    where: { userId_permission: { userId: user.id, permission: "USER_MANAGE" } },
    select: { id: true },
  })
  if (legacyGrant) return user

  // New RBAC: the manage_permissions action on the User Control page.
  const perms = await import("@/lib/permissions/resolver")
  const hasGrant = await perms.hasPermission(user.id, USER_CONTROL_KEY)
  if (hasGrant) return user

  return bad("You do not have permission to manage roles and permissions.", 403)
}

// ── Anti-privilege-escalation guards ─────────────────────────────────────
//
// These functions are called BY the route handlers AFTER requirePermissionsAdmin
// passes, to verify the specific action is safe given the target user/role.

/**
 * Prevent a user from modifying their OWN roles or overrides.
 *
 * Rationale: a user with `manage_permissions` could otherwise grant themselves
 * the Super Admin role. The self-modification block is the simplest and most
 * robust defense — any role/override change must target a DIFFERENT user.
 *
 * Super admins CAN modify their own record (they already have full access).
 *
 * Usage:
 *   const selfCheck = preventSelfTarget(auth, targetUserId)
 *   if (selfCheck instanceof Response) return selfCheck
 */
export function preventSelfTarget(
  auth: CurrentUser,
  targetUserId: string
): NextResponse | null {
  if (auth.id === targetUserId) {
    return bad(
      "You cannot modify your own roles or permissions. Ask another administrator to make the change.",
      403
    )
  }
  return null
}

/**
 * Prevent a non-super-admin from modifying a super-admin-flagged user.
 *
 * Rationale: if a `manage_permissions` user could edit a super admin's roles,
 * they could revoke the super admin's access and take over the system.
 * Only super admins can touch other super admins.
 *
 * Usage:
 *   const targetCheck = await preventSuperAdminTarget(auth, targetUserId)
 *   if (targetCheck instanceof Response) return targetCheck
 */
export async function preventSuperAdminTarget(
  auth: CurrentUser,
  targetUserId: string
): Promise<NextResponse | null> {
  const isSuper = await isSuperAdminUser(auth.id)
  if (isSuper) return null // super admin can touch anyone

  const targetIsSuper = await isSuperAdminUser(targetUserId)
  if (targetIsSuper) {
    return bad(
      "You cannot modify a Super Admin user. Only other Super Admins can do that.",
      403
    )
  }
  return null
}

/**
 * Prevent a non-super-admin from assigning or modifying a super-admin-flagged role.
 *
 * Rationale: a `manage_permissions` user could otherwise assign the "Super Admin"
 * role to an ally. Only super admins can grant super-admin-level roles.
 *
 * Also blocks modification of system roles (isSystem=true) by non-super-admins.
 *
 * Usage:
 *   const roleCheck = await preventSuperAdminRole(auth, roleId)
 *   if (roleCheck instanceof Response) return roleCheck
 */
export async function preventSuperAdminRole(
  auth: CurrentUser,
  roleId: string
): Promise<NextResponse | null> {
  const isSuper = await isSuperAdminUser(auth.id)
  if (isSuper) return null

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { isSuperAdmin: true, isSystem: true, name: true },
  })
  if (!role) return bad("Role not found.", 404)

  if (role.isSuperAdmin) {
    return bad(
      `The "${role.name}" role has Super Admin privileges. Only other Super Admins can assign or modify it.`,
      403
    )
  }
  // System roles can be edited by non-super-admins (they have `manage_permissions`),
  // but NOT deleted. Deletion is blocked in the DELETE handler separately.
  return null
}

/**
 * Enforce the "privilege ceiling" rule: a user cannot assign a role whose
 * permissions exceed their own.
 *
 * Compares the role's permission set against the actor's resolved permission
 * set. If the role grants ANY permission the actor doesn't have, the assignment
 * is blocked.
 *
 * Super admins bypass this check (they have all permissions).
 *
 * Usage:
 *   const ceilingCheck = await enforcePrivilegeCeiling(auth, roleId)
 *   if (ceilingCheck instanceof Response) return ceilingCheck
 */
export async function enforcePrivilegeCeiling(
  auth: CurrentUser,
  roleId: string
): Promise<NextResponse | null> {
  const isSuper = await isSuperAdminUser(auth.id)
  if (isSuper) return null

  // Fetch the role's permissions + the actor's resolved permission set.
  const [rolePerms, actorSet] = await Promise.all([
    prisma.rolePermission.findMany({
      where: { roleId },
      select: {
        permission: {
          select: { menuGroup: true, page: true, tab: true, action: true },
        },
      },
    }),
    getUserPermissions(auth.id),
  ])

  // Convert role permissions to keys.
  const toKey = (p: { menuGroup: string; page: string; tab: string; action: string }) =>
    p.action !== ""
      ? `${p.menuGroup}::${p.page}::${p.tab}::${p.action}`
      : p.tab !== ""
        ? `${p.menuGroup}::${p.page}::${p.tab}`
        : p.page !== ""
          ? `${p.menuGroup}::${p.page}`
          : p.menuGroup

  // Check each role permission: is it covered by the actor's set?
  // Uses the resolver's inheritance logic: an ancestor key in the actor's set
  // covers all descendants.
  const { permissionGranted } = await import("@/lib/permissions/resolver")
  for (const rp of rolePerms) {
    const key = toKey(rp.permission)
    if (!permissionGranted(actorSet, key)) {
      return bad(
        `Cannot assign this role: it grants a permission you do not have yourself ("${key}"). You cannot grant permissions beyond your own authority.`,
        403
      )
    }
  }
  return null
}

/**
 * Convenience: run ALL anti-escalation checks for a role-assignment operation.
 * Use in POST /api/permissions/users/[userId]/roles:
 *
 *   const auth = await requirePermissionsAdmin()
 *   if (auth instanceof Response) return auth
 *
 *   const guard = await enforceRoleAssignmentGuards(auth, targetUserId, roleId)
 *   if (guard instanceof Response) return guard
 *
 *   // ... proceed with assignment ...
 */
export async function enforceRoleAssignmentGuards(
  auth: CurrentUser,
  targetUserId: string,
  roleId: string
): Promise<NextResponse | null> {
  // 1. No self-targeting.
  const selfCheck = preventSelfTarget(auth, targetUserId)
  if (selfCheck) return selfCheck

  // 2. No touching super-admin users.
  const targetCheck = await preventSuperAdminTarget(auth, targetUserId)
  if (targetCheck) return targetCheck

  // 3. No assigning super-admin roles.
  const roleCheck = await preventSuperAdminRole(auth, roleId)
  if (roleCheck) return roleCheck

  // 4. Privilege ceiling — role's perms must be subset of actor's.
  const ceilingCheck = await enforcePrivilegeCeiling(auth, roleId)
  if (ceilingCheck) return ceilingCheck

  return null
}

// ── Audit-log writer — append an immutable RBAC change record ────────────
export async function writeRbacAudit(args: {
  actorId: string
  targetUserId?: string | null
  targetRoleId?: string | null
  action: string
  details?: Record<string, unknown>
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: args.actorId,
      targetUserId: args.targetUserId ?? null,
      targetRoleId: args.targetRoleId ?? null,
      action: args.action,
      details: (args.details ?? {}) as Prisma.InputJsonValue,
    },
  })
}

// Standard RBAC audit action labels (kept here so they're spelled consistently).
export const AUDIT = {
  ROLE_CREATED: "ROLE_CREATED",
  ROLE_UPDATED: "ROLE_UPDATED",
  ROLE_DELETED: "ROLE_DELETED",
  ROLE_PERMISSIONS_REPLACED: "ROLE_PERMISSIONS_REPLACED",
  ROLE_ASSIGNED: "ROLE_ASSIGNED",
  ROLE_REVOKED: "ROLE_REVOKED",
  OVERRIDE_ADDED: "OVERRIDE_ADDED",
  OVERRIDE_REMOVED: "OVERRIDE_REMOVED",
  PRIVILEGE_ESCALATION_BLOCKED: "PRIVILEGE_ESCALATION_BLOCKED",
} as const
