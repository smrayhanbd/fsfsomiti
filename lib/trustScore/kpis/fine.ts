// FINE KPI calculator (FRS §5.5).
//
// Rewards disciplined members with no outstanding fines. Applicable to all
// members. Members with no fines get full weight. Each active (unpaid /
// non-waived) fine deducts its FineType penaltyPoints. Paid/waived fines are
// ignored — their penalty is reversed automatically at recalc time.

import type { KpiConfig } from "../config"
import type { MemberContext } from "../context"
import type { KpiBreakdown } from "../types"

export function calculateFineKpi(
  ctx: MemberContext,
  config: KpiConfig,
  weight: number
): KpiBreakdown {
  // Only unresolved fines count as deductions (FRS §5.5).
  const active = ctx.fines.filter((f) => f.status === "ISSUED")
  if (active.length === 0) {
    return {
      code: "FINE",
      applicable: true,
      defaultWeight: config.fineWeight,
      redistributedWeight: weight,
      score: weight,
      max: weight,
      detail: "No outstanding fines — full score.",
    }
  }

  const totalPenalty = active.reduce((sum, f) => sum + (f.fineType.penaltyPoints || 0), 0)
  const score = Math.max(0, weight - totalPenalty)

  return {
    code: "FINE",
    applicable: true,
    defaultWeight: config.fineWeight,
    redistributedWeight: weight,
    score: round2(score),
    max: weight,
    detail: `${active.length} outstanding fine(s) — ${totalPenalty} pts deducted.`,
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
