import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getTransparencySettings } from "@/app/actions/portal"
import PortalProjectsClient from "./PortalProjectsClient"

export const dynamic = "force-dynamic"

/**
 * Member portal → Projects (read-only list).
 *
 * Reuses the dashboard's query shape but selects only public fields (no
 * internal CoA account IDs). Gated by the admin's `showProjects` toggle.
 */
export default async function PortalProjectsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") redirect("/")

  const transparency = await getTransparencySettings()
  if (!transparency.showProjects) redirect("/portal")

  const projects = await prisma.project.findMany({
    where: { isDeleted: false },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      managerMember: { select: { id: true, fullName: true, memberNo: true } },
      expenses: { select: { amount: true } },
      revenues: { select: { amount: true } },
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
      manager: p.managerMember
        ? { id: p.managerMember.id, fullName: p.managerMember.fullName, memberNo: p.managerMember.memberNo }
        : null,
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Projects
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Active ventures and operations the somiti runs. Read-only.
          </p>
        </div>
        <Link
          href="/portal"
          className="inline-flex items-center text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          ← Back to Dashboard
        </Link>
      </div>

      <PortalProjectsClient rows={rows} />
    </div>
  )
}
