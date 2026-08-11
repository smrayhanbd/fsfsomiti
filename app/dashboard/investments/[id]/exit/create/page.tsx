import prisma from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import ExitForm from "./ExitForm"

export const dynamic = "force-dynamic"

export default async function RecordExitPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  const { id } = await params

  const investment = await prisma.investment.findUnique({
    where: { id },
    select: {
      id: true, investmentNo: true, name: true, currentValue: true, costBasis: true,
      investmentType: { select: { name: true, slug: true } },
    },
  })
  if (!investment) notFound()

  const bankAccounts = await prisma.bankAccount.findMany({
    where: { isActive: true },
    orderBy: { accountName: "asc" },
    select: { id: true, accountName: true, bankName: true },
  })

  return (
    <ExitForm
      investment={{
        id: investment.id,
        investmentNo: investment.investmentNo,
        name: investment.name,
        currentValue: Number(investment.currentValue),
        costBasis: Number(investment.costBasis),
        typeSlug: investment.investmentType.slug,
      }}
      bankAccounts={bankAccounts.map((b) => ({ id: b.id, accountName: b.accountName, bankName: b.bankName }))}
    />
  )
}
