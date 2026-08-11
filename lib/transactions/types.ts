// Client-safe transaction type mirrors (avoid bundling the Prisma client).
// Mirrors lib/accounting.ts conventions.

export type TransactionType = "DEPOSIT" | "WITHDRAWAL" | "CHARGE" | "INCOME_DISTRIBUTION"
export type TransactionCategory = "MEMBER" | "FUTURE"
export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CHEQUE" | "BKASH" | "NAGAD" | "ROCKET"
export type TransactionStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "RETURNED"
  | "REJECTED"
  | "REVERSED"
export type ApprovalLevel = "L1" | "L2" | "L3"

export type TransactionSubType =
  | "SAVINGS_DEPOSIT"
  | "ADVANCE"
  | "DUE_PAYMENT"
  | "SERVICE_CHARGE"
  | "BANK_CHARGE"
  | "ANNUAL_FEE"
  | "ADMIN_CHARGE"
  | "FINE_PENALTY"
  | "OTHER_CHARGE"
  | "CUSTOM_CHARGE"
  | "PROJECT_PROFIT"
  | "BANK_INTEREST"
  | "INVESTMENT_INCOME"
  | "DIVIDEND"
  | "OTHER_INCOME"
  // Phase 2 stubs — not yet wired in the rules engine.
  | "LOAN_DISBURSEMENT"
  | "LOAN_INSTALLMENT"
  | "ADMISSION_FEE"
  | "MEMBERSHIP_FEE"
  | "SHARE_PURCHASE"
  | "SHARE_REFUND"

// Display metadata ---------------------------------------------------------

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  CHARGE: "Charge",
  INCOME_DISTRIBUTION: "Income Distribution",
}

export const SUBTYPE_LABELS: Record<TransactionSubType, string> = {
  SAVINGS_DEPOSIT: "Savings Deposit",
  ADVANCE: "Advance Deposit",
  DUE_PAYMENT: "Due Payment",
  SERVICE_CHARGE: "Service Charge",
  BANK_CHARGE: "Bank Charge",
  ANNUAL_FEE: "Annual Membership Fee",
  ADMIN_CHARGE: "Administrative Charge",
  FINE_PENALTY: "Fine / Penalty",
  OTHER_CHARGE: "Other Charge",
  CUSTOM_CHARGE: "Custom Charge",
  PROJECT_PROFIT: "Project Profit",
  BANK_INTEREST: "Bank Interest",
  INVESTMENT_INCOME: "Investment Income",
  DIVIDEND: "Dividend",
  OTHER_INCOME: "Other Income",
  LOAN_DISBURSEMENT: "Loan Disbursement",
  LOAN_INSTALLMENT: "Loan Installment",
  ADMISSION_FEE: "Admission Fee",
  MEMBERSHIP_FEE: "Membership Fee",
  SHARE_PURCHASE: "Share Purchase",
  SHARE_REFUND: "Share Refund",
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket",
}

export const STATUS_META: Record<
  TransactionStatus,
  { label: string; badge: string; dot: string }
> = {
  DRAFT: {
    label: "Draft",
    badge:
      "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700",
    dot: "bg-slate-400",
  },
  PENDING_APPROVAL: {
    label: "Pending Approval",
    badge:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50",
    dot: "bg-amber-500",
  },
  APPROVED: {
    label: "Approved",
    badge:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50",
    dot: "bg-emerald-500",
  },
  RETURNED: {
    label: "Returned",
    badge:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/50",
    dot: "bg-blue-500",
  },
  REJECTED: {
    label: "Rejected",
    badge:
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/50",
    dot: "bg-rose-500",
  },
  REVERSED: {
    label: "Reversed",
    badge:
      "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-900/50",
    dot: "bg-purple-500",
  },
}

// Which sub-types apply to which top-level type, for form dropdowns.
export const SUBTYPES_BY_TYPE: Record<TransactionType, TransactionSubType[]> = {
  DEPOSIT: ["SAVINGS_DEPOSIT", "ADVANCE", "DUE_PAYMENT"],
  WITHDRAWAL: ["SAVINGS_DEPOSIT"], // generic withdrawal against savings
  CHARGE: [
    "SERVICE_CHARGE",
    "BANK_CHARGE",
    "ANNUAL_FEE",
    "ADMIN_CHARGE",
    "FINE_PENALTY",
    "OTHER_CHARGE",
    "CUSTOM_CHARGE",
  ],
  INCOME_DISTRIBUTION: [
    "PROJECT_PROFIT",
    "BANK_INTEREST",
    "INVESTMENT_INCOME",
    "DIVIDEND",
    "OTHER_INCOME",
  ],
}

// Attachment descriptor stored in Transaction.attachments (JSON).
export interface TransactionAttachment {
  type: string // e.g. "Deposit Slip", "Cheque Image"
  name: string
  url: string
}

// Collection breakdown kept on Transaction.breakdown (JSON) — preserves the
// deposit/principal/interest/fine/other/discount detail the old collection
// form used to discard.
export interface TransactionBreakdown {
  deposit?: number
  principal?: number
  interest?: number
  fine?: number
  other?: number
  discount?: number
}

// Member-wise split for income distribution.
export interface DistributionShare {
  memberId: string
  memberName: string
  weight: number // e.g. investment share or avg-daily-balance weight
  amount: number
}
