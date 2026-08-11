import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { type CurrentUser } from "@/lib/permissions"
import {
  loadApprovalLimits,
  userApprovalCeiling,
  type ApprovalLimitRow,
} from "@/lib/transactions/validation"

/**
 * Approval-limit check (spec §13).
 *
 * When active approval tiers are configured, the user must have a ceiling
 * high enough to cover the transaction amount. Throws an Error with a
 * human-readable reason when the user's authority is too low.
 *
 * Extracted from `approveTransaction` (transactions.ts:217-238).
 */
export async function validateApprovalLimit(
  txn: { id: string; amount: Prisma.Decimal | number },
  user: CurrentUser
): Promise<void> {
  const limits = await loadApprovalLimits()
  if (limits.length === 0) return // no limits configured → only Maker-Checker applies

  const granted = new Set<string>(
    (
      await prisma.userPermission.findMany({
        where: { userId: user.id },
        select: { permission: true },
      })
    ).map((p) => p.permission)
  )
  const ceiling = userApprovalCeiling(user, granted, limits)
  const amount = Number(txn.amount)
  if (amount > ceiling) {
    const tier = limits.find(
      (l: ApprovalLimitRow) => amount >= l.minAmount && amount <= l.maxAmount
    )
    throw new Error(
      `Your approval authority (up to ৳${ceiling.toLocaleString()}) is below this amount. ` +
        `This transaction requires ${tier?.label ?? "a higher authority"} approval.`
    )
  }
}
