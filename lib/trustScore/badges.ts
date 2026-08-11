// Badge assigner + achievement-badge evaluator (FRS §4, §10).
//
// assignBadgeLevel maps a score to a Trust Score tier (Diamond/Platinum/...).
// assignRiskLevel maps a score to a risk label.
// evaluateAchievements compares the live member context against the 7
// achievement-badge criteria and returns which badges should currently be held.

import type { KpiConfig } from "./config"
import type { MemberContext } from "./context"

export interface BadgeLevel {
  label: string
  emoji: string
  /** 0-indexed tier rank, higher = better. Used for upgrade/downgrade detection. */
  rank: number
}

/** FRS §4 badge tiers, in ascending rank order. */
const BADGE_TIERS = [
  { label: "Suspended Member", emoji: "❌" },
  { label: "High Risk", emoji: "🚨" },
  { label: "Needs Improvement", emoji: "⚠️" },
  { label: "Silver Member", emoji: "🥈" },
  { label: "Gold Member", emoji: "🥇" },
  { label: "Platinum Member", emoji: "🏆" },
  { label: "Diamond Member", emoji: "💎" },
]

/** Map a Trust Score to its badge tier, using config thresholds (FRS §4). */
export function assignBadgeLevel(score: number, config: KpiConfig): BadgeLevel {
  let idx: number
  if (score >= config.badgeDiamondMin) idx = 6
  else if (score >= config.badgePlatinumMin) idx = 5
  else if (score >= config.badgeGoldMin) idx = 4
  else if (score >= config.badgeSilverMin) idx = 3
  else if (score >= config.badgeWarningMin) idx = 2
  else if (score >= config.badgeHighRiskMin) idx = 1
  else idx = 0
  return { ...BADGE_TIERS[idx], rank: idx }
}

/** Map a Trust Score to a risk label (FRS §11.1). */
export function assignRiskLevel(score: number): string {
  if (score >= 80) return "Low Risk"
  if (score >= 60) return "Average"
  if (score >= 40) return "Elevated Risk"
  return "High Risk"
}

// ── Achievement badges (FRS §10) ───────────────────────────────────────────

export interface AchievementDef {
  code: string
  name: string
  emoji: string
  /** True if the member's live context currently meets the criteria. */
  earned: boolean
}

/**
 * Evaluate all 7 achievement badges against the member's live context + score.
 * The returned `earned` flags are diffed against stored rows in the orchestrator
 * to decide which badges to newly insert (ACTIVE) or mark lost.
 *
 * Criteria come from FRS §10.1 and are evaluated from live data at recalc time
 * (no separate scheduler required).
 */
export function evaluateAchievements(
  ctx: MemberContext
): AchievementDef[] {
  const now = new Date()

  // DEPOSIT helpers
  const cycles = ctx.depositCycles
  // 12 consecutive on-time deposits (most recent 12 all on-time).
  const last12 = cycles.slice(-12)
  const diamondSaver = cycles.length >= 12 && last12.every((c) => c.daysLate === 0)
  // 24 consecutive months with no late deposits.
  const last24 = cycles.slice(-24)
  const perfectPayer = cycles.length >= 24 && last24.every((c) => c.daysLate === 0)

  // ATTEND: 100% in a rolling 12-month window.
  const yearAgo = new Date(now)
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  const recentMeetings = ctx.attendance.filter((a) => new Date(a.markedAt) >= yearAgo)
  const totalMeetingsYear = ctx.totalMeetingsHeld
    ? Math.min(ctx.totalMeetingsHeld, ctx.attendance.length)
    : ctx.attendance.length
  const attendedRecent = recentMeetings.filter((a) => a.status === "PRESENT").length
  const meetingStar =
    totalMeetingsYear > 0 && attendedRecent >= totalMeetingsYear

  // FINE: no fines issued in the last 12 months.
  const yearFines = ctx.fines.filter((f) => new Date(f.issuedDate) >= yearAgo)
  const zeroFine = yearFines.length === 0

  // REFERRAL: 5+ active referrals.
  const activeReferrals = ctx.referrals.filter((r) =>
    ["ACTIVE", "PENDING"].includes(r.status)
  ).length
  const referralChampion = activeReferrals >= 5

  // LOAN HERO: all installments on time, no overdue.
  const hasLoans = ctx.loans.length > 0
  const allInstallmentsOnTime = hasLoans
    ? ctx.loans.every((loan) =>
        loan.schedule.every((inst: { dueDate: Date; status: string }) => {
          if (new Date(inst.dueDate) > now) return true
          return inst.status === "PAID" || inst.status === "WAIVED"
        })
      )
    : false
  const hasOverdue = ctx.loans.some((loan) =>
    loan.schedule.some((inst: { status: string }) => inst.status === "OVERDUE")
  )
  const loanHero = hasLoans && allInstallmentsOnTime && !hasOverdue

  // LOYAL MEMBER: 10+ years continuous membership.
  const loyalMember =
    now.getFullYear() - new Date(ctx.member.membershipDate).getFullYear() >= 10

  return [
    { code: "DIAMOND_SAVER", name: "Diamond Saver", emoji: "💎", earned: diamondSaver },
    { code: "PERFECT_PAYER", name: "Perfect Payer", emoji: "⏰", earned: perfectPayer },
    { code: "MEETING_STAR", name: "Meeting Star", emoji: "⭐", earned: meetingStar },
    { code: "ZERO_FINE", name: "Zero Fine", emoji: "🎯", earned: zeroFine },
    { code: "REFERRAL_CHAMPION", name: "Referral Champion", emoji: "🤝", earned: referralChampion },
    { code: "LOAN_HERO", name: "Loan Hero", emoji: "🥇", earned: loanHero },
    { code: "LOYAL_MEMBER", name: "Loyal Member", emoji: "🌱", earned: loyalMember },
  ]
}
