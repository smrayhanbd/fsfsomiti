/**
 * Shared types + helpers for the member-portal savings feature pages
 * (/portal/savings, /portal/ledger, /portal/receipts).
 *
 * These used to live in MySavingsClient.tsx when everything was bundled
 * into one tabbed page. Now that ledger + receipts are standalone routes,
 * they live here so all three pages render identically.
 */

export interface MemberSummary {
  id: string
  memberNo: string
  fullName: string
  phone: string
  email: string | null
  membershipDate: string
  address: string | null
  currentBalance: number
  totalDeposit: number
  totalWithdrawal: number
  earliestDate: string
}

export interface SavingsRow {
  id: string
  amount: number
  type: string
  method: string | null
  date: string
  receiptNo: string | null
  transactionMirror: {
    id: string
    voucherNo: string
    status: string
    transactionType: string
    paymentMethod: string | null
    referenceNo: string | null
    remarks: string | null
    chargeTypeName: string | null
    // Prisma's `Json?` field comes through as a wide union after `plain()`.
    // We only ever read `collectionTypeName` out of it (after a runtime cast),
    // so `unknown` is the honest type here.
    breakdown: unknown
    transactionDate: string
    approvedAt: string | null
  } | null
}

export interface WithdrawalRequest {
  id: string
  amount: number | null
  createdAt: string
  method: string | null
  notes: string | null
  status: string
}

export const SAVINGS_TYPE_STYLES: Record<string, string> = {
  WITHDRAWAL: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400",
  FINE: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400",
  LOAN_PAYMENT: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400",
}

/**
 * Helper — is this row eligible for a money-receipt download?
 *
 * Mirrors the gate in /api/portal/transactions/[id]/receipt: the linked GL
 * Transaction must be APPROVED and of type DEPOSIT or WITHDRAWAL. Anything
 * else (charges, fines that never went through the GL, pending requests, etc.)
 * is shown without a download button.
 */
export function isReceiptEligible(row: SavingsRow): boolean {
  const mirror = row.transactionMirror
  if (!mirror) return false
  if (mirror.status !== "APPROVED") return false
  return (
    mirror.transactionType === "DEPOSIT" ||
    mirror.transactionType === "WITHDRAWAL"
  )
}

/**
 * Resolve the human-readable "Type" label for a row.
 *
 * The savings row's `type` field is hard-coded per TransactionType by
 * savingsTypeFor() (DEPOSIT → "MONTHLY"), so it doesn't reflect what the user
 * actually picked as the deposit type. The real name lives on the linked
 * Transaction — either inside the JSON `breakdown` (deposits: {
 * collectionTypeName }) or as the flat `chargeTypeName` column. Falls back to
 * the raw savings.type when neither is present.
 */
export function typeLabelFor(row: SavingsRow): string {
  const mirror = row.transactionMirror
  if (!mirror) return row.type.replace("_", " ")
  const breakdown = mirror.breakdown as { collectionTypeName?: string } | null
  return (
    breakdown?.collectionTypeName?.trim() ||
    mirror.chargeTypeName?.trim() ||
    row.type.replace("_", " ")
  )
}
