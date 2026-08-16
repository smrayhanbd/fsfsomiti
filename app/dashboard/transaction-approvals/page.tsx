import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import ApprovalsClient from "./ApprovalsClient"
import { guardDashboardPage } from "@/lib/page-guard"

export const dynamic = "force-dynamic"

export default async function TransactionApprovalsPage() {
  // Page-level permission guard — redirects to /dashboard/unauthorized
  // if the user doesn't have access to this page.
  await guardDashboardPage("Transactions", "Admin Submitted")


  const user = await getCurrentUser()
  if (!user) redirect("/")

  const [pendingTxns, memberRequests] = await Promise.all([
    prisma.transaction.findMany({
      where: { status: "PENDING_APPROVAL" },
      orderBy: { submittedAt: "asc" },
      include: {
        member: { select: { id: true, memberNo: true, fullName: true } },
        cashAccount: { select: { id: true, accountName: true } },
      },
    }),
    prisma.memberRequest.findMany({
      // DEPOSIT requests surface as Transactions (in the "Admin Submitted"
      // tab above) — they're NOT duplicated in the "Member Requests" tab to
      // avoid double-handling. WITHDRAWAL / CLOSING still go through the
      // legacy MemberRequest-only flow shown here.
      where: { status: "PENDING", type: { in: ["WITHDRAWAL", "CLOSING"] } },
      orderBy: { createdAt: "desc" },
      include: { member: { select: { id: true, memberNo: true, fullName: true, phone: true } } },
    }),
  ])

  return (
    <ApprovalsClient
      pendingTxns={pendingTxns.map((t) => ({
        id: t.id,
        voucherNo: t.voucherNo,
        transactionType: t.transactionType,
        subType: t.subType,
        chargeTypeName: t.chargeTypeName,
        amount: Number(t.amount),
        approvalLevel: t.approvalLevel,
        submittedBy: t.submittedBy,
        submittedAt: t.submittedAt?.toISOString() ?? t.createdAt.toISOString(),
        createdBy: t.createdBy,
        createdById: t.createdById,
        paymentMethod: t.paymentMethod,
        memberSubmitted: t.memberSubmitted,
        attachments: (t.attachments as { type: string; name: string; url: string }[]) ?? [],
        member: t.member
          ? { id: t.member.id, memberNo: t.member.memberNo, fullName: t.member.fullName }
          : null,
        cashAccountName: t.cashAccount?.accountName ?? null,
      }))}
      memberRequests={memberRequests.map((r) => ({
        id: r.id,
        type: r.type,
        amount: r.amount ? Number(r.amount) : null,
        method: r.method,
        reason: r.reason,
        notes: r.notes,
        createdAt: r.createdAt.toISOString(),
        member: {
          id: r.member.id,
          memberNo: r.member.memberNo,
          fullName: r.member.fullName,
          phone: r.member.phone,
        },
      }))}
      currentUserId={user.id}
    />
  )
}
