// Notification dispatcher (FRS §14).
//
// Fires after the recalculation transaction commits. Non-blocking by contract
// — callers `void` the returned promise (see recalculate.ts). Writes rows to
// the per-member MemberNotification table, which surfaces in the portal bell
// (via getMemberNotifications) and can be extended to email/SMS later.
//
// Minor score changes (< 2 points) are batched/suppressed per FRS §14.2.

import prisma from "@/lib/prisma"
import type { TrustScoreResult } from "./types"

interface AchievementDef {
  code: string
  name: string
  emoji: string
  earned: boolean
}

const MIN_CHANGE_TO_NOTIFY = 2

/**
 * Write in-app notifications for meaningful score/badge/suspension changes.
 * Compares earned/lost achievement sets against prior state by inspecting the
 * stored AchievementBadge rows.
 */
export async function dispatchNotifications(
  result: TrustScoreResult,
  scoreBefore: number,
  badgeEmoji: string,
  liveAchievements: AchievementDef[]
): Promise<void> {
  const items: { type: string; title: string; message: string }[] = []

  // Score change notifications.
  if (result.scoreChange >= MIN_CHANGE_TO_NOTIFY) {
    items.push({
      type: "SCORE_INCREASED",
      title: "Trust Score Increased",
      message: `Your Trust Score rose from ${scoreBefore} to ${result.scoreAfter} (+${result.scoreChange}).`,
    })
  } else if (result.scoreChange <= -MIN_CHANGE_TO_NOTIFY) {
    items.push({
      type: "SCORE_DECREASED",
      title: "Trust Score Changed",
      message: `Your Trust Score moved from ${scoreBefore} to ${result.scoreAfter} (${result.scoreChange}).`,
    })
  }

  // Suspension / reactivation.
  if (result.suspended) {
    items.push({
      type: "AUTO_SUSPENDED",
      title: "Account Suspended",
      message: `Your Trust Score (${result.scoreAfter}) fell below the threshold and your account has been automatically suspended. Please contact the committee.`,
    })
  }
  if (result.reactivated) {
    items.push({
      type: "REACTIVATED",
      title: "Account Reactivated",
      message: `Your account has been reactivated. Current Trust Score: ${result.scoreAfter}.`,
    })
  }

  // Achievement badges: diff against stored rows to find newly earned/lost.
  const stored = await prisma.achievementBadge.findMany({
    where: { memberId: result.memberId },
    select: { badgeCode: true, status: true },
  })
  const activeStored = new Set(
    stored
      .filter((s: { status: string }) => s.status === "ACTIVE")
      .map((s: { badgeCode: string }) => s.badgeCode)
  )

  for (const def of liveAchievements) {
    const wasActive = activeStored.has(def.code)
    // `def.earned` reflects post-commit state. If the badge row was just
    // inserted (earned) and wasn't previously active → earned notification.
    // If it was just marked LOST → lost notification.
    if (def.earned && !wasActive) {
      // The row may have existed as ACTIVE already if it carried over; check by
      // re-reading would be racy, so rely on the diff result the orchestrator
      // already computed via syncAchievementBadges. Simpler: only notify when
      // the live set says earned AND it's listed in result.achievementsEarned.
      if (result.achievementsEarned.some((e) => e.code === def.code)) {
        items.push({
          type: "ACHIEVEMENT_EARNED",
          title: "Achievement Unlocked!",
          message: `You earned the ${def.emoji} ${def.name} badge.`,
        })
      }
    } else if (!def.earned && wasActive) {
      if (result.achievementsLost.some((e) => e.code === def.code)) {
        items.push({
          type: "ACHIEVEMENT_LOST",
          title: "Achievement Lost",
          message: `You lost the ${def.emoji} ${def.name} badge. Keep your activity consistent to earn it back.`,
        })
      }
    }
  }

  if (items.length === 0) return

  await prisma.memberNotification.createMany({
    data: items.map((i) => ({
      memberId: result.memberId,
      type: i.type,
      title: i.title,
      message: i.message,
    })),
  })
}
