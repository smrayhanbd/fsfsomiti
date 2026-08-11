// Dynamic weight redistribution engine (FRS §6).
//
// Members are never penalized for KPIs that don't apply to them. When a KPI is
// N/A (currently only LOAN, when the member has never had a loan), its default
// weight is redistributed proportionally across the applicable KPIs so the
// applicable weights still sum to exactly 100.
//
// Rounding correction (FRS §6.1): after flooring each redistributed weight,
// any remainder needed to reach 100 is added to the applicable KPI with the
// highest default weight.

import type { KpiCode } from "./types"
import type { KpiConfig } from "./config"
import { defaultWeights } from "./config"

export interface WeightResult {
  /** Per-KPI redistributed weight (0 for N/A KPIs). Applicable weights sum to 100. */
  weights: Record<KpiCode, number>
  /** Whether each KPI is applicable to this member. */
  applicable: Record<KpiCode, boolean>
}

/** The ordered KPI codes, used for deterministic iteration. */
export const KPI_CODES: KpiCode[] = ["DEPOSIT", "LOAN", "ATTEND", "FINE", "REFERRAL"]

/**
 * Compute redistributed weights for a member.
 *
 * @param applicable a record marking which KPIs apply to this member.
 * @param config     the current KPI configuration (default weights).
 */
export function computeRedistributedWeights(
  applicable: Record<KpiCode, boolean>,
  config: KpiConfig
): WeightResult {
  const defaults = defaultWeights(config)

  const applicableCodes = KPI_CODES.filter((k) => applicable[k])
  const applicableTotal = applicableCodes.reduce((sum, k) => sum + defaults[k], 0)

  // Edge case: no applicable KPIs (shouldn't happen — DEPOSIT/ATTEND/FINE/
  // REFERRAL are always applicable). Guard against divide-by-zero regardless.
  if (applicableTotal <= 0) {
    const zero = { DEPOSIT: 0, LOAN: 0, ATTEND: 0, FINE: 0, REFERRAL: 0 }
    return { weights: zero, applicable }
  }

  const multiplier = 100 / applicableTotal
  const weights = { DEPOSIT: 0, LOAN: 0, ATTEND: 0, FINE: 0, REFERRAL: 0 } as Record<
    KpiCode,
    number
  >

  // Floor each redistributed weight (FRS §6.1).
  let highestCode: KpiCode = applicableCodes[0]
  let highestDefault = -1
  for (const k of applicableCodes) {
    weights[k] = Math.floor(defaults[k] * multiplier)
    if (defaults[k] > highestDefault) {
      highestDefault = defaults[k]
      highestCode = k
    }
  }

  // Correction: push the rounding remainder onto the highest-default-weight KPI
  // so the total is exactly 100.
  const sum = KPI_CODES.reduce((s, k) => s + weights[k], 0)
  const remainder = 100 - sum
  if (remainder !== 0 && highestCode) {
    weights[highestCode] += remainder
  }

  return { weights, applicable }
}
