// Trust Score recalculation orchestrator (FRS §7).
//
// This is the single entry point: `recalculateTrustScore(memberId, eventType)`.
// It is event-driven (FRS §8) and NEVER exposed via a public API (FRS §23.5).
// Existing server actions call it after their DB writes commit.
//
// Steps 9 (member update + audit log) run as ONE atomic $transaction so there
// are never partial states (FRS §7, §23.2). Achievement-badge diffing and
// notifications run after the commit and are non-blocking (FRS §14.2).

import prisma, { directPrisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { getKpiConfig } from "./config"
import { loadMemberContext } from "./context"
import { computeRedistributedWeights } from "./weights"
import { calculateDepositKpi } from "./kpis/deposit"
import { calculateLoanKpi } from "./kpis/loan"
import { calculateAttendKpi } from "./kpis/attend"
import { calculateFineKpi } from "./kpis/fine"
import { calculateReferralKpi } from "./kpis/referral"
import { assembleScore } from "./assembler"
import { assignBadgeLevel, assignRiskLevel, evaluateAchievements } from "./badges"
import type { KpiBreakdown, ScoreEventType, TrustScoreResult } from "./types"

// Async side-effects (notifications + suggestions cache) are dispatched via
// these helpers so the orchestrator stays focused on the atomic core.
import { dispatchNotifications } from "./notifications"

/**
 * Recalculate a member's Trust Score. Idempotent: calling it again with the
 * same data produces the same result and only one audit row per call.
 *
 * @returns the full result, or null if the member does not exist.
 */
export async function recalculateTrustScore(
  memberId: string,
  eventType: ScoreEventType,
  options: { createdBy?: string; referenceId?: string; referenceType?: string } = {}
): Promise<TrustScoreResult | null> {
  const config = await getKpiConfig()
  const ctx = await loadMemberContext(memberId)
  if (!ctx) return null

  const scoreBefore = ctx.member.trustScore ?? config.initialScore

  // 1. Determine applicability. LOAN is N/A when the member has no loans.
  const loanResult = calculateLoanKpi(ctx, config, config.loanWeight)
  const applicable = {
    DEPOSIT: true,
    LOAN: loanResult.applicable,
    ATTEND: true,
    FINE: true,
    REFERRAL: true,
  }

  // 2. Compute redistributed weights (applicable weights sum to 100).
  const { weights } = computeRedistributedWeights(applicable, config)

  // 3. Run each applicable KPI calculator with its redistributed weight.
  const breakdowns: KpiBreakdown[] = [
    calculateDepositKpi(ctx, config, weights.DEPOSIT),
    loanResult.breakdown,
    calculateAttendKpi(ctx, config, weights.ATTEND),
    calculateFineKpi(ctx, config, weights.FINE),
    calculateReferralKpi(ctx, config, weights.REFERRAL),
  ]

  // 4. Assemble the final score (clamp + round).
  const { trustScore: scoreAfter, rawTotal } = assembleScore(breakdowns)
  const badge = assignBadgeLevel(scoreAfter, config)
  const risk = assignRiskLevel(scoreAfter)
  const scoreChange = scoreAfter - scoreBefore

  // 5. Evaluate achievement badges against live data.
  const achievementDefs = evaluateAchievements(ctx)

  // 6. Atomic transaction: update member + write exactly one audit row (FRS §7.9).
  const wasSuspended = ctx.member.status === "SUSPENDED"
  let nowSuspended = wasSuspended
  let reactivated = false

  await directPrisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: memberId },
      data: {
        trustScore: scoreAfter,
        badgeLevel: badge.label,
        riskLevel: risk,
        scoreLastUpdated: new Date(),
      },
    })

    await tx.trustScoreHistory.create({
      data: {
        memberId,
        eventType,
        referenceId: options.referenceId ?? null,
        referenceType: options.referenceType ?? null,
        // Which KPI moved (best-effort heuristic from the event type).
        kpiAffected: kpiForEvent(eventType),
        scoreBefore,
        scoreChange,
        scoreAfter,
        remarks: buildRemarks(eventType, breakdowns, rawTotal),
        createdBy: options.createdBy ?? "SYSTEM",
      },
    })

    // Diff achievement badges: newly-earned → insert ACTIVE; newly-lost → mark LOST.
    await syncAchievementBadges(tx, memberId, achievementDefs)

    // 7. Auto-suspension check (FRS §9.1) — only within the same transaction.
    if (scoreAfter < config.suspensionThreshold && ctx.member.status === "ACTIVE") {
      await tx.member.update({
        where: { id: memberId },
        data: { status: "SUSPENDED" },
      })
      nowSuspended = true
    }
  })

  // 8. Manual reactivation path: if a committee/admin triggered MEMBER_REACTIVATED
  // and the score clears the reactivation threshold, lift the suspension.
  if (eventType === "MEMBER_REACTIVATED" && ctx.member.status === "SUSPENDED") {
    if (scoreAfter >= config.reactivationThreshold) {
      await prisma.member.update({ where: { id: memberId }, data: { status: "ACTIVE" } })
      nowSuspended = false
      reactivated = true
    }
  }

  const result: TrustScoreResult = {
    memberId,
    eventType,
    scoreBefore,
    scoreAfter,
    scoreChange,
    badgeLevel: badge.label,
    riskLevel: risk,
    breakdown: breakdowns,
    achievementsEarned: achievementDefs
      .filter((d) => d.earned)
      .map((d) => ({ code: d.code, name: d.name })),
    achievementsLost: achievementDefs
      .filter((d) => !d.earned)
      .map((d) => ({ code: d.code, name: d.name })),
    suspended: nowSuspended && !wasSuspended,
    reactivated,
  }

  // 9. Non-blocking side-effects: notifications for meaningful changes (FRS §14).
  // Run after the commit so they never delay or break the score update.
  void dispatchNotifications(result, scoreBefore, badge.emoji, achievementDefs).catch(
    (e) => console.error("[trustScore] notification dispatch failed:", e)
  )

  return result
}

/** Map a ScoreEventType to the KPI it primarily affects (for audit). */
function kpiForEvent(eventType: ScoreEventType): string {
  if (eventType.startsWith("DEPOSIT")) return "DEPOSIT"
  if (eventType.startsWith("LOAN")) return "LOAN"
  if (eventType.startsWith("MEETING")) return "ATTEND"
  if (eventType.startsWith("FINE")) return "FINE"
  if (eventType.startsWith("REFERRAL")) return "REFERRAL"
  if (eventType === "MEMBER_CONFIG_CHANGED") return "ALL"
  if (eventType.startsWith("MEMBER")) return "ALL"
  return "NONE"
}

/** Human-readable audit remark summarizing the recalculation. */
function buildRemarks(eventType: string, breakdowns: KpiBreakdown[], rawTotal: number): string {
  const lines = breakdowns
    .filter((b) => b.applicable)
    .map((b) => `${b.code}: ${b.score}/${b.max}`)
    .join(", ")
  return `Event ${eventType}. Raw total ${rawTotal.toFixed(2)}. Breakdown — ${lines}.`
}

/**
 * Diff the live achievement evaluation against stored rows. Newly-earned badges
 * get an ACTIVE row; badges no longer met (and currently ACTIVE) get marked LOST
 * with lostDate set. History is preserved (FRS §10.2).
 */
async function syncAchievementBadges(
  tx: Prisma.TransactionClient,
  memberId: string,
  defs: { code: string; name: string; earned: boolean }[]
): Promise<void> {
  for (const def of defs) {
    const activeRow = await tx.achievementBadge.findFirst({
      where: { memberId, badgeCode: def.code, status: "ACTIVE" },
    })

    if (def.earned && !activeRow) {
      // Newly earned.
      await tx.achievementBadge.create({
        data: { memberId, badgeCode: def.code, badgeName: def.name, status: "ACTIVE" },
      })
    } else if (!def.earned && activeRow) {
      // Newly lost. LOYAL_MEMBER is permanent once earned (FRS §10.1) — skip.
      if (def.code === "LOYAL_MEMBER") continue
      await tx.achievementBadge.update({
        where: { id: activeRow.id },
        data: { status: "LOST", lostDate: new Date() },
      })
    }
  }
}
