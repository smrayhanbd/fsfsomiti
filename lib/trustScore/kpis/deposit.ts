// DEPOSIT KPI calculator (FRS §5.2).
//
// Measures savings payment regularity and punctuality. Applicable to all
// members. On-time rate is computed from reconstructed deposit cycles (see
// context.ts), then mapped to a score and reduced by late-payment penalties.

import type { KpiConfig } from "../config"
import type { MemberContext } from "../context"
import type { KpiBreakdown } from "../types"

/** FRS §5.2 late-payment penalty table, indexed by days-overdue bucket. */
function latePenalty(daysLate: number): number {
  if (daysLate <= 0) return 0
  if (daysLate <= 3) return 1
  if (daysLate <= 7) return 2
  if (daysLate <= 15) return 4
  return 6
}

/**
 * Map an on-time rate to a base score for a given weight, using the FRS §5.2
 * thresholds. Linear interpolation is applied between thresholds when enabled
 * in config; otherwise the lower-threshold step value is used.
 */
function baseScoreForRate(rate: number, weight: number, interpolate: boolean): number {
  // Thresholds as fraction -> fraction-of-weight earned. (100% -> full, etc.)
  const tiers: { at: number; frac: number }[] = [
    { at: 1.0, frac: 1.0 },
    { at: 0.95, frac: 33 / 35 },
    { at: 0.9, frac: 31 / 35 },
    { at: 0.8, frac: 27 / 35 },
    { at: 0.7, frac: 22 / 35 },
    { at: 0.0, frac: 15 / 35 },
  ]
  if (rate >= 1) return weight
  if (rate < 0.7) return Math.round((15 / 35) * weight * 10) / 10

  // Find the bracket [lower, upper) that `rate` falls into.
  for (let i = 0; i < tiers.length - 1; i++) {
    const upper = tiers[i]
    const lower = tiers[i + 1]
    if (rate >= lower.at && rate < upper.at) {
      if (!interpolate) return +(lower.frac * weight).toFixed(2)
      // Linear interpolation between lower and upper.
      const t = (rate - lower.at) / (upper.at - lower.at)
      const frac = lower.frac + t * (upper.frac - lower.frac)
      return +(frac * weight).toFixed(2)
    }
  }
  return weight
}

/**
 * DEPOSIT KPI. Always applicable (FRS §5.1).
 *
 * - New member with no deposit history → full weight (FRS §5.2).
 * - Score floored at 0.
 */
export function calculateDepositKpi(
  ctx: MemberContext,
  config: KpiConfig,
  weight: number
): KpiBreakdown {
  const cycles = ctx.depositCycles

  // New member / no cycles yet → full points (FRS §5.2 + §20).
  if (cycles.length === 0) {
    return {
      code: "DEPOSIT",
      applicable: true,
      defaultWeight: config.depositWeight,
      redistributedWeight: weight,
      score: weight,
      max: weight,
      detail: "No deposit cycles due yet — defaults to full score.",
    }
  }

  const total = cycles.length
  const onTime = cycles.filter((c) => c.daysLate !== null && c.daysLate === 0).length
  const onTimeRate = onTime / total
  const base = baseScoreForRate(onTimeRate, weight, config.depositLinearInterp)

  const lateCycles = cycles.filter((c) => c.daysLate !== null && c.daysLate > 0)
  const totalPenalty = lateCycles.reduce((sum, c) => sum + latePenalty(c.daysLate!), 0)

  const score = Math.max(0, base - totalPenalty)

  return {
    code: "DEPOSIT",
    applicable: true,
    defaultWeight: config.depositWeight,
    redistributedWeight: weight,
    score: round2(score),
    max: weight,
    detail: `${onTime}/${total} deposits on time (${pct(onTimeRate)}). ` +
      `${lateCycles.length} late (${totalPenalty} pts penalty). Base ${round2(base)} − ${totalPenalty} = ${round2(score)}.`,
  }
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
