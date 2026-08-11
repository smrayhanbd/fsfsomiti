import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import ProjectsClient from "./ProjectsClient"

export const dynamic = "force-dynamic"

export default async function ProjectsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")

  const projects = await prisma.project.findMany({
    where: { isDeleted: false },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      managerMember: { select: { id: true, fullName: true, memberNo: true } },
      expenses: { select: { amount: true } },
      revenues: { select: { amount: true } },
      projectLinks: { select: { id: true, investment: { select: { id: true, name: true, investmentNo: true } } } },
    },
  })

  const rows = projects.map((p) => {
    const spent = p.expenses.reduce((s, e) => s + Number(e.amount), 0)
    const revenue = p.revenues.reduce((s, r) => s + Number(r.amount), 0)
    const budget = Number(p.totalBudget)
    return {
      id: p.id,
      projectNo: p.projectNo,
      name: p.name,
      type: p.type,
      status: p.status,
      plannedStartDate: p.plannedStartDate?.toISOString() ?? null,
      plannedEndDate: p.plannedEndDate?.toISOString() ?? null,
      budget,
      spent,
      budgetUsedPct: budget > 0 ? (spent / budget) * 100 : 0,
      revenue,
      netPL: revenue - spent,
      manager: p.managerMember ? { id: p.managerMember.id, fullName: p.managerMember.fullName, memberNo: p.managerMember.memberNo } : null,
      investments: p.projectLinks.map((l) => ({
        linkId: l.id, id: l.investment.id, name: l.investment.name, investmentNo: l.investment.investmentNo,
      })),
    }
  })

  return <ProjectsClient rows={rows} />
}
