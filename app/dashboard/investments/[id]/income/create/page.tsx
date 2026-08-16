import prisma from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import IncomeForm from "./IncomeForm"
import { guardDashboardPage } from "@/lib/page-guard"

export const dynamic = "force-dynamic"

export default async function RecordIncomePage({ params }: { params: Promise<{ id: string }> }) {
  // Page-level permission guard — redirects to /dashboard/unauthorized
  // if the user doesn't have access to this page.
  await guardDashboardPage("Operations & Management", "Investment Management")


  const user = await getCurrentUser()
  if (!user) redirect("/")
  const { id } = await params

  const investment = await prisma.investment.findUnique({
    where: { id },
    select: { id: true, investmentNo: true, name: true, investmentType: { select: { name: true } } },
  })
  if (!investment) notFound()

  const bankAccounts = await prisma.bankAccount.findMany({
    where: { isActive: true },
    orderBy: { accountName: "asc" },
    select: { id: true, accountName: true, bankName: true },
  })

  return (
    <IncomeForm
      investment={{ id: investment.id, investmentNo: investment.investmentNo, name: investment.name, typeName: investment.investmentType.name }}
      bankAccounts={bankAccounts.map((b) => ({ id: b.id, accountName: b.accountName, bankName: b.bankName }))}
    />
  )
}
