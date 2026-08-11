// Income Distribution posting — the bridge that keeps the General Ledger and
// the member Savings sub-ledger in sync.
//
// THE BUG THIS FIXES:
// The old INCOME_DISTRIBUTION flow (lib/transactions/rules.ts) posted
//   Dr INCOME-PROFIT-INTEREST  /  Cr PROFIT-PAYABLE
// and then credited a Savings "DONATION" mirror row per member — but NEVER
// cleared PROFIT-PAYABLE into MEMBER-SAVINGS-LIABILITY. So the GL liability
// drifted further from the sum of member balances on every distribution.
//
// THE FIX (immediate-credit model):
// One balanced JOURNAL voucher credits MEMBER-SAVINGS-LIABILITY directly, so
// the aggregate GL liability rises exactly in step with the per-member mirror
// rows. No clearing account, no drift:
//
//   Dr  <source income account>            [totalDistributable]
//       Cr  MEMBER-SAVINGS-LIABILITY           [totalDistributable]
//
// Plus, for each share, a Savings row of type "PROFIT" is created so the
// member's withdrawable balance rises immediately. computeMemberBalance sums
// all non-WITHDRAWAL Savings rows, so PROFIT is included automatically.

import { Prisma } from "@prisma/client"
import type { VoucherType } from "@prisma/client"
import { SYSTEM_ACCOUNT_CODES, resolveAccountId } from "@/lib/transactions/rules"
import {
  INVESTMENT_INCOME_CODES,
  incomeCodeForType,
} from "@/lib/portfolio/accounting"

// ── Distribution-specific inputs (plain TS, decoupled from Prisma rows) ──
export interface PostDistributionInput {
  /** Date stamped on the voucher and on the Savings mirror rows. */
  postedAt: Date
  narration: string
  referenceNo?: string | null
  sourceType: "INVESTMENT" | "PROJECT" | "GENERAL"
  totalDistributable: number
  /**
   * For an investment source, the income type (DIVIDEND/INTEREST/RENTAL/...)
   * lets us debit the *specific* income account the distribution consumes —
   * so the P&L shows rental income dropping when rental profit is distributed.
   * Null → fall back to the general INCOME-PROFIT-INTEREST account.
   */
  investmentIncomeType?: string | null
  /** Tag the voucher with a member for display (optional). */
  memberId?: string | null
  /** Caller passes the shares to create Savings mirror rows for. */
  shares: {
    memberId: string
    memberName: string
    amount: number
    distributionShareId: string
  }[]
}

export interface PostDistributionResult {
  journalEntryId: string
  voucherNo: string
  /** savingsMirrorId per share, keyed by distributionShareId. */
  savingsMirrorIds: Record<string, string>
}

// ── Balance-effect formula (mirrors lib/transactions/posting.ts) ─────────
// DEBIT-natured accounts rise on debit, CREDIT-natured rise on credit.
// `sign = 1` for posting, `-1` for reversal.
async function applyEffects(
  tx: Prisma.TransactionClient,
  lines: { accountId: string; debit: number; credit: number }[],
  sign: 1 | -1
): Promise<void> {
  const grouped = new Map<string, { debit: number; credit: number }>()
  for (const l of lines) {
    const g = grouped.get(l.accountId) ?? { debit: 0, credit: 0 }
    g.debit += l.debit
    g.credit += l.credit
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

// ── Atomic voucher number — Counter row "journal:<type>" avoids races ────
// The shared "transaction" counter is owned by lib/transactions/voucher.ts;
// we keep a separate "journal" counter so the two number spaces can't collide.
const JOURNAL_VOUCHER_PREFIX: Record<VoucherType, string> = {
  JOURNAL: "JV",
  RECEIPT: "RV",
  PAYMENT: "PV",
  CONTRA: "CV",
}

async function nextJournalNo(
  tx: Prisma.TransactionClient,
  type: VoucherType
): Promise<string> {
  const counter = await tx.counter.upsert({
    where: { id: "journal" },
    update: { value: { increment: 1 } },
    create: { id: "journal", value: 1 },
  })
  const prefix = JOURNAL_VOUCHER_PREFIX[type] ?? "JV"
  return `${prefix}-${String(counter.value).padStart(4, "0")}`
}

/**
 * Resolve the income account code to DEBIT for the distribution.
 *
 * Investment income → the specific income account (INCOME-RENTAL, etc.) so
 *   the P&L shows the consumed income class.
 * Project / General → INCOME-PROFIT-INTEREST (the catch-all distribution
 *   income account the seed provides).
 */
function incomeAccountCodeFor(input: PostDistributionInput): string {
  if (input.sourceType === "INVESTMENT" && input.investmentIncomeType) {
    return incomeCodeForType(input.investmentIncomeType)
  }
  return SYSTEM_ACCOUNT_CODES.INCOME_PROFIT_INTEREST
}

/**
 * Post a distribution: the balanced GL voucher + per-member Savings mirror
 * rows. MUST be called inside a `prisma.$transaction` callback.
 *
 * Idempotency is the caller's responsibility — this function always writes.
 * `postDistributionAction` guards on status === DRAFT before calling.
 */
export async function postDistribution(
  tx: Prisma.TransactionClient,
  input: PostDistributionInput
): Promise<PostDistributionResult> {
  const total = Number(input.totalDistributable || 0)
  if (total <= 0) throw new Error("Distribution total must be greater than zero.")
  if (input.shares.length === 0) throw new Error("Distribution has no shares.")

  // Validate the shares sum to the total before touching the ledger — a
  // mismatch here would produce an unbalanced voucher that we'd then have to
  // roll back.
  const sharesSum = input.shares.reduce((s, x) => s + Number(x.amount), 0)
  if (Math.abs(sharesSum - total) > 0.005) {
    throw new Error(
      `Distribution shares (${sharesSum.toFixed(2)}) do not sum to the total (${total.toFixed(2)}).`
    )
  }

  // ── Resolve accounts ──────────────────────────────────────────────────
  const incomeAccountId = await resolveAccountId(tx, incomeAccountCodeFor(input))
  const liabilityAccountId = await resolveAccountId(
    tx,
    SYSTEM_ACCOUNT_CODES.MEMBER_SAVINGS_LIABILITY
  )

  const voucherNo = await nextJournalNo(tx, "JOURNAL")

  // ── The voucher: Dr income  /  Cr member-savings-liability ────────────
  const entry = await tx.journalEntry.create({
    data: {
      voucherNo,
      voucherType: "JOURNAL",
      entryDate: input.postedAt,
      narration: input.narration.trim(),
      referenceNo: input.referenceNo?.trim() || null,
      memberId: input.memberId ?? null,
      status: "POSTED",
      totalDebit: total,
      totalCredit: total,
      lines: {
        create: [
          {
            accountId: incomeAccountId,
            debit: total,
            credit: 0,
            memo: "Income distributed to members",
          },
          {
            accountId: liabilityAccountId,
            debit: 0,
            credit: total,
            memo: "Profit credited to member savings",
          },
        ],
      },
    },
  })

  // Apply balance effects to both GL accounts.
  await applyEffects(tx, [
    { accountId: incomeAccountId, debit: total, credit: 0 },
    { accountId: liabilityAccountId, debit: 0, credit: total },
  ], 1)

  // ── Per-member Savings mirror rows (the credit members feel) ─────────
  // type "PROFIT" is distinguished from "DONATION" so reports can tell a
  // proper profit distribution from a one-off donation credit.
  const savingsMirrorIds: Record<string, string> = {}
  for (const share of input.shares) {
    const mirror = await tx.savings.create({
      data: {
        memberId: share.memberId,
        amount: share.amount,
        type: "PROFIT",
        method: "SYSTEM",
        date: input.postedAt,
      },
      select: { id: true },
    })
    savingsMirrorIds[share.distributionShareId] = mirror.id
  }

  return { journalEntryId: entry.id, voucherNo, savingsMirrorIds }
}

/**
 * Reverse a posted distribution: a new JOURNAL voucher that swaps Dr/Cr, plus
 * deletion of the per-member Savings mirror rows. MUST run in a transaction.
 *
 * The mirror rows are deleted (not negated) because a reversed distribution
 * is treated as never having happened for the member's balance — this keeps
 * the Savings ledger clean of zero-sum noise. The reversing voucher provides
 * the audit trail in the GL.
 */
export async function reverseDistribution(
  tx: Prisma.TransactionClient,
  params: {
    originalEntryId: string
    reversedAt: Date
    reason: string
    mirrorRows: { mirrorId: string; memberId: string; amount: number }[]
  }
): Promise<{ reversalJournalId: string; reversalVoucherNo: string }> {
  // Load the original voucher's lines to build the mirror entry.
  const original = await tx.journalEntry.findUnique({
    where: { id: params.originalEntryId },
    include: { lines: true },
  })
  if (!original) throw new Error("Original distribution voucher not found.")
  if (original.status !== "POSTED") {
    throw new Error("Only a POSTED voucher can be reversed.")
  }

  const voucherNo = await nextJournalNo(tx, "JOURNAL")

  // Swap Dr ↔ Cr so the reversal undoes the original posting.
  const reversedLines = original.lines.map((l) => ({
    accountId: l.accountId,
    debit: Number(l.credit),
    credit: Number(l.debit),
    memo: `Reversal: ${l.memo ?? "distribution"}`,
  }))

  const reversalEntry = await tx.journalEntry.create({
    data: {
      voucherNo,
      voucherType: "JOURNAL",
      entryDate: params.reversedAt,
      narration: `REVERSAL — ${params.reason.trim()}`,
      referenceNo: `REV of ${original.voucherNo}`,
      status: "POSTED",
      totalDebit: Number(original.totalCredit),
      totalCredit: Number(original.totalDebit),
      lines: { create: reversedLines },
    },
  })

  // Undo the GL balance effects (sign = -1) using the swapped lines.
  await applyEffects(
    tx,
    reversedLines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit })),
    -1
  )

  // Remove the per-member PROFIT mirror rows so member balances revert.
  for (const m of params.mirrorRows) {
    if (m.mirrorId) {
      await tx.savings.delete({ where: { id: m.mirrorId } })
    }
  }

  return { reversalJournalId: reversalEntry.id, reversalVoucherNo: voucherNo }
}

// Re-export for callers that need the income code maps.
export { INVESTMENT_INCOME_CODES }
