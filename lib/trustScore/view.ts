// Read-side view builder for Trust Score dashboards (FRS §11, §17).
//
// Both the admin member-detail page and the member portal page render the same
// data shape: current score + badge, KPI breakdown, achievement badges, score
// history, and improvement suggestions. This helper computes it all in one
// place so the two UIs stay consistent and neither duplicates engine logic.

import prisma from "@/lib/prisma"
import {
  getKpiConfig,
  loadMemberContext,
  computeRedistributedWeights,
  assignBadgeLevel,
  evaluateAchievements,
  generateSuggestions,
} from "./index"
import { calculateDepositKpi } from "./kpis/deposit"
import { calculateLoanKpi } from "./kpis/loan"
import { calculateAttendKpi } from "./kpis/attend"
import { calculateFineKpi } from "./kpis/fine"
import { calculateReferralKpi } from "./kpis/referral"
import { assembleScore } from "./assembler"

export interface ScoreView {
  member: {
    id: string
    fullName: string
    memberNo: string
    photoUrl: string | null
    status: string
    trustScore: number
    badgeLevel: string
    riskLevel: string
    scoreLastUpdated: string | null
    membershipDate: string
  }
  breakdown: Array<{
    code: string
    applicable: boolean
    defaultWeight: number
    redistributedWeight: number
    score: number
    max: number
    detail: string
  }>
  badgeEmoji: string
  suggestions: Array<{ kpi: string; potentialGain: number; message: string }>
  // Achievement badges: all 7 defs with `earned` + stored history summary.
  achievements: Array<{
    code: string
    name: string
    emoji: string
    earned: boolean
    earnedDate: string | null
    lostDate: string | null
  }>
  history: Array<{
    id: string
    eventType: string
    kpiAffected: string | null
    scoreBefore: number
    scoreChange: number
    scoreAfter: number
    remarks: string | null
    createdAt: string
  }>
  // Monthly trend (last 12 months) derived from history.
  trend: Array<{ month: string; score: number }>
}

/**
 * Build the full score view for a member. Returns null if the member doesn't
 * exist. This recomputes the breakdown live (it does NOT mutate the stored
 * score — use recalculateTrustScore for that).
 */
export async function getScoreView(memberId: string): Promise<ScoreView | null> {
  const config = await getKpiConfig()
  const ctx = await loadMemberContext(memberId)
  if (!ctx) return null

  // Recompute the breakdown the same way the orchestrator does (read-only).
  const loanResult = calculateLoanKpi(ctx, config, config.loanWeight)
  const applicable = {
    DEPOSIT: true,
    LOAN: loanResult.applicable,
    ATTEND: true,
    FINE: true,
    REFERRAL: true,
  }
  const { weights } = computeRedistributedWeights(applicable, config)
  const breakdowns = [
    calculateDepositKpi(ctx, config, weights.DEPOSIT),
    loanResult.breakdown,
    calculateAttendKpi(ctx, config, weights.ATTEND),
    calculateFineKpi(ctx, config, weights.FINE),
    calculateReferralKpi(ctx, config, weights.REFERRAL),
  ]
  const { trustScore } = assembleScore(breakdowns)
  const badge = assignBadgeLevel(trustScore, config)
  const achievementDefs = evaluateAchievements(ctx)
  const suggestions = generateSuggestions(ctx, config, breakdowns, trustScore)

  // Stored achievement rows (for earned/lost history).
  const storedBadges = await prisma.achievementBadge.findMany({
    where: { memberId },
    orderBy: { earnedDate: "desc" },
  })

  const achievements = achievementDefs.map((def) => {
    const row = storedBadges.find(
      (b: { badgeCode: string; status: string }) =>
        b.badgeCode === def.code && b.status === "ACTIVE"
    )
    const lostRow = storedBadges.find(
      (b: { badgeCode: string; status: string }) =>
        b.badgeCode === def.code && b.status === "LOST"
    )
    return {
      code: def.code,
      name: def.name,
      emoji: def.emoji,
      earned: def.earned,
      earnedDate: row?.earnedDate.toISOString() ?? null,
      lostDate: lostRow?.lostDate?.toISOString() ?? null,
    }
  })

  // Score history (audit log) — most recent first.
  const history = await prisma.trustScoreHistory.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  // Monthly trend: take the last record of each month for the past 12 months.
  const trend = buildTrend(history)

  return {
    member: {
      id: ctx.member.id,
      fullName: "", // filled by caller (ctx doesn't include name)
      memberNo: "",
      photoUrl: null,
      status: ctx.member.status,
      trustScore: ctx.member.trustScore,
      badgeLevel: ctx.member.badgeLevel,
      riskLevel: ctx.member.riskLevel,
      scoreLastUpdated: ctx.member.scoreLastUpdated?.toISOString() ?? null,
      membershipDate: ctx.member.membershipDate.toISOString(),
    },
    breakdown: breakdowns.map((b) => ({ ...b })),
    badgeEmoji: badge.emoji,
    suggestions: suggestions.map((s) => ({ ...s })),
    achievements,
    history: history.map((h) => ({
      id: h.id,
      eventType: h.eventType,
      kpiAffected: h.kpiAffected,
      scoreBefore: h.scoreBefore,
      scoreChange: h.scoreChange,
      scoreAfter: h.scoreAfter,
      remarks: h.remarks,
      createdAt: h.createdAt.toISOString(),
    })),
    trend,
  }
}

/** Reduce the history into one score-per-month for the last 12 months. */
function buildTrend(
  history: Array<{ createdAt: Date; scoreAfter: number }>
): Array<{ month: string; score: number }> {
  const byMonth = new Map<string, { date: Date; score: number }>()
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    byMonth.set(monthKey(d), { date: d, score: 0 })
  }
  for (const h of history) {
    const key = monthKey(h.createdAt)
    const existing = byMonth.get(key)
    // Keep the latest entry per month.
    if (existing && h.createdAt >= existing.date) {
      byMonth.set(key, { date: h.createdAt, score: h.scoreAfter })
    } else if (!existing) {
      // Outside the 12-month window — ignore.
    }
  }
  return Array.from(byMonth.entries()).map(([month, v]) => ({
    month,
    score: v.score,
  }))
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
