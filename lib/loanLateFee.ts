import { directPrisma } from "@/lib/prisma"

/**
 * Late-payment interest / penalty engine (Roadmap item 17).
 *
 * For each overdue LoanSchedule row (dueDate < now − graceDays and not yet
 * PAID), accrues a daily-prorated late fee against the outstanding principal.
 *
 *   fee = principal × (annualRate / 365) × daysOverdue
 *
 * The fee is recorded as a `lateFeeAccrued` increment on the schedule row
 * (so the loan detail UI shows the running tally per installment) AND as a
 * LoanRepayment row of type LATE_FEE so it appears on the member's repayment
 * history. Idempotent — the cron uses `daysOverdue` derived from the
 * schedule's dueDate, so a second run the same day adds 0 new days.
 */

/**
 * Compute the late fee for a given principal / annual rate / days overdue.
 *
 * Pure — no I/O. Exported so unit tests can verify the prorated formula
 * without touching the DB.
 *
 *   dailyRate = annualRate / 365
 *   fee = principal × dailyRate × daysOverdue
 *
 * Returns 0 when any input is non-positive (no negative fees).
 */
export function calculateLateFee(
  principal: number,
  annualRate: number,
  daysOverdue: number
): number {
  if (principal <= 0 || annualRate <= 0 || daysOverdue <= 0) return 0
  const dailyRate = annualRate / 365
  return principal * dailyRate * daysOverdue
}

export interface LateFeeScanResult {
  scanned: number
  accrued: number
  totalAmount: number
}

/**
 * Scan every loan schedule row that is past its due date + grace period and
 * not yet paid, and accrue the per-day late fee for the days since the last
 * accrual. Idempotent within a 24h window: a second run on the same day
 * produces zero additional fee because `lateFeeAccrued` already reflects the
 * previous day's count.
 *
 * The scan runs inside a single `$transaction` so partial failures don't
 * leave the schedule row updated without a matching LoanRepayment row.
 */
export async function scanAndAccrueLateFees(): Promise<LateFeeScanResult> {
  const now = new Date()
  let scanned = 0
  let accrued = 0
  let totalAmount = 0

  await directPrisma.$transaction(
    async (tx) => {
      // Find every overdue unpaid schedule row, joined to its Loan (for the
      // product lookup) and LoanProduct (for the rate + grace days).
      const schedules = await tx.loanSchedule.findMany({
        where: {
          status: { not: "PAID" },
          // We can't put the loanProduct join directly into the where clause
          // (Prisma doesn't support filtering on a related-through-related
          // column without an explicit nested filter), so we filter the
          // dueDate < now and post-filter the grace window in JS.
          dueDate: { lt: now },
        },
        include: {
          loan: {
            select: {
              id: true,
              loanNo: true,
              memberId: true,
              principal: true,
              outstandingBalance: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  lateFeePercent: true,
                  lateFeeGraceDays: true,
                },
              },
            },
          },
        },
      })

      for (const sch of schedules) {
        const product = sch.loan.product
        // Skip products without a configured late-fee rate.
        if (!product || !product.lateFeePercent) continue
        const rate = Number(product.lateFeePercent)
        if (rate <= 0) continue

        const graceDays = product.lateFeeGraceDays ?? 0
        const dueMs = sch.dueDate.getTime()
        const elapsedMs = now.getTime() - dueMs
        const elapsedDays = Math.floor(elapsedMs / (24 * 60 * 60 * 1000))
        const daysOverdue = elapsedDays - graceDays
        if (daysOverdue <= 0) continue

        scanned++

        // Principal for the fee = outstanding balance on the loan (the
        // portion still owed). Falls back to the schedule's principal when
        // the loan outstanding is zero (e.g. last installment).
        const principal = Math.max(
          0,
          Number(sch.loan.outstandingBalance || sch.principal)
        )

        // Compute the fee target = total fee for the full overdue window.
        // We then subtract the already-accrued amount to get the delta.
        const totalFee = calculateLateFee(principal, rate, daysOverdue)
        const alreadyAccrued = Number(sch.lateFeeAccrued ?? 0)
        const delta = Math.max(0, totalFee - alreadyAccrued)
        if (delta <= 0) continue // already accrued up to today

        // Update the schedule row's running tally.
        await tx.loanSchedule.update({
          where: { id: sch.id },
          data: {
            lateFeeAccrued: totalFee,
            // Mirror the new total into the schedule's `fine` field so the
            // existing loan-detail UI (which reads `fine`) shows the late
            // fee without changes. Keep `fine` monotonically increasing.
            fine: totalFee,
          },
        })

        // Create a LoanRepayment row of type LATE_FEE so the member's
        // repayment history shows the accrual. The receipt is uniquely
        // keyed by the schedule id so a re-run on the same day can't create
        // duplicates (an idempotency guard).
        const receiptNo = `LF-${sch.loan.loanNo}-${sch.installmentNo}`
        await tx.loanRepayment.upsert({
          where: { receiptNo },
          create: {
            receiptNo,
            loanId: sch.loanId,
            memberId: sch.loan.memberId,
            installmentNo: sch.installmentNo,
            principal: 0,
            interest: 0,
            fine: totalFee,
            totalAmount: totalFee,
            method: "ACCRUAL",
            notes: `Late fee accrued for ${daysOverdue} days overdue (rate ${rate.toFixed(4)})`,
            paymentDate: now,
          },
          update: {
            fine: totalFee,
            totalAmount: totalFee,
            notes: `Late fee accrued for ${daysOverdue} days overdue (rate ${rate.toFixed(4)})`,
          },
        })

        accrued++
        totalAmount += delta
      }
    },
    { maxWait: 15_000, timeout: 30_000 }
  )

  return { scanned, accrued, totalAmount }
}
