// Score assembler (FRS §7 steps 5–6).
//
// Sums the applicable KPI scores into a final Trust Score (0–100). Clamps to
// [0, 100] and rounds to the nearest integer. Per FRS §3, if the rounded total
// is off (e.g. due to per-KPI rounding), the correction is applied to the
// highest-weight applicable KPI — but since the redistributed weights already
// sum to exactly 100 (see weights.ts), the total is normally already an integer.

import type { KpiBreakdown } from "./types"

export interface AssembledScore {
  /** Final trust score, integer 0–100. */
  trustScore: number
  /** The raw sum before clamping/rounding (for audit transparency). */
  rawTotal: number
}

/**
 * Sum the applicable KPI breakdowns into the final Trust Score.
 * Individual KPI scores are already floored at 0 by their calculators.
 */
export function assembleScore(breakdowns: KpiBreakdown[]): AssembledScore {
  const rawTotal = breakdowns
    .filter((b) => b.applicable)
    .reduce((sum, b) => sum + b.score, 0)

  const clamped = Math.min(100, Math.max(0, rawTotal))
  const trustScore = Math.round(clamped)

  return { trustScore, rawTotal: round2(rawTotal) }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
