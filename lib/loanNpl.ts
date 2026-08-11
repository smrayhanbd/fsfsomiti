import prisma from "@/lib/prisma"

/**
 * Non-Performing Loan (NPL) classification engine.
 *
 * Maps a loan's days-past-due (DPD) to a regulatory-style bucket so the
 * dashboard can flag risk early. The thresholds follow the standard
 * cooperative-credit NPL scale (0 → CURRENT, ≤30 → WATCH, ≤60 →
 * SUBSTANDARD, ≤90 → DOUBTFUL, >90 → LOSS).
 *
 * Server-only — uses Prisma. The cron endpoint at /api/loans/npl-scan runs
 * this nightly (see vercel.json).
 */

export type NplBucket = "CURRENT" | "WATCH" | "SUBSTANDARD" | "DOUBTFUL" | "LOSS"

/** Map a days-past-due value to an NPL bucket. Pure — no I/O. */
export function computeBucket(daysPastDue: number): NplBucket {
  if (daysPastDue <= 0) return "CURRENT"
  if (daysPastDue <= 30) return "WATCH"
  if (daysPastDue <= 60) return "SUBSTANDARD"
  if (daysPastDue <= 90) return "DOUBTFUL"
  return "LOSS"
}

/**
 * Compute days past due for a single loan.
 *
 * Reads the most recent unpaid LoanSchedule row where dueDate < now (i.e. the
 * schedule is in PENDING / PARTIALLY_PAID state and the due date has passed).
 * Returns the days since the EARLIEST such due date — this is the convention
 * used by cooperative regulators: a loan is "past due" from the first missed
 * installment, not the last.
 *
 * Returns 0 when there are no overdue installments (loan is current).
 */
export async function computeDaysPastDue(loanId: string): Promise<number> {
  const now = new Date()
  // We consider an installment "unpaid" if its status is NOT PAID. The
  // LoanSchedule.status enum includes PENDING, PARTIALLY_PAID, PAID, OVERDUE.
  // Treat PENDING + PARTIALLY_PAID + OVERDUE as unpaid.
  const overdue = await prisma.loanSchedule.findFirst({
    where: {
      loanId,
      status: { not: "PAID" },
      dueDate: { lt: now },
    },
    orderBy: { dueDate: "asc" },
    select: { dueDate: true },
  })
  if (!overdue) return 0
  const dpd = Math.floor((now.getTime() - overdue.dueDate.getTime()) / (24 * 60 * 60 * 1000))
  return Math.max(0, dpd)
}

export interface NplScanResult {
  scanned: number
  flagged: number
  details: Array<{ loanId: string; bucket: NplBucket; daysPastDue: number }>
}

/**
 * Scan every ACTIVE / DISBURSED loan, compute its DPD + bucket, and update
 * the loan row when its bucket changes. Creates an admin Notification (type:
 * `LOAN_NPL`) when a loan first moves into a non-CURRENT bucket or escalates
 * to a worse bucket.
 *
 * Idempotent — running twice in a row with no state change produces no writes.
 *
 * Persists the bucket on the typed Prisma `Loan` row (columns: `nplBucket`,
 * `nplFlaggedAt`, `nplDaysPastDue` — added in migration 20260812000003).
 */
export async function scanAllLoansForNpl(): Promise<NplScanResult> {
  // Active loans = DISBURSED or APPROVED (approved-without-disbursement is rare
  // but technically also a candidate).
  const loans = await prisma.loan.findMany({
    where: { status: { in: ["DISBURSED"] } },
    select: {
      id: true,
      loanNo: true,
      memberId: true,
      nplBucket: true,
      nplFlaggedAt: true,
      nplDaysPastDue: true,
    },
  })

  const details: NplScanResult["details"] = []
  let flagged = 0

  for (const loan of loans) {
    const dpd = await computeDaysPastDue(loan.id)
    const bucket = computeBucket(dpd)
    details.push({ loanId: loan.id, bucket, daysPastDue: dpd })

    if (bucket === "CURRENT") continue

    // Persist the bucket on the loan row when it changes. We compare against
    // the previously-cached bucket so idempotent re-scans don't trigger writes
    // (and notifications) for loans whose status hasn't changed.
    const priorBucket = loan.nplBucket as NplBucket | null
    if (priorBucket !== bucket) {
      await prisma.loan.update({
        where: { id: loan.id },
        data: {
          nplBucket: bucket,
          nplFlaggedAt: new Date(),
          nplDaysPastDue: dpd,
        },
      })

      // Best-effort admin notification. Uses the existing Notification table —
      // a global, non-per-user notification surfaced in the Topbar bell.
      try {
        await prisma.notification.create({
          data: {
            type: "LOAN_NPL",
            title: `Loan ${loan.loanNo} flagged as ${bucket}`,
            message: `Loan ${loan.loanNo} is ${dpd} days past due (bucket: ${bucket}). Review and follow up with the member.`,
            link: `/dashboard/loans/${loan.id}`,
          },
        })
      } catch (e) {
        console.error("[scanAllLoansForNpl] notification failed:", e)
      }
      flagged++
    }
  }

  return { scanned: loans.length, flagged, details }
}
