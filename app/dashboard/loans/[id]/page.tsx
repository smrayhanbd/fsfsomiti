import prisma from "@/lib/prisma"
import { notFound } from "next/navigation"
import LoanDetailClient, { type LoanDetailData } from "./LoanDetailClient"
import LinkedTasksPanel from "@/components/tasks/LinkedTasksPanel"
import { listTasks } from "@/app/actions/tasks"

export const dynamic = 'force-dynamic'

export default async function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const loan = await prisma.loan.findUnique({
    where: { id },
    include: {
      member: true,
      product: true,
      schedule: { orderBy: { installmentNo: "asc" } },
      repayments: { orderBy: { paymentDate: "desc" } },
      guarantors: true,
    },
  })

  if (!loan) notFound()

  // Tasks linked to this loan (bi-directional integration).
  const linkedTasks = await listTasks({ loanId: id, limit: 10 })

  const data: LoanDetailData = {
    id: loan.id,
    loanNo: loan.loanNo,
    status: loan.status,
    member: {
      id: loan.member.id,
      fullName: loan.member.fullName,
      memberNo: loan.member.memberNo,
      phone: loan.member.phone,
    },
    product: {
      id: loan.product.id,
      name: loan.product.name,
      allowInterestWaiver: loan.product.allowInterestWaiver,
    },
    principal: Number(loan.principal),
    interestRate: Number(loan.interestRate),
    interestType: loan.interestType,
    repaymentFreq: loan.repaymentFreq,
    numberOfInstallments: loan.numberOfInstallments,
    totalInterest: Number(loan.totalInterest),
    totalPayable: Number(loan.totalPayable),
    installmentAmount: Number(loan.installmentAmount),
    outstandingBalance: Number(loan.outstandingBalance),
    principalPaid: Number(loan.principalPaid),
    interestPaid: Number(loan.interestPaid),
    finePaid: Number(loan.finePaid),
    nextDueDate: loan.nextDueDate?.toISOString() ?? null,
    applicationDate: loan.applicationDate.toISOString(),
    approvedDate: loan.approvedDate?.toISOString() ?? null,
    disbursedDate: loan.disbursedDate?.toISOString() ?? null,
    expectedCloseDate: loan.expectedCloseDate?.toISOString() ?? null,
    closedDate: loan.closedDate?.toISOString() ?? null,
    disbursementMethod: loan.disbursementMethod,
    purpose: loan.purpose,
    notes: loan.notes,
    schedule: loan.schedule.map((s) => ({
      id: s.id,
      installmentNo: s.installmentNo,
      dueDate: s.dueDate.toISOString(),
      principal: Number(s.principal),
      interest: Number(s.interest),
      installmentAmount: Number(s.installmentAmount),
      balanceAfter: Number(s.balanceAfter),
      status: s.status,
      paidDate: s.paidDate?.toISOString() ?? null,
      paidAmount: Number(s.paidAmount),
      fine: Number(s.fine),
    })),
    repayments: loan.repayments.map((r) => ({
      id: r.id,
      receiptNo: r.receiptNo,
      paymentDate: r.paymentDate.toISOString(),
      principal: Number(r.principal),
      interest: Number(r.interest),
      fine: Number(r.fine),
      totalAmount: Number(r.totalAmount),
      method: r.method,
      referenceNo: r.referenceNo,
    })),
    guarantors: loan.guarantors.map((g) => ({
      id: g.id,
      name: g.name,
      relation: g.relation,
      phone: g.phone,
      nidNumber: g.nidNumber,
      address: g.address,
    })),
  }

  return (
    <div className="space-y-4">
      <LoanDetailClient loan={data} />
      <LinkedTasksPanel
        tasks={linkedTasks}
        createHref={`/dashboard/tasks/new?link=loanId&id=${loan.id}&label=${encodeURIComponent(loan.loanNo)}`}
        title={`Tasks for Loan ${loan.loanNo}`}
      />
    </div>
  )
}
