"use client"

import { useState, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import { createTransaction } from "@/app/actions/transactions"
import { toast } from "sonner"
import { formatBDT } from "@/lib/accounting"
import { PieChart, Send, Info } from "lucide-react"
import type { TransactionSubType } from "@/lib/transactions/types"

interface Props {
  members: { id: string; memberNo: string; fullName: string; avgDailyBalance: number }[]
}

const INCOME_SOURCES: { value: TransactionSubType; label: string }[] = [
  { value: "PROJECT_PROFIT", label: "Project Profit" },
  { value: "BANK_INTEREST", label: "Bank Interest" },
  { value: "INVESTMENT_INCOME", label: "Investment Income" },
  { value: "DIVIDEND", label: "Dividend" },
  { value: "OTHER_INCOME", label: "Other Income" },
]

export default function DistributionForm({ members }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [source, setSource] = useState<TransactionSubType>("PROJECT_PROFIT")
  const [period, setPeriod] = useState("MONTHLY")
  const [totalIncome, setTotalIncome] = useState("")

  const eligible = useMemo(
    () => members.filter((m) => m.avgDailyBalance > 0),
    [members]
  )
  const totalWeight = useMemo(
    () => eligible.reduce((s, m) => s + m.avgDailyBalance, 0),
    [eligible]
  )

  const shares = useMemo(() => {
    const total = parseFloat(totalIncome) || 0
    if (total <= 0 || totalWeight <= 0) return []
    return eligible
      .map((m) => ({
        ...m,
        weight: m.avgDailyBalance / totalWeight,
        amount: (m.avgDailyBalance / totalWeight) * total,
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [eligible, totalWeight, totalIncome])

  const handleSubmit = () => {
    const total = parseFloat(totalIncome)
    if (!total || total <= 0) return toast.error("Enter a valid total income amount")
    if (shares.length === 0) return toast.error("No eligible members with balance activity")

    startTransition(async () => {
      let ok = 0
      let failed = 0
      for (const s of shares) {
        const res = await createTransaction({
          transactionType: "INCOME_DISTRIBUTION",
          subType: source,
          memberId: s.id,
          amount: Math.round(s.amount * 100) / 100,
          remarks: `${source} distribution for period ${period}`,
        })
        if (res.ok) ok++
        else failed++
      }
      if (failed > 0) toast.warning(`${ok} created, ${failed} failed`)
      else toast.success(`${ok} distribution transactions created as drafts`)
      router.push("/dashboard/transactions")
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <PieChart className="h-7 w-7 text-indigo-600" />
          Income Distribution
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
          Distribute profits fairly using average daily balance (spec §8
          recommended method).
        </p>
      </div>

      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider text-slate-500">
            Distribution Source
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Income Source *</Label>
            <Select value={source} onValueChange={(v) => { if (v) setSource(v as TransactionSubType) }}>
              <SelectTrigger className="bg-white dark:bg-slate-950">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INCOME_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Distribution Period *</Label>
            <Select value={period} onValueChange={(v) => { if (v) setPeriod(v) }}>
              <SelectTrigger className="bg-white dark:bg-slate-950">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTHLY">Monthly</SelectItem>
                <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                <SelectItem value="HALF_YEARLY">Half-Yearly</SelectItem>
                <SelectItem value="YEARLY">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="total">Total Income (৳) *</Label>
            <Input
              id="total"
              type="number"
              step="0.01"
              value={totalIncome}
              onChange={(e) => setTotalIncome(e.target.value)}
              placeholder="0.00"
              className="bg-white dark:bg-slate-950"
            />
          </div>
        </CardContent>
      </Card>

      {parseFloat(totalIncome) > 0 && (
        <div className="flex items-center gap-2 text-sm text-indigo-700 bg-indigo-50 dark:bg-indigo-950/30 dark:text-indigo-300 rounded-lg p-3">
          <Info className="h-4 w-4 shrink-0" />
          {eligible.length} eligible members · total weight ৳{totalWeight.toLocaleString()} · each
          member&apos;s share is proportional to their average daily balance.
        </div>
      )}

      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider text-slate-500">
            Member-wise Allocation Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                  Member
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                  Avg Daily Balance
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                  Share %
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                  Amount
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shares.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-10 text-slate-400">
                    Enter a total income to preview the allocation.
                  </TableCell>
                </TableRow>
              ) : (
                shares.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <p className="text-sm text-slate-700 dark:text-slate-200">{s.fullName}</p>
                      <p className="text-[11px] text-slate-400">{s.memberNo}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {formatBDT(s.avgDailyBalance)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-slate-500">
                      {(s.weight * 100).toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-emerald-600">
                      {formatBDT(s.amount)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          className="bg-amber-600 hover:bg-amber-700"
          disabled={isPending || shares.length === 0}
          onClick={handleSubmit}
        >
          <Send className="h-4 w-4 mr-2" /> Create {shares.length || ""} Draft(s)
        </Button>
      </div>
    </div>
  )
}
