import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/permissions"
import TransactionsClient from "./TransactionsClient"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function TransactionsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")

  const [transactions, members] = await Promise.all([
    prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        member: { select: { id: true, memberNo: true, fullName: true } },
        cashAccount: { select: { id: true, accountName: true, accountCode: true } },
      },
    }),
    prisma.member.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, memberNo: true, fullName: true },
      orderBy: { memberNo: "asc" },
    }),
  ])

  const rows = transactions.map((t) => ({
    id: t.id,
    voucherNo: t.voucherNo,
    transactionType: t.transactionType,
    subType: t.subType,
    chargeTypeName: t.chargeTypeName,
    status: t.status,
    amount: Number(t.amount),
    paymentMethod: t.paymentMethod,
    referenceNo: t.referenceNo,
    createdAt: t.createdAt.toISOString(),
    approvedAt: t.approvedAt?.toISOString() ?? null,
    member: t.member
      ? { id: t.member.id, memberNo: t.member.memberNo, fullName: t.member.fullName }
      : null,
    cashAccountName: t.cashAccount?.accountName ?? null,
    createdBy: t.createdBy,
  }))

  return (
    <TransactionsClient
      rows={rows}
      members={members.map((m) => ({ id: m.id, memberNo: m.memberNo, fullName: m.fullName }))}
    />
  )
}
