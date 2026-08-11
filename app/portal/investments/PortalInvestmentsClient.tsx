"use client"

/**
 * Investments list — member-portal client (read-only).
 *
 * Mirrors the dashboard InvestmentsClient layout (StatCard totals + a filterable
 * table) but without create/edit/CSV-of-internal-data actions. Each row links
 * to a read-only detail page.
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
import { Search, Eye, Gem, Wallet, TrendingUp, TrendingDown } from "lucide-react"

import StatCard from "@/components/somiti/StatCard"
import SectionCard from "@/components/somiti/SectionCard"
import { InvestmentStatusBadge } from "@/components/portfolio/EntityBadges"
import { type InvestmentStatus } from "@/lib/portfolio/types"

interface Row {
  id: string
  investmentNo: string
  name: string
  subCategory: string | null
  costBasis: number
  currentValue: number
  gainLoss: number
  roi: number
  investmentDate: string
  maturityDate: string | null
  status: InvestmentStatus
  type: { id: string; name: string; slug: string }
}

const STATUS_OPTIONS: InvestmentStatus[] = [
  "DRAFT", "ACTIVE", "PARTIALLY_EXITED", "FULLY_EXITED", "MATURED", "SUSPENDED", "WRITTEN_OFF",
]

export default function PortalInvestmentsClient({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<InvestmentStatus | "ALL">("ALL")
  const [returnFilter, setReturnFilter] = useState<"ALL" | "POS" | "NEG">("ALL")

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false
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
  }, [rows, search, statusFilter, returnFilter])

  const stats = useMemo(() => {
    const totalInvested = rows.reduce((s, r) => s + r.costBasis, 0)
    const totalValue = rows.reduce((s, r) => s + r.currentValue, 0)
    const totalGainLoss = totalValue - totalInvested
    const activeCount = rows.filter((r) => r.status === "ACTIVE").length
    return { totalInvested, totalValue, totalGainLoss, activeCount }
  }, [rows])

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Invested" value={formatBDT(stats.totalInvested)} icon={Wallet} accent="blue" />
        <StatCard label="Current Value" value={formatBDT(stats.totalValue)} icon={Gem} accent="violet" />
        <StatCard
          label="Gain / Loss"
          value={formatBDT(stats.totalGainLoss)}
          icon={stats.totalGainLoss >= 0 ? TrendingUp : TrendingDown}
          accent={stats.totalGainLoss >= 0 ? "emerald" : "crimson"}
        />
        <StatCard label="Active Investments" value={stats.activeCount} icon={Gem} accent="gold" />
      </div>

      {/* Filters */}
      <SectionCard bodyClassName="p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint-ink" />
            <Input
              placeholder="Search by no, name, sub-category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[var(--control-bg)] pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as InvestmentStatus | "ALL")}>
            <SelectTrigger className="bg-[var(--control-bg)] md:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={returnFilter} onValueChange={(v) => setReturnFilter(v as "ALL" | "POS" | "NEG")}>
            <SelectTrigger className="bg-[var(--control-bg)] md:w-44"><SelectValue placeholder="Return" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All returns</SelectItem>
              <SelectItem value="POS">Gain only</SelectItem>
              <SelectItem value="NEG">Loss only</SelectItem>
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
                <TableHead className="t-overline px-6 py-3 text-muted-ink">Investment</TableHead>
                <TableHead className="t-overline px-6 py-3 text-muted-ink">Type</TableHead>
                <TableHead className="t-overline px-6 py-3 text-right text-muted-ink">Invested</TableHead>
                <TableHead className="t-overline px-6 py-3 text-right text-muted-ink">Current</TableHead>
                <TableHead className="t-overline px-6 py-3 text-right text-muted-ink">Gain/Loss</TableHead>
                <TableHead className="t-overline px-6 py-3 text-muted-ink">Status</TableHead>
                <TableHead className="t-overline px-6 py-3 text-right text-muted-ink"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow className="border-[var(--border-base)]">
                  <TableCell colSpan={7} className="py-10 text-center t-body text-muted-ink">
                    No investments match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id} className="border-[var(--border-base)] transition-colors last:border-0 hover:bg-subtle">
                    <TableCell className="px-6 py-3">
                      <div className="font-medium text-primary-ink">{r.name}</div>
                      <div className="t-caption font-mono text-muted-ink">{r.investmentNo}</div>
                    </TableCell>
                    <TableCell className="px-6 py-3 t-body text-secondary-ink">
                      {r.type.name}
                      {r.subCategory ? <span className="block t-caption text-muted-ink">{r.subCategory}</span> : null}
                    </TableCell>
                    <TableCell className="px-6 py-3 text-right t-num text-secondary-ink">{formatBDT(r.costBasis)}</TableCell>
                    <TableCell className="px-6 py-3 text-right t-num font-medium text-primary-ink">{formatBDT(r.currentValue)}</TableCell>
                    <TableCell className={`px-6 py-3 text-right t-num font-bold ${r.gainLoss >= 0 ? "text-success" : "text-debit"}`}>
                      {r.gainLoss >= 0 ? "+" : "−"}{formatBDT(Math.abs(r.gainLoss))}
                      <span className="block t-caption font-normal text-muted-ink">
                        {r.roi >= 0 ? "+" : ""}{r.roi.toFixed(2)}%
                      </span>
                    </TableCell>
                    <TableCell className="px-6 py-3"><InvestmentStatusBadge status={r.status} /></TableCell>
                    <TableCell className="px-6 py-3 text-right">
                      <Link href={`/portal/investments/${r.id}`}>
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
