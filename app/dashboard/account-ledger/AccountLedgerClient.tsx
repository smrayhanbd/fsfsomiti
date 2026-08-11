"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import AccountSelect from "@/components/AccountSelect"
import {
  accountTypeMeta,
  formatBDT,
  formatDate,
  formatNumber,
  type AccountType,
} from "@/lib/accounting"
import LedgerPrintStatement from "@/app/dashboard/_ledger-print/LedgerPrintStatement"
import type { OrgInfo } from "@/lib/organization"
import {
  Search,
  Download,
  Printer,
  BookOpen,
  ArrowRight,
  Calendar,
} from "lucide-react"

interface PickerAccount {
  id: string
  accountCode: string
  accountName: string
  accountType: AccountType
  currentBalance: number | string
}

interface LedgerLine {
  id: string
  date: string
  voucherNo: string
  narration: string
  voucherType: string
  debit: number
  credit: number
  memo: string | null
}

interface SelectedAccount {
  id: string
  accountCode: string
  accountName: string
  accountType: AccountType
  nature: string
  openingBalance: number | string
  currentBalance: number | string
  currency: string
}

interface Props {
  accounts: PickerAccount[]
  selectedAccountId: string | null
  from: string | null
  to: string | null
  selected: SelectedAccount | null
  openingAtFrom: number | null
  lines: LedgerLine[]
  org: OrgInfo
}

export default function AccountLedgerClient({
  accounts,
  selectedAccountId,
  from,
  to,
  selected,
  openingAtFrom,
  lines,
  org,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  // Local mirror of the filter so typing is smooth; we push to the URL on apply.
  const [accountId, setAccountId] = useState(selectedAccountId || "")
  const [fromDate, setFromDate] = useState(from || "")
  const [toDate, setToDate] = useState(to || "")

  const applyFilter = () => {
    const params = new URLSearchParams(searchParams.toString())
    if (accountId) params.set("accountId", accountId)
    else params.delete("accountId")
    if (fromDate) params.set("from", fromDate)
    else params.delete("from")
    if (toDate) params.set("to", toDate)
    else params.delete("to")
    startTransition(() => router.push(`/dashboard/account-ledger?${params.toString()}`))
  }

  // Build the running-balance rows from the posting lines.
  const rows = useMemo(() => {
    if (!selected) return [] as { line: LedgerLine; balance: number }[]
    const nature = selected.nature
    let running = Number(openingAtFrom ?? selected.openingBalance ?? 0)
    return lines.map((line) => {
      const d = Number(line.debit ?? 0)
      const c = Number(line.credit ?? 0)
      const delta = nature === "DEBIT" ? d - c : c - d
      running += delta
      return { line, balance: running }
    })
  }, [lines, selected, openingAtFrom])

  const totals = useMemo(() => {
    const debit = lines.reduce((s, l) => s + Number(l.debit ?? 0), 0)
    const credit = lines.reduce((s, l) => s + Number(l.credit ?? 0), 0)
    return { debit, credit }
  }, [lines])

  const closingBalance = rows.length
    ? rows[rows.length - 1].balance
    : Number(openingAtFrom ?? selected?.openingBalance ?? 0)

  const handleExport = () => {
    if (!selected) return
    const header = ["Date", "Voucher", "Narration", "Debit", "Credit", "Balance"]
    const data = rows.map(({ line, balance }) => [
      formatDate(line.date),
      line.voucherNo,
      line.narration,
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
    a.download = `ledger-${selected.accountCode}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const meta = selected ? accountTypeMeta(selected.accountType) : null

  // Printable-statement columns/ells — derived from the same `rows` shown on
  // screen so print and screen always agree.
  const printColumns = [
    { key: "date", label: "Date" },
    { key: "voucher", label: "Voucher" },
    { key: "narration", label: "Narration" },
    { key: "debit", label: "Debit", align: "right" as const },
    { key: "credit", label: "Credit", align: "right" as const },
    { key: "balance", label: "Balance", align: "right" as const },
  ]
  const printRows = rows.map(({ line, balance }) => ({
    date: formatDate(line.date),
    voucher: line.voucherNo,
    narration: line.narration,
    debit: line.debit > 0 ? formatNumber(line.debit) : "",
    credit: line.credit > 0 ? formatNumber(line.credit) : "",
    balance: formatNumber(balance),
  }))
  const periodLabel = `${from ? formatDate(from) : "Start"} to ${to ? formatDate(to) : "Today"}`
  const openingNum = Number(openingAtFrom ?? selected?.openingBalance ?? 0)
  const footerLines = selected
    ? [
        `Total Debit : ${formatNumber(totals.debit)} BDT`,
        `Total Credit : ${formatNumber(totals.credit)} BDT`,
        `Opening Balance : ${formatNumber(openingNum)} BDT`,
        `Available Balance as of ${to ? formatDate(to) : formatDate(new Date().toISOString())} : ${formatNumber(closingBalance)} BDT`,
      ]
    : []

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <Card className="ledger-no-print bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl">
        <CardContent className="p-4 grid md:grid-cols-[1fr_180px_180px_auto] gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Account
            </Label>
            <AccountSelect
              accounts={accounts}
              value={accountId}
              onValueChange={setAccountId}
              placeholder="Select an account…"
              renderMeta={(a) => formatBDT((a as PickerAccount).currentBalance)}
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
          <Button
            onClick={applyFilter}
            disabled={!accountId || isPending}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Search className="mr-2 h-4 w-4" /> View
          </Button>
        </CardContent>
      </Card>

      {!selected ? (
        <EmptyState />
      ) : (
        <>
          {/* Account summary header */}
          <Card className={`ledger-no-print ${meta!.chip} bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl`}>
            <CardContent className="p-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta!.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${meta!.dot}`} />
                      {meta!.label}
                    </span>
                    <span className="font-mono text-xs text-slate-400">
                      {selected.accountCode}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    {selected.accountName}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selected.nature === "DEBIT" ? "Debit-natured" : "Credit-natured"} · {selected.currency}
                    {(from || to) && (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {from ? formatDate(from) : "Start"} → {to ? formatDate(to) : "Today"}
                      </span>
                    )}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-4 md:text-right">
                  <Summary
                    label="Opening"
                    value={formatBDT(openingAtFrom ?? selected.openingBalance)}
                  />
                  <Summary
                    label="Movement"
                    value={formatBDT(
                      selected.nature === "DEBIT"
                        ? totals.debit - totals.credit
                        : totals.credit - totals.debit
                    )}
                  />
                  <Summary
                    label="Closing"
                    value={formatBDT(closingBalance)}
                    strong
                  />
                </div>
              </div>
            </CardContent>
          </Card>

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
                    Voucher
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                    Narration
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
                  <TableCell colSpan={3} className="text-slate-500 italic text-xs">
                    Opening balance
                  </TableCell>
                  <TableCell className="text-right text-slate-400">—</TableCell>
                  <TableCell className="text-right text-slate-400">—</TableCell>
                  <TableCell className="text-right font-bold tabular-nums text-slate-700 dark:text-slate-200">
                    {formatBDT(openingAtFrom ?? selected.openingBalance)}
                  </TableCell>
                </TableRow>

                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                      No postings in this period.
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
                        <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                          {line.voucherNo}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-700 dark:text-slate-200">
                          {line.narration}
                        </span>
                        {line.memo && (
                          <span className="block text-[11px] text-slate-400">
                            {line.memo}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                        {line.debit > 0 ? formatBDT(line.debit) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-rose-700 dark:text-rose-400">
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
                  <TableCell colSpan={3} className="text-slate-700 dark:text-slate-200">
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

          {/* Printable statement — revealed only in print via @media print.
              The COA account name appears in the left entity block per the
              requested layout (member info is replaced by the account). */}
          <LedgerPrintStatement
            org={org}
            entity={{
              kind: "ACCOUNT",
              name: selected.accountName,
              code: selected.accountCode,
              type: meta?.label,
            }}
            period={periodLabel}
            columns={printColumns}
            openingCells={["Opening balance", "", "", "", "", formatNumber(openingNum)]}
            rows={printRows}
            closingCells={[
              "Period totals", "", "",
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
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
        {label}
      </p>
      <p
        className={`tabular-nums ${strong ? "text-lg font-extrabold text-slate-900 dark:text-white" : "text-sm font-semibold text-slate-600 dark:text-slate-300"}`}
      >
        {value}
      </p>
    </div>
  )
}

function EmptyState() {
  return (
    <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl">
      <CardContent className="flex flex-col items-center justify-center py-20 text-center">
        <div className="p-4 rounded-full bg-indigo-50 dark:bg-indigo-950/40 mb-4">
          <BookOpen className="h-10 w-10 text-indigo-500" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Select an account to view its ledger
        </h3>
        <p className="text-sm text-slate-500 max-w-sm mt-1">
          Choose any ledger account and optionally a date range to see its
          running-balance statement.
        </p>
      </CardContent>
    </Card>
  )
}
