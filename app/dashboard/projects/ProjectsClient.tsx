"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { formatBDT, formatDate } from "@/lib/accounting"
import {
  Search, Filter, Plus, Eye, Briefcase, Wallet, TrendingDown, TrendingUp, Link2, Scale,
} from "lucide-react"

import StatCard from "@/components/somiti/StatCard"
import SectionCard from "@/components/somiti/SectionCard"
import { ProjectStatusBadge } from "@/components/portfolio/EntityBadges"
import {
  PROJECT_TYPE_LABELS, PROJECT_STATUS_LABELS,
  type ProjectType, type ProjectStatus,
} from "@/lib/portfolio/types"

interface Row {
  id: string
  projectNo: string
  name: string
  type: ProjectType
  status: ProjectStatus
  plannedStartDate: string | null
  plannedEndDate: string | null
  budget: number
  spent: number
  budgetUsedPct: number
  revenue: number
  netPL: number
  manager: { id: string; fullName: string; memberNo: string } | null
  investments: Array<{ linkId: string; id: string; name: string; investmentNo: string }>
}

const TYPE_OPTIONS = Object.keys(PROJECT_TYPE_LABELS) as ProjectType[]
const STATUS_OPTIONS = Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]

export default function ProjectsClient({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("ALL")
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "ALL">("ALL")
  const [linkedFilter, setLinkedFilter] = useState<"ALL" | "YES" | "NO">("ALL")

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter !== "ALL" && r.type !== typeFilter) return false
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false
      if (linkedFilter === "YES" && r.investments.length === 0) return false
      if (linkedFilter === "NO" && r.investments.length > 0) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          r.projectNo.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          (r.manager?.fullName ?? "").toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [rows, search, typeFilter, statusFilter, linkedFilter])

  const stats = useMemo(() => {
    const totalBudget = rows.reduce((s, r) => s + r.budget, 0)
    const totalSpent = rows.reduce((s, r) => s + r.spent, 0)
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
    const activeCount = rows.filter((r) => r.status === "ACTIVE").length
    return { totalBudget, totalSpent, totalRevenue, remaining: totalBudget - totalSpent, activeCount }
  }, [rows])

  const exportCsv = () => {
    const header = ["Project No", "Name", "Type", "Manager", "Budget", "Spent", "Revenue", "Net P&L", "Status"]
    const body = filtered.map((r) => [
      r.projectNo, r.name, r.type, r.manager?.fullName ?? "",
      r.budget.toFixed(2), r.spent.toFixed(2), r.revenue.toFixed(2), r.netPL.toFixed(2), r.status,
    ])
    const csv = [header, ...body].map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `projects-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:flex-wrap">
        <div className="min-w-0">
          <h1 className="t-h1 text-primary-ink">Project Management</h1>
          <p className="t-body mt-1.5 text-muted-ink">Manage active ventures and operations — budget, expenses, revenue & profit.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
          <Link href="/dashboard/projects/create">
            <Button className="brand-gradient shadow-brand-glow"><Plus className="mr-2 h-4 w-4" /> New Project</Button>
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total Budget" value={formatBDT(stats.totalBudget)} icon={Wallet} accent="blue" />
        <StatCard label="Total Spent" value={formatBDT(stats.totalSpent)} icon={TrendingDown} accent="crimson" />
        <StatCard label="Budget Remaining" value={formatBDT(stats.remaining)} icon={Scale} accent={stats.remaining >= 0 ? "emerald" : "crimson"} />
        <StatCard label="Total Revenue" value={formatBDT(stats.totalRevenue)} icon={TrendingUp} accent="emerald" />
        <StatCard label="Active Projects" value={stats.activeCount} icon={Briefcase} accent="gold" />
      </div>

      {/* Filters */}
      <SectionCard icon={<Filter className="h-4 w-4" />} title="Filters" accent="blue" bodyClassName="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-ink" />
            <Input placeholder="Search name, project no, manager…" value={search} onChange={(e) => setSearch(e.target.value)} className="bg-[var(--control-bg)] pl-9" />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? "ALL")}>
            <SelectTrigger className="bg-[var(--control-bg)]"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              {TYPE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{PROJECT_TYPE_LABELS[t]}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v ?? "ALL") as ProjectStatus | "ALL")}>
              <SelectTrigger className="bg-[var(--control-bg)]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={linkedFilter} onValueChange={(v) => setLinkedFilter((v ?? "ALL") as typeof linkedFilter)}>
              <SelectTrigger className="bg-[var(--control-bg)]"><SelectValue placeholder="Investment" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="YES">Linked</SelectItem>
                <SelectItem value="NO">Unlinked</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>

      {/* Table */}
      <SectionCard icon={<Briefcase className="h-4 w-4" />} title={`Projects (${filtered.length})`} accent="violet" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border-base)] bg-subtle/40 hover:bg-transparent">
                <TableHead className="t-overline text-muted-ink">Project No</TableHead>
                <TableHead className="t-overline text-muted-ink">Name</TableHead>
                <TableHead className="t-overline text-muted-ink">Manager</TableHead>
                <TableHead className="t-overline text-right text-muted-ink">Budget</TableHead>
                <TableHead className="t-overline text-right text-muted-ink">Spent</TableHead>
                <TableHead className="t-overline text-muted-ink">Budget Used</TableHead>
                <TableHead className="t-overline text-right text-muted-ink">Revenue</TableHead>
                <TableHead className="t-overline text-right text-muted-ink">Net P&amp;L</TableHead>
                <TableHead className="t-overline text-muted-ink">Status</TableHead>
                <TableHead className="t-overline text-muted-ink">Investment</TableHead>
                <TableHead className="t-overline text-right text-muted-ink">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow className="border-[var(--border-base)]">
                  <TableCell colSpan={11} className="py-16 text-center">
                    <Briefcase className="mx-auto mb-3 h-10 w-10 text-faint-ink" />
                    <p className="t-h3 text-primary-ink">No projects found</p>
                    <p className="t-body mt-1 text-muted-ink">Adjust your filters or create your first project.</p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id} className="border-[var(--border-base)] transition-colors hover:bg-subtle">
                    <TableCell className="t-num text-secondary-ink">{r.projectNo}</TableCell>
                    <TableCell>
                      <Link href={`/dashboard/projects/${r.id}`} className="t-body font-semibold text-primary-ink hover:text-brand">{r.name}</Link>
                      <p className="t-caption text-muted-ink">{PROJECT_TYPE_LABELS[r.type]}</p>
                    </TableCell>
                    <TableCell className="t-caption text-secondary-ink">{r.manager?.fullName ?? "—"}</TableCell>
                    <TableCell className="t-num text-right">{formatBDT(r.budget)}</TableCell>
                    <TableCell className="t-num text-right">{formatBDT(r.spent)}</TableCell>
                    <TableCell className="w-32">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
                          <div
                            className={`h-full rounded-full ${r.budgetUsedPct > 100 ? "bg-[var(--status-debit)]" : r.budgetUsedPct > 80 ? "bg-[var(--status-warning)]" : "bg-[var(--status-success)]"}`}
                            style={{ width: `${Math.min(r.budgetUsedPct, 100)}%` }}
                          />
                        </div>
                        <span className="t-num t-caption text-muted-ink">{r.budgetUsedPct.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="t-num text-right">{formatBDT(r.revenue)}</TableCell>
                    <TableCell className={`t-num text-right font-semibold ${r.netPL >= 0 ? "t-num-pos" : "t-num-neg"}`}>{formatBDT(r.netPL)}</TableCell>
                    <TableCell><ProjectStatusBadge status={r.status} /></TableCell>
                    <TableCell>
                      {r.investments.length > 0 ? (
                        <div className="flex items-center gap-1">
                          <Link2 className="h-3 w-3 text-brand" />
                          <Link href={`/dashboard/investments/${r.investments[0].id}`} className="t-caption text-brand hover:underline">{r.investments[0].investmentNo}</Link>
                        </div>
                      ) : (<span className="t-caption text-faint-ink">—</span>)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link href={`/dashboard/projects/${r.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="View"><Eye className="h-4 w-4" /></Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </div>
  )
}
