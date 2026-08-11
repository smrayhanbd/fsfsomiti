// ─────────────────────────────────────────────────────────────────────────
// Reusable auto-voucher posting service for the Investment & Project modules.
//
// Each helper runs inside the CALLER's `prisma.$transaction` (exactly like
// lib/transactions/posting.ts:postTransactionEffects) and:
//   1. resolves account codes → ids (fails loudly if a system account is
//      missing, so we never post to the wrong account),
//   2. builds a balanced Dr/Cr set per the spec's journal-entry matrix,
//   3. creates a POSTED JournalEntry + JournalLines,
//   4. applies the balance effect to each touched Account,
//   5. returns { journalEntryId, voucherNo }.
//
// Implements the main scenarios from spec §3.3. Capital write-downs/gains use
// JOURNAL + explicit accounts (DN/CN voucher types are deferred).
// ─────────────────────────────────────────────────────────────────────────

import { Prisma } from "@prisma/client"
import { nextVoucherNo } from "@/lib/accounting"
import type { VoucherType } from "@/lib/accounting"
import {
  resolveAccountId,
  INVESTMENT_INCOME_CODES,
  INVESTMENT_EXPENSE_CODES,
  TAX_CODES,
  incomeCodeForType,
} from "./accounting"

export interface PostResult {
  journalEntryId: string
  voucherNo: string
}

interface LineSpec {
  accountCode: string // system code OR "__CASH__" / "__ASSET__" sentinels
  debit: number
  credit: number
  memo: string
}

/**
 * Apply (or reverse) the balance effect of a set of lines, grouped by account.
 * Net effect follows the account's nature:
 *   DEBIT-natured  → increases on debit, decreases on credit
 *   CREDIT-natured → increases on credit, decreases on debit
 *
 * Identical formula to lib/transactions/posting.ts:applyLineEffects (kept
 * duplicated to stay inside the caller's transaction without a circular dep).
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

/**
 * Core writer: resolve specs → ids, validate balance, create the POSTED
 * JournalEntry + lines, and apply balance effects. Shared by every helper.
 *
 *   `__CASH__`  → replaced by `input.cashAccountId`
 *   `__ASSET__` → replaced by `input.assetAccountId`
 */
interface CoreInput {
  voucherType: VoucherType
  entryDate: Date
  narration: string
  referenceNo?: string | null
  specs: LineSpec[]
  cashAccountId?: string | null
  assetAccountId?: string | null
}

async function postCore(
  tx: Prisma.TransactionClient,
  input: CoreInput
): Promise<PostResult> {
  const resolved: { accountId: string; debit: number; credit: number; memo: string }[] = []
  for (const spec of input.specs) {
    let accountId: string
    if (spec.accountCode === "__CASH__") {
      if (!input.cashAccountId) {
        throw new Error("A Cash / Bank account is required for this transaction.")
      }
      accountId = input.cashAccountId
    } else if (spec.accountCode === "__ASSET__") {
      if (!input.assetAccountId) {
        throw new Error("An asset account is required for this transaction.")
      }
      accountId = input.assetAccountId
    } else {
      accountId = await resolveAccountId(tx, spec.accountCode)
    }
    resolved.push({ accountId, debit: spec.debit, credit: spec.credit, memo: spec.memo })
  }

  const totalDebit = resolved.reduce((s, l) => s + l.debit, 0)
  const totalCredit = resolved.reduce((s, l) => s + l.credit, 0)
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(
      `Voucher not balanced. Debits ${totalDebit.toFixed(2)} ≠ Credits ${totalCredit.toFixed(2)}.`
    )
  }

  const voucherNo = await nextVoucherNo(input.voucherType, tx)
  const entry = await tx.journalEntry.create({
    data: {
      voucherNo,
      voucherType: input.voucherType,
      entryDate: input.entryDate,
      narration: input.narration.trim(),
      referenceNo: input.referenceNo?.trim() || null,
      status: "POSTED",
      totalDebit,
      totalCredit,
      lines: {
        create: resolved.map((l) => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          memo: l.memo.trim() || null,
        })),
      },
    },
  })

  await applyLineEffects(tx, resolved, 1)
  return { journalEntryId: entry.id, voucherNo }
}

// ── INVESTMENT: purchase (with optional brokerage/registration) ─────────
//   Dr  Investment Asset        [investedAmount]
//   Dr  Brokerage/Reg Expense   [feesAmount]            (if any)
//       Cr  Cash/Bank              [investedAmount + fees]
export interface InvestmentPurchaseInput {
  entryDate: Date
  narration: string
  referenceNo?: string | null
  assetAccountId: string
  cashAccountId?: string | null
  investedAmount: number
  feesAmount?: number
  // Which expense code to use for fees (brokerage vs registration). Defaults
  // to brokerage.
  feeExpenseCode?: string
  voucherType?: VoucherType
}

export async function postInvestmentPurchase(
  tx: Prisma.TransactionClient,
  input: InvestmentPurchaseInput
): Promise<PostResult> {
  const fees = Number(input.feesAmount || 0)
  const invested = Number(input.investedAmount || 0)
  if (invested <= 0) throw new Error("Invested amount must be greater than zero.")

  const specs: LineSpec[] = [
    { accountCode: "__ASSET__", debit: invested, credit: 0, memo: "Investment acquired (at cost)" },
  ]
  if (fees > 0) {
    specs.push({
      accountCode: input.feeExpenseCode ?? INVESTMENT_EXPENSE_CODES.BROKERAGE,
      debit: fees,
      credit: 0,
      memo: "Acquisition fees / brokerage",
    })
  }
  specs.push({
    accountCode: "__CASH__",
    debit: 0,
    credit: invested + fees,
    memo: "Cash / bank paid out",
  })

  return postCore(tx, {
    voucherType: input.voucherType ?? "PAYMENT",
    entryDate: input.entryDate,
    narration: input.narration,
    referenceNo: input.referenceNo,
    specs,
    cashAccountId: input.cashAccountId,
    assetAccountId: input.assetAccountId,
  })
}

// ── INVESTMENT: income (dividend / interest / rent / profit share) ──────
//   Dr  Cash/Bank               [netAmount]
//   Dr  TDS Receivable          [tdsAmount]             (if any)
//       Cr  Income account         [grossAmount]
export interface InvestmentIncomeInput {
  entryDate: Date
  narration: string
  referenceNo?: string | null
  cashAccountId: string
  incomeType: string // DIVIDEND | INTEREST | RENTAL | PROFIT_SHARE | OTHER
  grossAmount: number
  tdsAmount?: number
  voucherType?: VoucherType
}

export async function postInvestmentIncome(
  tx: Prisma.TransactionClient,
  input: InvestmentIncomeInput
): Promise<PostResult> {
  const gross = Number(input.grossAmount || 0)
  const tds = Number(input.tdsAmount || 0)
  if (gross <= 0) throw new Error("Income amount must be greater than zero.")
  if (tds > gross) throw new Error("TDS cannot exceed gross amount.")

  const specs: LineSpec[] = [
    { accountCode: "__CASH__", debit: gross - tds, credit: 0, memo: "Net income received" },
  ]
  if (tds > 0) {
    specs.push({ accountCode: TAX_CODES.TDS_RECEIVABLE, debit: tds, credit: 0, memo: "TDS deducted at source" })
  }
  specs.push({
    accountCode: incomeCodeForType(input.incomeType),
    debit: 0,
    credit: gross,
    memo: "Investment income recognised",
  })

  return postCore(tx, {
    voucherType: input.voucherType ?? "RECEIPT",
    entryDate: input.entryDate,
    narration: input.narration,
    referenceNo: input.referenceNo,
    specs,
    cashAccountId: input.cashAccountId,
  })
}

// ── INVESTMENT: exit / disposal (capital gain OR loss) ──────────────────
//   GAIN:  Dr Bank [+CGT Payable]   Cr Asset [cost basis]   Cr Capital Gain
//   LOSS:  Dr Bank, Dr Capital Loss   Cr Asset [cost basis]
export interface InvestmentExitInput {
  entryDate: Date
  narration: string
  referenceNo?: string | null
  assetAccountId: string
  cashAccountId: string
  costBasisSold: number
  netProceeds: number // cash actually received (after CGT)
  capitalGainLoss: number // signed: + gain, - loss
  taxAmount?: number // capital gains tax
  voucherType?: VoucherType
}

export async function postInvestmentExit(
  tx: Prisma.TransactionClient,
  input: InvestmentExitInput
): Promise<PostResult> {
  const costBasis = Number(input.costBasisSold || 0)
  const netProceeds = Number(input.netProceeds || 0)
  const gainLoss = Number(input.capitalGainLoss || 0)
  const tax = Number(input.taxAmount || 0)
  if (costBasis <= 0) throw new Error("Cost basis of sold units must be greater than zero.")

  const specs: LineSpec[] = [
    { accountCode: "__CASH__", debit: netProceeds, credit: 0, memo: "Net sale proceeds received" },
  ]
  if (tax > 0) {
    specs.push({ accountCode: TAX_CODES.CGT_PAYABLE, debit: tax, credit: 0, memo: "Capital gains tax" })
  }
  specs.push({
    accountCode: "__ASSET__",
    debit: 0,
    credit: costBasis,
    memo: "Investment disposed (at cost)",
  })

  if (gainLoss >= 0) {
    // Gain: credit the capital gain income account for the gain portion.
    // gain = (netProceeds + tax) - costBasis
    const gain = netProceeds + tax - costBasis
    if (gain > 0) {
      specs.push({
        accountCode: INVESTMENT_INCOME_CODES.CAPITAL_GAIN,
        debit: 0,
        credit: gain,
        memo: "Capital gain on disposal",
      })
    }
  } else {
    // Loss: debit capital loss expense for the loss portion.
    const loss = costBasis - (netProceeds + tax)
    if (loss > 0) {
      specs.push({
        accountCode: INVESTMENT_EXPENSE_CODES.CAPITAL_LOSS,
        debit: loss,
        credit: 0,
        memo: "Capital loss on disposal",
      })
    }
  }

  return postCore(tx, {
    voucherType: input.voucherType ?? "RECEIPT",
    entryDate: input.entryDate,
    narration: input.narration,
    referenceNo: input.referenceNo,
    specs,
    cashAccountId: input.cashAccountId,
    assetAccountId: input.assetAccountId,
  })
}

// ── INVESTMENT: write-off (bad investment) ──────────────────────────────
//   Dr  Investment Write-Off Expense     [amount]
//       Cr  Investment Asset                [amount]
export interface InvestmentWriteOffInput {
  entryDate: Date
  narration: string
  referenceNo?: string | null
  assetAccountId: string
  amount: number
}

export async function postInvestmentWriteOff(
  tx: Prisma.TransactionClient,
  input: InvestmentWriteOffInput
): Promise<PostResult> {
  const amount = Number(input.amount || 0)
  if (amount <= 0) throw new Error("Write-off amount must be greater than zero.")

  const specs: LineSpec[] = [
    { accountCode: INVESTMENT_EXPENSE_CODES.WRITE_OFF, debit: amount, credit: 0, memo: "Investment written off" },
    { accountCode: "__ASSET__", debit: 0, credit: amount, memo: "Investment written off (at book value)" },
  ]
  return postCore(tx, {
    voucherType: "JOURNAL",
    entryDate: input.entryDate,
    narration: input.narration,
    referenceNo: input.referenceNo,
    specs,
    assetAccountId: input.assetAccountId,
  })
}

// ── PROJECT: expense ────────────────────────────────────────────────────
//   Dr  Project Expense — [Cost Center]   [amount]
//       Cr  Cash / Bank / Payable           [amount]
export interface ProjectExpenseInput {
  entryDate: Date
  narration: string
  referenceNo?: string | null
  expenseAccountId: string // project expense account
  cashAccountId?: string | null
  amount: number
  voucherType?: VoucherType
}

export async function postProjectExpense(
  tx: Prisma.TransactionClient,
  input: ProjectExpenseInput
): Promise<PostResult> {
  const amount = Number(input.amount || 0)
  if (amount <= 0) throw new Error("Expense amount must be greater than zero.")

  const specs: LineSpec[] = [
    { accountCode: "__EXPENSE__", debit: amount, credit: 0, memo: "Project expense" },
    { accountCode: "__CASH__", debit: 0, credit: amount, memo: "Cash / bank paid" },
  ]
  // postCore doesn't resolve "__EXPENSE__" — replace with the project's own
  // expense account id directly. We do that by remapping before postCore.
  return postCoreCustom(tx, {
    voucherType: input.voucherType ?? "PAYMENT",
    entryDate: input.entryDate,
    narration: input.narration,
    referenceNo: input.referenceNo,
    specs,
    cashAccountId: input.cashAccountId,
    customAccountId: input.expenseAccountId,
  })
}

// ── PROJECT: revenue ────────────────────────────────────────────────────
//   Dr  Cash / Bank [+Tax Collected Payable]   Cr Project Revenue [gross]
export interface ProjectRevenueInput {
  entryDate: Date
  narration: string
  referenceNo?: string | null
  revenueAccountId: string // project revenue account
  cashAccountId: string
  grossAmount: number
  taxAmount?: number
  voucherType?: VoucherType
}

export async function postProjectRevenue(
  tx: Prisma.TransactionClient,
  input: ProjectRevenueInput
): Promise<PostResult> {
  const gross = Number(input.grossAmount || 0)
  const tax = Number(input.taxAmount || 0)
  if (gross <= 0) throw new Error("Revenue amount must be greater than zero.")

  const specs: LineSpec[] = [
    { accountCode: "__CASH__", debit: gross - tax, credit: 0, memo: "Net revenue received" },
  ]
  if (tax > 0) {
    specs.push({ accountCode: TAX_CODES.TDS_PAYABLE, debit: tax, credit: 0, memo: "Tax / VAT collected" })
  }
  specs.push({ accountCode: "__REVENUE__", debit: 0, credit: gross, memo: "Project revenue recognised" })

  return postCoreCustom(tx, {
    voucherType: input.voucherType ?? "RECEIPT",
    entryDate: input.entryDate,
    narration: input.narration,
    referenceNo: input.referenceNo,
    specs,
    cashAccountId: input.cashAccountId,
    customAccountId: input.revenueAccountId,
  })
}

// ── postCore variant that maps __EXPENSE__ / __REVENUE__ to a custom account ─
// Avoids another sentinel in postCore; the project modules pass their own
// expense/revenue account id (selected per-project in Section 8 of the form).
interface CoreCustomInput extends Omit<CoreInput, "assetAccountId"> {
  customAccountId: string
}

async function postCoreCustom(
  tx: Prisma.TransactionClient,
  input: CoreCustomInput
): Promise<PostResult> {
  const resolved: { accountId: string; debit: number; credit: number; memo: string }[] = []
  for (const spec of input.specs) {
    let accountId: string
    if (spec.accountCode === "__CASH__") {
      if (!input.cashAccountId) {
        throw new Error("A Cash / Bank account is required for this transaction.")
      }
      accountId = input.cashAccountId
    } else if (spec.accountCode === "__EXPENSE__" || spec.accountCode === "__REVENUE__") {
      accountId = input.customAccountId
    } else {
      accountId = await resolveAccountId(tx, spec.accountCode)
    }
    resolved.push({ accountId, debit: spec.debit, credit: spec.credit, memo: spec.memo })
  }

  const totalDebit = resolved.reduce((s, l) => s + l.debit, 0)
  const totalCredit = resolved.reduce((s, l) => s + l.credit, 0)
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(
      `Voucher not balanced. Debits ${totalDebit.toFixed(2)} ≠ Credits ${totalCredit.toFixed(2)}.`
    )
  }

  const voucherNo = await nextVoucherNo(input.voucherType, tx)
  const entry = await tx.journalEntry.create({
    data: {
      voucherNo,
      voucherType: input.voucherType,
      entryDate: input.entryDate,
      narration: input.narration.trim(),
      referenceNo: input.referenceNo?.trim() || null,
      status: "POSTED",
      totalDebit,
      totalCredit,
      lines: {
        create: resolved.map((l) => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          memo: l.memo.trim() || null,
        })),
      },
    },
  })

  await applyLineEffects(tx, resolved, 1)
  return { journalEntryId: entry.id, voucherNo }
}
