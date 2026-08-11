"use server"

import prisma, { directPrisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"
import {
  getCurrentUser,
  requireSuperAdmin,
  PERMISSIONS,
  ROLE,
  ALL_PERMISSION_KEYS,
  type PermissionKey,
} from "@/lib/permissions"

export type ActionResult = { ok: true; userId?: string } | { ok: false; error: string }

const USERS_PATH = "/dashboard/users"

// PERMISSION_GROUPS and ALL_PERMISSIONS live in @/lib/permissions — a "use
// server" module may only export async functions, so non-function values are
// kept there and imported by client components directly.

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------
export async function createUser(formData: FormData): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    requireSuperAdmin(user)

    const name = ((formData.get("name") as string) || "").trim()
    const email = ((formData.get("email") as string) || "").trim().toLowerCase()
    const phone = ((formData.get("phone") as string) || "").trim()
    const role = (formData.get("role") as string) || ROLE.ADMIN
    const password = (formData.get("password") as string) || ""

    if (!email) return { ok: false, error: "Email is required." }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return { ok: false, error: "Please enter a valid email address." }
    if (password.length < 6)
      return { ok: false, error: "Password must be at least 6 characters." }
    if (!([ROLE.SUPER_ADMIN, ROLE.ADMIN] as string[]).includes(role))
      return { ok: false, error: "Invalid role." }
    const roleValue = role as "SUPER_ADMIN" | "ADMIN"

    const clash = await prisma.user.findUnique({ where: { email } })
    if (clash) return { ok: false, error: "A user with this email already exists." }

    const hashed = await bcrypt.hash(password, 12)
    const created = await prisma.user.create({
      data: {
        email,
        password: hashed,
        role: roleValue,
        name: name || null,
        phone: phone || null,
        isActive: true,
        createdBy: user.email,
      },
      select: { id: true },
    })
    revalidatePath(USERS_PATH)
    return { ok: true, userId: created.id }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// UPDATE profile (name/phone/email/role)
// ---------------------------------------------------------------------------
export async function updateUser(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    requireSuperAdmin(user)

    const target = await prisma.user.findUnique({ where: { id } })
    if (!target) return { ok: false, error: "User not found." }

    const name = ((formData.get("name") as string) || "").trim()
    const email = ((formData.get("email") as string) || "").trim().toLowerCase()
    const phone = ((formData.get("phone") as string) || "").trim()
    const role = (formData.get("role") as string) || target.role

    if (!email) return { ok: false, error: "Email is required." }
    if (!([ROLE.SUPER_ADMIN, ROLE.ADMIN] as string[]).includes(role))
      return { ok: false, error: "Invalid role." }
    const roleValue = role as "SUPER_ADMIN" | "ADMIN"

    // Demotion guardrail — cannot demote the last remaining SUPER_ADMIN.
    if (target.role === ROLE.SUPER_ADMIN && roleValue !== ROLE.SUPER_ADMIN) {
      await guardLastSuperAdmin(id)
    }
    // Prevent demoting yourself out of super-admin (lockout protection).
    if (target.id === user.id && target.role === ROLE.SUPER_ADMIN && roleValue !== ROLE.SUPER_ADMIN) {
      return {
        ok: false,
        error: "You cannot demote yourself. Ask another Super Admin to do it.",
      }
    }

    if (email !== target.email) {
      const clash = await prisma.user.findUnique({ where: { email } })
      if (clash) return { ok: false, error: "Email already in use." }
    }

    await prisma.user.update({
      where: { id },
      data: {
        name: name || null,
        email,
        phone: phone || null,
        role: roleValue,
      },
    })
    revalidatePath(USERS_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// ACTIVATE / DEACTIVATE
// ---------------------------------------------------------------------------
export async function setUserActive(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    requireSuperAdmin(user)

    const target = await prisma.user.findUnique({ where: { id } })
    if (!target) return { ok: false, error: "User not found." }

    if (!isActive) {
      // Never lock yourself out.
      if (target.id === user.id) {
        return { ok: false, error: "You cannot disable your own account." }
      }
      // Never remove the last Super Admin.
      if (target.role === ROLE.SUPER_ADMIN) {
        await guardLastSuperAdmin(id)
      }
    }

    await prisma.user.update({ where: { id }, data: { isActive } })
    revalidatePath(USERS_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// ADMIN RESET PASSWORD
// ---------------------------------------------------------------------------
export async function resetUserPassword(id: string, newPassword: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    requireSuperAdmin(user)

    if (!newPassword || newPassword.length < 6) {
      return { ok: false, error: "Password must be at least 6 characters." }
    }
    const target = await prisma.user.findUnique({ where: { id } })
    if (!target) return { ok: false, error: "User not found." }

    const hashed = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id }, data: { password: hashed } })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// DELETE — guarded
// ---------------------------------------------------------------------------
export async function deleteUser(id: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    requireSuperAdmin(user)

    if (id === user.id) {
      return { ok: false, error: "You cannot delete your own account." }
    }
    const target = await prisma.user.findUnique({ where: { id } })
    if (!target) return { ok: false, error: "User not found." }
    if (target.role === ROLE.SUPER_ADMIN) {
      await guardLastSuperAdmin(id)
    }
    await prisma.user.delete({ where: { id } })
    revalidatePath(USERS_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// PERMISSION GRANT / REVOKE (generalised; replaces meeting-only helpers)
// ---------------------------------------------------------------------------
export async function grantPermission(userId: string, key: PermissionKey): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    requireSuperAdmin(user)
    if (!ALL_PERMISSION_KEYS.includes(key)) {
      return { ok: false, error: "Unknown permission key." }
    }
    await prisma.userPermission.upsert({
      where: { userId_permission: { userId, permission: key } },
      update: {},
      create: { userId, permission: key },
    })
    revalidatePath(USERS_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function revokePermission(userId: string, key: PermissionKey): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    requireSuperAdmin(user)
    await prisma.userPermission
      .delete({ where: { userId_permission: { userId, permission: key } } })
      .catch(() => {}) // idempotent
    revalidatePath(USERS_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// ROLE ASSIGNMENT (new RBAC system)
// ---------------------------------------------------------------------------
// The user form's "Role" dropdown lists every RBAC Role (Treasurer, Auditor,
// Committee Member, …). Picking one:
//   1. Assigns that Role to the user via UserRole, REPLACING any previously
//      assigned non-system role (a user holds one functional role at a time;
//      the resolver unions all roles, but the UI models "primary role").
//   2. Derives the legacy User.role string used by auth routing (proxy.ts) and
//      getCurrentUser(): SUPER_ADMIN if the chosen role is a super-admin role,
//      otherwise ADMIN. This keeps the dashboard/portal split working while
//      the new RBAC system controls in-dashboard granularity.
//
// System super-admin role is handled specially: assigning it sets
// User.role=SUPER_ADMIN and never gets auto-replaced.
export async function setUserRole(userId: string, roleId: string): Promise<ActionResult> {
  try {
    const actor = await getCurrentUser()
    requireSuperAdmin(actor)

    const [target, role] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } }),
      prisma.role.findUnique({ where: { id: roleId }, select: { id: true, name: true, isSuperAdmin: true } }),
    ])
    if (!target) return { ok: false, error: "User not found." }
    if (!role) return { ok: false, error: "Role not found." }

    // Lockout guardrail: cannot remove the last active super-admin.
    const demotingFromSuper =
      target.role === ROLE.SUPER_ADMIN && !role.isSuperAdmin
    if (demotingFromSuper) {
      if (target.id === actor.id) {
        return { ok: false, error: "You cannot demote yourself. Ask another Super Admin." }
      }
      await guardLastSuperAdmin(userId)
    }

    // Derive the legacy routing value.
    const roleValue: "SUPER_ADMIN" | "ADMIN" = role.isSuperAdmin ? ROLE.SUPER_ADMIN : ROLE.ADMIN

    await directPrisma.$transaction(async (tx) => {
      // Replace any previously-assigned non-system roles with the new one.
      // System super-admin role assignments are preserved (a user may hold
      // the Super Admin role alongside a functional role).
      const previous = await tx.userRole.findMany({
        where: { userId },
        include: { role: { select: { id: true, isSuperAdmin: true, isSystem: true } } },
      })
      const toRemove = previous.filter(
        (ur) => !(ur.role.isSuperAdmin && ur.role.isSystem)
      )
      // UserRole has a composite PK (userId, roleId), so delete each prior
      // functional assignment by its composite key.
      for (const ur of toRemove) {
        await tx.userRole.delete({
          where: { userId_roleId: { userId, roleId: ur.role.id } },
        })
      }

      // Assign the new role (idempotent).
      await tx.userRole.upsert({
        where: { userId_roleId: { userId, roleId: role.id } },
        update: { assignedBy: actor.email ?? undefined },
        create: { userId, roleId: role.id, assignedBy: actor.email ?? undefined },
      })

      // Sync the legacy routing value.
      await tx.user.update({ where: { id: userId }, data: { role: roleValue } })

      // Audit trail.
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          targetUserId: userId,
          targetRoleId: role.id,
          action: "ROLE_ASSIGNED",
          details: { roleName: role.name, routingRole: roleValue },
        },
      })
    })

    revalidatePath(USERS_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * All RBAC roles for the user form's Role dropdown, with each user's currently
 * assigned role id. Returns { roles, currentRoleId } so the form can mark the
 * selected option. Used by both the create and edit forms.
 */
export async function getRolesForForm(userId?: string): Promise<{
  roles: Array<{ id: string; name: string; description: string | null; isSystem: boolean; isSuperAdmin: boolean }>
  currentRoleId: string | null
}> {
  const [roles, current] = await Promise.all([
    prisma.role.findMany({
      orderBy: [{ isSuperAdmin: "desc" }, { name: "asc" }],
      select: { id: true, name: true, description: true, isSystem: true, isSuperAdmin: true },
    }),
    userId
      ? prisma.userRole.findFirst({
          where: { userId },
          include: { role: { select: { id: true, isSuperAdmin: true, isSystem: true } } },
          orderBy: { role: { isSuperAdmin: "desc" } },
        })
      : null,
  ])
  return {
    roles,
    // Prefer the current functional (non-super) role as the "current" selection,
    // falling back to a system super-admin role if that's all they have.
    currentRoleId:
      current?.role.id ?? roles.find((r) => r.name === "Super Admin" && r.isSuperAdmin)?.id ?? null,
  }
}

// ---------------------------------------------------------------------------
// Guardrail: refuse to remove the last Super Admin.
// ---------------------------------------------------------------------------
async function guardLastSuperAdmin(keepId: string): Promise<void> {
  const superAdmins = await prisma.user.count({
    where: { role: ROLE.SUPER_ADMIN, isActive: true },
  })
  if (superAdmins <= 1) {
    throw new Error(
      "This action would leave the system without any active Super Admin. " +
        "Promote another user first."
    )
  }
  // extra paranoia: confirm the kept user is actually a super admin
  const target = await prisma.user.findUnique({ where: { id: keepId } })
  if (target?.role !== ROLE.SUPER_ADMIN) return
}
