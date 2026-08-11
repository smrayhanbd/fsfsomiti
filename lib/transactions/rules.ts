import { Prisma } from "@prisma/client"

// Stable account codes the rules engine resolves against the Chart of
// Accounts. The seed (prisma/seed.js) guarantees these exist; the approve
// action fails loudly if any are missing rather than posting to a wrong
// account.
export const SYSTEM_ACCOUNT_CODES = {
  MEMBER_SAVINGS_LIABILITY: "MEMBER-SAVINGS-LIABILITY",
  CASH_IN_HAND: "CASH-IN-HAND",
  PROFIT_PAYABLE: "PROFIT-PAYABLE",
  INCOME_PROFIT_INTEREST: "INCOME-PROFIT-INTEREST",
  EXPENSE_RECOVERY_INCOME: "EXPENSE-RECOVERY-INCOME",
  OPERATING_EXPENSES: "OPERATING-EXPENSES",
  // Loan lifecycle — used by the write-off GL entry (B21).
  // Loans Receivable is the asset that goes DOWN when a loan is written off.
  // Loan Write-Off Expense is the P&L hit recognised at the same time.
  LOANS_RECEIVABLE: "LOANS-RECEIVABLE",
  LOAN_WRITE_OFF_EXPENSE: "EXPENSE-LOAN-WRITEOFF",
} as const

export interface JournalLineSpec {
  accountCode: string
  debit: number
  credit: number
  memo?: string
}

export interface ResolveContext {
  /** Cash / Bank / Mobile-wallet account selected on the transaction. */
  cashAccountId: string | null
  /** The member the transaction is for (optional). */
  memberId?: string | null
  /** Total amount. */
  amount: number
}

/**
 * Resolve a single account id by its stable `accountCode`. Throws if missing
 * so a half-configured chart of accounts never silently posts to the wrong
 * place (spec §17: unbalanced / unresolved postings must abort the approval).
 */
export async function resolveAccountId(
  tx: Prisma.TransactionClient,
  code: string
): Promise<string> {
  const acc = await tx.account.findUnique({
    where: { accountCode: code },
    select: { id: true, accountName: true, allowPosting: true, status: true },
  })
  if (!acc) {
    throw new Error(
      `System account "${code}" not found. Run the seed or add it on the Chart of Accounts.`
    )
  }
  if (acc.status !== "ACTIVE") {
    throw new Error(`System account "${code}" (${acc.accountName}) is inactive.`)
  }
  return acc.id
}

/**
 * Build the balanced double-entry journal lines for a transaction based on
 * its type and sub-type. Returns specs keyed by account code; the caller
 * resolves codes → ids inside the same transaction.
 *
 * Accounting rules (spec §6 / §7 / §8 / §9):
 *   DEPOSIT   → Dr Cash/Bank,           Cr Member Savings Liability
 *   WITHDRAW  → Dr Member Savings Liab., Cr Cash/Bank
 *   CHARGE    → Dr Member Savings Liab., Cr Expense Recovery Income
 *   INCOME    → Dr Profit/Interest Inc., Cr Profit Payable
 *               (per-member step 2: Dr Profit Payable, Cr Member Savings)
 *
 * Phase 2 sub-types (loan disbursement, admission, shares, dividend) are
 * intentionally not handled here — the loan module already owns that flow.
 */
export function buildJournalSpecs(
  transactionType: "DEPOSIT" | "WITHDRAWAL" | "CHARGE" | "INCOME_DISTRIBUTION",
  ctx: ResolveContext
): JournalLineSpec[] {
  // The cash side of the entry is resolved from ctx.cashAccountId in
  // posting.ts (not by code) so we emit the "__CASH__" sentinel here.
  const amount = Number(ctx.amount || 0)
  if (amount <= 0) {
    throw new Error("Transaction amount must be greater than zero.")
  }
  if (!ctx.cashAccountId && transactionType !== "CHARGE") {
    // Charges may be recovered without a cash movement; everything else needs
    // an explicit Cash/Bank/Wallet destination.
    throw new Error(
      "A Cash / Bank / Mobile Wallet account is required for this transaction."
    )
  }

  switch (transactionType) {
    case "DEPOSIT":
      // Cash/Bank increases, member liability increases.
      // The cash side is resolved from ctx.cashAccountId in posting.ts.
      return [
        { accountCode: "__CASH__", debit: amount, credit: 0, memo: "Cash/Bank received" },
        {
          accountCode: SYSTEM_ACCOUNT_CODES.MEMBER_SAVINGS_LIABILITY,
          debit: 0,
          credit: amount,
          memo: "Member savings credit",
        },
      ]

    case "WITHDRAWAL":
      return [
        {
          accountCode: SYSTEM_ACCOUNT_CODES.MEMBER_SAVINGS_LIABILITY,
          debit: amount,
          credit: 0,
          memo: "Member savings debit",
        },
        { accountCode: "__CASH__", debit: 0, credit: amount, memo: "Cash/Bank paid out" },
      ]

    case "CHARGE":
      // Recover from members (no cash moves) — expense recovery income.
      // The two-step "record expense then recover" pattern is modelled as a
      // single balanced pair here for simplicity; if the Somiti actually paid
      // a third party, that goes through a separate Payment Voucher.
      return [
        {
          accountCode: SYSTEM_ACCOUNT_CODES.MEMBER_SAVINGS_LIABILITY,
          debit: amount,
          credit: 0,
          memo: "Charge debited from member savings",
        },
        {
          accountCode: SYSTEM_ACCOUNT_CODES.EXPENSE_RECOVERY_INCOME,
          debit: 0,
          credit: amount,
          memo: "Expense recovery income",
        },
      ]

    case "INCOME_DISTRIBUTION":
      // Step 1 of the two-step posting: recognise income, create a payable.
      // The per-member step 2 (Dr Profit Payable, Cr Member Savings) is
      // generated by the approve action for each member share.
      return [
        {
          accountCode: SYSTEM_ACCOUNT_CODES.INCOME_PROFIT_INTEREST,
          debit: amount,
          credit: 0,
          memo: "Income recognised for distribution",
        },
        {
          accountCode: SYSTEM_ACCOUNT_CODES.PROFIT_PAYABLE,
          debit: 0,
          credit: amount,
          memo: "Profit payable pending member credit",
        },
      ]

    default:
      throw new Error(`Unsupported transaction type: ${transactionType}`)
  }
}

/**
 * Build the balanced journal lines for a loan write-off (B21).
 *
 * Accounting entry:
 *   Dr  EXPENSE-LOAN-WRITEOFF       [outstandingBalance]
 *       Cr  LOANS-RECEIVABLE           [outstandingBalance]
 *
 * Rationale: the outstanding principal is no longer recoverable, so we
 *   1. remove it from the asset side (credit Loans Receivable — an asset,
 *      which decreases on credit), and
 *   2. recognise the loss in the P&L (debit Write-Off Expense — an expense,
 *      which increases on debit).
 *
 * The two lines are balanced by construction. Unlike `buildJournalSpecs`,
 * this spec set doesn't reference the `__CASH__` sentinel because no cash
 * moves — the write-off is purely an accounting recognition.
 *
 * `loan.outstandingBalance` is read as-is from the calling action; the caller
 * is responsible for the FOR UPDATE row lock that makes the read safe.
 */
export function buildWriteOffSpecs(loan: {
  // Accept Decimal too because Prisma returns Decimal for decimal columns.
  outstandingBalance: number | string | Prisma.Decimal
  loanNo?: string | null
  memberId?: string | null
}): JournalLineSpec[] {
  const amount = Number(loan.outstandingBalance || 0)
  if (amount <= 0) {
    // Nothing to write off — return an empty spec set so the caller can
    // decide whether to skip posting entirely. (Loan already has a zero
    // outstanding balance, so there's no GL effect to post.)
    return []
  }
  const memoSuffix = loan.loanNo ? ` — ${loan.loanNo}` : ""
  return [
    {
      accountCode: SYSTEM_ACCOUNT_CODES.LOAN_WRITE_OFF_EXPENSE,
      debit: amount,
      credit: 0,
      memo: `Loan written off${memoSuffix}`,
    },
    {
      accountCode: SYSTEM_ACCOUNT_CODES.LOANS_RECEIVABLE,
      debit: 0,
      credit: amount,
      memo: `Loan receivable removed${memoSuffix}`,
    },
  ]
}
