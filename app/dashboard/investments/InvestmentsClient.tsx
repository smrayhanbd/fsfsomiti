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
  Search, Filter, Plus, Eye, TrendingUp, TrendingDown, Link2, Gem, Wallet, BarChart3, ArrowRightLeft,
} from "lucide-react"

import StatCard from "@/components/somiti/StatCard"
import SectionCard from "@/components/somiti/SectionCard"
import { InvestmentStatusBadge } from "@/components/portfolio/EntityBadges"
import {
  INVESTMENT_STATUS_LABELS,
  type InvestmentStatus,
  type InvestmentTypeOption,
} from "@/lib/portfolio/types"

interface Row {
  id: string
  investmentNo: string
  name: string
  subCategory: string | null
  investedAmount: number
  costBasis: number
  currentValue: number
  gainLoss: number
  roi: number
  investmentDate: string
  maturityDate: string | null
  status: InvestmentStatus
  type: { id: string; name: string; slug: string }
  projects: Array<{ linkId: string; id: string; name: string; projectNo: string }>
}

interface Props {
  rows: Row[]
  types: InvestmentTypeOption[]
}

const STATUS_OPTIONS: InvestmentStatus[] = [
  "DRAFT", "ACTIVE", "PARTIALLY_EXITED", "FULLY_EXITED", "MATURED", "SUSPENDED", "WRITTEN_OFF",
]

export default function InvestmentsClient({ rows, types }: Props) {
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("ALL")
  const [statusFilter, setStatusFilter] = useState<InvestmentStatus | "ALL">("ALL")
  const [linkedFilter, setLinkedFilter] = useState<"ALL" | "YES" | "NO">("ALL")
  const [returnFilter, setReturnFilter] = useState<"ALL" | "POS" | "NEG">("ALL")

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter !== "ALL" && r.type.id !== typeFilter) return false
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false
      if (linkedFilter === "YES" && r.projects.length === 0) return false
      if (linkedFilter === "NO" && r.projects.length > 0) return false
      if (returnFilter === "POS" && r.gainLoss <= 0) return false
      if (returnFilter === "NEG" && r.gainLoss >= 0) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          r.investmentNo.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          (r.subCategory ?? "").toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [rows, search, typeFilter, statusFilter, linkedFilter, returnFilter])

  const stats = useMemo(() => {
    const totalInvested = rows.reduce((s, r) => s + r.costBasis, 0)
    const totalValue = rows.reduce((s, r) => s + r.currentValue, 0)
    const totalGainLoss = totalValue - totalInvested
    const totalIncome = 0 // income KPI filled in Phase 2 (dashboard)
    const activeCount = rows.filter((r) => r.status === "ACTIVE").length
    return {
      totalInvested,
      totalValue,
      totalGainLoss,
      totalIncome,
      activeCount,
      gainPct: totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0,
    }
  }, [rows])

  const exportCsv = () => {
    const header = ["Investment No", "Name", "Type", "Sub-category", "Invested", "Current Value", "Gain/Loss", "ROI %", "Status", "Investment Date", "Maturity"]
    const body = filtered.map((r) => [
      r.investmentNo, r.name, r.type.name, r.subCategory ?? "",
      r.costBasis.toFixed(2), r.currentValue.toFixed(2), r.gainLoss.toFixed(2),
      r.roi.toFixed(2), r.status, r.investmentDate.slice(0, 10), r.maturityDate?.slice(0, 10) ?? "",
    ])
    const csv = [header, ...body]
      .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `investments-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:flex-wrap">
        <div className="min-w-0">
          <h1 className="t-h1 text-primary-ink">Investment Management</h1>
          <p className="t-body mt-1.5 text-muted-ink">
            Track where Somiti funds are invested — shares, FDR, land, property, businesses & more.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
          <Link href="/dashboard/investments/create">
            <Button className="brand-gradient shadow-brand-glow">
              <Plus className="mr-2 h-4 w-4" /> New Investment
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Invested Capital" value={formatBDT(stats.totalInvested)} icon={Wallet} accent="blue" />
        <StatCard label="Portfolio Value" value={formatBDT(stats.totalValue)} icon={Gem} accent="violet" />
        <StatCard
          label="Unrealized Gain/Loss"
          value={formatBDT(stats.totalGainLoss)}
          icon={stats.totalGainLoss >= 0 ? TrendingUp : TrendingDown}
          accent={stats.totalGainLoss >= 0 ? "emerald" : "crimson"}
          trend={{ value: +stats.gainPct.toFixed(1), positive: stats.totalGainLoss >= 0 }}
        />
        <StatCard label="Active Investments" value={stats.activeCount} icon={BarChart3} accent="gold" />
        <StatCard label="Total Count" value={rows.length} icon={ArrowRightLeft} accent="amber" />
      </div>

      {/* Filters */}
      <SectionCard
        icon={<Filter className="h-4 w-4" />}
        title="Filters"
        accent="blue"
        bodyClassName="p-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-ink" />
            <Input
              placeholder="Search name, investment no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[var(--control-bg)] pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? "ALL")}>
            <SelectTrigger className="bg-[var(--control-bg)]"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              {types.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v ?? "ALL") as InvestmentStatus | "ALL")}>
            <SelectTrigger className="bg-[var(--control-bg)]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{INVESTMENT_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Select value={linkedFilter} onValueChange={(v) => setLinkedFilter((v ?? "ALL") as typeof linkedFilter)}>
              <SelectTrigger className="bg-[var(--control-bg)]"><SelectValue placeholder="Linked" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="YES">Linked</SelectItem>
                <SelectItem value="NO">Unlinked</SelectItem>
              </SelectContent>
            </Select>
            <Select value={returnFilter} onValueChange={(v) => setReturnFilter((v ?? "ALL") as typeof returnFilter)}>
              <SelectTrigger className="bg-[var(--control-bg)]"><SelectValue placeholder="Return" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="POS">Gain</SelectItem>
                <SelectItem value="NEG">Loss</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>

      {/* Table */}
      <SectionCard
        icon={<Gem className="h-4 w-4" />}
        title={`Investments (${filtered.length})`}
        accent="violet"
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border-base)] bg-subtle/40 hover:bg-transparent">
                <TableHead className="t-overline text-muted-ink">Investment No</TableHead>
                <TableHead className="t-overline text-muted-ink">Name</TableHead>
                <TableHead className="t-overline text-muted-ink">Type</TableHead>
                <TableHead className="t-overline text-right text-muted-ink">Invested</TableHead>
                <TableHead className="t-overline text-right text-muted-ink">Current Value</TableHead>
                <TableHead className="t-overline text-right text-muted-ink">Gain/Loss</TableHead>
                <TableHead className="t-overline text-right text-muted-ink">ROI</TableHead>
                <TableHead className="t-overline text-muted-ink">Date</TableHead>
                <TableHead className="t-overline text-muted-ink">Status</TableHead>
                <TableHead className="t-overline text-muted-ink">Project</TableHead>
                <TableHead className="t-overline text-right text-muted-ink">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow className="border-[var(--border-base)]">
                  <TableCell colSpan={11} className="py-16 text-center">
                    <Gem className="mx-auto mb-3 h-10 w-10 text-faint-ink" />
                    <p className="t-h3 text-primary-ink">No investments found</p>
                    <p className="t-body mt-1 text-muted-ink">Adjust your filters or create your first investment.</p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id} className="border-[var(--border-base)] transition-colors hover:bg-subtle">
                    <TableCell className="t-num text-secondary-ink">{r.investmentNo}</TableCell>
                    <TableCell>
                      <Link href={`/dashboard/investments/${r.id}`} className="t-body font-semibold text-primary-ink hover:text-brand">
                        {r.name}
                      </Link>
                      {r.subCategory && <p className="t-caption text-muted-ink">{r.subCategory}</p>}
                    </TableCell>
                    <TableCell><span className="t-caption rounded-full bg-subtle px-2.5 py-1 text-secondary-ink">{r.type.name}</span></TableCell>
                    <TableCell className="t-num text-right">{formatBDT(r.costBasis)}</TableCell>
                    <TableCell className="t-num text-right font-semibold">{formatBDT(r.currentValue)}</TableCell>
                    <TableCell className={`t-num text-right font-semibold ${r.gainLoss >= 0 ? "t-num-pos" : "t-num-neg"}`}>
                      {formatBDT(r.gainLoss)}
                    </TableCell>
                    <TableCell className={`t-num text-right ${r.roi >= 0 ? "t-num-pos" : "t-num-neg"}`}>
                      {r.roi >= 0 ? "+" : ""}{r.roi.toFixed(1)}%
                    </TableCell>
                    <TableCell className="t-caption text-secondary-ink">{formatDate(r.investmentDate)}</TableCell>
                    <TableCell><InvestmentStatusBadge status={r.status} /></TableCell>
                    <TableCell>
                      {r.projects.length > 0 ? (
                        <div className="flex items-center gap-1">
                          <Link2 className="h-3 w-3 text-brand" />
                          <Link href={`/dashboard/projects/${r.projects[0].id}`} className="t-caption text-brand hover:underline">
                            {r.projects[0].projectNo}
                          </Link>
                        </div>
                      ) : (
                        <span className="t-caption text-faint-ink">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link href={`/dashboard/investments/${r.id}`}>
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
