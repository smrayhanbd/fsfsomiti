"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"

// ──────────────────────────────────────────────────────────────────────────────
// IDOR guard — derive memberId from the authenticated session, never from
// the request body. Mirrors the proven pattern in app/actions/elections.ts
// (getCurrentMemberId at lines 88-98) and app/actions/portal.ts.
// ──────────────────────────────────────────────────────────────────────────────
async function getCurrentMemberId(): Promise<string> {
  const { getServerSession } = await import("next-auth")
  const { authOptions } = await import("@/lib/auth")
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") {
    throw new Error("You must be signed in as a member to perform this action.")
  }
  return session.user.id
}

// =====================================================================
// ADMIN NOTIFICATIONS
//
// Global (not per-admin-user) notifications surfaced in the Topbar bell
// and on /dashboard/notifications. Producers are server actions across
// the app: member-portal requests create a row here so admins see a live
// feed of what needs attention, with a `link` so a click jumps straight
// to the relevant approval queue.
//
// `createAdminNotification` is deliberately non-throwing — a notification
// is best-effort and must never break the member action that triggered it
// (same philosophy as lib/tasks/spawn.ts).
// =====================================================================

export interface CreateAdminNotificationInput {
  type?: string // e.g. "MEMBER_REQUEST", "PROFILE_REQUEST", "LOAN_REQUEST", "SYSTEM"
  title: string
  message: string
  link?: string // dashboard path to open when clicked
}

/**
 * Create a global admin notification. Never throws — failures are logged
 * and swallowed so the caller's business logic is unaffected.
 */
export async function createAdminNotification(
  input: CreateAdminNotificationInput
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        type: input.type ?? "SYSTEM",
        title: input.title,
        message: input.message,
        link: input.link ?? null,
      },
    })
    // Revalidate so the Topbar bell reflects the new item on next render.
    revalidatePath("/dashboard")
  } catch (e) {
    console.error("[notifications] createAdminNotification failed:", input.title, e)
  }
}

/**
 * Mark a single notification as read. Called when an admin clicks a row.
 */
export async function markNotificationRead(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    })
    revalidatePath("/dashboard")
    revalidatePath("/dashboard/notifications")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Mark every notification as read. Called from the notifications page
 * "Mark all as read" button.
 */
export async function markAllNotificationsRead(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    await prisma.notification.updateMany({
      where: { isRead: false },
      data: { isRead: true },
    })
    revalidatePath("/dashboard")
    revalidatePath("/dashboard/notifications")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Mark all of a member's notifications as read/dismissed.
 * Called from the member portal topbar "Mark all as read" button.
 *
 * Handles BOTH kinds of portal notifications:
 *  1. Persistent MemberNotification rows (trust score, badges) → set isRead=true
 *  2. Computed notifications (meetings, dues, resolved requests) → record their
 *     stable ID in MemberNotificationDismissal so they're filtered out until
 *     the underlying condition changes (e.g. a new request resolves → new ID).
 */
export async function markAllMemberNotificationsRead(
  memberId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // IDOR guard (S4): derive memberId from the session. The client-supplied
    // memberId is ignored — if it doesn't match the session we throw.
    let memberIdResolved: string
    try {
      memberIdResolved = await getCurrentMemberId()
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
    if (memberId && memberId !== memberIdResolved) {
      return { ok: false, error: "Unauthorized: session does not match requested member." }
    }
    memberId = memberIdResolved

    // 1. Mark all persistent MemberNotification rows as read.
    await prisma.memberNotification.updateMany({
      where: { memberId, isRead: false },
      data: { isRead: true },
    })

    // 2. Dismiss all currently-visible computed notifications.
    //    We re-fetch the current notification list (which excludes already-
    //    dismissed ones) and record each computed notification's ID.
    const { getMemberNotifications } = await import("@/app/actions/portal")
    const current = await getMemberNotifications(memberId)
    if (current.length > 0) {
      await prisma.memberNotificationDismissal.createMany({
        data: current.map((n) => ({
          memberId,
          notificationKey: n.id,
        })),
        skipDuplicates: true,
      })
    }

    revalidatePath("/portal")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Mark a single member notification as read/dismissed.
 * Works for both persistent MemberNotification rows and computed notifications
 * (by recording the notificationKey in MemberNotificationDismissal).
 */
export async function markMemberNotificationRead(
  memberId: string,
  notificationId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // IDOR guard (S4): derive memberId from the session.
    let memberIdResolved: string
    try {
      memberIdResolved = await getCurrentMemberId()
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
    if (memberId && memberId !== memberIdResolved) {
      return { ok: false, error: "Unauthorized: session does not match requested member." }
    }
    memberId = memberIdResolved

    // Try marking as a persistent MemberNotification row first.
    const result = await prisma.memberNotification.updateMany({
      where: { id: notificationId, memberId },
      data: { isRead: true },
    })
    // If no persistent row was updated, treat it as a computed notification
    // and record its dismissal.
    if (result.count === 0) {
      await prisma.memberNotificationDismissal.upsert({
        where: { memberId_notificationKey: { memberId, notificationKey: notificationId } },
        create: { memberId, notificationKey: notificationId },
        update: { dismissedAt: new Date() },
      })
    }
    revalidatePath("/portal")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
