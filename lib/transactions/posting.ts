import { Prisma } from "@prisma/client"
import { nextVoucherNo } from "@/lib/accounting"
import { buildJournalSpecs, buildWriteOffSpecs, resolveAccountId } from "./rules"
import type { VoucherType } from "@/lib/accounting"

export interface PostInput {
  transactionId: string
  transactionType: "DEPOSIT" | "WITHDRAWAL" | "CHARGE" | "INCOME_DISTRIBUTION"
  amount: number
  memberId?: string | null
  cashAccountId: string | null
  referenceNo?: string | null
  narration: string
  /** Savings row type to mirror (e.g. MONTHLY / WITHDRAWAL / FINE / DONATION). */
  savingsType: string
  /** Savings row method (CASH / BKASH / BANK). */
  savingsMethod: string
  /** −1 for reversals (negates the member-facing mirror amount). */
  sign?: 1 | -1
}

export interface PostResult {
  journalEntryId: string
  journalVoucherNo: string
  savingsMirrorId: string | null
}

/**
 * Apply (or reverse) the financial effects of a transaction inside the
 * caller's `prisma.$transaction`. Writes BOTH:
 *
 *   1. the double-entry GL — JournalEntry + JournalLines + Account balances
 *   2. the member-facing Savings mirror row (the legacy ledger member
 *      balances are derived from — preserves existing UX, due lists, trust
 *      score hooks)
 *
 * This is the bridge the two parallel ledgers previously lacked. If anything
 * throws, the caller's whole transaction rolls back (spec §17).
 */
export async function postTransactionEffects(
  tx: Prisma.TransactionClient,
  input: PostInput
): Promise<PostResult> {
  const sign = input.sign ?? 1
  const specs = buildJournalSpecs(input.transactionType, {
    cashAccountId: input.cashAccountId,
    memberId: input.memberId,
    amount: input.amount,
  })

  // Resolve every account code → id up front so missing accounts fail BEFORE
  // we write anything. The "__CASH__" sentinel is replaced by the selected
  // cash/bank/wallet account.
  const resolvedLines: {
    accountId: string
    debit: number
    credit: number
    memo?: string
  }[] = []
  for (const spec of specs) {
    let accountId: string
    if (spec.accountCode === "__CASH__") {
      if (!input.cashAccountId) {
        throw new Error("A Cash / Bank / Mobile Wallet account is required.")
      }
      accountId = input.cashAccountId
    } else {
      accountId = await resolveAccountId(tx, spec.accountCode)
    }
    resolvedLines.push({
      accountId,
      // For reversals we swap debit/credit rather than negating amounts, which
      // keeps the journal readable and `Σdebit = Σcredit` invariant intact.
      debit: sign === -1 ? spec.credit : spec.debit,
      credit: sign === -1 ? spec.debit : spec.credit,
      memo: spec.memo,
    })
  }

  // Validate balance (≤ 0.005 tolerance, same convention as journal.ts).
  const totalDebit = resolvedLines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = resolvedLines.reduce((s, l) => s + l.credit, 0)
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(
      `Voucher not balanced. Debits ${totalDebit.toFixed(2)} ≠ Credits ${totalCredit.toFixed(2)}.`
    )
  }

  // Voucher type: RECEIPT for inflows, PAYMENT for outflows, JOURNAL otherwise.
  const voucherType: VoucherType =
    input.transactionType === "DEPOSIT"
      ? "RECEIPT"
      : input.transactionType === "WITHDRAWAL"
      ? "PAYMENT"
      : "JOURNAL"

  // Create the JournalEntry + lines and apply balance effects in one tx.
  // Pass `tx` so the count read runs inside this interactive transaction —
  // calling the global prisma client here breaks Supabase pooled transactions.
  const voucherNo = await nextVoucherNo(voucherType, tx)
  const entry = await tx.journalEntry.create({
    data: {
      voucherNo,
      voucherType,
      entryDate: new Date(),
      narration: input.narration,
      referenceNo: input.referenceNo || null,
      memberId: input.memberId || null,
      status: "POSTED", // posted immediately as part of approval
      totalDebit,
      totalCredit,
      lines: {
        create: resolvedLines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          memo: l.memo?.trim() || null,
        })),
      },
    },
  })

  // Apply account balance effects. (journal.ts keeps applyLineEffects private;
  // we re-implement the small, well-tested formula here so this can run inside
  // the caller's transaction without a circular import.)
  await applyLineEffects(tx, resolvedLines, 1)

  // Member-facing mirror row. This is what the existing member-ledger,
  // due-list, and trust-score code reads. Without it, member balances would
  // drift from the GL. The pattern mirrors loan.ts's recordRepayment.
  //
  // Reversal polarity fix (B22): when sign === −1 the mirror row's TYPE is
  // inverted so computeMemberBalance treats it with the opposite effect. A
  // reversal of a WITHDRAWAL credits the member back, so the mirror row must
  // be a "DEPOSIT" (counted as addition by computeMemberBalance). Without
  // this swap, the mirror would carry type "WITHDRAWAL" and the balance math
  // would subtract AGAIN, double-charging the member. The amount stored on
  // the row is always positive (Savings.amount has no sign); the direction is
  // expressed entirely by the `type` field.
  let savingsMirrorId: string | null = null
  if (input.memberId) {
    const mirrorAmount = sign * Number(input.amount)
    let mirrorType = input.savingsType
    if (sign === -1) {
      // Reverse the polarity so the member-facing balance math undoes the
      // original posting instead of re-applying it.
      if (input.savingsType === "WITHDRAWAL") mirrorType = "DEPOSIT"
      else if (input.savingsType === "FINE") mirrorType = "DEPOSIT" // fine waiver credits the member
      else if (input.savingsType === "DEPOSIT") mirrorType = "WITHDRAWAL" // deposit reversal debits the member
      else if (input.savingsType === "DONATION") mirrorType = "DEPOSIT"
      // (PROFIT / LOAN_PAYMENT / MONTHLY reversals default to keeping their
      // type — they're already addition-flavored and computeMemberBalance
      // treats them as such; no swap needed.)
    }
    const mirror = await tx.savings.create({
      data: {
        memberId: input.memberId,
        amount: Math.abs(mirrorAmount),
        type: mirrorType,
        method: input.savingsMethod,
        date: new Date(),
      },
    })
    savingsMirrorId = mirror.id
  }

  return { journalEntryId: entry.id, journalVoucherNo: voucherNo, savingsMirrorId }
}

/**
 * Post the GL entry for a loan write-off (B21). MUST run inside the caller's
 * `directPrisma.$transaction` callback.
 *
 * Creates a JOURNAL voucher that:
 *   Dr  EXPENSE-LOAN-WRITEOFF       [outstandingBalance]
 *       Cr  LOANS-RECEIVABLE           [outstandingBalance]
 *
 * No member-facing Savings mirror row is created — the write-off touches the
 * General Ledger only. The Savings side of the loan is already captured on
 * the LOAN_PAYMENT rows recorded against this loan, and member balances are
 * unaffected (writing off a loan doesn't change the member's savings).
 *
 * Returns the journalEntryId so the caller can link it on the Loan row.
 * Returns `null` when the outstanding balance is zero (no GL effect needed).
 */
export async function postWriteOffEffects(
  tx: Prisma.TransactionClient,
  loan: {
    id: string
    loanNo?: string | null
    memberId?: string | null
    // Accept Decimal too because Prisma returns Decimal for decimal columns.
    outstandingBalance: number | string | Prisma.Decimal
  }
): Promise<{ journalEntryId: string | null; journalVoucherNo: string | null }> {
  const specs = buildWriteOffSpecs(loan)
  if (specs.length === 0) {
    // Outstanding balance is zero — nothing to post. Caller can still mark
    // the loan WRITTEN_OFF for state-tracking purposes.
    return { journalEntryId: null, journalVoucherNo: null }
  }

  // Resolve every account code → id up front so missing accounts fail BEFORE
  // we write anything (same pattern as postTransactionEffects).
  const resolvedLines: {
    accountId: string
    debit: number
    credit: number
    memo?: string
  }[] = []
  for (const spec of specs) {
    const accountId = await resolveAccountId(tx, spec.accountCode)
    resolvedLines.push({
      accountId,
      debit: spec.debit,
      credit: spec.credit,
      memo: spec.memo,
    })
  }

  const totalDebit = resolvedLines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = resolvedLines.reduce((s, l) => s + l.credit, 0)
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(
      `Write-off voucher not balanced. Debits ${totalDebit.toFixed(2)} ≠ Credits ${totalCredit.toFixed(2)}.`
    )
  }

  const voucherNo = await nextVoucherNo("JOURNAL", tx)
  const entry = await tx.journalEntry.create({
    data: {
      voucherNo,
      voucherType: "JOURNAL",
      entryDate: new Date(),
      narration: `Loan write-off — ${loan.loanNo ?? loan.id}`,
      referenceNo: loan.loanNo ?? null,
      memberId: loan.memberId ?? null,
      status: "POSTED",
      totalDebit,
      totalCredit,
      lines: {
        create: resolvedLines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          memo: l.memo?.trim() || null,
        })),
      },
    },
  })

  // Apply balance effects (debit asset down, debit expense up).
  await applyLineEffects(tx, resolvedLines, 1)

  return { journalEntryId: entry.id, journalVoucherNo: voucherNo }
}

/**
 * Mutate `Account.currentBalance` for each line's account, grouped so each
 * account is updated once. Net effect follows the account's nature:
 *   DEBIT-natured  → increases on debit, decreases on credit
 *   CREDIT-natured → increases on credit, decreases on debit
 *
 * Identical to the private helper in app/actions/journal.ts; duplicated to
 * keep the modules decoupled while staying inside the same DB transaction.
 */
async function applyLineEffects(
  tx: Prisma.TransactionClient,
  lines: { accountId: string; debit: number; credit: number }[],
  sign: 1 | -1
): Promise<void> {
  const grouped = new Map<string, { debit: number; credit: number }>()
  for (const l of lines) {
    const g = grouped.get(l.accountId) ?? { debit: 0, credit: 0 }
    g.debit += Number(l.debit || 0)
    g.credit += Number(l.credit || 0)
    grouped.set(l.accountId, g)
  }
  for (const [accountId, { debit, credit }] of grouped) {
    const acc = await tx.account.findUnique({
      where: { id: accountId },
      select: { nature: true, currentBalance: true },
    })
    // B23: never silently skip a missing account. A missing account here means
    // a JournalLine was written with an accountId that doesn't exist — a
    // referential integrity violation we should fail loudly on, not absorb.
    if (!acc) {
      throw new Error(
        `Account ${accountId} not found while applying line effects — the posting was aborted before any balance was changed.`
      )
    }
    const net = acc.nature === "DEBIT" ? debit - credit : credit - debit
    const next = Number(acc.currentBalance) + sign * net
    await tx.account.update({
      where: { id: accountId },
      data: { currentBalance: next },
    })
  }
}
