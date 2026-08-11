"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Receipt, Search, Printer, ArrowRight } from "lucide-react"
import { formatBDT, formatDate } from "@/lib/accounting"

interface RecentReceipt {
  id: string
  voucherNo: string
  transactionType: "DEPOSIT" | "WITHDRAWAL"
  amount: number
  transactionDate: string
  member: { memberNo: string; fullName: string } | null
}

export default function ReceiptLookupClient({ recent }: { recent: RecentReceipt[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [query, setQuery] = useState("")

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return toast.error("Enter a voucher number")
    const match = recent.find(
      (r) => r.voucherNo.toLowerCase() === q.toLowerCase() || r.voucherNo.toLowerCase().includes(q.toLowerCase())
    )
    if (match) {
      router.push(`/dashboard/receipts/${match.id}`)
    } else {
      // Not in the recent 20 — attempt server-side resolution by going to a
      // search route. We just route to the receipt detail with a toast hint.
      toast.error("Voucher not found in recent approvals. Use the list below.")
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <Receipt className="h-7 w-7 text-indigo-600" />
          Money Receipts
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
          Look up a voucher and print its money receipt. Only approved deposits and withdrawals have receipts.
        </p>
      </div>

      {/* Lookup */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider text-slate-500">Find by Voucher No</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLookup} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. TR-DEP-000001"
                className="pl-9 bg-white dark:bg-slate-950"
              />
            </div>
            <Button type="submit" disabled={isPending} className="bg-indigo-600 hover:bg-indigo-700">
              <Printer className="h-4 w-4 mr-2" /> Open Receipt
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Recent receipts */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">Recent Approvals</h2>
        <Card className="bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden rounded-2xl">
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Receipt className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                <p className="font-medium">No approved receipts yet</p>
                <p className="text-sm">Approve a deposit or withdrawal to generate a receipt.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {recent.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/dashboard/receipts/${r.id}`}
                      className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <Badge
                        variant="secondary"
                        className={
                          r.transactionType === "DEPOSIT"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                        }
                      >
                        {r.transactionType}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{r.voucherNo}</p>
                        <p className="text-xs text-slate-500">
                          {r.member ? `${r.member.fullName} · ${r.member.memberNo}` : "—"} · {formatDate(r.transactionDate)}
                        </p>
                      </div>
                      <span className="font-bold tabular-nums text-slate-700 dark:text-slate-200">{formatBDT(r.amount)}</span>
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
