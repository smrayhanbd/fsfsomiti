import prisma from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import ValuationForm from "./ValuationForm"

export const dynamic = "force-dynamic"

export default async function RecordValuationPage({ params }: { params: Promise<{ id: string }> }) {
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
