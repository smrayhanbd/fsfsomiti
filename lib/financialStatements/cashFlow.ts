// Cash Flow Statement engine (Roadmap item 27).
//
// Reads every JournalLine posted in the [startDate, endDate] window and
// groups the underlying accounts into the three standard cash-flow
// categories (operating / investing / financing) by Account.accountType.
//
// Cash/bank accounts are intentionally skipped — they're the reconciling
// item that nets the whole statement to zero. (A real cash flow statement
// derives its "net change in cash" by summing just the cash/bank accounts;
// we surface the same number at the bottom.)

import prisma from "@/lib/prisma"
import type { AccountType } from "@/lib/accounting"

export interface CashFlowLine {
  accountId: string
  accountCode: string
  accountName: string
  accountType: AccountType
  /** Signed net movement for this account in the period (debit − credit per nature). */
  amount: number
}

export interface CashFlowSection {
  inflows: number
  outflows: number
  net: number
  lines: CashFlowLine[]
}

export interface CashFlowStatement {
  operating: CashFlowSection
  investing: CashFlowSection
  financing: CashFlowSection
  /** Sum of operating + investing + financing nets — equals the period's net
   * change in cash (modulo opening/closing adjustments). */
  netChange: number
}

/**
 * Build a Cash Flow Statement covering [startDate, endDate].
 *
 * Account-type mapping (IAS 7-style):
 *   - INCOME + EXPENSE          → operating
 *   - ASSET (non-cash/bank)     → investing
 *   - LIABILITY + EQUITY        → financing
 *
 * Cash / bank accounts (Account.isBank || Account.isCash) are skipped because
 * they are the reconciling item; their period movement is the netChange.
 */
export async function generateCashFlowStatement(
  startDate: Date,
  endDate: Date
): Promise<CashFlowStatement> {
  const end = new Date(endDate)
  end.setHours(23, 59, 59, 999)

  // Fetch every active account with its period journal lines. We use the
  // same loadAccountsWithMovements pattern as the other financial statements.
  const accounts = await prisma.account.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      accountCode: true,
      accountName: true,
      accountType: true,
      nature: true,
      isBank: true,
      isCash: true,
      journalLines: {
        where: {
          journalEntry: {
            status: "POSTED",
            entryDate: { gte: startDate, lte: end },
          },
        },
        select: { debit: true, credit: true },
      },
    },
    orderBy: [{ accountType: "asc" }, { accountCode: "asc" }],
  })

  const operating: CashFlowLine[] = []
  const investing: CashFlowLine[] = []
  const financing: CashFlowLine[] = []

  for (const a of accounts) {
    // Skip cash / bank — they're the reconciling item.
    if (a.isBank || a.isCash) continue

    let debit = 0
    let credit = 0
    for (const l of a.journalLines) {
      debit += Number(l.debit ?? 0)
      credit += Number(l.credit ?? 0)
    }
    if (debit === 0 && credit === 0) continue

    // Natural balance for the period: debit-natured accounts get debit −
    // credit, credit-natured accounts get credit − debit. This matches the
    // convention used in lib/financialStatements.ts.
    const amount = a.nature === "DEBIT" ? debit - credit : credit - debit

    const line: CashFlowLine = {
      accountId: a.id,
      accountCode: a.accountCode,
      accountName: a.accountName,
      accountType: a.accountType as AccountType,
      amount,
    }

    const type = a.accountType as AccountType
    if (type === "INCOME" || type === "EXPENSE") {
      operating.push(line)
    } else if (type === "ASSET") {
      investing.push(line)
    } else if (type === "LIABILITY" || type === "EQUITY") {
      financing.push(line)
    }
  }

  const op = summarise(operating)
  const inv = summarise(investing)
  const fin = summarise(financing)

  return {
    operating: op,
    investing: inv,
    financing: fin,
    netChange: op.net + inv.net + fin.net,
  }
}

/** Helper: build the per-section totals from the lines. */
function summarise(lines: CashFlowLine[]): CashFlowSection {
  let inflows = 0
  let outflows = 0
  for (const l of lines) {
    if (l.amount > 0) inflows += l.amount
    else outflows += Math.abs(l.amount)
  }
  return {
    inflows,
    outflows,
    net: inflows - outflows,
    lines,
  }
}
