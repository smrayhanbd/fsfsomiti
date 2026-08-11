import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import RequestsClient from "./RequestsClient"
import { Inbox } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function MyRequestsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") redirect("/")

  const memberId = session.user.id
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } })
  if (!member) redirect("/")

  // Pull all request types in parallel, newest first. Deposit requests are
  // stored on the same MemberRequest table with type='DEPOSIT' — they carry
  // the slip attachment + review metadata captured by the new fields added
  // to the MemberRequest schema (attachments, referenceNo, transactionDate,
  // rejectionReason, reviewedBy, reviewedAt). We also include the linked
  // Transaction so the page can show the returnReason + engine status.
  const [withdrawals, closings, profiles, deposits] = await Promise.all([
    prisma.memberRequest.findMany({
      where: { memberId, type: "WITHDRAWAL" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.memberRequest.findMany({
      where: { memberId, type: "CLOSING" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.profileUpdateRequest.findMany({
      where: { memberId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.memberRequest.findMany({
      where: { memberId, type: "DEPOSIT" },
      orderBy: { createdAt: "desc" },
      include: {
        transactions: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            voucherNo: true,
            returnReason: true,
            rejectionReason: true,
          },
        },
      },
    }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <Inbox className="h-7 w-7 text-indigo-500" /> My Requests
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Track the status of every request you&apos;ve submitted to management.
        </p>
      </div>

      <RequestsClient
        withdrawals={withdrawals.map((r) => ({
          id: r.id,
          type: "WITHDRAWAL",
          amount: Number(r.amount),
          method: r.method,
          notes: r.notes,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        }))}
        closings={closings.map((r) => ({
          id: r.id,
          type: "CLOSING",
          reason: r.reason,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        }))}
        profiles={profiles.map((r) => ({
          id: r.id,
          payload: (r.payload || {}) as Record<string, string>,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        }))}
        deposits={deposits.map((r) => {
          const linked = r.transactions[0]
          const effectiveStatus = linked?.status ?? r.status
          return {
            id: r.id,
            type: "DEPOSIT",
            amount: r.amount ? Number(r.amount) : null,
            method: r.method,
            notes: r.notes,
            status: effectiveStatus,
            collectionTypeId:
              ((r.breakdown as { collectionTypeId?: string } | null)?.collectionTypeId as
                | string
                | null) ?? null,
            referenceNo: r.referenceNo,
            transactionDate: r.transactionDate ? r.transactionDate.toISOString() : null,
            rejectionReason: linked?.rejectionReason ?? r.rejectionReason ?? null,
            returnReason: linked?.returnReason ?? null,
            voucherNo: linked?.voucherNo ?? null,
            reviewedBy: r.reviewedBy,
            reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
            createdAt: r.createdAt.toISOString(),
            attachments: (r.attachments as { type: string; name: string; url: string }[]) ?? [],
          }
        })}
      />
    </div>
  )
}
