// Stable account codes the Investment & Project posting services resolve
// against the Chart of Accounts. The seed (prisma/seed.js) guarantees these
// exist; the posting helpers fail loudly if any are missing rather than
// posting to the wrong account.
//
// Mirrors the SYSTEM_ACCOUNT_CODES convention in lib/transactions/rules.ts.

// ── Investment asset accounts (one per asset class) ────────────────────
export const INVESTMENT_ASSET_CODES = {
  SHARES: "INVESTMENT-SHARES",
  FDR: "INVESTMENT-FDR",
  LAND: "INVESTMENT-LAND",
  PROPERTY: "INVESTMENT-PROPERTY",
  BUSINESS: "INVESTMENT-BUSINESS",
  LOANS: "INVESTMENT-LOANS",
  OTHER: "INVESTMENT-OTHER",
} as const

// ── Cash / bank settlement account ─────────────────────────────────────
export const CASH_IN_HAND = "CASH-IN-HAND"

// ── Income accounts (one per income class) ─────────────────────────────
export const INVESTMENT_INCOME_CODES = {
  DIVIDEND: "INCOME-DIVIDEND",
  INTEREST: "INCOME-INTEREST",
  RENTAL: "INCOME-RENTAL",
  CAPITAL_GAIN: "INCOME-CAPITAL-GAIN",
  PROFIT_SHARE: "INCOME-PROFIT-SHARE",
} as const

// ── Expense accounts ───────────────────────────────────────────────────
export const INVESTMENT_EXPENSE_CODES = {
  BROKERAGE: "EXPENSE-BROKERAGE",
  REGISTRATION: "EXPENSE-REGISTRATION",
  CAPITAL_LOSS: "EXPENSE-CAPITAL-LOSS",
  WRITE_OFF: "EXPENSE-INVESTMENT-WRITEOFF",
} as const

// ── Tax accounts ───────────────────────────────────────────────────────
// NOTE on TDS direction:
//   • Investment income — tax is deducted at source BY the payer and already
//     deposited to NBR on our behalf. We hold a claim against future tax, so
//     it is an ASSET → TDS_RECEIVABLE (debit nature).
//   • Project revenue   — tax/VAT is collected FROM customers and owed back
//     to NBR, so it is a LIABILITY → TDS_PAYABLE (credit nature).
export const TAX_CODES = {
  TDS_RECEIVABLE: "TDS-RECEIVABLE",
  TDS_PAYABLE: "TDS-PAYABLE",
  CGT_PAYABLE: "CGT-PAYABLE",
} as const

// ── Project accounts ───────────────────────────────────────────────────
export const PROJECT_CODES = {
  REVENUE: "INCOME-PROJECT-REVENUE",
  EXPENSE: "EXPENSE-PROJECT",
  WIP: "PROJECT-WIP",
} as const

import type { Prisma } from "@prisma/client"

/**
 * Resolve a single account id by its stable `accountCode`. Throws if missing
 * so a half-configured chart of accounts never silently posts to the wrong
 * place. Identical contract to lib/transactions/rules.ts:resolveAccountId.
 */
export async function resolveAccountId(
  tx: Prisma.TransactionClient,
  code: string
): Promise<string> {
  const acc = await tx.account.findUnique({
    where: { accountCode: code },
    select: { id: true, accountName: true, status: true, allowPosting: true },
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

/** Map an investment type slug → its asset account code. */
export function assetCodeForTypeSlug(slug: string): string {
  switch (slug) {
    case "stock-shares":
    case "mutual-fund-bond":
      return INVESTMENT_ASSET_CODES.SHARES
    case "fixed-deposit":
      return INVESTMENT_ASSET_CODES.FDR
    case "land":
      return INVESTMENT_ASSET_CODES.LAND
    case "building-property":
      return INVESTMENT_ASSET_CODES.PROPERTY
    case "business-equity":
      return INVESTMENT_ASSET_CODES.BUSINESS
    case "loan-external":
      return INVESTMENT_ASSET_CODES.LOANS
    default:
      return INVESTMENT_ASSET_CODES.OTHER
  }
}

/** Income account code for a given income type. */
export function incomeCodeForType(type: string): string {
  switch (type) {
    case "DIVIDEND":
      return INVESTMENT_INCOME_CODES.DIVIDEND
    case "INTEREST":
      return INVESTMENT_INCOME_CODES.INTEREST
    case "RENTAL":
      return INVESTMENT_INCOME_CODES.RENTAL
    case "PROFIT_SHARE":
      return INVESTMENT_INCOME_CODES.PROFIT_SHARE
    default:
      return INVESTMENT_INCOME_CODES.INTEREST
  }
}
