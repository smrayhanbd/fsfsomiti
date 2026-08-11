import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import ProjectForm from "../ProjectForm"

export const dynamic = "force-dynamic"

export default async function CreateProjectPage({ searchParams }: { searchParams: Promise<{ investment?: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  const sp = await searchParams
  const linkInvestmentId = sp.investment ?? null

  const [members, accounts, bankAccounts, linkedInvestment] = await Promise.all([
    prisma.member.findMany({
      where: { status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, memberNo: true },
    }),
    prisma.account.findMany({
      where: { status: "ACTIVE", allowPosting: true },
      orderBy: { accountCode: "asc" },
      select: { id: true, accountCode: true, accountName: true, accountType: true, isCash: true, isBank: true, currentBalance: true },
    }),
    prisma.bankAccount.findMany({
      where: { isActive: true },
      orderBy: { accountName: "asc" },
      select: { id: true, accountName: true, bankName: true },
    }),
    linkInvestmentId
      ? prisma.investment.findUnique({ where: { id: linkInvestmentId }, select: { id: true, name: true, costBasis: true } })
      : Promise.resolve(null),
  ])

  return (
    <ProjectForm
      mode="create"
      members={members.map((m) => ({ id: m.id, fullName: m.fullName, memberNo: m.memberNo }))}
      accounts={accounts.map((a) => ({ id: a.id, accountCode: a.accountCode, accountName: a.accountName, accountType: a.accountType, isCash: a.isCash, isBank: a.isBank, currentBalance: Number(a.currentBalance) }))}
      bankAccounts={bankAccounts.map((b) => ({ id: b.id, accountName: b.accountName, bankName: b.bankName }))}
      investments={linkInvestmentId && linkedInvestment ? [{ id: linkedInvestment.id, name: linkedInvestment.name, amount: Number(linkedInvestment.costBasis) }] : []}
      linkInvestmentId={linkInvestmentId}
      project={null}
    />
  )
}
