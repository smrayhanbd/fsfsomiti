import prisma from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { getCurrentUser, isSuperAdmin, hasPermission, PERMISSIONS } from "@/lib/permissions"
import TransactionDetailClient, { type TransactionDetailData } from "./TransactionDetailClient"

export const dynamic = "force-dynamic"

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect("/")

  const txn = await prisma.transaction.findUnique({
    where: { id },
    include: {
      member: { select: { id: true, memberNo: true, fullName: true, phone: true } },
      cashAccount: { select: { id: true, accountName: true, accountCode: true, currentBalance: true } },
      journalEntry: {
        include: {
          lines: {
            include: { account: { select: { accountName: true, accountCode: true } } },
          },
        },
      },
      memberRequest: { select: { id: true, type: true, reason: true, notes: true, referenceNo: true } },
      reversalOf: { select: { id: true, voucherNo: true } },
      reversedBy: { select: { id: true, voucherNo: true } },
    },
  })

  if (!txn) notFound()

  const canApprove =
    txn.status === "PENDING_APPROVAL" &&
    txn.createdById !== user.id &&
    (isSuperAdmin(user) || (await hasPermission(user.id, PERMISSIONS.TRANSACTION_APPROVE, user)))

  const canReverse =
    txn.status === "APPROVED" &&
    (isSuperAdmin(user) || (await hasPermission(user.id, PERMISSIONS.TRANSACTION_REVERSE, user)))

  const canSubmit =
    (txn.status === "DRAFT" || txn.status === "RETURNED") &&
    (isSuperAdmin(user) || (await hasPermission(user.id, PERMISSIONS.TRANSACTION_SUBMIT, user)))

  const data: TransactionDetailData = {
    id: txn.id,
    voucherNo: txn.voucherNo,
    transactionType: txn.transactionType,
    subType: txn.subType,
    chargeTypeName: txn.chargeTypeName,
    status: txn.status,
    approvalLevel: txn.approvalLevel,
    amount: Number(txn.amount),
    paymentMethod: txn.paymentMethod,
    referenceNo: txn.referenceNo,
    remarks: txn.remarks,
    breakdown: (txn.breakdown as Record<string, number> | null) ?? null,
    attachments: (txn.attachments as { type: string; name: string; url: string }[]) ?? [],
    createdAt: txn.createdAt.toISOString(),
    approvedAt: txn.approvedAt?.toISOString() ?? null,
    memberSubmitted: txn.memberSubmitted,
    memberRequest: txn.memberRequest
      ? {
          id: txn.memberRequest.id,
          type: txn.memberRequest.type,
          reason: txn.memberRequest.reason,
          notes: txn.memberRequest.notes,
          referenceNo: txn.memberRequest.referenceNo,
        }
      : null,
    member: txn.member
      ? {
          id: txn.member.id,
          memberNo: txn.member.memberNo,
          fullName: txn.member.fullName,
          phone: txn.member.phone,
        }
      : null,
    cashAccount: txn.cashAccount
      ? {
          id: txn.cashAccount.id,
          name: txn.cashAccount.accountName,
          code: txn.cashAccount.accountCode,
          balance: Number(txn.cashAccount.currentBalance),
        }
      : null,
    journalEntry: txn.journalEntry
      ? {
          id: txn.journalEntry.id,
          voucherNo: txn.journalEntry.voucherNo,
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
      : null,
    audit: {
      createdBy: txn.createdBy,
      createdAt: txn.createdAt.toISOString(),
      submittedBy: txn.submittedBy,
      submittedAt: txn.submittedAt?.toISOString() ?? null,
      approvedBy: txn.approvedBy,
      approvedAt: txn.approvedAt?.toISOString() ?? null,
      returnedBy: txn.returnedBy,
      returnedAt: txn.returnedAt?.toISOString() ?? null,
      returnReason: txn.returnReason,
      rejectedBy: txn.rejectedBy,
      rejectedAt: txn.rejectedAt?.toISOString() ?? null,
      rejectionReason: txn.rejectionReason,
      reversedByUser: txn.reversedByUser,
      reversedAt: txn.reversedAt?.toISOString() ?? null,
      reversalReason: txn.reversalReason,
    },
    reversalOf: txn.reversalOf ? { id: txn.reversalOf.id, voucherNo: txn.reversalOf.voucherNo } : null,
    reversedBy: txn.reversedBy ? { id: txn.reversedBy.id, voucherNo: txn.reversedBy.voucherNo } : null,
  }

  return (
    <TransactionDetailClient
      txn={data}
      canApprove={canApprove}
      canReverse={canReverse}
      canSubmit={canSubmit}
      isSuperAdmin={isSuperAdmin(user)}
    />
  )
}
