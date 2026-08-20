"use server"

import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/permissions"

// Same union shape used across app/actions/*.ts — defined locally per file so
// each domain module stays self-contained.
export type ActionResult = { ok: true } | { ok: false; error: string }

const PROFILE_PATH = "/dashboard/profile"

/**
 * Self-service profile update for the signed-in admin.
 *
 * Only name and phone are editable here. Email is intentionally NOT exposed:
 * the next-auth JWT carries the login-time email, and getCurrentUser() resolves
 * the session by that email — so changing it here would invalidate the session
 * on the next request (the user would appear logged out). Super Admins who
 * need to change an email should do it under Users management (which also
 * requires the target to re-authenticate).
 */
export async function updateProfile(formData: FormData): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: "Not authenticated." }

    const name = ((formData.get("name") as string) || "").trim()
    const phone = ((formData.get("phone") as string) || "").trim()

    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: name || null,
        phone: phone || null,
      },
    })
    revalidatePath(PROFILE_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Change the signed-in admin's own password. Requires the current password to
 * be re-typed (defense against a stolen session being used to silently swap
 * the credential). The new password is hashed with bcrypt (cost 10), matching
 * createUser / resetUserPassword.
 */
export async function changeOwnPassword(formData: FormData): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: "Not authenticated." }

    const current = (formData.get("currentPassword") as string) || ""
    const next = (formData.get("newPassword") as string) || ""

    if (!next || next.length < 6) {
      return { ok: false, error: "New password must be at least 6 characters." }
    }
    if (current === next) {
      return { ok: false, error: "New password must be different from the current one." }
    }

    const target = await prisma.user.findUnique({
      where: { id: user.id },
      select: { password: true },
    })
    if (!target) return { ok: false, error: "Account not found." }

    const matched = await bcrypt.compare(current, target.password)
    if (!matched) return { ok: false, error: "Current password is incorrect." }

    const hashed = await bcrypt.hash(next, 10)
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
