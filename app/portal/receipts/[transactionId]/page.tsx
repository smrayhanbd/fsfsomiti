import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { notFound, redirect } from "next/navigation"
import { getOrganization } from "@/lib/organization"
import MoneyReceipt from "@/app/dashboard/receipts/[transactionId]/MoneyReceipt"
import type { PaymentMethod } from "@/lib/transactions/types"

export const dynamic = "force-dynamic"

/**
 * Member-portal printable Money Receipt.
 *
 * Renders the EXACT SAME `MoneyReceipt` component the admin panel uses at
 * `/dashboard/receipts/[transactionId]` — so the voucher a member sees (and
 * prints / saves as PDF via the browser's print dialog) is pixel-identical to
 * what an admin sees.
 *
 * Auth: the session user MUST be a MEMBER, and the transaction's `memberId`
 * MUST match `session.user.id`. Any mismatch returns 404 (never leak existence
 * to non-owners).
 *
 * Only APPROVED DEPOSIT / WITHDRAWAL transactions have a posted voucher to
 * render; anything else 404s.
 */
export default async function PortalReceiptPage({
  params,
}: {
  params: Promise<{ transactionId: string }>
}) {
  const { transactionId } = await params

  // 1. Auth — members only.
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") {
    redirect("/")
  }
  const memberId = session.user.id

  // 2. Load the transaction + everything the MoneyReceipt component needs.
  const [txn, org, bankAccounts] = await Promise.all([
    prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        member: {
          select: {
            id: true,
            memberNo: true,
            fullName: true,
            phone: true,
            photoUrl: true,
            gender: true,
          },
        },
        cashAccount: { select: { id: true, accountName: true, accountCode: true } },
        journalEntry: {
          include: {
            lines: {
              include: { account: { select: { accountName: true, accountCode: true } } },
            },
          },
        },
      },
    }),
    getOrganization(),
    prisma.bankAccount.findMany({
      // Per org policy: exclude CASH from the "For Future Deposits" reference.
      where: {
        isActive: true,
        paymentMethod: { not: "CASH" },
      },
      include: { coaAccount: { select: { accountName: true, accountCode: true } } },
      orderBy: [
        { paymentMethod: "asc" },
        { isDefault: "desc" },
        { accountName: "asc" },
      ],
    }),
  ])

  if (!txn) notFound()

  // Ownership check — never leak existence to non-owners.
  if (txn.memberId !== memberId) {
    notFound()
  }

  // Only approved deposits & withdrawals have a posted voucher.
  if (
    txn.status !== "APPROVED" ||
    (txn.transactionType !== "DEPOSIT" && txn.transactionType !== "WITHDRAWAL")
  ) {
    notFound()
  }

  // 3. Compute the member's total savings balance AFTER this transaction.
  // Mirrors the logic in `buildReceiptPayload.ts`: fetch ALL the member's
  // savings rows ordered oldest-first, find this transaction's mirror row by
  // `savingsMirrorId`, and sum up to and including it.
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
      if (txn.savingsMirrorId && s.id === txn.savingsMirrorId) break
    }
    balanceAfterTxn = sum
  }

  return (
    <MoneyReceipt
      txn={{
        id: txn.id,
        voucherNo: txn.voucherNo,
        transactionType: txn.transactionType as "DEPOSIT" | "WITHDRAWAL",
        subType: txn.subType,
        amount: Number(txn.amount),
        paymentMethod: txn.paymentMethod as PaymentMethod | null,
        referenceNo: txn.referenceNo,
        remarks: txn.remarks,
        breakdown: (txn.breakdown as Record<string, string> | null) ?? null,
        transactionDate: txn.transactionDate.toISOString(),
        approvedAt: txn.approvedAt?.toISOString() ?? null,
        approvedBy: txn.approvedBy,
        balanceAfterTxn,
      }}
      member={
        txn.member
          ? {
              id: txn.member.id,
              memberNo: txn.member.memberNo,
              fullName: txn.member.fullName,
              phone: txn.member.phone,
              photoUrl: txn.member.photoUrl,
              gender: txn.member.gender,
            }
          : null
      }
      cashAccount={
        txn.cashAccount
          ? {
              id: txn.cashAccount.id,
              accountName: txn.cashAccount.accountName,
              accountCode: txn.cashAccount.accountCode,
            }
          : null
      }
      journalEntry={
        txn.journalEntry
          ? {
              voucherNo: txn.journalEntry.voucherNo,
              voucherType: txn.journalEntry.voucherType as
                | "RECEIPT"
                | "PAYMENT"
                | "JOURNAL"
                | "CONTRA",
              narration: txn.journalEntry.narration,
              totalDebit: Number(txn.journalEntry.totalDebit),
              totalCredit: Number(txn.journalEntry.totalCredit),
              lines: txn.journalEntry.lines.map((l) => ({
                id: l.id,
                accountCode: l.account.accountCode,
                accountName: l.account.accountName,
                debit: Number(l.debit),
                credit: Number(l.credit),
                memo: l.memo,
              })),
            }
          : null
      }
      org={org}
      bankAccounts={bankAccounts.map((b) => ({
        id: b.id,
        accountName: b.accountName,
        bankName: b.bankName,
        accountNumber: b.accountNumber,
        branch: b.branch,
        paymentMethod: b.paymentMethod as PaymentMethod,
        coaAccountName: b.coaAccount.accountName,
        isDefault: b.isDefault,
      }))}
    />
  )
}
