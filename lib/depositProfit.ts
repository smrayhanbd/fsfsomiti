/**
 * Term-deposit profit calculation helper (Roadmap item 22).
 *
 * Pure functions — no I/O. Used by the deposit-products UI to preview the
 * expected profit for a principal / rate / term, and by the maturity cron to
 * decide how much to credit on the maturity date.
 */

/**
 * Calculate the expected profit for a term deposit using simple interest.
 *
 *   profit = principal × annualRate × (termMonths / 12) × profitSharingRatio
 *
 * The `profitSharingRatio` is the portion of the gross profit the member
 * receives (0–1). The remainder stays in the somiti's pooled fund as service
 * charge / overhead.
 *
 * Returns 0 when any input is non-positive.
 */
export function calculateExpectedProfit(
  principal: number,
  annualRate: number,
  termMonths: number,
  profitSharingRatio: number
): number {
  if (principal <= 0 || annualRate <= 0 || termMonths <= 0 || profitSharingRatio <= 0) {
    return 0
  }
  return principal * annualRate * (termMonths / 12) * profitSharingRatio
}

/**
 * Compute the maturity date for a deposit started on `startDate` with a
 * given `termMonths`. Returns the date that is exactly `termMonths` later
 * (day-of-month aligned, clamped to the end of the month if needed).
 */
export function maturityDate(startDate: Date, termMonths: number): Date {
  const d = new Date(startDate)
  d.setMonth(d.getMonth() + termMonths)
  return d
}
