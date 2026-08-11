"use client"

/**
 * Projects list — member-portal client (read-only).
 *
 * Mirrors the dashboard ProjectsClient layout (StatCard totals + a filterable
 * table) but without create/edit actions. Each row links to a read-only detail.
 */

import { useMemo, useState } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { formatBDT, formatDate } from "@/lib/accounting"
import { Search, Eye, Briefcase, Wallet, TrendingUp, TrendingDown } from "lucide-react"

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
}

const TYPE_OPTIONS = Object.keys(PROJECT_TYPE_LABELS) as ProjectType[]
const STATUS_OPTIONS = Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]

export default function PortalProjectsClient({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("ALL")
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "ALL">("ALL")

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter !== "ALL" && r.type !== typeFilter) return false
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false
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
  }, [rows, search, typeFilter, statusFilter])

  const stats = useMemo(() => {
    const totalBudget = rows.reduce((s, r) => s + r.budget, 0)
    const totalSpent = rows.reduce((s, r) => s + r.spent, 0)
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
    const activeCount = rows.filter((r) => r.status === "ACTIVE").length
    return { totalBudget, totalSpent, totalRevenue, netPL: totalRevenue - totalSpent, activeCount }
  }, [rows])

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Budget" value={formatBDT(stats.totalBudget)} icon={Wallet} accent="blue" />
        <StatCard label="Total Spent" value={formatBDT(stats.totalSpent)} icon={TrendingDown} accent="crimson" />
        <StatCard
          label="Net P&L"
          value={formatBDT(stats.netPL)}
          icon={stats.netPL >= 0 ? TrendingUp : TrendingDown}
          accent={stats.netPL >= 0 ? "emerald" : "crimson"}
        />
        <StatCard label="Active Projects" value={stats.activeCount} icon={Briefcase} accent="gold" />
      </div>

      {/* Filters */}
      <SectionCard bodyClassName="p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint-ink" />
            <Input
              placeholder="Search by no, name, manager…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[var(--control-bg)] pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => v && setTypeFilter(v)}>
            <SelectTrigger className="bg-[var(--control-bg)] md:w-48"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              {TYPE_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>{PROJECT_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ProjectStatus | "ALL")}>
            <SelectTrigger className="bg-[var(--control-bg)] md:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      {/* Table */}
      <SectionCard bodyClassName="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border-base)] hover:bg-transparent">
                <TableHead className="t-overline px-6 py-3 text-muted-ink">Project</TableHead>
                <TableHead className="t-overline px-6 py-3 text-muted-ink">Type</TableHead>
                <TableHead className="t-overline px-6 py-3 text-muted-ink">Manager</TableHead>
                <TableHead className="t-overline px-6 py-3 text-right text-muted-ink">Budget</TableHead>
                <TableHead className="t-overline px-6 py-3 text-right text-muted-ink">Net P&L</TableHead>
                <TableHead className="t-overline px-6 py-3 text-muted-ink">Status</TableHead>
                <TableHead className="t-overline px-6 py-3 text-right text-muted-ink"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow className="border-[var(--border-base)]">
                  <TableCell colSpan={7} className="py-10 text-center t-body text-muted-ink">
                    No projects match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id} className="border-[var(--border-base)] transition-colors last:border-0 hover:bg-subtle">
                    <TableCell className="px-6 py-3">
                      <div className="font-medium text-primary-ink">{r.name}</div>
                      <div className="t-caption font-mono text-muted-ink">{r.projectNo}</div>
                    </TableCell>
                    <TableCell className="px-6 py-3 t-body text-secondary-ink">{PROJECT_TYPE_LABELS[r.type]}</TableCell>
                    <TableCell className="px-6 py-3 t-body text-secondary-ink">{r.manager?.fullName ?? "—"}</TableCell>
                    <TableCell className="px-6 py-3 text-right t-num text-secondary-ink">{formatBDT(r.budget)}</TableCell>
                    <TableCell className={`px-6 py-3 text-right t-num font-bold ${r.netPL >= 0 ? "text-success" : "text-debit"}`}>
                      {r.netPL >= 0 ? "+" : "−"}{formatBDT(Math.abs(r.netPL))}
                    </TableCell>
                    <TableCell className="px-6 py-3"><ProjectStatusBadge status={r.status} /></TableCell>
                    <TableCell className="px-6 py-3 text-right">
                      <Link href={`/portal/projects/${r.id}`}>
                        <button className="inline-flex items-center gap-1 rounded-md px-2 py-1 t-caption font-medium text-brand hover:bg-brand-gradient-soft">
                          <Eye className="h-3.5 w-3.5" /> View
                        </button>
                      </Link>
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
