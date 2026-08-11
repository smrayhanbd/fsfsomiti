import prisma from "@/lib/prisma"
import { getOrganization } from "@/lib/organization"
import type { PaymentMethod } from "@/lib/transactions/types"
import type { ReceiptPayload } from "@/lib/pdf/receipt-payload"

/**
 * Build the serializable payload needed to render a money-receipt PDF for a
 * given transaction.
 *
 * Mirrors the data-loading in `app/dashboard/receipts/[transactionId]/page.tsx`
 * so the emailed PDF matches the on-screen voucher exactly. Only APPROVED
 * DEPOSIT / WITHDRAWAL transactions have a posted voucher — for anything else
 * we return `null`, which lets the caller (the approval email path) still send
 * the notification email without an attachment rather than failing the approval.
 *
 * Server-only: imports prisma.
 */
export async function buildReceiptPayload(
  transactionId: string
): Promise<ReceiptPayload | null> {
  const txn = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      member: {
        select: { memberNo: true, fullName: true, phone: true },
      },
      cashAccount: { select: { accountName: true, accountCode: true } },
      journalEntry: { select: { voucherType: true } },
    },
  })

  // No receipt for non-printable transaction states/types.
  if (
    !txn ||
    txn.status !== "APPROVED" ||
    (txn.transactionType !== "DEPOSIT" && txn.transactionType !== "WITHDRAWAL")
  ) {
    return null
  }

  const breakdown = (txn.breakdown as { collectionTypeName?: string } | null) ?? null
  const purpose =
    breakdown?.collectionTypeName ??
    (txn.transactionType === "DEPOSIT" ? "Savings Deposit" : "Withdrawal")

  // ── Compute the member's total savings balance AFTER this transaction.
  //
  // Each approved DEPOSIT/WITHDRAWAL Transaction creates a Savings mirror row
  // (linked via `savingsMirrorId`). The member's running balance at the moment
  // of THIS transaction = sum of all their savings rows up to and including
  // the mirror row, ordered oldest-first.
  //
  // IMPORTANT: we can NOT use `date: { lte: txn.transactionDate }` because the
  // transaction's `transactionDate` is the EFFECTIVE date (when the money
  // moved) while the savings mirror row's `date` is set to `now()` at posting
  // time. A back-dated transaction (e.g. money deposited Monday, entered
  // Wednesday) would have transactionDate < mirrorRow.date, so the date
  // comparison would EXCLUDE the mirror row and the balance would be wrong.
  //
  // Instead we fetch ALL the member's savings rows ordered by date+createdAt,
  // find the mirror row by its id, and sum up to and including it. This is
  // robust against timestamp mismatches.
  let balanceAfterTxn: number | null = null
  if (txn.memberId) {
    const memberSavings = await prisma.savings.findMany({
      where: { memberId: txn.memberId },
      select: { id: true, type: true, amount: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    })
    let sum = 0
    for (const s of memberSavings) {
      sum += s.type === "WITHDRAWAL" ? -Number(s.amount) : Number(s.amount)
      // Stop after including this transaction's mirror row — everything after
      // it belongs to later transactions and shouldn't be in the balance.
      if (txn.savingsMirrorId && s.id === txn.savingsMirrorId) break
    }
    balanceAfterTxn = sum
  }

  // Bank accounts shown on deposit receipts (the "for future deposits" block).
  //
  // Per the org's policy: members are encouraged to deposit directly to a
  // bank / mobile-wallet account — NOT to hand cash to a collector. So we
  // exclude `paymentMethod: "CASH"` (the Cash Drawer / Cash-in-Hand accounts)
  // from this reference list. Cash accounts are still valid targets for an
  // admin-entered cash deposit (the receipt renders fine without this block),
  // they're just not advertised to members as a "deposit here" option.
  const bankAccounts = await prisma.bankAccount.findMany({
    where: {
      isActive: true,
      paymentMethod: { not: "CASH" },
    },
    select: {
      id: true,
      accountName: true,
      bankName: true,
      accountNumber: true,
      branch: true,
      paymentMethod: true,
      isDefault: true,
    },
    orderBy: [{ paymentMethod: "asc" }, { isDefault: "desc" }, { accountName: "asc" }],
  })

  const org = await getOrganization()

  return {
    org,
    txn: {
      id: txn.id,
      voucherNo: txn.voucherNo,
      transactionType: txn.transactionType as "DEPOSIT" | "WITHDRAWAL",
      amount: Number(txn.amount),
      paymentMethod: txn.paymentMethod as PaymentMethod | null,
      referenceNo: txn.referenceNo,
      remarks: txn.remarks,
      purpose,
      transactionDate: txn.transactionDate.toISOString(),
      approvedAt: txn.approvedAt?.toISOString() ?? null,
      approvedBy: txn.approvedBy,
      voucherType: (txn.journalEntry?.voucherType ?? "JOURNAL") as
        | "RECEIPT"
        | "PAYMENT"
        | "JOURNAL"
        | "CONTRA",
      balanceAfterTxn,
    },
    member: txn.member
      ? {
          memberNo: txn.member.memberNo,
          fullName: txn.member.fullName,
          phone: txn.member.phone,
        }
      : null,
    cashAccount: txn.cashAccount
      ? {
          accountName: txn.cashAccount.accountName,
          accountCode: txn.cashAccount.accountCode,
        }
      : null,
    bankAccounts: bankAccounts.map((b) => ({
      id: b.id,
      accountName: b.accountName,
      bankName: b.bankName,
      accountNumber: b.accountNumber,
      branch: b.branch,
      paymentMethod: b.paymentMethod as PaymentMethod,
      isDefault: b.isDefault,
    })),
  }
}
