// Fund-share snapshot engine.
//
// The cooperative principle: a member's share of a distribution is based on
// their fund (savings balance) at the moment the underlying income was
// generated — NOT their current balance. A member who joins after an
// investment was made does not participate in that investment's profit.
//
// Because `Savings.date` records when each deposit/withdrawal happened, we
// can compute any member's balance as of any past date by filtering rows up
// to that date. The existing `computeMemberBalance` (lib/transactions/
// validation.ts) sums ALL rows; this module adds the date-filtered variant.

import { Prisma, type MemberStatus } from "@prisma/client"
import type { MemberFundSnapshot } from "./types"

// Statuses that are eligible to receive a distribution. A member who is
// PENDING / SUSPENDED / CLOSED / etc. is excluded even if they had a fund,
// because they cannot currently transact. Callers that need to override
// this (e.g. a final settlement of a closed member) can read the raw fund.
const ELIGIBLE_STATUSES: MemberStatus[] = ["ACTIVE"]

/**
 * A member's fund (savings balance) as of `asOfDate`.
 *
 * Same arithmetic as `computeMemberBalance` (deposits − withdrawals) but
 * restricted to Savings rows dated up to and including `asOfDate`. Never
 * returns a negative number — an overdrawn member is treated as fund 0.
 *
 * Must be called inside a `prisma.$transaction` callback (uses aggregate).
 */
export async function computeMemberFundAt(
  tx: Prisma.TransactionClient,
  memberId: string,
  asOfDate: Date
): Promise<number> {
  // `date <= asOfDate` — inclusive of the snapshot day itself so a deposit
  // made on the investment date counts toward the fund.
  const rows = await tx.savings.findMany({
    where: { memberId, date: { lte: asOfDate } },
    select: { amount: true, type: true },
  })
  const deposit = rows
    .filter((r) => r.type !== "WITHDRAWAL")
    .reduce((s, r) => s + Number(r.amount), 0)
  const withdrawal = rows
    .filter((r) => r.type === "WITHDRAWAL")
    .reduce((s, r) => s + Number(r.amount), 0)
  return Math.max(0, deposit - withdrawal)
}

/**
 * Every ACTIVE member whose fund at `asOfDate` is greater than zero, ready to
 * feed into the allocator. Members with no fund at the snapshot date, or who
 * had not yet joined, are omitted (the allocator only splits among those who
 * actually contributed capital at that point in time).
 *
 * Sorted by fund descending so the largest contributor is row #1 — matches
 * how the UI preview reads and where any rounding dust is assigned.
 */
export async function snapshotEligibleMembers(
  tx: Prisma.TransactionClient,
  asOfDate: Date
): Promise<MemberFundSnapshot[]> {
  const members = await tx.member.findMany({
    where: { status: { in: ELIGIBLE_STATUSES } },
    select: { id: true, memberNo: true, fullName: true, savings: true },
  })

  const eligible: MemberFundSnapshot[] = []
  for (const m of members) {
    // Reuse the rows we already fetched instead of re-querying per member.
    const deposit = m.savings
      .filter((s) => s.type !== "WITHDRAWAL" && s.date <= asOfDate)
      .reduce((s, r) => s + Number(r.amount), 0)
    const withdrawal = m.savings
      .filter((s) => s.type === "WITHDRAWAL" && s.date <= asOfDate)
      .reduce((s, r) => s + Number(r.amount), 0)
    const fund = Math.max(0, deposit - withdrawal)
    if (fund > 0) {
      eligible.push({ memberId: m.id, memberNo: m.memberNo, fullName: m.fullName, fund })
    }
  }

  eligible.sort((a, b) => b.fund - a.fund)
  return eligible
}
