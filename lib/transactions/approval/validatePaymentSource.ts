/**
 * Payment-source validation (spec §7B).
 *
 * For a WITHDRAWAL with a linked cash/bank account, ensures the account has
 * enough balance to disburse the requested amount. Pure — no I/O (the
 * account record is already loaded by the caller).
 *
 * Throws an Error with a human-readable reason when the source account has
 * insufficient funds.
 *
 * Extracted from `approveTransaction` (transactions.ts:275-284).
 */
export function validatePaymentSource(txn: {
  transactionType: string
  amount: number | { toNumber(): number }
  cashAccount?: { currentBalance: number | { toNumber(): number }; accountName: string } | null
}): void {
  if (txn.transactionType !== "WITHDRAWAL") return
  if (!txn.cashAccount) return

  const acc = txn.cashAccount
  const amount = typeof txn.amount === "number" ? txn.amount : txn.amount.toNumber()
  const balance = typeof acc.currentBalance === "number" ? acc.currentBalance : acc.currentBalance.toNumber()

  if (balance < amount) {
    throw new Error(
      `Insufficient funds in "${acc.accountName}" ` +
        `(balance ৳${balance.toLocaleString()}).`
    )
  }
}
