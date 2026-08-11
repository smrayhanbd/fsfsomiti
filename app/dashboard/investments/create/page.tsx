import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import InvestmentForm from "../InvestmentForm"

export const dynamic = "force-dynamic"

export default async function CreateInvestmentPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")

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
      mode="create"
      types={types.map((t) => ({
        id: t.id, name: t.name, slug: t.slug,
        subCategories: t.subCategories as unknown as string[],
        assetAccountCode: t.assetAccountCode,
      }))}
      accounts={accounts.map((a) => ({
        id: a.id, accountCode: a.accountCode, accountName: a.accountName,
        accountType: a.accountType, isCash: a.isCash, isBank: a.isBank,
        currentBalance: Number(a.currentBalance),
      }))}
      bankAccounts={bankAccounts.map((b) => ({
        id: b.id, accountName: b.accountName, bankName: b.bankName,
        paymentMethod: b.paymentMethod, coaAccountId: b.coaAccountId,
      }))}
      investment={null}
    />
  )
}
