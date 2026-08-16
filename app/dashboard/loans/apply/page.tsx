import prisma from "@/lib/prisma"
import LoanApplicationForm from "./LoanApplicationForm"
import { guardDashboardPage } from "@/lib/page-guard"

export const dynamic = 'force-dynamic'

export default async function NewLoanPage() {
  // Page-level permission guard — redirects to /dashboard/unauthorized
  // if the user doesn't have access to this page.
  await guardDashboardPage("Finance & Accounting", "Loan Management")


  const [products, members] = await Promise.all([
    prisma.loanProduct.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.member.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, fullName: true, memberNo: true, phone: true },
      orderBy: { fullName: "asc" },
    }),
  ])

  const serializedProducts = products.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    interestRate: Number(p.interestRate),
    interestType: p.interestType,
    repaymentFreq: p.repaymentFreq,
    numberOfInstallments: p.numberOfInstallments,
    minAmount: Number(p.minAmount),
    maxAmount: Number(p.maxAmount),
    gracePeriod: p.gracePeriod,
    allowManualSchedule: p.allowManualSchedule,
  }))

  return <LoanApplicationForm products={serializedProducts} members={members} />
}
