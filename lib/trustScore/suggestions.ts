// Rule-based recommendation engine (FRS §13).
//
// Purely rule-based — no external AI service. Generates personalized
// improvement suggestions, sorted by potential score gain (FRS §13.1).

import type { KpiConfig } from "./config"
import type { MemberContext } from "./context"
import type { KpiBreakdown } from "./types"
import { assignBadgeLevel } from "./badges"

export interface Suggestion {
  /** The KPI this suggestion targets, or 'GENERAL'. */
  kpi: string
  /** Potential score gain if the suggestion is actioned. */
  potentialGain: number
  /** Human-readable message (FRS §13.2 templates). */
  message: string
}

/**
 * Build the suggestion list for a member. Always returns at most 5 suggestions,
 * sorted by potentialGain descending (FRS §13.1).
 */
export function generateSuggestions(
  ctx: MemberContext,
  config: KpiConfig,
  breakdowns: KpiBreakdown[],
  score: number
): Suggestion[] {
  const out: Suggestion[] = []

  for (const b of breakdowns) {
    if (!b.applicable) continue
    const gap = round2(b.max - b.score)
    if (gap > 0) {
      out.push({
        kpi: b.code,
        potentialGain: gap,
        message: suggestionFor(b.code, b, ctx, gap),
      })
    }
  }

  // "Within 5 points of the next badge" nudge (FRS §13.2).
  const nextBadge = nextBadgeTarget(score, config)
  if (nextBadge) {
    const diff = nextBadge.min - score
    if (diff > 0 && diff <= 5) {
      out.push({
        kpi: "GENERAL",
        potentialGain: 0,
        message: `You are only ${diff} points away from ${nextBadge.label} status.`,
      })
    }
  }

  // Sort by potentialGain desc, then keep top 5.
  out.sort((a, b) => b.potentialGain - a.potentialGain)
  return out.slice(0, 5)
}

function suggestionFor(
  code: string,
  b: KpiBreakdown,
  ctx: MemberContext,
  gap: number
): string {
  switch (code) {
    case "DEPOSIT": {
      const cycles = ctx.depositCycles
      const late = cycles.filter((c) => c.daysLate && c.daysLate > 0).length
      if (late > 0) {
        return `Paying your next ${late > 1 ? `${late} deposits` : "deposit"} on time will improve your Deposit Discipline score by ~${gap} points.`
      }
      return "Paying your next deposit on time will improve your Deposit Discipline score."
    }
    case "ATTEND":
      return `Attending the next meeting could earn you approximately ${gap} points.`
    case "FINE": {
      const active = ctx.fines.filter((f) => f.status === "ISSUED").length
      const penalty = ctx.fines
        .filter((f) => f.status === "ISSUED")
        .reduce((s, f) => s + (f.fineType.penaltyPoints || 0), 0)
      return `Resolving your ${active} active fine(s) will restore up to ${penalty} points.`
    }
    case "REFERRAL": {
      const active = ctx.referrals.filter((r) =>
        ["ACTIVE", "PENDING"].includes(r.status)
      ).length
      const need = Math.max(0, 5 - active)
      return `Refer ${need} more active member(s) to earn up to ${gap} more points.`
    }
    case "LOAN":
      return `Paying your loan installments on time will improve your Loan Repayment score by ~${gap} points.`
    default:
      return `You can gain up to ${gap} more points in this area.`
  }
}

/** Find the next badge tier the member could reach. */
function nextBadgeTarget(
  score: number,
  config: KpiConfig
): { label: string; min: number } | null {
  const tiers = [
    { label: "Diamond Member", min: config.badgeDiamondMin },
    { label: "Platinum Member", min: config.badgePlatinumMin },
    { label: "Gold Member", min: config.badgeGoldMin },
    { label: "Silver Member", min: config.badgeSilverMin },
  ]
  for (const t of tiers) {
    if (score < t.min) return t
  }
  return null
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// Re-exported so call sites don't need to import from badges.ts separately.
export { assignBadgeLevel }
