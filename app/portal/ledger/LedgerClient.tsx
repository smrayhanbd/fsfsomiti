"use client"

import { useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { FileText, Download, Calendar, Printer, Search } from "lucide-react"
import { formatBDT, formatDate, formatNumber } from "@/lib/accounting"
import LedgerPrintStatement from "@/app/dashboard/_ledger-print/LedgerPrintStatement"
import type { OrgInfo } from "@/lib/organization"
import { SAVINGS_TYPE_STYLES, type SavingsRow } from "../savings/shared"

interface LedgerMember {
  memberNo: string
  fullName: string
  phone: string
  email: string | null
  address: string | null
  earliestDate: string
}

interface Props {
  member: LedgerMember
  savings: SavingsRow[]
  org: OrgInfo
}

// ─── Member ledger statement ────────────────────────────────────────────
// Ports the admin dashboard's MemberLedgerClient UI into the member portal.
// Per spec: remove the member picker + member-summary header + the all-time
// stat cards. KEEP the date-range filter bar, the toolbar (Print + Export
// CSV), and the 8-column running-balance statement table.
// Previously the "View Ledger" tab on /portal/savings; now a standalone
// page under the View Reports menu.
export default function LedgerClient({ member, savings, org }: Props) {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const earliestStr = new Date(member.earliestDate).toISOString().slice(0, 10)

  const [from, setFrom] = useState<string>(earliestStr)
  const [to, setTo] = useState<string>(todayStr)
  // Has the member clicked "Generate" yet? Until then, the on-screen table
  // area shows a prompt instead of the statement.
  const [generated, setGenerated] = useState(false)

  // Running-balance computation — mirrors admin's `rows` + `totals` useMemo.
  // Walks savings oldest-first, threads an accumulator from `openingAtFrom`.
  const { rows, totals, openingAtFrom, closingBalance } = useMemo(() => {
    const fromTime = from ? new Date(from).getTime() : null
    const toDate = to ? new Date(to) : null
    if (toDate) toDate.setHours(23, 59, 59, 999)
    const toTime = toDate ? toDate.getTime() : null

    const chronological = [...savings].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    // Opening balance = sum of all movement BEFORE `from`.
    let opening = 0
    for (const s of chronological) {
      const t = new Date(s.date).getTime()
      if (fromTime !== null && t >= fromTime) break
      opening += s.type === "WITHDRAWAL" ? -Number(s.amount) : Number(s.amount)
    }

    // In-window rows + running balance.
    let running = opening
    let totalDebit = 0
    let totalCredit = 0
    const inWindow: {
      line: SavingsRow
      typeLabel: string
      description: string
      ref: string
      method: string
      debit: number
      credit: number
      balance: number
    }[] = []
    for (const s of chronological) {
      const t = new Date(s.date).getTime()
      if (fromTime !== null && t < fromTime) continue
      if (toTime !== null && t > toTime) continue

      const amount = Number(s.amount)
      const isWithdrawal = s.type === "WITHDRAWAL"
      const debit = isWithdrawal ? amount : 0
      const credit = isWithdrawal ? 0 : amount
      running += credit - debit
      totalDebit += debit
      totalCredit += credit

      const mirror = s.transactionMirror
      const breakdown = mirror?.breakdown as { collectionTypeName?: string } | null
      const typeLabel =
        breakdown?.collectionTypeName?.trim() ||
        mirror?.chargeTypeName?.trim() ||
        s.type.replace("_", " ")
      const remarks = mirror?.remarks?.trim() || ""
      const referenceNo = mirror?.referenceNo?.trim() || ""
      const description = [remarks, referenceNo ? `Ref: ${referenceNo}` : ""]
        .filter(Boolean)
        .join(" | ")
      const ref = s.receiptNo || mirror?.voucherNo || ""
      // Humanize the method label (BANK_TRANSFER → Bank Transfer).
      const method = s.method
        ? s.method.toLowerCase().replace(/_+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : "—"

      inWindow.push({ line: s, typeLabel, description, ref, method, debit, credit, balance: running })
    }

    const close = opening + totalCredit - totalDebit
    return {
      rows: inWindow,
      totals: { debit: totalDebit, credit: totalCredit },
      openingAtFrom: opening,
      closingBalance: close,
    }
  }, [savings, from, to])

  const periodLabel = `${from ? formatDate(from) : "Start"} to ${to ? formatDate(to) : "Today"}`

  const handleGenerate = () => {
    if (from && to && new Date(from) > new Date(to)) {
      toast.error("Invalid date range", {
        description: "The start date must be on or before the end date.",
      })
      return
    }
    setGenerated(true)
    toast.success("Ledger generated", {
      description: `${rows.length} transactions for ${periodLabel}.`,
    })
  }

  // Export CSV — mirrors admin's `handleExport` so members get the same
  // column order (Date / Receipt-Voucher / Description / Type / Method /
  // Debit / Credit / Balance) as the on-screen table.
  const handleExport = () => {
    const header = [
      "Date",
      "Receipt/Voucher",
      "Description",
      "Type",
      "Method",
      "Withdrawal",
      "Deposit",
      "Balance",
    ]
    const data = rows.map(({ line, typeLabel, description, ref, method, debit, credit, balance }) => [
      formatDate(line.date),
      ref || "",
      description || "",
      typeLabel,
      method,
      debit.toFixed(2),
      credit.toFixed(2),
      balance.toFixed(2),
    ])
    const csv = [header, ...data]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `ledger-${member.memberNo}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const resetFilter = () => {
    setFrom(earliestStr)
    setTo(todayStr)
    setGenerated(false)
  }

  // Printable-statement columns/cells — derived from the same `rows` shown on
  // screen so the on-screen table, the browser-print output, and the pdfkit
  // PDF all agree. Mirrors admin's `printColumns` + `printRows` + `footerLines`.
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
  const printRows = rows.map(({ line, typeLabel, description, ref, method, debit, credit, balance }) => ({
    date: formatDate(line.date),
    desc: description || "—",
    ref: ref || "—",
    type: typeLabel,
    method,
    withdrawal: debit > 0 ? formatNumber(debit) : "",
    deposit: credit > 0 ? formatNumber(credit) : "",
    balance: formatNumber(balance),
  }))
  const footerLines = [
    `Total Withdrawal : ${formatNumber(totals.debit)} BDT`,
    `Total Deposit : ${formatNumber(totals.credit)} BDT`,
    `Opening Balance : ${formatNumber(openingAtFrom)} BDT`,
    `Closing Balance as of ${to ? formatDate(to) : formatDate(new Date().toISOString())} : ${formatNumber(closingBalance)} BDT`,
  ]

  return (
    <div className="space-y-6">
      {/* On-screen section — hidden during print via `ledger-no-print`. */}
      <div className="ledger-no-print space-y-6">
      {/* Filter bar — mirrors admin's filter card but WITHOUT the member picker
          (the member is always the logged-in user). Keeps From / To / Generate / Reset.
          No min/max constraints so the member can pick any date freely. */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl">
        <CardContent className="p-4 grid md:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              From
            </Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setGenerated(false) }}
              className="bg-white dark:bg-slate-950"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              To
            </Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setGenerated(false) }}
              className="bg-white dark:bg-slate-950"
            />
          </div>
          <Button onClick={handleGenerate} className="bg-indigo-600 hover:bg-indigo-700">
            <Search className="mr-2 h-4 w-4" /> Generate
          </Button>
          <Button variant="outline" onClick={resetFilter}>
            Reset
          </Button>
        </CardContent>
      </Card>

      {/* Toolbar — shown only after the member clicks "Generate".
          Print / Save as PDF (browser-native, matches admin exactly) +
          Export CSV. No pdfkit "Download PDF" button — the browser print
          output is the canonical PDF. */}
      {generated && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={rows.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={rows.length === 0}>
            <Printer className="mr-2 h-4 w-4" /> Print / Save as PDF
          </Button>
        </div>
      )}

      {/* Running-balance ledger — shown only after "Generate" is clicked.
          8-column table matching admin's design.
          Opening row (italic) → movement rows → period totals row (bold). */}
      {generated ? (
        <>
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-500" />
            <span className="text-sm font-semibold text-slate-800 dark:text-white">
              Ledger Statement
            </span>
          </div>
          <span className="text-xs text-slate-400 inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {periodLabel}
          </span>
        </div>
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
                Withdrawal
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                Deposit
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
                ৳ {openingAtFrom.toLocaleString()}
              </TableCell>
            </TableRow>

            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                  No transactions in this period.
                </TableCell>
              </TableRow>
            ) : (
              rows.map(({ line, typeLabel, description, ref, method, debit, credit, balance }) => (
                <TableRow
                  key={line.id}
                  className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                >
                  <TableCell className="text-xs text-slate-500">
                    {formatDate(line.date)}
                  </TableCell>
                  <TableCell>
                    {ref ? (
                      <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                        {ref}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                    {description ? (
                      <span className="whitespace-pre-wrap break-words">{description}</span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[10px] py-0 px-1.5 ${
                        SAVINGS_TYPE_STYLES[line.type] ??
                        "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300"
                      }`}
                    >
                      {typeLabel}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">{method}</TableCell>
                  <TableCell className="text-right tabular-nums text-rose-700 dark:text-rose-400">
                    {debit > 0 ? formatBDT(debit) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                    {credit > 0 ? formatBDT(credit) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-bold tabular-nums text-slate-900 dark:text-white">
                    {formatBDT(balance)}
                  </TableCell>
                </TableRow>
              ))
            )}

            {/* Period totals row */}
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
                {formatBDT(closingBalance)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>

      {/* Footer summary — mirrors admin's `footerLines` block. */}
      <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1 px-1">
        <div>Total Withdrawal : {formatBDT(totals.debit)}</div>
        <div>Total Deposit : {formatBDT(totals.credit)}</div>
        <div>Opening Balance : {formatBDT(openingAtFrom)}</div>
        <div className="font-bold">
          Closing Balance as of {to ? formatDate(to) : formatDate(new Date().toISOString())} : {formatBDT(closingBalance)}
        </div>
      </div>
        </>
      ) : (
        <Card className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 shadow-sm rounded-2xl">
          <CardContent className="p-12 text-center">
            <FileText className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
            <p className="font-medium text-slate-700 dark:text-slate-200">No statement generated yet</p>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              Pick a date range above and click <strong>Generate</strong> to view your ledger statement here.
              Then use <strong>Print / Save as PDF</strong> to save a copy.
            </p>
          </CardContent>
        </Card>
      )}
      </div>

      {/* Printable statement — revealed ONLY in print via @media print.
          This is the EXACT SAME component the admin panel uses
          (`app/dashboard/_ledger-print/LedgerPrintStatement.tsx`), so the
          browser's "Save as PDF" output is pixel-identical to what an admin
          prints from `/dashboard/member-ledger`. Only rendered after the
          member clicks "Generate" so an accidental Ctrl+P doesn't print an
          empty statement. */}
      {generated && (
        <LedgerPrintStatement
          org={org}
          entity={{
            kind: "MEMBER",
            name: `${member.fullName} (${member.memberNo})`,
            phone: member.phone,
            email: member.email,
            address: member.address,
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
      )}
    </div>
  )
}
