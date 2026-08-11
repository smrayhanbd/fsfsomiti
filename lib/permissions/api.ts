// ============================================================================
// RBAC API helpers — shared by every /api/permissions/* route handler.
// ============================================================================
// Provides: the "Super Admin OR user_control action" auth guard, a typed JSON
// response helper matching the app's { success, data?, error? } convention,
// and an audit-log writer so every mutation records who/what/why.

import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/permissions"
import { isSuperAdminUser } from "@/lib/permissions/resolver"
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
} as const
