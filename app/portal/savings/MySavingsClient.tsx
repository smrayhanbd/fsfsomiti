"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Wallet, TrendingUp, TrendingDown, Receipt, Building2,
} from "lucide-react"
import { SAVINGS_TYPE_STYLES, typeLabelFor, type SavingsRow } from "./shared"

interface MemberSummary {
  memberNo: string
  fullName: string
  currentBalance: number
  totalDeposit: number
  totalWithdrawal: number
}

interface Props {
  member: MemberSummary
  savings: SavingsRow[]
  orgName: string
}

// ─── Savings dashboard ──────────────────────────────────────────────────
// Stat cards + full transaction history. Withdrawal requests now live on
// their own page (/portal/withdrawal-request); the ledger statement and
// money receipts live under View Reports (/portal/ledger, /portal/receipts).
export default function MySavingsClient({ member, savings, orgName }: Props) {
  const stats = [
    {
      label: "Current Balance",
      value: `৳ ${member.currentBalance.toLocaleString()}`,
      icon: Wallet,
      color: "text-emerald-600",
      iconBg: "bg-emerald-100 dark:bg-emerald-950/50",
    },
    {
      label: "Total Deposited",
      value: `৳ ${member.totalDeposit.toLocaleString()}`,
      icon: TrendingUp,
      color: "text-blue-600",
      iconBg: "bg-blue-100 dark:bg-blue-950/50",
    },
    {
      label: "Total Withdrawn",
      value: `৳ ${member.totalWithdrawal.toLocaleString()}`,
      icon: TrendingDown,
      color: "text-rose-600",
      iconBg: "bg-rose-100 dark:bg-rose-950/50",
    },
  ]

  // Running balance per row. Savings are newest-first, so walk oldest-first.
  const chronological = [...savings].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )
  let running = 0
  const balanceById = new Map<string, number>()
  for (const s of chronological) {
    running += s.type === "WITHDRAWAL" ? -Number(s.amount) : Number(s.amount)
    balanceById.set(s.id, running)
  }

  return (
    <>
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl"
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 ${stat.iconBg}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500 dark:text-slate-400">
                  {stat.label}
                </p>
                <p className={`text-xl font-extrabold tracking-tight ${stat.color} mt-0.5`}>{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Transaction history */}
      <div className="mt-6">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
              <Receipt className="h-4 w-4 text-indigo-500" /> Transaction History
            </CardTitle>
            <span className="text-xs text-slate-400">{savings.length} records</span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-slate-200/60 dark:border-slate-800/60 hover:bg-transparent">
                    <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Date</TableHead>
                    <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Receipt/Voucher</TableHead>
                    <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Type</TableHead>
                    <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Method</TableHead>
                    <TableHead className="px-6 py-3 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Amount</TableHead>
                    <TableHead className="px-6 py-3 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {savings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                        No transactions yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    savings.map((sav) => (
                      <TableRow
                        key={sav.id}
                        className="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                      >
                        <TableCell className="px-6 py-3 text-sm text-slate-700 dark:text-slate-200">
                          {new Date(sav.date).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-6 py-3 text-sm font-mono text-slate-500">
                          {sav.receiptNo || sav.transactionMirror?.voucherNo || "—"}
                        </TableCell>
                        <TableCell className="px-6 py-3 text-sm">
                          <Badge
                            variant="outline"
                            className={SAVINGS_TYPE_STYLES[sav.type] || "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300"}
                          >
                            {typeLabelFor(sav)}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-6 py-3 text-sm text-slate-500">{sav.method || "—"}</TableCell>
                        <TableCell className={`px-6 py-3 text-right font-bold text-sm ${sav.type === "WITHDRAWAL" ? "text-rose-600" : "text-emerald-600"}`}>
                          {sav.type === "WITHDRAWAL" ? "− " : "+ "}৳ {Number(sav.amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="px-6 py-3 text-right text-sm font-medium text-slate-700 dark:text-slate-200">
                          ৳ {(balanceById.get(sav.id) ?? 0).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Printable statement (only visible when printing the page) */}
      <div className="portal-print-area">
        <div className="portal-statement p-8 max-w-3xl mx-auto">
          <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">{orgName}</h1>
                <p className="text-xs text-slate-500">Member Savings Statement</p>
              </div>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>Generated: {new Date().toLocaleString()}</p>
              <p>Member ID: <span className="font-mono font-semibold">{member.memberNo}</span></p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Member Name</p>
              <p className="text-sm font-semibold text-slate-900">{member.fullName}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Current Balance</p>
              <p className="text-sm font-bold text-emerald-700">৳ {member.currentBalance.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Total Deposited</p>
              <p className="text-sm font-semibold text-slate-900">৳ {member.totalDeposit.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Total Withdrawn</p>
              <p className="text-sm font-semibold text-slate-900">৳ {member.totalWithdrawal.toLocaleString()}</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Date</th>
                <th style={{ textAlign: "left" }}>Receipt</th>
                <th style={{ textAlign: "left" }}>Type</th>
                <th style={{ textAlign: "left" }}>Method</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th style={{ textAlign: "right" }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {[...savings]
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map((sav) => (
                  <tr key={sav.id}>
                    <td>{new Date(sav.date).toLocaleDateString()}</td>
                    <td>{sav.receiptNo || sav.transactionMirror?.voucherNo || "—"}</td>
                    <td>{typeLabelFor(sav)}</td>
                    <td>{sav.method}</td>
                    <td style={{ textAlign: "right" }}>
                      {sav.type === "WITHDRAWAL" ? "− " : "+ "}৳ {Number(sav.amount).toLocaleString()}
                    </td>
                    <td style={{ textAlign: "right" }}>৳ {(balanceById.get(sav.id) ?? 0).toLocaleString()}</td>
                  </tr>
                ))}
            </tbody>
          </table>

          <p className="text-[10px] text-slate-400 mt-8 text-center">
            This is a computer-generated statement. Please contact management for any discrepancies.
          </p>
        </div>
      </div>
    </>
  )
}
