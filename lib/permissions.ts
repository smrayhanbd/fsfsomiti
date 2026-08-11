import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"

// Permission keys stored on the UserPermission table.
export const PERMISSIONS = {
  // Meeting module
  MEETING_ATTENDANCE_MARK: "MEETING_ATTENDANCE_MARK",
  MEETING_MINUTES_UPLOAD: "MEETING_MINUTES_UPLOAD",
  // Transactions module (spec §12 / §13)
  TRANSACTION_CREATE: "TRANSACTION_CREATE",
  TRANSACTION_SUBMIT: "TRANSACTION_SUBMIT",
  TRANSACTION_APPROVE: "TRANSACTION_APPROVE",
  TRANSACTION_REVERSE: "TRANSACTION_REVERSE",
  // User management
  USER_MANAGE: "USER_MANAGE",
  // Task Management module
  TASK_CREATE: "TASK_CREATE",
  TASK_VIEW_ALL: "TASK_VIEW_ALL",
  TASK_ASSIGN: "TASK_ASSIGN",
  TASK_APPROVE: "TASK_APPROVE",
  TASK_DELETE: "TASK_DELETE",
  TASK_MANAGE_RECURRING: "TASK_MANAGE_RECURRING",
  // Committee Management module
  COMMITTEE_MANAGE: "COMMITTEE_MANAGE",
  // Investment & Project modules
  INVESTMENT_MANAGE: "INVESTMENT_MANAGE",
  INVESTMENT_VIEW: "INVESTMENT_VIEW",
  PROJECT_MANAGE: "PROJECT_MANAGE",
  PROJECT_VIEW: "PROJECT_VIEW",
  // Election Management module
  ELECTION_MANAGE: "ELECTION_MANAGE",
  ELECTION_REVIEW: "ELECTION_REVIEW",
  ELECTION_VIEW: "ELECTION_VIEW",
} as const

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const ROLE = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
} as const

// Numeric rank for hierarchy comparisons (higher = more privileged).
export const ROLE_RANK: Record<string, number> = {
  [ROLE.MEMBER]: 0,
  [ROLE.ADMIN]: 1,
  [ROLE.SUPER_ADMIN]: 2,
}

export function roleRank(role: string | null | undefined): number {
  return ROLE_RANK[role ?? ""] ?? -1
}

// A light shape returned by getCurrentUser — enough to authorize against.
export interface CurrentUser {
  id: string
  email: string
  role: string
}

/**
 * Resolve the authenticated dashboard user from the next-auth session, then
 * fetch the persisted User row so the real role (SUPER_ADMIN | ADMIN | ...) is
 * used instead of the JWT-time value. Returns null when unauthenticated.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email
  if (!email) return null

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true },
  })
  return user ?? null
}

export function isSuperAdmin(user: { role: string } | null | undefined): boolean {
  return !!user && user.role === ROLE.SUPER_ADMIN
}

// ── MIGRATION BRIDGE: legacy flat keys → new 4-level hierarchy ───────────
// During the RBAC migration, the OLD flat PERMISSIONS keys are mapped to the
// NEW "::"-separated keys. A call to hasPermission(K) is now answered by the
// new resolver checking ALL mapped new keys (a legacy key like
// TRANSACTION_APPROVE maps to several page-specific approve_* actions, so we
// grant if ANY is held — matching the old coarse behavior). Legacy flat
// UserPermission grants are ALSO still honored, so nothing breaks before
// roles are fully assigned.
const LEGACY_KEY_MAP: Record<PermissionKey, string[]> = {
  MEETING_ATTENDANCE_MARK: ["Operations & Management::Meeting Management::::mark_attendance"],
  MEETING_MINUTES_UPLOAD: ["Operations & Management::Meeting Management::::upload_minutes"],
  TRANSACTION_CREATE: [
    "Transactions::Deposit Entry::::create_deposit",
    "Transactions::Withdrawal Entry::::create_withdrawal",
    "Transactions::Apply Charges::::create_charge",
    "Transactions::Distribute Income::::create_distribution",
  ],
  TRANSACTION_SUBMIT: ["Transactions::Admin Submitted::::approve"],
  TRANSACTION_APPROVE: [
    "Transactions::Deposit Entry::::approve_deposit",
    "Transactions::Withdrawal Entry::::approve_withdrawal",
    "Transactions::Apply Charges::::approve_charge",
    "Transactions::Admin Submitted::::approve",
    "Transactions::Member Requests::::approve",
  ],
  TRANSACTION_REVERSE: [
    "Transactions::Deposit Entry::::reverse_deposit",
    "Transactions::Withdrawal Entry::::reverse_withdrawal",
    "Transactions::Apply Charges::::reverse_charge",
    "Transactions::Distribute Income::::reverse_distribution",
  ],
  USER_MANAGE: ["System & Settings::User Control::::manage_permissions"],
  TASK_CREATE: ["Operations & Management::All Tasks::::create_task"],
  TASK_VIEW_ALL: ["Operations & Management::All Tasks"],
  TASK_ASSIGN: ["Operations & Management::All Tasks::::assign_task"],
  TASK_APPROVE: ["Operations & Management::All Tasks::::approve_task"],
  TASK_DELETE: ["Operations & Management::All Tasks::::delete_task"],
  TASK_MANAGE_RECURRING: ["Operations & Management::All Tasks::::edit_task"],
  COMMITTEE_MANAGE: ["Operations & Management::Committees"],
  INVESTMENT_MANAGE: ["Operations & Management::Investment Management"],
  INVESTMENT_VIEW: ["Operations & Management::Investment Management"],
  PROJECT_MANAGE: ["Operations & Management::Project Management"],
  PROJECT_VIEW: ["Operations & Management::Project Management"],
  ELECTION_MANAGE: ["Operations & Management::Election Management"],
  ELECTION_REVIEW: ["Operations & Management::Election Management::::review_candidate"],
  ELECTION_VIEW: ["Operations & Management::Election Management"],
}

/**
 * True if the user holds the given permission grant. SUPER_ADMIN always true.
 *
 * MIGRATION: checks BOTH the new RBAC resolver (via the mapped hierarchy key)
 * AND the legacy flat UserPermission table, so grants made under either system
 * are honored. Once all grants are migrated to roles/overrides, the legacy
 * fallback can be removed.
 */
export async function hasPermission(userId: string, key: PermissionKey, user?: { role: string } | null): Promise<boolean> {
  if (isSuperAdmin(user)) return true

  // 1. Legacy flat grant (direct UserPermission row).
  const legacyRow = await prisma.userPermission.findUnique({
    where: { userId_permission: { userId, permission: key } },
    select: { id: true },
  })
  if (legacyRow) return true

  // 2. New RBAC resolver via the mapped hierarchy key(s).
  const newKeys = LEGACY_KEY_MAP[key]
  if (newKeys && newKeys.length > 0) {
    const { getUserPermissions } = await import("@/lib/permissions/resolver")
    const { permissionGranted } = await import("@/lib/permissions/resolver")
    const set = await getUserPermissions(userId)
    if (newKeys.some((k) => permissionGranted(set, k))) return true
  }

  return false
}

/** SUPER_ADMIN only — throws if the caller is not a super admin. */
export function requireSuperAdmin(user: CurrentUser | null): asserts user is CurrentUser {
  if (!isSuperAdmin(user)) {
    throw new Error("Only the Super Admin can perform this action.")
  }
}

/**
 * Resolve the dashboard user and verify they hold the given permission.
 * SUPER_ADMIN always passes. Returns the user so callers can chain.
 * Throws if unauthenticated or unauthorised.
 */
export async function requirePermission(
  user: CurrentUser | null,
  key: PermissionKey
): Promise<CurrentUser> {
  if (!user) throw new Error("You must be signed in to perform this action.")
  if (isSuperAdmin(user)) return user
  const granted = await hasPermission(user.id, key, user)
  if (!granted) {
    throw new Error(`You do not have the "${key}" permission.`)
  }
  return user
}

/**
 * Resolve the current user and confirm their account is still active
 * (not disabled by an admin). Throws if unauthenticated or disabled.
 */
export async function requireActiveUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be signed in to perform this action.")
  // Re-check isActive from the DB row we already loaded.
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { isActive: true },
  })
  if (!row?.isActive) {
    throw new Error("Your account has been disabled. Contact an administrator.")
  }
  return user
}

/** All permission keys for display in a UI (matrix / grant forms). */
export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS)

/**
 * Permission catalogue shown in the management matrix — grouped by module so
 * the UI can render labelled sections.
 */
export const PERMISSION_GROUPS: { group: string; keys: PermissionKey[] }[] = [
  {
    group: "Meetings",
    keys: [PERMISSIONS.MEETING_ATTENDANCE_MARK, PERMISSIONS.MEETING_MINUTES_UPLOAD],
  },
  {
    group: "Transactions",
    keys: [
      PERMISSIONS.TRANSACTION_CREATE,
      PERMISSIONS.TRANSACTION_SUBMIT,
      PERMISSIONS.TRANSACTION_APPROVE,
      PERMISSIONS.TRANSACTION_REVERSE,
    ],
  },
  {
    group: "User Management",
    keys: [PERMISSIONS.USER_MANAGE],
  },
  {
    group: "Tasks",
    keys: [
      PERMISSIONS.TASK_CREATE,
      PERMISSIONS.TASK_VIEW_ALL,
      PERMISSIONS.TASK_ASSIGN,
      PERMISSIONS.TASK_APPROVE,
      PERMISSIONS.TASK_DELETE,
      PERMISSIONS.TASK_MANAGE_RECURRING,
    ],
  },
  {
    group: "Committees",
    keys: [PERMISSIONS.COMMITTEE_MANAGE],
  },
  {
    group: "Investments & Projects",
    keys: [
      PERMISSIONS.INVESTMENT_MANAGE,
      PERMISSIONS.INVESTMENT_VIEW,
      PERMISSIONS.PROJECT_MANAGE,
      PERMISSIONS.PROJECT_VIEW,
    ],
  },
  {
    group: "Elections",
    keys: [
      PERMISSIONS.ELECTION_MANAGE,
      PERMISSIONS.ELECTION_REVIEW,
      PERMISSIONS.ELECTION_VIEW,
    ],
  },
]

/** Read-only list of all permission keys for clients (e.g. import into forms). */
export const ALL_PERMISSIONS = ALL_PERMISSION_KEYS

// ── Meeting-specific authorization helpers (rules 5 & 6) ──────────────────────

/**
 * Attendance may be edited when it has not been submitted yet, OR by the
 * Super Admin at any time (rule 5).
 */
export function canEditAttendance(meeting: { attendanceLocked: boolean }, user: { role: string } | null | undefined): boolean {
  if (isSuperAdmin(user)) return true
  return !meeting.attendanceLocked
}

/**
 * Minutes may be uploaded when not yet locked, OR replaced by the Super Admin
 * at any time (rule 6).
 */
export function canUploadMinutes(meeting: { minutesLocked: boolean }, user: { role: string } | null | undefined): boolean {
  if (isSuperAdmin(user)) return true
  return !meeting.minutesLocked
}
