import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { formatBDT, formatDate } from "@/lib/accounting"
import { getTransparencySettings } from "@/app/actions/portal"
import { ProjectStatusBadge } from "@/components/portfolio/EntityBadges"
import {
  PROJECT_TYPE_LABELS, PROJECT_STATUS_LABELS,
  type MilestoneStatus,
} from "@/lib/portfolio/types"
import SectionCard from "@/components/somiti/SectionCard"
import StatCard from "@/components/somiti/StatCard"
import Money from "@/components/somiti/Money"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Briefcase, Wallet, TrendingUp, TrendingDown, ArrowLeft, FileText } from "lucide-react"

export const dynamic = "force-dynamic"

/**
 * Member portal → Project detail (read-only).
 *
 * Shows the public financial sections of a single project. Internal CoA
 * account IDs, voucher linkage, and audit actor info are excluded.
 */
export default async function PortalProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") redirect("/")

  const transparency = await getTransparencySettings()
  if (!transparency.showProjects) redirect("/portal")

  const { id } = await params

  const project = await prisma.project.findFirst({
    where: { id, isDeleted: false },
    include: {
      managerMember: { select: { id: true, fullName: true, memberNo: true } },
      sponsorMember: { select: { id: true, fullName: true, memberNo: true } },
      expenses: { orderBy: { expenseDate: "desc" }, take: 50 },
      revenues: { orderBy: { revenueDate: "desc" }, take: 50 },
      milestones: { orderBy: { sortOrder: "asc" } },
      projectLinks: { select: { investment: { select: { id: true, name: true, investmentNo: true, status: true } } } },
    },
  })
  if (!project) notFound()

  const totalSpent = project.expenses.reduce((s, e) => s + Number(e.amount), 0)
  const totalRevenue = project.revenues.reduce((s, r) => s + Number(r.amount), 0)
  const netPL = totalRevenue - totalSpent
  const budget = Number(project.totalBudget)
  const budgetUsedPct = budget > 0 ? (totalSpent / budget) * 100 : 0

  // Expense summary by category.
  const byCategory = new Map<string, number>()
  for (const e of project.expenses) {
    const cat = e.category
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + Number(e.amount))
  }
  const expenseByCategory = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Link href="/portal/projects" className="inline-flex w-fit items-center text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to Projects
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{project.name}</h1>
          <ProjectStatusBadge status={project.status} />
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          <span className="font-mono">{project.projectNo}</span> · {PROJECT_TYPE_LABELS[project.type]}
          {project.managerMember ? ` · Manager: ${project.managerMember.fullName}` : ""}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Budget" value={<Money amount={budget} />} icon={Wallet} accent="blue" />
        <StatCard label="Total Spent" value={<Money amount={totalSpent} />} icon={TrendingDown} accent="crimson" hint={`${budgetUsedPct.toFixed(1)}% of budget`} />
        <StatCard label="Total Revenue" value={<Money amount={totalRevenue} />} icon={TrendingUp} accent="emerald" />
        <StatCard
          label="Net P&L"
          value={<Money amount={netPL} />}
          icon={netPL >= 0 ? TrendingUp : TrendingDown}
          accent={netPL >= 0 ? "emerald" : "crimson"}
        />
      </div>

      {/* Overview */}
      <SectionCard title="Overview" icon={<Briefcase />} accent="blue">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <Detail label="Type">{PROJECT_TYPE_LABELS[project.type]}</Detail>
          <Detail label="Phase">{project.phase.replace(/_/g, " ")}</Detail>
          <Detail label="Status">{PROJECT_STATUS_LABELS[project.status]}</Detail>
          <Detail label="Planned Start">{project.plannedStartDate ? formatDate(project.plannedStartDate) : "—"}</Detail>
          <Detail label="Planned End">{project.plannedEndDate ? formatDate(project.plannedEndDate) : "—"}</Detail>
          <Detail label="Manager">{project.managerMember?.fullName ?? "—"}</Detail>
        </dl>
        {project.description && (
          <div className="mt-4 rounded-lg bg-inset p-3 text-sm text-secondary-ink">
            <p>{project.description}</p>
          </div>
        )}
      </SectionCard>

      {/* Milestones */}
      <SectionCard title="Milestones" icon={<TrendingUp />}>
        {project.milestones.length === 0 ? (
          <p className="py-6 text-center t-body text-muted-ink">No milestones recorded.</p>
        ) : (
          <div className="space-y-2">
            {project.milestones.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-base)] bg-inset px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-primary-ink">{m.name}</p>
                  <p className="t-caption text-muted-ink">
                    Target: {m.targetDate ? formatDate(m.targetDate) : "—"}
                    {m.actualDate ? ` · Completed: ${formatDate(m.actualDate)}` : ""}
                  </p>
                </div>
                <MilestonePill status={m.status} />
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Expense summary + recent activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Expenses by Category" icon={<TrendingDown />} accent="crimson">
          {expenseByCategory.length === 0 ? (
            <p className="py-6 text-center t-body text-muted-ink">No expenses recorded.</p>
          ) : (
            <div className="space-y-2">
              {expenseByCategory.map(([cat, amt]) => {
                const pct = totalSpent > 0 ? (amt / totalSpent) * 100 : 0
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-secondary-ink">{cat.replace(/_/g, " ")}</span>
                      <span className="t-num font-medium text-primary-ink">{formatBDT(amt)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-subtle">
                      <div className="h-full rounded-full bg-crimson" style={{ width: `${pct}%`, backgroundColor: "var(--chart-crimson)" }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Recent Revenue" icon={<TrendingUp />} accent="emerald" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-[var(--border-base)] hover:bg-transparent">
                  <TableHead className="t-overline px-4 text-muted-ink">Date</TableHead>
                  <TableHead className="t-overline px-4 text-muted-ink">Description</TableHead>
                  <TableHead className="t-overline px-4 text-right text-muted-ink">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.revenues.length === 0 ? (
                  <TableRow className="border-[var(--border-base)]">
                    <TableCell colSpan={3} className="py-8 text-center t-body text-muted-ink">No revenue recorded.</TableCell>
                  </TableRow>
                ) : (
                  project.revenues.slice(0, 8).map((r) => (
                    <TableRow key={r.id} className="border-[var(--border-base)] last:border-0 hover:bg-subtle">
                      <TableCell className="px-4 py-3 text-secondary-ink">{formatDate(r.revenueDate)}</TableCell>
                      <TableCell className="px-4 py-3 text-secondary-ink">{r.description}</TableCell>
                      <TableCell className="px-4 py-3 text-right t-num text-success">+{formatBDT(Number(r.amount))}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      </div>

      {/* Linked investments */}
      {project.projectLinks.length > 0 && (
        <SectionCard title="Linked Investments" icon={<FileText />} accent="violet">
          <div className="flex flex-wrap gap-2">
            {project.projectLinks.map((l) => (
              <Link
                key={l.investment.id}
                href={`/portal/investments/${l.investment.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-base)] bg-inset px-3 py-1.5 text-sm font-medium text-secondary-ink hover:border-brand hover:text-brand"
              >
                <span className="font-mono t-caption">{l.investment.investmentNo}</span>
                <span>{l.investment.name}</span>
              </Link>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="t-overline text-faint-ink">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-primary-ink">{children}</dd>
    </div>
  )
}

function MilestonePill({ status }: { status: MilestoneStatus }) {
  const tone: Record<MilestoneStatus, string> = {
    NOT_STARTED: "bg-subtle text-muted-ink",
    IN_PROGRESS: "bg-info-soft text-info",
    COMPLETED: "bg-success-soft text-success",
    DELAYED: "bg-warning-soft text-warning",
  }
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 t-caption font-semibold ${tone[status]}`}>
      {status.replace(/_/g, " ")}
    </span>
  )
}
