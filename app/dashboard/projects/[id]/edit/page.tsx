import prisma from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import ProjectForm from "../../ProjectForm"

export const dynamic = "force-dynamic"

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      costCenters: { orderBy: { sortOrder: "asc" } },
      milestones: { orderBy: { sortOrder: "asc" } },
    },
  })
  if (!project) notFound()

  const [members, accounts, bankAccounts] = await Promise.all([
    prisma.member.findMany({ where: { status: "ACTIVE" }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, memberNo: true } }),
    prisma.account.findMany({ where: { status: "ACTIVE", allowPosting: true }, orderBy: { accountCode: "asc" }, select: { id: true, accountCode: true, accountName: true, accountType: true, isCash: true, isBank: true, currentBalance: true } }),
    prisma.bankAccount.findMany({ where: { isActive: true }, orderBy: { accountName: "asc" }, select: { id: true, accountName: true, bankName: true } }),
  ])

  return (
    <ProjectForm
      mode="edit"
      members={members.map((m) => ({ id: m.id, fullName: m.fullName, memberNo: m.memberNo }))}
      accounts={accounts.map((a) => ({ id: a.id, accountCode: a.accountCode, accountName: a.accountName, accountType: a.accountType, isCash: a.isCash, isBank: a.isBank, currentBalance: Number(a.currentBalance) }))}
      bankAccounts={bankAccounts.map((b) => ({ id: b.id, accountName: b.accountName, bankName: b.bankName }))}
      investments={[]}
      linkInvestmentId={null}
      project={{
        id: project.id,
        name: project.name,
        type: project.type,
        code: project.code,
        description: project.description,
        tags: project.tags as unknown as string[],
        plannedStartDate: project.plannedStartDate?.toISOString() ?? null,
        plannedEndDate: project.plannedEndDate?.toISOString() ?? null,
        actualStartDate: project.actualStartDate?.toISOString() ?? null,
        phase: project.phase,
        managerMemberId: project.managerMemberId,
        sponsorMemberId: project.sponsorMemberId,
        teamMembers: (project.teamMembers ?? []) as unknown as Array<{ id: string; name: string }>,
        externalContractors: project.externalContractors,
        totalBudget: Number(project.totalBudget),
        budgetSource: project.budgetSource,
        revenuePlan: (project.revenuePlan ?? {}) as { expectedRevenue?: number; revenueType?: string; expectedProfit?: number; expectedMarginPct?: number },
        revenueAccountId: project.revenueAccountId,
        expenseAccountId: project.expenseAccountId,
        wipAssetAccountId: project.wipAssetAccountId,
        bankAccountId: project.bankAccountId,
        status: project.status,
        costCenters: project.costCenters.map((c) => ({ id: c.id, name: c.name, budgetAmount: Number(c.budgetAmount) })),
        milestones: project.milestones.map((m) => ({ id: m.id, name: m.name, targetDate: m.targetDate?.toISOString() ?? null, status: m.status, value: m.value ? Number(m.value) : null, notes: m.notes })),
      }}
    />
  )
}
