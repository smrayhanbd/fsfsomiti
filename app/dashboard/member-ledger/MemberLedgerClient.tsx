"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
import MemberSelect, { type FlatMember } from "@/components/MemberSelect"
import { formatBDT, formatDate, formatNumber, humanizeEnum } from "@/lib/accounting"
import LedgerPrintStatement from "@/app/dashboard/_ledger-print/LedgerPrintStatement"
import type { OrgInfo } from "@/lib/organization"
import {
  Search,
  Download,
  Printer,
  Users,
  ArrowRight,
  Calendar,
  Wallet,
  TrendingUp,
  TrendingDown,
  Landmark,
  ExternalLink,
} from "lucide-react"

interface LedgerLine {
  id: string
  date: string
  receiptNo: string | null
  type: string
  method: string
  amount: number
  debit: number
  credit: number
  voucherNo: string | null
  /**
   * Human-readable label for the on-screen + print "Type" column.
   * Resolved by the server page from the linked Transaction's
   * breakdown.collectionTypeName → chargeTypeName → savings.type, so a
   * deposit saved as "Membership Deposit" shows up as "Membership Deposit"
   * instead of the hard-coded "Monthly".
   */
  typeLabel: string
  /**
   * Combination of Remarks + Reference Number from the linked Transaction,
   * e.g. "Quarterly savings | Ref: TXN-12345". Empty string when neither
   * is set; the cell then renders an em-dash placeholder.
   */
  description: string
}

interface SelectedMember {
  id: string
  memberNo: string
  fullName: string
  phone: string
  email: string | null
  photoUrl: string | null
  status: string
  membershipDate: string
  address: string | null
}

interface LoanSummary {
  principal: number
  outstanding: number
  paid: number
  activeCount: number
}

interface Props {
  members: FlatMember[]
  selectedMemberId: string | null
  from: string | null
  to: string | null
  typeFilter: string | null
  availableTypes: string[]
  selected: SelectedMember | null
  openingAtFrom: number
  totalDepositsAllTime: number
  totalWithdrawalsAllTime: number
  loanSummary: LoanSummary | null
  lines: LedgerLine[]
  org: OrgInfo
}

// Color coding per savings type (consistent with portal/savings styles).
const TYPE_STYLES: Record<string, string> = {
  WITHDRAWAL:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400",
  FINE: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400",
  PENALTY:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400",
  LOAN_PAYMENT:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400",
  DONATION:
    "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-400",
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400",
  PENDING:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400",
  SUSPENDED:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400",
  INACTIVE:
    "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300",
  CLOSED:
    "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300",
  DECEASED:
    "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300",
  REJECTED:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400",
}

export default function MemberLedgerClient({
  members,
  selectedMemberId,
  from,
  to,
  typeFilter,
  availableTypes,
  selected,
  openingAtFrom,
  totalDepositsAllTime,
  totalWithdrawalsAllTime,
  loanSummary,
  lines,
  org,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  // Local mirrors of the filters so typing is smooth; we push to the URL on apply.
  const [memberId, setMemberId] = useState(selectedMemberId || "")
  const [fromDate, setFromDate] = useState(from || "")
  const [toDate, setToDate] = useState(to || "")
  const [type, setType] = useState(typeFilter || "ALL")

  const applyFilter = () => {
    const params = new URLSearchParams(searchParams.toString())
    if (memberId) params.set("memberId", memberId)
    else params.delete("memberId")
    if (fromDate) params.set("from", fromDate)
    else params.delete("from")
    if (toDate) params.set("to", toDate)
    else params.delete("to")
    if (type && type !== "ALL") params.set("type", type)
    else params.delete("type")
    startTransition(() =>
      router.push(`/dashboard/member-ledger?${params.toString()}`)
    )
  }

  const resetFilter = () => {
    setMemberId("")
    setFromDate("")
    setToDate("")
    setType("ALL")
    startTransition(() => router.push(`/dashboard/member-ledger`))
  }

  // Running balance: credits add, debits (withdrawals) subtract. Built via
  // reduce so the accumulator is threaded through without reassigning a
  // closure variable (satisfies react-hooks/immutability).
  const rows = useMemo(() => {
    const acc = lines.reduce(
      (state, line) => {
        const balance =
          state.running + Number(line.credit ?? 0) - Number(line.debit ?? 0)
        state.out.push({ line, balance })
        state.running = balance
        return state
      },
      { running: openingAtFrom, out: [] as { line: LedgerLine; balance: number }[] }
    )
    return acc.out
  }, [lines, openingAtFrom])

  const totals = useMemo(() => {
    const debit = lines.reduce((s, l) => s + Number(l.debit ?? 0), 0)
    const credit = lines.reduce((s, l) => s + Number(l.credit ?? 0), 0)
    return { debit, credit }
  }, [lines])

  const closingBalance = rows.length
    ? rows[rows.length - 1].balance
    : openingAtFrom

  const handleExport = () => {
    if (!selected) return
    const header = [
      "Date",
      "Receipt/Voucher",
      "Description",
      "Type",
      "Method",
      "Debit",
      "Credit",
      "Balance",
    ]
    const data = rows.map(({ line, balance }) => [
      formatDate(line.date),
      line.receiptNo || line.voucherNo || "",
      line.description || "",
      line.typeLabel,
      line.method,
      line.debit.toFixed(2),
      line.credit.toFixed(2),
      balance.toFixed(2),
    ])
    const csv = [header, ...data]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `member-ledger-${selected.memberNo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const currentBalanceAllTime = totalDepositsAllTime - totalWithdrawalsAllTime

  // Printable-statement columns/cells, derived from the same `rows` shown
  // on screen so print and screen always agree.
  const printColumns = [
    { key: "date", label: "Date" },
    { key: "desc", label: "Description" },
    { key: "ref", label: "Receipt / Voucher" },
    { key: "type", label: "Type" },
    { key: "method", label: "Method" },
    { key: "withdrawal", label: "Withdrawal", align: "right" as const },
    { key: "deposit", label: "Deposit", align: "right" as const },
    { key: "balance", label: "Balance", align: "right" as const },
  ]
  const printRows = rows.map(({ line, balance }) => ({
    date: formatDate(line.date),
    // Description column = combination of Remarks + Reference Number (with a
    // "Ref:" prefix on the reference). Falls back to an em-dash when neither
    // is set so the cell is never visually empty.
    desc: line.description || "—",
    ref: line.receiptNo || line.voucherNo || "—",
    // Use the resolved deposit-type name (e.g. "Membership Deposit") rather
    // than the raw savings.type ("MONTHLY").
    type: line.typeLabel,
    method: humanizeEnum(line.method),
    withdrawal: line.debit > 0 ? formatNumber(line.debit) : "",
    deposit: line.credit > 0 ? formatNumber(line.credit) : "",
    balance: formatNumber(balance),
  }))
  const periodLabel = `${from ? formatDate(from) : "Start"} to ${to ? formatDate(to) : "Today"}`
  const footerLines = [
    `Total Withdrawal : ${formatNumber(totals.debit)} BDT`,
    `Total Deposit : ${formatNumber(totals.credit)} BDT`,
    `Opening Balance : ${formatNumber(openingAtFrom)} BDT`,
    `Available Balance as of ${to ? formatDate(to) : formatDate(new Date().toISOString())} : ${formatNumber(closingBalance)} BDT`,
  ]

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <Card className="ledger-no-print bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl">
        <CardContent className="p-4 grid md:grid-cols-[1fr_180px_180px_160px_auto] gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Member
            </Label>
            <MemberSelect
              members={members}
              value={memberId}
              onValueChange={setMemberId}
              placeholder="Select a member…"
              className="w-full h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              From
            </Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-white dark:bg-slate-950"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              To
            </Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-white dark:bg-slate-950"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Type
            </Label>
            <Select value={type} onValueChange={(v) => setType((v as string) ?? "ALL")}>
              <SelectTrigger className="bg-white dark:bg-slate-950 w-full">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All types</SelectItem>
                {availableTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {humanizeEnum(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={applyFilter}
              disabled={!memberId || isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              <Search className="mr-2 h-4 w-4" /> View
            </Button>
            <Button variant="outline" onClick={resetFilter} disabled={isPending}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {!selected ? (
        <EmptyState />
      ) : (
        <>
          {/* Member summary header */}
          <Card className="ledger-no-print bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl">
            <CardContent className="p-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center shrink-0">
                    <Users className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          STATUS_STYLES[selected.status] ?? STATUS_STYLES.INACTIVE
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                        {humanizeEnum(selected.status)}
                      </span>
                      <span className="font-mono text-xs text-slate-400">
                        {selected.memberNo}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                      {selected.fullName}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selected.phone}
                      {selected.email ? ` · ${selected.email}` : ""}
                      <span className="ml-2 inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Member since {formatDate(selected.membershipDate)}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/members/${selected.id}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" /> Member profile
                  </Link>
                </div>
              </div>

              {/* Opening / Movement / Closing row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-5 border-t border-slate-100 dark:border-slate-800/60">
                <Summary
                  label="Opening"
                  value={formatBDT(openingAtFrom)}
                />
                <Summary
                  label="Inflow (credit)"
                  value={formatBDT(totals.credit)}
                  tone="emerald"
                />
                <Summary
                  label="Outflow (debit)"
                  value={formatBDT(totals.debit)}
                  tone="rose"
                />
                <Summary
                  label="Closing"
                  value={formatBDT(closingBalance)}
                  strong
                />
                {(from || to) && (
                  <p className="col-span-full text-[11px] text-slate-400 inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Period: {from ? formatDate(from) : "Start"} →{" "}
                    {to ? formatDate(to) : "Today"}
                    {typeFilter && typeFilter !== "ALL" && (
                      <Badge
                        variant="outline"
                        className="ml-2 text-[10px] py-0 px-1.5"
                      >
                        Type: {humanizeEnum(typeFilter)}
                      </Badge>
                    )}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* All-time snapshot stat cards */}
          <div className="ledger-no-print grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Current Balance"
              value={formatBDT(currentBalanceAllTime)}
              icon={Wallet}
              color="text-emerald-600"
              iconBg="bg-emerald-100 dark:bg-emerald-950/50"
            />
            <StatCard
              label="Total Deposited"
              value={formatBDT(totalDepositsAllTime)}
              icon={TrendingUp}
              color="text-blue-600"
              iconBg="bg-blue-100 dark:bg-blue-950/50"
            />
            <StatCard
              label="Total Withdrawn"
              value={formatBDT(totalWithdrawalsAllTime)}
              icon={TrendingDown}
              color="text-rose-600"
              iconBg="bg-rose-100 dark:bg-rose-950/50"
            />
            <StatCard
              label={loanSummary ? "Loan Outstanding" : "Loan Outstanding"}
              value={formatBDT(loanSummary?.outstanding ?? 0)}
              icon={Landmark}
              color="text-amber-600"
              iconBg="bg-amber-100 dark:bg-amber-950/50"
              hint={
                loanSummary
                  ? `${loanSummary.activeCount} active loan${
                      loanSummary.activeCount > 1 ? "s" : ""
                    }`
                  : "No active loans"
              }
            />
          </div>

          {/* Toolbar */}
          <div className="ledger-no-print flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
          </div>

          {/* Running-balance ledger */}
          <Card className="ledger-no-print bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/50 hover:bg-transparent">
                  <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                    Date
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                    Receipt / Voucher
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                    Description
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                    Type
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                    Method
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                    Debit
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                    Credit
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                    Balance
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Opening row */}
                <TableRow className="bg-slate-50/60 dark:bg-slate-900/40 font-medium">
                  <TableCell colSpan={5} className="text-slate-500 italic text-xs">
                    Opening balance
                  </TableCell>
                  <TableCell className="text-right text-slate-400">—</TableCell>
                  <TableCell className="text-right text-slate-400">—</TableCell>
                  <TableCell className="text-right font-bold tabular-nums text-slate-700 dark:text-slate-200">
                    {formatBDT(openingAtFrom)}
                  </TableCell>
                </TableRow>

                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                      No transactions in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map(({ line, balance }) => (
                    <TableRow
                      key={line.id}
                      className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                    >
                      <TableCell className="text-xs text-slate-500">
                        {formatDate(line.date)}
                      </TableCell>
                      <TableCell>
                        {line.receiptNo || line.voucherNo ? (
                          <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                            {line.receiptNo || line.voucherNo}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                        {line.description ? (
                          <span className="whitespace-pre-wrap break-words">
                            {line.description}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] py-0 px-1.5 ${
                            TYPE_STYLES[line.type] ??
                            "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300"
                          }`}
                        >
                          {line.typeLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {humanizeEnum(line.method)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-rose-700 dark:text-rose-400">
                        {line.debit > 0 ? formatBDT(line.debit) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                        {line.credit > 0 ? formatBDT(line.credit) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatBDT(balance)}
                      </TableCell>
                    </TableRow>
                  ))
                )}

                {/* Totals row */}
                <TableRow className="border-t-2 border-slate-200 dark:border-slate-700 font-bold bg-slate-50/80 dark:bg-slate-900/60">
                  <TableCell colSpan={5} className="text-slate-700 dark:text-slate-200">
                    Period totals
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-slate-900 dark:text-white">
                    {formatBDT(totals.debit)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-slate-900 dark:text-white">
                    {formatBDT(totals.credit)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-slate-900 dark:text-white">
                    <span className="inline-flex items-center gap-1">
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                      {formatBDT(closingBalance)}
                    </span>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>

          {/* Printable statement — revealed only in print via @media print. */}
          <LedgerPrintStatement
            org={org}
            entity={{
              kind: "MEMBER",
              name: `${selected.fullName} (${selected.memberNo})`,
              phone: selected.phone,
              email: selected.email,
              address: selected.address,
            }}
            period={periodLabel}
            columns={printColumns}
            openingCells={[
              "Opening balance", "", "", "", "", "", "",
              formatNumber(openingAtFrom),
            ]}
            rows={printRows}
            closingCells={[
              "Period totals", "", "", "", "",
              formatNumber(totals.debit),
              formatNumber(totals.credit),
              formatNumber(closingBalance),
            ]}
            footerLines={footerLines}
          />
        </>
      )}
    </div>
  )
}

function Summary({
  label,
  value,
  tone,
  strong,
}: {
  label: string
  value: string
  tone?: "emerald" | "rose"
  strong?: boolean
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "rose"
      ? "text-rose-700 dark:text-rose-400"
      : "text-slate-600 dark:text-slate-300"
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
        {label}
      </p>
      <p
        className={`tabular-nums ${
          strong
            ? "text-lg font-extrabold text-slate-900 dark:text-white"
            : `text-sm font-semibold ${toneClass}`
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  iconBg,
  hint,
}: {
  label: string
  value: string
  icon: React.ElementType
  color: string
  iconBg: string
  hint?: string
}) {
  return (
    <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl">
      <CardContent className="p-5 flex items-center gap-4">
        <div
          className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 ${iconBg}`}
        >
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className={`text-xl font-extrabold tracking-tight ${color} mt-0.5`}>
            {value}
          </p>
          {hint && (
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">{hint}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyState() {
  return (
    <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl">
      <CardContent className="flex flex-col items-center justify-center py-20 text-center">
        <div className="p-4 rounded-full bg-indigo-50 dark:bg-indigo-950/40 mb-4">
          <Users className="h-10 w-10 text-indigo-500" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Select a member to view their ledger
        </h3>
        <p className="text-sm text-slate-500 max-w-sm mt-1">
          Choose any member and optionally a date range or transaction type to
          see a running-balance statement of their savings activity.
        </p>
      </CardContent>
    </Card>
  )
}
