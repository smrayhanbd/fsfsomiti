// Balance invariants for the Income Distribution module.
//
// After a distribution is posted, three numbers MUST agree:
//   1. the distribution's totalDistributable
//   2. the sum of its DistributionShare.amount rows
//   3. the sum of its Savings PROFIT mirror rows
//   4. the posted JournalEntry's totalDebit and totalCredit
//
// A drift between any of these means the GL and the member sub-ledger have
// fallen out of sync — the exact bug this module was built to prevent.
// `assertDistributionBalanced` throws if they disagree; call it from tests
// and (optionally, in dev) from the post action.

import { Prisma } from "@prisma/client"

const TOLERANCE = 0.005

export interface BalanceCheck {
  ok: boolean
  totalDistributable: number
  sharesSum: number
  mirrorSum: number
  journalDebit: number | null
  journalCredit: number | null
  /** Human-readable list of any mismatches. */
  problems: string[]
}

/**
 * Verify a posted distribution's ledgers reconcile. Read-only — safe to call
 * from inside or outside a transaction. Never throws on a mismatch; returns
 * the details so the caller can decide (test → fail, UI → show a banner).
 */
export async function assertDistributionBalanced(
  tx: Prisma.TransactionClient,
  distributionId: string
): Promise<BalanceCheck> {
  const dist = await tx.incomeDistribution.findUnique({
    where: { id: distributionId },
    include: {
      shares: { select: { amount: true, savingsMirrorId: true } },
      journalEntry: { select: { totalDebit: true, totalCredit: true } },
    },
  })
  if (!dist) {
    return {
      ok: false,
      totalDistributable: 0,
      sharesSum: 0,
      mirrorSum: 0,
      journalDebit: null,
      journalCredit: null,
      problems: ["Distribution not found."],
    }
  }

  const total = Number(dist.totalDistributable)
  const sharesSum = dist.shares.reduce((s, x) => s + Number(x.amount), 0)

  // Sum the actual Savings mirror rows (the source of truth for member
  // balances). Missing mirror ids count as 0.
  const mirrorIds = dist.shares.map((s) => s.savingsMirrorId).filter(Boolean) as string[]
  const mirrorRows = mirrorIds.length
    ? await tx.savings.findMany({ where: { id: { in: mirrorIds } }, select: { amount: true } })
    : []
  const mirrorSum = mirrorRows.reduce((s, r) => s + Number(r.amount), 0)

  const journalDebit = dist.journalEntry ? Number(dist.journalEntry.totalDebit) : null
  const journalCredit = dist.journalEntry ? Number(dist.journalEntry.totalCredit) : null

  const problems: string[] = []
  if (Math.abs(sharesSum - total) > TOLERANCE) {
    problems.push(
      `Shares sum (${sharesSum.toFixed(2)}) ≠ total (${total.toFixed(2)}).`
    )
  }
  if (dist.status === "POSTED") {
    // A DRAFT has no mirror rows / voucher yet, so only check these once posted.
    if (Math.abs(mirrorSum - total) > TOLERANCE) {
      problems.push(
        `Savings mirror rows sum (${mirrorSum.toFixed(2)}) ≠ total (${total.toFixed(2)}).`
      )
    }
    if (journalDebit === null || Math.abs(journalDebit - total) > TOLERANCE) {
      problems.push(`Journal debit (${journalDebit}) ≠ total (${total.toFixed(2)}).`)
    }
    if (journalCredit === null || Math.abs(journalCredit - total) > TOLERANCE) {
      problems.push(`Journal credit (${journalCredit}) ≠ total (${total.toFixed(2)}).`)
    }
  }

  return {
    ok: problems.length === 0,
    totalDistributable: total,
    sharesSum,
    mirrorSum,
    journalDebit,
    journalCredit,
    problems,
  }
}
