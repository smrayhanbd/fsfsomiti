"use client"

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
  AlertCircle, CheckCircle2, Receipt, ArrowDownToLine, Lock,
} from "lucide-react"
import { SAVINGS_TYPE_STYLES, isReceiptEligible, typeLabelFor, type SavingsRow } from "../savings/shared"

interface Props {
  savings: SavingsRow[]
}

// ─── Money-receipt voucher list ─────────────────────────────────────────
// Previously the "Money Receipts" tab on /portal/savings; now a standalone
// page under the View Reports menu.
export default function ReceiptsClient({ savings }: Props) {
  const eligible = savings.filter(isReceiptEligible)
  const ineligible = savings.filter((s) => !isReceiptEligible(s))

  return (
    <div className="space-y-6">
      {/* Header card with summary + policy note */}
      <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
            <Receipt className="h-4 w-4 text-emerald-500" />
            Money Receipt Vouchers
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Each approved deposit or withdrawal has a printable money-receipt voucher.
            Click <strong>View Receipt</strong> to open the voucher, then use
            <strong> Print / Save as PDF</strong> to save a copy — identical to what the admin prints.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400">
              <ArrowDownToLine className="h-3 w-3 mr-1" />
              {eligible.length} available
            </Badge>
            <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300">
              {savings.length} total transactions
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Eligible transactions table */}
      <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4 flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Approved Transactions
          </CardTitle>
          <span className="text-xs text-slate-400">{eligible.length} receipts available</span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-200/60 dark:border-slate-800/60 hover:bg-transparent">
                  <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Date</TableHead>
                  <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Voucher No</TableHead>
                  <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Type</TableHead>
                  <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Method</TableHead>
                  <TableHead className="px-6 py-3 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Amount</TableHead>
                  <TableHead className="px-6 py-3 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eligible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                      <div className="flex flex-col items-center gap-2">
                        <AlertCircle className="h-6 w-6 text-slate-300" />
                        <span>No approved deposit or withdrawal transactions yet.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  eligible.map((sav) => {
                    const mirror = sav.transactionMirror!
                    return (
                      <TableRow
                        key={sav.id}
                        className="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                      >
                        <TableCell className="px-6 py-3 text-sm text-slate-700 dark:text-slate-200">
                          {new Date(sav.date).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-6 py-3 text-sm font-mono text-slate-500">
                          {mirror.voucherNo}
                        </TableCell>
                        <TableCell className="px-6 py-3 text-sm">
                          <Badge
                            variant="outline"
                            className={
                              sav.type === "WITHDRAWAL"
                                ? SAVINGS_TYPE_STYLES.WITHDRAWAL
                                : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400"
                            }
                          >
                            {typeLabelFor(sav)}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-6 py-3 text-sm text-slate-500">
                          {sav.method || "—"}
                        </TableCell>
                        <TableCell className={`px-6 py-3 text-right font-bold text-sm ${sav.type === "WITHDRAWAL" ? "text-rose-600" : "text-emerald-600"}`}>
                          {sav.type === "WITHDRAWAL" ? "− " : "+ "}৳ {Number(sav.amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="px-6 py-3 text-right">
                          <Link href={`/portal/receipts/${mirror.id}`}>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                            >
                              <Receipt className="h-3.5 w-3.5" />
                              View Receipt
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Other transactions (no receipt available) — collapsed, low-emphasis */}
      {ineligible.length > 0 && (
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden opacity-80">
          <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
              <Lock className="h-4 w-4 text-slate-400" />
              Other Transactions
            </CardTitle>
            <span className="text-xs text-slate-400">{ineligible.length} records · no receipt available</span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-slate-200/60 dark:border-slate-800/60 hover:bg-transparent">
                    <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Date</TableHead>
                    <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Receipt/Voucher</TableHead>
                    <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Type</TableHead>
                    <TableHead className="px-6 py-3 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Amount</TableHead>
                    <TableHead className="px-6 py-3 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ineligible.map((sav) => {
                    const mirror = sav.transactionMirror
                    const status = mirror?.status || sav.type
                    return (
                      <TableRow
                        key={sav.id}
                        className="border-b border-slate-100 dark:border-slate-800/50 last:border-0"
                      >
                        <TableCell className="px-6 py-3 text-sm text-slate-700 dark:text-slate-200">
                          {new Date(sav.date).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-6 py-3 text-sm font-mono text-slate-500">
                          {sav.receiptNo || mirror?.voucherNo || "—"}
                        </TableCell>
                        <TableCell className="px-6 py-3 text-sm">
                          <Badge
                            variant="outline"
                            className={SAVINGS_TYPE_STYLES[sav.type] || "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300"}
                          >
                            {typeLabelFor(sav)}
                          </Badge>
                        </TableCell>
                        <TableCell className={`px-6 py-3 text-right font-bold text-sm ${sav.type === "WITHDRAWAL" ? "text-rose-600" : "text-emerald-600"}`}>
                          {sav.type === "WITHDRAWAL" ? "− " : "+ "}৳ {Number(sav.amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="px-6 py-3 text-right">
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                            <Lock className="h-3 w-3" />
                            {status}
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
