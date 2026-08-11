import type { OrgInfo } from "@/lib/organization"
import type { PaymentMethod } from "@/lib/transactions/types"

/**
 * Serializable payload describing a single money receipt / withdrawal voucher,
 * consumed by the server-side PDF drawer (`moneyReceiptPdf.ts`).
 *
 * Mirrors the on-screen `MoneyReceipt` component's props but is plain data (no
 * React, no Decimal, no Date instances) so it can be built once and passed
 * straight to pdfkit. Built by `buildReceiptPayload.ts` from the DB.
 *
 * Note: there is intentionally NO accounting debit/credit table here — the
 * money receipt no longer shows the GL Dr/Cr breakdown (per the new spec), so
 * the PDF matches the on-screen voucher.
 */
export interface ReceiptBankAccountDto {
  id: string
  accountName: string
  bankName: string | null
  accountNumber: string | null
  branch: string | null
  paymentMethod: PaymentMethod
  isDefault: boolean
}

export interface ReceiptPayload {
  org: OrgInfo
  txn: {
    id: string
    voucherNo: string
    transactionType: "DEPOSIT" | "WITHDRAWAL"
    amount: number
    paymentMethod: PaymentMethod | null
    referenceNo: string | null
    remarks: string | null
    /** collectionTypeName if present (purpose), else null */
    purpose: string
    transactionDate: string // ISO
    approvedAt: string | null // ISO
    approvedBy: string | null
    /** GL voucher type — drives the "Collection Method" vs "Payment Method" label */
    voucherType: "RECEIPT" | "PAYMENT" | "JOURNAL" | "CONTRA"
    /**
     * The member's total savings balance AFTER this transaction was posted.
     *
     * Computed by `buildReceiptPayload.ts` as:
     *   openingBalanceAtTxn ± txn.amount
     * where openingBalanceAtTxn = sum of all the member's savings rows dated
     * strictly before this transaction's posting date.
     *
     * Shown on the receipt as "Total Balance" so the member can see their
     * accumulated savings right on the voucher. `null` when the transaction
     * has no linked member (shouldn't happen for a member receipt, but the
     * type allows it for safety).
     */
    balanceAfterTxn: number | null
  }
  member: {
    memberNo: string
    fullName: string
    phone: string | null
  } | null
  cashAccount: {
    accountName: string
    accountCode: string
  } | null
  bankAccounts: ReceiptBankAccountDto[]
}
