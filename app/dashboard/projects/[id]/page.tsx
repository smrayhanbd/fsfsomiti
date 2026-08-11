import prisma from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import ProjectDetailClient from "./ProjectDetailClient"

export const dynamic = "force-dynamic"

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      managerMember: { select: { id: true, fullName: true, memberNo: true } },
      sponsorMember: { select: { id: true, fullName: true, memberNo: true } },
      costCenters: { orderBy: { sortOrder: "asc" }, include: { expenses: { select: { amount: true } } } },
      expenses: { orderBy: { expenseDate: "desc" }, include: { costCenter: { select: { name: true } } } },
      revenues: { orderBy: { revenueDate: "desc" } },
      milestones: { orderBy: { sortOrder: "asc" } },
      projectLinks: { include: { investment: { select: { id: true, name: true, investmentNo: true, status: true } } } },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 50 },
      tasks: { select: { id: true, title: true, status: true, dueDate: true }, orderBy: { createdAt: "desc" }, take: 20 },
    },
  })
  if (!project) notFound()

  // All investments for the linking picker (minus already-linked).
  const allInvestments = await prisma.investment.findMany({
    where: { isDeleted: false },
    orderBy: { createdAt: "desc" },
    select: { id: true, investmentNo: true, name: true },
  })

  const totalSpent = project.expenses.reduce((s, e) => s + Number(e.amount), 0)
  const totalRevenue = project.revenues.reduce((s, r) => s + Number(r.amount), 0)
  const netPL = totalRevenue - totalSpent

  // All linked journal vouchers.
  const linkedEntryIds = [
    ...project.expenses.map((e) => e.journalEntryId),
    ...project.revenues.map((r) => r.journalEntryId),
  ].filter(Boolean) as string[]
  const vouchers = linkedEntryIds.length > 0
    ? await prisma.journalEntry.findMany({
        where: { id: { in: linkedEntryIds } },
        orderBy: { entryDate: "desc" },
        select: { id: true, voucherNo: true, voucherType: true, entryDate: true, narration: true, totalDebit: true, totalCredit: true },
      })
    : []

  // P&L by cost center (expense breakdown).
  const plByCostCenter = project.costCenters.map((cc) => {
    const spend = cc.expenses.reduce((s, e) => s + Number(e.amount), 0)
    const budget = Number(cc.budgetAmount)
    return {
      name: cc.name,
      budget,
      spend,
      remaining: budget - spend,
      usedPct: budget > 0 ? (spend / budget) * 100 : 0,
    }
  })

  return (
    <ProjectDetailClient
      project={{
        id: project.id,
        projectNo: project.projectNo,
        name: project.name,
        type: project.type,
        code: project.code,
        description: project.description,
        tags: project.tags as unknown as string[],
        phase: project.phase,
        status: project.status,
        plannedStartDate: project.plannedStartDate?.toISOString() ?? null,
        plannedEndDate: project.plannedEndDate?.toISOString() ?? null,
        actualStartDate: project.actualStartDate?.toISOString() ?? null,
        manager: project.managerMember ? { id: project.managerMember.id, fullName: project.managerMember.fullName, memberNo: project.managerMember.memberNo } : null,
        sponsor: project.sponsorMember ? { id: project.sponsorMember.id, fullName: project.sponsorMember.fullName, memberNo: project.sponsorMember.memberNo } : null,
        totalBudget: Number(project.totalBudget),
        budgetSource: project.budgetSource,
        revenuePlan: (project.revenuePlan ?? {}) as { expectedRevenue?: number },
        documents: (project.documents ?? []) as Array<{ name: string; type?: string; url: string; date?: string }>,
      }}
      totalSpent={totalSpent}
      totalRevenue={totalRevenue}
      netPL={netPL}
      costCenters={plByCostCenter}
      expenses={project.expenses.map((e) => ({
        id: e.id, expenseDate: e.expenseDate.toISOString(), referenceNo: e.referenceNo,
        description: e.description, costCenterName: e.costCenter?.name ?? null,
        category: e.category, amount: Number(e.amount), paymentMethod: e.paymentMethod, voucherNo: e.journalEntryId,
      }))}
      revenues={project.revenues.map((r) => ({
        id: r.id, revenueDate: r.revenueDate.toISOString(), referenceNo: r.referenceNo,
        description: r.description, revenueType: r.revenueType, amount: Number(r.amount),
        customer: r.customer, voucherNo: r.journalEntryId,
      }))}
      milestones={project.milestones.map((m) => ({
        id: m.id, name: m.name, targetDate: m.targetDate?.toISOString() ?? null,
        actualDate: m.actualDate?.toISOString() ?? null, status: m.status, notes: m.notes,
      }))}
      tasks={project.tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate?.toISOString() ?? null }))}
      investments={project.projectLinks.map((l) => ({
        linkId: l.id, relationshipType: l.relationshipType,
        id: l.investment.id, name: l.investment.name, investmentNo: l.investment.investmentNo, status: l.investment.status,
      }))}
      vouchers={vouchers.map((v) => ({
        id: v.id, voucherNo: v.voucherNo, voucherType: v.voucherType, entryDate: v.entryDate.toISOString(),
        narration: v.narration, totalDebit: Number(v.totalDebit), totalCredit: Number(v.totalCredit),
      }))}
      auditLogs={project.auditLogs.map((a) => ({
        id: a.id, action: a.action, summary: a.summary, actorName: a.actorName, createdAt: a.createdAt.toISOString(),
      }))}
      allInvestments={allInvestments.map((i) => ({ id: i.id, investmentNo: i.investmentNo, name: i.name }))}
    />
  )
}
