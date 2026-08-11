import prisma from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import InvestmentForm from "../../InvestmentForm"

export const dynamic = "force-dynamic"

export default async function EditInvestmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  const { id } = await params

  const investment = await prisma.investment.findUnique({
    where: { id },
    select: {
      id: true, name: true, investmentTypeId: true, subCategory: true,
      investmentDate: true, maturityDate: true, description: true,
      tags: true, investedAmount: true, currency: true, exchangeRate: true,
      feesAmount: true, paymentMethod: true, bankAccountId: true, referenceNo: true,
      expectedAnnualReturn: true, incomeTypes: true, paymentFrequency: true,
      details: true, documents: true, status: true,
    },
  })
  if (!investment) notFound()
  if (investment.status !== "DRAFT") {
    redirect(`/dashboard/investments/${id}`)
  }

  const [types, accounts, bankAccounts] = await Promise.all([
    prisma.investmentType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, slug: true, subCategories: true, assetAccountCode: true },
    }),
    prisma.account.findMany({
      where: { status: "ACTIVE", allowPosting: true },
      orderBy: { accountCode: "asc" },
      select: { id: true, accountCode: true, accountName: true, accountType: true, isCash: true, isBank: true, currentBalance: true },
    }),
    prisma.bankAccount.findMany({
      where: { isActive: true },
      orderBy: { accountName: "asc" },
      select: { id: true, accountName: true, bankName: true, paymentMethod: true, coaAccountId: true },
    }),
  ])

  return (
    <InvestmentForm
      mode="edit"
      types={types.map((t) => ({ id: t.id, name: t.name, slug: t.slug, subCategories: t.subCategories as unknown as string[], assetAccountCode: t.assetAccountCode }))}
      accounts={accounts.map((a) => ({ id: a.id, accountCode: a.accountCode, accountName: a.accountName, accountType: a.accountType, isCash: a.isCash, isBank: a.isBank, currentBalance: Number(a.currentBalance) }))}
      bankAccounts={bankAccounts.map((b) => ({ id: b.id, accountName: b.accountName, bankName: b.bankName, paymentMethod: b.paymentMethod, coaAccountId: b.coaAccountId }))}
      investment={{
        id: investment.id,
        name: investment.name,
        investmentTypeId: investment.investmentTypeId,
        subCategory: investment.subCategory,
        investmentDate: investment.investmentDate.toISOString(),
        maturityDate: investment.maturityDate?.toISOString() ?? null,
        description: investment.description,
        tags: investment.tags as unknown as string[],
        investedAmount: Number(investment.investedAmount),
        currency: investment.currency,
        exchangeRate: Number(investment.exchangeRate),
        feesAmount: Number(investment.feesAmount),
        paymentMethod: investment.paymentMethod,
        bankAccountId: investment.bankAccountId,
        referenceNo: investment.referenceNo,
        expectedAnnualReturn: Number(investment.expectedAnnualReturn),
        incomeTypes: investment.incomeTypes as unknown as string[],
        paymentFrequency: investment.paymentFrequency,
        details: (investment.details ?? {}) as Record<string, unknown>,
        documents: (investment.documents ?? []) as Array<{ name: string; type?: string; url: string; date?: string; notes?: string }>,
      }}
    />
  )
}
