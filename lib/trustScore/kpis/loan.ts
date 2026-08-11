// LOAN KPI calculator (FRS §5.3).
//
// Measures loan installment repayment discipline. Members who have never taken
// a loan are EXCLUDED (the KPI is N/A and its weight is redistributed — see
// weights.ts). A loan in DEFAULT zeroes this KPI until a recovery period
// elapses; multiple loans are aggregated.

import type { KpiConfig } from "../config"
import type { MemberContext } from "../context"
import type { KpiBreakdown } from "../types"

/** Map an on-time rate to a LOAN score for a given weight (FRS §5.3). */
function scoreForRate(rate: number, weight: number): number {
  if (rate >= 1) return weight
  if (rate >= 0.95) return (23 / 25) * weight
  if (rate >= 0.9) return (21 / 25) * weight
  if (rate >= 0.8) return (17 / 25) * weight
  if (rate >= 0.7) return (14 / 25) * weight
  return (14 / 25) * weight * (rate / 0.7) // proportional below 70%
}

export interface LoanKpiResult {
  breakdown: KpiBreakdown
  applicable: boolean
}

/**
 * LOAN KPI.
 *
 * - No loan history → N/A (weight redistributed).
 * - Any loan DEFAULTED → 0 until recovery period elapses.
 * - Otherwise: on-time installments / total installments across all loans.
 * - A fully repaid closed loan retains its final score (FRS §5.3).
 */
export function calculateLoanKpi(
  ctx: MemberContext,
  config: KpiConfig,
  weight: number
): LoanKpiResult {
  // N/A: member has never had a loan. Do not penalize (FRS §5.3).
  if (ctx.loans.length === 0) {
    return {
      applicable: false,
      breakdown: {
        code: "LOAN",
        applicable: false,
        defaultWeight: config.loanWeight,
        redistributedWeight: 0,
        score: 0,
        max: 0,
        detail: "No loan history — KPI not applicable; weight redistributed.",
      },
    }
  }

  // Check for default. If any loan is currently DEFAULTED and the recovery
  // window hasn't elapsed since the last activity, LOAN = 0 (FRS §5.3).
  const defaulted = ctx.loans.filter((l) => l.status === "DEFAULTED")
  if (defaulted.length > 0) {
    // Use the loan's updatedAt as the default-start proxy; if it's older than
    // loanRecoveryMonths we allow recalculation off zero.
    const mostRecent = defaulted.reduce((a, b) =>
      new Date(a.updatedAt).getTime() > new Date(b.updatedAt).getTime() ? a : b
    )
    const monthsSince = monthsBetween(new Date(mostRecent.updatedAt), new Date())
    if (monthsSince < config.loanRecoveryMonths) {
      return {
        applicable: true,
        breakdown: {
          code: "LOAN",
          applicable: true,
          defaultWeight: config.loanWeight,
          redistributedWeight: weight,
          score: 0,
          max: weight,
          detail: `Loan in default — LOAN KPI held at 0 (${monthsSince}/${config.loanRecoveryMonths}mo recovery).`,
        },
      }
    }
  }

  // Aggregate installments across all loans (FRS §5.3 + §20: multiple loans).
  let totalInstallments = 0
  let onTimeInstallments = 0
  for (const loan of ctx.loans) {
    for (const inst of loan.schedule) {
      // Skip installments not yet due (future due dates don't count against you).
      if (new Date(inst.dueDate).getTime() > Date.now()) continue
      totalInstallments++
      const paidOnTime =
        (inst.status === "PAID" || inst.status === "WAIVED") &&
        inst.paidDate &&
        new Date(inst.paidDate).getTime() <= new Date(inst.dueDate).getTime() + 86_400_000 // +1 day grace
      if (paidOnTime) onTimeInstallments++
    }
  }

  // No installments due yet → full weight (analogous to the deposit rule).
  if (totalInstallments === 0) {
    return {
      applicable: true,
      breakdown: {
        code: "LOAN",
        applicable: true,
        defaultWeight: config.loanWeight,
        redistributedWeight: weight,
        score: weight,
        max: weight,
        detail: "Loan active but no installments due yet — full score.",
      },
    }
  }

  const rate = onTimeInstallments / totalInstallments
  const score = Math.max(0, round2(scoreForRate(rate, weight)))

  return {
    applicable: true,
    breakdown: {
      code: "LOAN",
      applicable: true,
      defaultWeight: config.loanWeight,
      redistributedWeight: weight,
      score,
      max: weight,
      detail: `${onTimeInstallments}/${totalInstallments} installments on time (${pct(rate)}).`,
    },
  }
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
}
