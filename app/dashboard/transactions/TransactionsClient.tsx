"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TransactionStatusBadge } from "@/components/transactions/TransactionStatusBadge"
import { formatBDT, formatDate } from "@/lib/accounting"
import {
  TRANSACTION_TYPE_LABELS,
  SUBTYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  type TransactionType,
  type TransactionStatus,
} from "@/lib/transactions/types"
import {
  Search, Filter, Plus, ArrowDownToLine, ArrowUpFromLine, Receipt,
  PieChart, FileText, Eye, Printer, History,
} from "lucide-react"

import StatCard from "@/components/somiti/StatCard"
import SectionCard from "@/components/somiti/SectionCard"

interface Row {
  id: string
  voucherNo: string
  transactionType: TransactionType
  subType: string
  chargeTypeName: string | null
  status: TransactionStatus
  amount: number
  paymentMethod: string | null
  referenceNo: string | null
  createdAt: string
  approvedAt: string | null
  member: { id: string; memberNo: string; fullName: string } | null
  cashAccountName: string | null
  createdBy: string
}

interface Props {
  rows: Row[]
  members: { id: string; memberNo: string; fullName: string }[]
}

const TYPE_ICON: Record<TransactionType, typeof FileText> = {
  DEPOSIT: ArrowDownToLine,
  WITHDRAWAL: ArrowUpFromLine,
  CHARGE: Receipt,
  INCOME_DISTRIBUTION: PieChart,
}

export default function TransactionsClient({ rows }: Props) {
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<TransactionType | "ALL">("ALL")
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | "ALL">("ALL")

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter !== "ALL" && r.transactionType !== typeFilter) return false
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          r.voucherNo.toLowerCase().includes(q) ||
          (r.referenceNo ?? "").toLowerCase().includes(q) ||
          (r.member?.fullName ?? "").toLowerCase().includes(q) ||
          (r.member?.memberNo ?? "").toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [rows, search, typeFilter, statusFilter])

  const stats = useMemo(() => {
    const approved = rows.filter((r) => r.status === "APPROVED")
    const pending = rows.filter((r) => r.status === "PENDING_APPROVAL")
    const inflow = approved.filter((r) => r.transactionType === "DEPOSIT").reduce((s, r) => s + r.amount, 0)
    const outflow = approved.filter((r) => r.transactionType === "WITHDRAWAL").reduce((s, r) => s + r.amount, 0)
    return { total: rows.length, pending: pending.length, inflow, outflow }
  }, [rows])

  const exportCsv = () => {
    const header = ["Voucher", "Type", "Sub Type", "Status", "Member", "Amount", "Method", "Reference", "Created", "Approved"]
    const body = filtered.map((r) => [
      r.voucherNo, r.transactionType, r.subType, r.status,
      r.member ? `${r.member.memberNo} ${r.member.fullName}` : "",
      r.amount.toFixed(2), r.paymentMethod ?? "", r.referenceNo ?? "",
      r.createdAt, r.approvedAt ?? "",
    ])
    const csv = [header, ...body]
      .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:flex-wrap">
        <div className="min-w-0">
          <h1 className="t-h1 text-primary-ink">Transaction History</h1>
          <p className="t-body mt-1.5 text-muted-ink">Unified ledger of every financial transaction with full audit trail.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
          <Link href="/dashboard/transactions/deposits">
            <Button className="brand-gradient shadow-brand-glow">
              <Plus className="mr-2 h-4 w-4" /> New Transaction
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total" value={stats.total.toLocaleString()} icon={History} accent="blue" />
        <StatCard label="Pending Approval" value={stats.pending.toLocaleString()} icon={Filter} accent="amber" />
        <StatCard label="Approved Inflow" value={formatBDT(stats.inflow)} icon={ArrowDownToLine} accent="emerald" />
        <StatCard label="Approved Outflow" value={formatBDT(stats.outflow)} icon={ArrowUpFromLine} accent="crimson" />
      </div>

      {/* Toolbar */}
      <SectionCard bodyClassName="p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint-ink" />
            <Input
              placeholder="Search voucher, member, reference…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[var(--control-bg)] pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-faint-ink" />
            <Select value={typeFilter} onValueChange={(v) => { if (v) setTypeFilter(v as TransactionType | "ALL") }}>
              <SelectTrigger className="w-40 bg-[var(--control-bg)]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                <SelectItem value="DEPOSIT">Deposit</SelectItem>
                <SelectItem value="WITHDRAWAL">Withdrawal</SelectItem>
                <SelectItem value="CHARGE">Charge</SelectItem>
                <SelectItem value="INCOME_DISTRIBUTION">Income Distribution</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { if (v) setStatusFilter(v as TransactionStatus | "ALL") }}>
              <SelectTrigger className="w-40 bg-[var(--control-bg)]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="PENDING_APPROVAL">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="RETURNED">Returned</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="REVERSED">Reversed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>

      {/* Table */}
      <SectionCard bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-[var(--border-base)] bg-subtle/40 hover:bg-transparent">
              <TableHead className="t-overline text-muted-ink">Voucher</TableHead>
              <TableHead className="t-overline text-muted-ink">Type</TableHead>
              <TableHead className="t-overline text-muted-ink">Member</TableHead>
              <TableHead className="t-overline text-right text-muted-ink">Amount</TableHead>
              <TableHead className="t-overline text-center text-muted-ink">Status</TableHead>
              <TableHead className="t-overline text-muted-ink">Date</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow className="border-[var(--border-base)]">
                <TableCell colSpan={7} className="py-16 text-center">
                  <FileText className="mx-auto mb-2 h-10 w-10 text-faint-ink" />
                  <p className="t-subheading text-primary-ink">No transactions found</p>
                  <p className="t-body text-muted-ink">Create one from the Deposit / Withdrawal / Charge pages.</p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const Icon = TYPE_ICON[r.transactionType] ?? FileText
                return (
                  <TableRow key={r.id} className="border-[var(--border-base)] transition-colors hover:bg-subtle">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-subtle">
                          <Icon className="h-4 w-4 text-muted-ink" />
                        </div>
                        <div>
                          <p className="t-num t-body font-semibold text-primary-ink">{r.voucherNo}</p>
                          {r.paymentMethod && (
                            <p className="t-caption text-muted-ink">
                              {PAYMENT_METHOD_LABELS[r.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] ?? r.paymentMethod}
                              {r.cashAccountName ? ` · ${r.cashAccountName}` : ""}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                        <TableCell>
                          <p className="t-body font-medium text-secondary-ink">{TRANSACTION_TYPE_LABELS[r.transactionType]}</p>
                          <p className="t-caption text-muted-ink">{r.chargeTypeName ?? SUBTYPE_LABELS[r.subType as keyof typeof SUBTYPE_LABELS] ?? r.subType}</p>
                        </TableCell>
                    <TableCell>
                      {r.member ? (
                        <div>
                          <p className="t-body text-secondary-ink">{r.member.fullName}</p>
                          <p className="t-num t-caption text-muted-ink">{r.member.memberNo}</p>
                        </div>
                      ) : (
                        <span className="t-caption text-muted-ink">—</span>
                      )}
                    </TableCell>
                    <TableCell className="t-num text-right font-bold text-primary-ink">{formatBDT(r.amount)}</TableCell>
                    <TableCell className="text-center">
                      <TransactionStatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="t-body text-muted-ink">{formatDate(r.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/dashboard/transactions/${r.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="View details">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        {r.status === "APPROVED" && (r.transactionType === "DEPOSIT" || r.transactionType === "WITHDRAWAL") && (
                          <Link href={`/dashboard/receipts/${r.id}`}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-brand hover:bg-brand-gradient-soft" title="Print money receipt">
                              <Printer className="h-4 w-4" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  )
}
