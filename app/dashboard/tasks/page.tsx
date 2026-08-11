import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { listTasks, getTaskStats, type ListFilters } from "@/app/actions/tasks"
import TaskTable from "@/components/tasks/TaskTable"
import TaskKanban from "@/components/tasks/TaskKanban"
import TaskCalendar from "@/components/tasks/TaskCalendar"
import TaskFilterBar from "@/components/tasks/TaskFilterBar"
import { Plus, CheckSquare, ListChecks, CalendarDays, LayoutGrid, AlertTriangle, Clock, CheckCircle2 } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function TasksHubPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const q = typeof sp.q === "string" ? sp.q : undefined
  const status = typeof sp.status === "string" ? sp.status : undefined
  const priority = typeof sp.priority === "string" ? sp.priority : undefined
  const overdueOnly = sp.overdue === "true"
  const view = (typeof sp.view === "string" ? sp.view : "list") as "list" | "kanban" | "calendar"

  const filters: ListFilters = { q, status, priority, overdueOnly }
  const [tasks, stats] = await Promise.all([listTasks(filters), getTaskStats()])

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <CheckSquare className="h-7 w-7 text-indigo-600" /> Task Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">Plan, assign, and track work across staff, committees, and members.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/tasks/reports">
            <Button variant="outline">Reports</Button>
          </Link>
          <Link href="/dashboard/committees">
            <Button variant="outline">Committees</Button>
          </Link>
          <Link href="/dashboard/tasks/new">
            <Button><Plus className="h-4 w-4" /> New Task</Button>
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard label="Open" value={stats.open} icon={<ListChecks className="h-4 w-4" />} tone="slate" />
        <KpiCard label="In Progress" value={stats.inProgress} icon={<Clock className="h-4 w-4" />} tone="blue" />
        <KpiCard label="Due (7 days)" value={stats.dueSoon} icon={<Clock className="h-4 w-4" />} tone="amber" />
        <KpiCard label="Overdue" value={stats.overdue} icon={<AlertTriangle className="h-4 w-4" />} tone="rose" />
        <KpiCard label="Pending Approval" value={stats.pendingApproval} icon={<CheckCircle2 className="h-4 w-4" />} tone="violet" />
        <KpiCard label="Approved" value={stats.approved} icon={<CheckCircle2 className="h-4 w-4" />} tone="emerald" />
      </div>

      {/* Filters */}
      <TaskFilterBar basePath="/dashboard/tasks" />

      {/* View tabs */}
      <Tabs defaultValue={view}>
        <TabsList>
          <TabsTrigger value="list"><ListChecks className="h-4 w-4 mr-1.5" /> List</TabsTrigger>
          <TabsTrigger value="kanban"><LayoutGrid className="h-4 w-4 mr-1.5" /> Board</TabsTrigger>
          <TabsTrigger value="calendar"><CalendarDays className="h-4 w-4 mr-1.5" /> Calendar</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="mt-4">
          <TaskTable tasks={tasks} basePath="/dashboard/tasks" />
        </TabsContent>
        <TabsContent value="kanban" className="mt-4">
          <TaskKanban tasks={tasks} basePath="/dashboard/tasks" />
        </TabsContent>
        <TabsContent value="calendar" className="mt-4">
          <TaskCalendar tasks={tasks} basePath="/dashboard/tasks" />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function KpiCard({
  label, value, icon, tone,
}: { label: string; value: number; icon: React.ReactNode; tone: "slate" | "blue" | "amber" | "rose" | "violet" | "emerald" }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-500/10 text-slate-600",
    blue: "bg-blue-500/10 text-blue-600",
    amber: "bg-amber-500/10 text-amber-600",
    rose: "bg-rose-500/10 text-rose-600",
    violet: "bg-violet-500/10 text-violet-600",
    emerald: "bg-emerald-500/10 text-emerald-600",
  }
  return (
    <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
          <span className={`inline-flex items-center justify-center h-7 w-7 rounded-lg ${tones[tone]}`}>{icon}</span>
        </div>
        <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</div>
      </CardContent>
    </Card>
  )
}

// (Tabs component switches content client-side; the defaultValue above tracks
// the current ?view= param so a page reload preserves the selected view.)

