// Financial statement computation engine.
// Reads raw Account + JournalLine data from Prisma and produces ready-to-render
// data structures for Trial Balance, Balance Sheet, and Profit & Loss.

import prisma from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import type { AccountType } from "@/lib/accounting"

// ---------------------------------------------------------------------------
// Shared row shape for any account-level line in a statement
// ---------------------------------------------------------------------------
export interface StatementRow {
  id: string
  code: string
  name: string
  type: AccountType
  balance: number // signed per account nature (see balanceFor)
}

export interface StatementSection {
  type: AccountType
  rows: StatementRow[]
  total: number
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * The "balance" of an account is the natural sign for its type:
 *  - Debit-natured accounts (assets, expenses) → debit − credit (+ opening)
 *  - Credit-natured accounts (liabilities, equity, income) → credit − debit (+ opening)
 */
export function naturalBalance(
  account: {
    nature: string
    openingBalance: Prisma.Decimal | number | null
  },
  sum: { debit: number; credit: number }
): number {
  const opening = Number(account.openingBalance ?? 0)
  const d = Number(sum.debit ?? 0)
  const c = Number(sum.credit ?? 0)
  return account.nature === "DEBIT"
    ? opening + d - c
    : opening + c - d
}

/** Fetch all accounts with the aggregate of their posted journal lines. */
export async function loadAccountsWithMovements(opts?: {
  fromDate?: Date
  toDate?: Date
}) {
  const dateFilter: Prisma.DateTimeFilter = {}
  if (opts?.fromDate) dateFilter.gte = opts.fromDate
  if (opts?.toDate) {
    const end = new Date(opts.toDate)
    end.setHours(23, 59, 59, 999)
    dateFilter.lte = end
  }

  // PERFORMANCE: aggregate the journal lines per account in the database
  // (groupBy + _sum) instead of loading every JournalLine row into JS just to
  // reduce it. On a ledger with thousands of posted lines this turns a
  // full-table transfer into one small row per account with activity.
  const [accounts, lineSums] = await Promise.all([
    prisma.account.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        accountCode: true,
        accountName: true,
        accountType: true,
        nature: true,
        openingBalance: true,
        currentBalance: true,
        parentAccountId: true,
        allowPosting: true,
      },
      orderBy: [{ accountType: "asc" }, { accountCode: "asc" }],
    }),
    prisma.journalLine.groupBy({
      by: ["accountId"],
      _sum: { debit: true, credit: true },
      where: {
        journalEntry: {
          status: "POSTED",
          ...(Object.keys(dateFilter).length
            ? { entryDate: dateFilter }
            : {}),
        },
      },
    }),
  ])

  const sums = new Map(lineSums.map((r) => [r.accountId, r._sum]))

  return accounts.map((a) => {
    const sum = sums.get(a.id)
    return {
      id: a.id,
      accountCode: a.accountCode,
      accountName: a.accountName,
      accountType: a.accountType as AccountType,
      nature: a.nature,
      parentAccountId: a.parentAccountId,
      allowPosting: a.allowPosting,
      balance: naturalBalance(a, {
        debit: Number(sum?.debit ?? 0),
        credit: Number(sum?.credit ?? 0),
      }),
    }
  })
}

/** Fetch opening-balance-only + period movement split for P&L comparison. */
async function loadPeriodMovements(opts: { fromDate: Date; toDate: Date }) {
  // PERFORMANCE: same groupBy aggregation as loadAccountsWithMovements, split
  // into "before the period" (opening) and "within the period" sums. The old
  // version loaded every posted JournalLine (with its entry date) into JS to
  // bucket it — a full ledger transfer per P&L render.
  const [accounts, beforeSums, withinSums] = await Promise.all([
    prisma.account.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        accountCode: true,
        accountName: true,
        accountType: true,
        nature: true,
        openingBalance: true,
      },
    }),
    prisma.journalLine.groupBy({
      by: ["accountId"],
      _sum: { debit: true, credit: true },
      where: {
        journalEntry: { status: "POSTED", entryDate: { lt: opts.fromDate } },
      },
    }),
    prisma.journalLine.groupBy({
      by: ["accountId"],
      _sum: { debit: true, credit: true },
      where: {
        journalEntry: {
          status: "POSTED",
          entryDate: { gte: opts.fromDate, lte: opts.toDate },
        },
      },
    }),
  ])

  const before = new Map(beforeSums.map((r) => [r.accountId, r._sum]))
  const within = new Map(withinSums.map((r) => [r.accountId, r._sum]))

  return accounts.map((a) => {
    const b = before.get(a.id)
    const w = within.get(a.id)
    return {
      id: a.id,
      accountCode: a.accountCode,
      accountName: a.accountName,
      accountType: a.accountType as AccountType,
      nature: a.nature,
      opening: naturalBalance(a, {
        debit: Number(b?.debit ?? 0),
        credit: Number(b?.credit ?? 0),
      }),
      period: naturalBalance(a, {
        debit: Number(w?.debit ?? 0),
        credit: Number(w?.credit ?? 0),
      }),
      closing:
        naturalBalance(a, {
          debit: Number(b?.debit ?? 0) + Number(w?.debit ?? 0),
          credit: Number(b?.credit ?? 0) + Number(w?.credit ?? 0),
        }),
    }
  })
}

function groupByType<T extends { accountType: AccountType }>(rows: T[]) {
  const map = new Map<AccountType, T[]>()
  for (const r of rows) {
    const arr = map.get(r.accountType) ?? []
    arr.push(r)
    map.set(r.accountType, arr)
  }
  return map
}

// ---------------------------------------------------------------------------
// Trial Balance
// ---------------------------------------------------------------------------
export interface TrialBalanceRow {
  id: string
  code: string
  name: string
  type: AccountType
  // Debit-natured accounts show on the debit column if balance > 0.
  debit: number
  credit: number
}

export interface TrialBalance {
  rows: TrialBalanceRow[]
  totalDebit: number
  totalCredit: number
  balanced: boolean
}

export async function buildTrialBalance(opts?: {
  asOf?: Date
}): Promise<TrialBalance> {
  const asOf = opts?.asOf
  // For trial balance we want balances up to "as of" date.
  const accounts = await loadAccountsWithMovements(
    asOf ? { toDate: asOf } : undefined
  )

  const rows: TrialBalanceRow[] = accounts.map((a) => {
    const balance = a.balance
    // Debit-natured accounts appear in the debit column when positive,
    // credit-natured in credit column. Negative balances flip columns.
    if (a.nature === "DEBIT") {
      return {
        id: a.id,
        code: a.accountCode,
        name: a.accountName,
        type: a.accountType,
        debit: balance >= 0 ? balance : 0,
        credit: balance < 0 ? Math.abs(balance) : 0,
      }
    }
    return {
      id: a.id,
      code: a.accountCode,
      name: a.accountName,
      type: a.accountType,
      debit: balance < 0 ? Math.abs(balance) : 0,
      credit: balance >= 0 ? balance : 0,
    }
  })

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0)
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0)

  return {
    rows,
    totalDebit,
    totalCredit,
    balanced: Math.abs(totalDebit - totalCredit) < 0.01,
  }
}

// ---------------------------------------------------------------------------
// Balance Sheet
// ---------------------------------------------------------------------------
export interface BalanceSheetSection {
  type: AccountType
  rows: { id: string; code: string; name: string; balance: number }[]
  total: number
}

export interface BalanceSheet {
  assets: BalanceSheetSection
  liabilities: BalanceSheetSection
  equity: BalanceSheetSection
  totalAssets: number
  totalLiabilitiesAndEquity: number
  // Equity is adjusted by the period's net income (income − expenses) so the
  // sheet balances even before income is formally closed to equity.
  netIncome: number
  balanced: boolean
}

export async function buildBalanceSheet(opts?: {
  asOf?: Date
}): Promise<BalanceSheet> {
  const asOf = opts?.asOf
  const accounts = await loadAccountsWithMovements(
    asOf ? { toDate: asOf } : undefined
  )

  const makeSection = (type: AccountType): BalanceSheetSection => {
    const rows = accounts
      .filter((a) => a.accountType === type)
      .map((a) => ({
        id: a.id,
        code: a.accountCode,
        name: a.accountName,
        balance: a.balance,
      }))
    const total = rows.reduce((s, r) => s + r.balance, 0)
    return { type, rows, total }
  }

  const assets = makeSection("ASSET")
  const liabilities = makeSection("LIABILITY")
  const equity = makeSection("EQUITY")

  const income = accounts
    .filter((a) => a.accountType === "INCOME")
    .reduce((s, a) => s + a.balance, 0)
  const expenses = accounts
    .filter((a) => a.accountType === "EXPENSE")
    .reduce((s, a) => s + a.balance, 0)
  const netIncome = income - expenses

  const totalAssets = assets.total
  // Retained earnings = net income added to equity for the sheet to balance.
  const totalLiabilitiesAndEquity =
    liabilities.total + equity.total + netIncome

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilitiesAndEquity,
    netIncome,
    balanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01,
  }
}

// ---------------------------------------------------------------------------
// Profit & Loss
// ---------------------------------------------------------------------------
export interface ProfitLossSection {
  type: AccountType
  rows: {
    id: string
    code: string
    name: string
    opening: number
    period: number
    closing: number
  }[]
  totalOpening: number
  totalPeriod: number
  totalClosing: number
}

export interface ProfitLoss {
  income: ProfitLossSection
  expenses: ProfitLossSection
  totalIncome: number
  totalExpenses: number
  netProfit: number
  openingNetProfit: number
}

export async function buildProfitLoss(opts: {
  fromDate: Date
  toDate: Date
}): Promise<ProfitLoss> {
  const accounts = await loadPeriodMovements(opts)

  const makeSection = (type: AccountType): ProfitLossSection => {
    const rows = accounts
      .filter((a) => a.accountType === type)
      .map((a) => ({
        id: a.id,
        code: a.accountCode,
        name: a.accountName,
        opening: a.opening,
        period: a.period,
        closing: a.closing,
      }))
    return {
      type,
      rows,
      totalOpening: rows.reduce((s, r) => s + r.opening, 0),
      totalPeriod: rows.reduce((s, r) => s + r.period, 0),
      totalClosing: rows.reduce((s, r) => s + r.closing, 0),
    }
  }

  const income = makeSection("INCOME")
  const expenses = makeSection("EXPENSE")

  return {
    income,
    expenses,
    totalIncome: income.totalPeriod,
    totalExpenses: expenses.totalPeriod,
    netProfit: income.totalPeriod - expenses.totalPeriod,
    openingNetProfit: income.totalOpening - expenses.totalOpening,
  }
}
