import { Prisma } from "@prisma/client"
import { computeMemberBalance } from "@/lib/transactions/validation"

/**
 * Member-eligibility check for WITHDRAWAL approvals (spec §7A).
 *
 * Validates three things inside the caller's transaction:
 *   1. The member's status is not in a blocked set (SUSPENDED / CLOSED /
 *      REJECTED / DECEASED) — withdrawals are only allowed for ACTIVE members.
 *   2. The member has enough withdrawable balance (Σ deposits − Σ withdrawals)
 *      to cover the requested amount.
 *   3. There is no other PENDING_APPROVAL withdrawal for the same member —
 *      this prevents double-spending when two withdrawals are submitted in
 *      parallel (the spec calls this the "no conflicting pending" rule).
 *
 * Throws an Error with a human-readable reason when any check fails.
 *
 * Extracted from `approveTransaction` (transactions.ts:240-273).
 */
export async function validateWithdrawalEligibility(
  tx: Prisma.TransactionClient,
  txn: {
    id: string
    amount: Prisma.Decimal | number
    memberId: string | null
    member?: { id: string; status: string; fullName: string } | null
  }
): Promise<void> {
  if (!txn.memberId) return
  if (!txn.member) throw new Error("Linked member not found.")
  const m = txn.member

  const blockedStatuses = ["SUSPENDED", "CLOSED", "REJECTED", "DECEASED"]
  if (blockedStatuses.includes(m.status)) {
    throw new Error(`Member account is ${m.status}. Cannot approve withdrawal.`)
  }

  const bal = await computeMemberBalance(tx, m.id)
  const amount = Number(txn.amount)
  if (bal.balance < amount) {
    throw new Error(
      `Insufficient withdrawable balance. Available ৳${bal.balance.toLocaleString()}, ` +
        `requested ৳${amount.toLocaleString()}.`
    )
  }

  // Concurrent pending transaction check (spec §7A "no conflicting pending").
  const conflicting = await tx.transaction.findFirst({
    where: {
      memberId: m.id,
      transactionType: "WITHDRAWAL",
      status: "PENDING_APPROVAL",
      id: { not: txn.id },
    },
    select: { voucherNo: true },
  })
  if (conflicting) {
    throw new Error(
      `Another pending withdrawal (${conflicting.voucherNo}) exists for this member. ` +
        `Resolve it first to prevent double-spending.`
    )
  }
}
