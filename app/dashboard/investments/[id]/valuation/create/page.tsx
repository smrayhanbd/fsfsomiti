import prisma from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import ValuationForm from "./ValuationForm"
import { guardDashboardPage } from "@/lib/page-guard"

export const dynamic = "force-dynamic"

export default async function RecordValuationPage({ params }: { params: Promise<{ id: string }> }) {
  // Page-level permission guard — redirects to /dashboard/unauthorized
  // if the user doesn't have access to this page.
  await guardDashboardPage("Operations & Management", "Investment Management")


  const user = await getCurrentUser()
  if (!user) redirect("/")
  const { id } = await params

  const investment = await prisma.investment.findUnique({
    where: { id },
    select: { id: true, investmentNo: true, name: true, currentValue: true },
  })
  if (!investment) notFound()

  return (
    <ValuationForm
      investment={{ id: investment.id, investmentNo: investment.investmentNo, name: investment.name, currentValue: Number(investment.currentValue) }}
    />
  )
}
