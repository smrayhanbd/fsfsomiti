import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import prisma from "@/lib/prisma"
import { ArrowLeft, BarChart3, TrendingUp, Clock, AlertTriangle, CheckCircle2 } from "lucide-react"
import { format } from "date-fns"

export const dynamic = "force-dynamic"

export default async function TaskReportsPage() {
  // Window: tasks created in the last 90 days for the close-rate metric.
  const now = new Date()
  const since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  const [byStatus, byPriority, total, overdueAgg, workload, recentApproved, timeTotals] = await Promise.all([
    prisma.task.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.task.groupBy({ by: ["priority"], _count: { _all: true } }),
    prisma.task.count(),
    prisma.task.count({
      where: { dueDate: { lt: new Date() }, status: { in: ["TODO", "IN_PROGRESS", "ON_HOLD"] } },
    }),
    // Workload by staff assignee
    prisma.taskAssignee.groupBy({
      by: ["userId"],
      where: { assigneeType: "STAFF", userId: { not: null }, task: { status: { in: ["TODO", "IN_PROGRESS", "IN_REVIEW", "ON_HOLD"] } } },
      _count: { _all: true },
    }),
    prisma.task.findMany({
      where: { approvedAt: { gte: since } },
      select: { id: true, title: true, priority: true, createdAt: true, approvedAt: true },
      orderBy: { approvedAt: "desc" },
      take: 15,
    }),
    prisma.taskTimeLog.aggregate({ _sum: { minutes: true } }),
  ])

  const statusMap = new Map(byStatus.map((s) => [s.status, s._count._all]))
  const priorityMap = new Map(byPriority.map((p) => [p.priority, p._count._all]))
  const completed = (statusMap.get("DONE") ?? 0) + (statusMap.get("APPROVED") ?? 0)
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0
  const overduePct = total > 0 ? Math.round((overdueAgg / total) * 100) : 0

  // Resolve staff names for workload table.
  const staffIds = workload.map((w) => w.userId).filter(Boolean) as string[]
  const staff = staffIds.length
    ? await prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true, email: true } })
    : []
  const staffMap = new Map(staff.map((s) => [s.id, s]))

  const totalHours = Math.round((timeTotals._sum.minutes ?? 0) / 60)

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/tasks">
          <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-indigo-600" /> Task Reports
          </h1>
          <p className="text-sm text-slate-500">Completion, workload, time-tracking, and recency analytics.</p>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={<TrendingUp className="h-5 w-5" />} label="Completion Rate" value={`${completionRate}%`} tone="emerald" sub={`${completed} of ${total} done`} />
        <StatTile icon={<Clock className="h-5 w-5" />} label="Time Logged" value={`${totalHours}h`} tone="blue" sub={`${timeTotals._sum.minutes ?? 0} minutes`} />
        <StatTile icon={<AlertTriangle className="h-5 w-5" />} label="Overdue" value={`${overdueAgg}`} tone="rose" sub={`${overduePct}% of all tasks`} />
        <StatTile icon={<CheckCircle2 className="h-5 w-5" />} label="Approved" value={`${statusMap.get("APPROVED") ?? 0}`} tone="violet" sub={`last 90d: ${recentApproved.length}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By status */}
        <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <CardHeader><CardTitle>Tasks by Status</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(["TODO", "IN_PROGRESS", "ON_HOLD", "IN_REVIEW", "DONE", "APPROVED", "CANCELLED"] as const).map((s) => {
              const count = statusMap.get(s) ?? 0
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              return (
                <div key={s}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-600 dark:text-slate-300">{s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                    <span className="text-slate-500">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* By priority */}
        <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <CardHeader><CardTitle>Tasks by Priority</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(["LOW", "MEDIUM", "HIGH", "URGENT"] as const).map((p) => {
              const count = priorityMap.get(p) ?? 0
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              const colors: Record<string, string> = { LOW: "bg-slate-400", MEDIUM: "bg-sky-500", HIGH: "bg-orange-500", URGENT: "bg-rose-500" }
              return (
                <div key={p}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-600 dark:text-slate-300">{p}</span>
                    <span className="text-slate-500">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className={`h-full rounded-full ${colors[p]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* Workload by staff */}
      <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <CardHeader><CardTitle>Active Workload by Staff</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500">Staff</TableHead>
                <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500 text-right">Open Tasks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workload.length === 0 && (
                <TableRow><TableCell colSpan={2} className="text-center py-6 text-slate-400">No active assignments.</TableCell></TableRow>
              )}
              {workload.map((w) => {
                const s = staffMap.get(w.userId!)
                return (
                  <TableRow key={w.userId}>
                    <TableCell className="px-4 py-3">{s?.name ?? s?.email ?? "Unknown"}</TableCell>
                    <TableCell className="px-4 py-3 text-right"><Badge variant="outline">{w._count._all}</Badge></TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recently approved */}
      <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <CardHeader><CardTitle>Recently Approved (last 90 days)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500">Task</TableHead>
                <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500">Priority</TableHead>
                <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500">Created</TableHead>
                <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500">Approved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentApproved.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-slate-400">No tasks approved in this window.</TableCell></TableRow>
              )}
              {recentApproved.map((t) => {
                const created = new Date(t.createdAt)
                const approved = t.approvedAt ? new Date(t.approvedAt) : null
                const daysToClose = approved ? Math.round((approved.getTime() - created.getTime()) / (24 * 60 * 60 * 1000)) : null
                return (
                  <TableRow key={t.id}>
                    <TableCell className="px-4 py-3">
                      <Link href={`/dashboard/tasks/${t.id}`} className="text-slate-900 dark:text-white hover:text-indigo-600">{t.title}</Link>
                      {daysToClose !== null && <span className="ml-2 text-xs text-slate-400">closed in {daysToClose}d</span>}
                    </TableCell>
                    <TableCell className="px-4 py-3"><Badge variant="outline">{t.priority}</Badge></TableCell>
                    <TableCell className="px-4 py-3 text-sm text-slate-500">{format(created, "MMM d, yyyy")}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-emerald-600">{approved ? format(approved, "MMM d, yyyy") : "—"}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function StatTile({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub: string; tone: "emerald" | "blue" | "rose" | "violet" }) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-600",
    blue: "bg-blue-500/10 text-blue-600",
    rose: "bg-rose-500/10 text-rose-600",
    violet: "bg-violet-500/10 text-violet-600",
  }
  return (
    <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
          <span className={`inline-flex items-center justify-center h-8 w-8 rounded-lg ${tones[tone]}`}>{icon}</span>
        </div>
        <div className="text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
        <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
      </CardContent>
    </Card>
  )
}
