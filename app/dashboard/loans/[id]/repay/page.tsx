import prisma from "@/lib/prisma"
import { notFound } from "next/navigation"
import RepaymentForm, { type RepaymentLoanData } from "./RepaymentForm"

export const dynamic = 'force-dynamic'

export default async function RepayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const loan = await prisma.loan.findUnique({
    where: { id },
    include: { member: true, schedule: { orderBy: { installmentNo: "asc" } } },
  })
  if (!loan) notFound()

  // Find the next unpaid installment to prefill suggestions.
  const nextUnpaid = loan.schedule.find((s) => s.status !== "PAID" && s.status !== "WAIVED")

  const data: RepaymentLoanData = {
    id: loan.id,
    loanNo: loan.loanNo,
    memberName: loan.member.fullName,
    memberNo: loan.member.memberNo,
    outstanding: Number(loan.outstandingBalance),
    nextDueAmount: nextUnpaid ? Number(nextUnpaid.installmentAmount) - Number(nextUnpaid.paidAmount) : 0,
    nextDueDate: (nextUnpaid?.dueDate ?? loan.nextDueDate)?.toISOString() ?? null,
    installmentAmount: nextUnpaid ? Number(nextUnpaid.installmentAmount) : Number(loan.installmentAmount),
  }

  return <RepaymentForm loan={data} />
}
