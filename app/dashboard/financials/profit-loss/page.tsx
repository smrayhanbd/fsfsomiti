import DateFilterBar from "../DateFilterBar"
import { buildProfitLoss } from "@/lib/financialStatements"
import { formatBDT, formatDate } from "@/lib/accounting"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react"

export const dynamic = "force-dynamic"

// Default period: current financial year so far (Jan 1 → today).
function defaultRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), 0, 1)
  return { from, to: now }
}

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const params = await searchParams
  const defaultR = defaultRange()
  const fromDate = params.from ? new Date(params.from) : defaultR.from
  const toDate = params.to ? new Date(params.to) : defaultR.to

  const pl = await buildProfitLoss({ fromDate, toDate })
  const profitable = pl.netProfit >= 0

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Profit &amp; Loss Statement
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Income versus expenses for the selected period.
          </p>
        </div>
        <Badge
          className={`px-3 py-1.5 text-xs ${
            profitable
              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
              : "bg-rose-500/10 text-rose-600 border border-rose-500/20"
          }`}
        >
          {profitable ? (
            <TrendingUp className="h-3.5 w-3.5 mr-1" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 mr-1" />
          )}
          {profitable ? "Net Profit" : "Net Loss"}
        </Badge>
      </div>

      <DateFilterBar
        basePath="/dashboard/financials/profit-loss"
        from={params.from || fromDate.toISOString().slice(0, 10)}
        to={params.to || toDate.toISOString().slice(0, 10)}
        mode="range"
      />

      {/* Headline */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Total Income"
          value={formatBDT(pl.totalIncome)}
          tone="text-emerald-600 dark:text-emerald-400"
          icon={TrendingUp}
        />
        <StatCard
          label="Total Expenses"
          value={formatBDT(pl.totalExpenses)}
          tone="text-rose-600 dark:text-rose-400"
          icon={TrendingDown}
        />
        <StatCard
          label="Net Result"
          value={formatBDT(pl.netProfit)}
          tone={
            profitable
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }
          icon={DollarSign}
        />
      </div>

      {/* Comparative table */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/40">
          <p className="text-xs font-semibold text-slate-500">
            Period: {formatDate(fromDate)} → {formatDate(toDate)}
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-800/50 hover:bg-transparent">
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                Code
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                Account
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                Opening
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                Period
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                Closing
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Income section */}
            <SectionHeader label="Income" tone="emerald" />
            {pl.income.rows.length === 0 ? (
              <EmptyRow colSpan={5} label="No income accounts" />
            ) : (
              <>
                {pl.income.rows.map((r) => (
                  <TableRow
                    key={r.id}
                    className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                  >
                    <TableCell className="font-mono text-xs text-slate-500">
                      {r.code}
                    </TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-200">
                      {r.name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500">
                      {formatBDT(r.opening)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                      {formatBDT(r.period)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-700 dark:text-slate-200">
                      {formatBDT(r.closing)}
                    </TableCell>
                  </TableRow>
                ))}
                <Subtotal
                  label="Total Income"
                  opening={pl.income.totalOpening}
                  period={pl.income.totalPeriod}
                  closing={pl.income.totalClosing}
                  tone="emerald"
                />
              </>
            )}

            {/* Expense section */}
            <SectionHeader label="Expenses" tone="rose" />
            {pl.expenses.rows.length === 0 ? (
              <EmptyRow colSpan={5} label="No expense accounts" />
            ) : (
              <>
                {pl.expenses.rows.map((r) => (
                  <TableRow
                    key={r.id}
                    className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                  >
                    <TableCell className="font-mono text-xs text-slate-500">
                      {r.code}
                    </TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-200">
                      {r.name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500">
                      {formatBDT(r.opening)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-rose-700 dark:text-rose-400">
                      {formatBDT(r.period)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-700 dark:text-slate-200">
                      {formatBDT(r.closing)}
                    </TableCell>
                  </TableRow>
                ))}
                <Subtotal
                  label="Total Expenses"
                  opening={pl.expenses.totalOpening}
                  period={pl.expenses.totalPeriod}
                  closing={pl.expenses.totalClosing}
                  tone="rose"
                />
              </>
            )}

            {/* Net result */}
            <TableRow className="border-t-2 border-slate-300 dark:border-slate-600 font-extrabold bg-slate-50/80 dark:bg-slate-900/60">
              <TableCell colSpan={2} className="text-slate-900 dark:text-white">
                Net {profitable ? "Profit" : "Loss"}
              </TableCell>
              <TableCell className="text-right tabular-nums text-slate-700 dark:text-slate-200">
                {formatBDT(pl.openingNetProfit)}
              </TableCell>
              <TableCell
                className={`text-right tabular-nums ${
                  profitable
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {formatBDT(pl.netProfit)}
              </TableCell>
              <TableCell
                className={`text-right tabular-nums ${
                  profitable
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {formatBDT(pl.openingNetProfit + pl.netProfit)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

function StatCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string
  value: string
  tone: string
  icon: typeof TrendingUp
}) {
  return (
    <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-widest font-bold text-slate-500">
            {label}
          </span>
          <Icon className={`h-4 w-4 ${tone}`} />
        </div>
        <p className={`text-lg font-extrabold tabular-nums mt-1 ${tone}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

function SectionHeader({ label, tone }: { label: string; tone: "emerald" | "rose" }) {
  const tones = {
    emerald: "bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400",
    rose: "bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400",
  }[tone]
  return (
    <TableRow className={`${tones} font-bold`}>
      <TableCell colSpan={5} className="text-xs uppercase tracking-widest">
        {label}
      </TableCell>
    </TableRow>
  )
}

function Subtotal({
  label,
  opening,
  period,
  closing,
  tone,
}: {
  label: string
  opening: number
  period: number
  closing: number
  tone: "emerald" | "rose"
}) {
  const tones = {
    emerald: "text-emerald-700 dark:text-emerald-400",
    rose: "text-rose-700 dark:text-rose-400",
  }[tone]
  return (
    <TableRow className={`border-t border-slate-200 dark:border-slate-700 font-bold bg-slate-50/60 dark:bg-slate-900/40`}>
      <TableCell colSpan={2} className={`text-slate-900 dark:text-white`}>
        {label}
      </TableCell>
      <TableCell className={`text-right tabular-nums text-slate-700 dark:text-slate-200`}>
        {formatBDT(opening)}
      </TableCell>
      <TableCell className={`text-right tabular-nums ${tones}`}>
        {formatBDT(period)}
      </TableCell>
      <TableCell className={`text-right tabular-nums text-slate-700 dark:text-slate-200`}>
        {formatBDT(closing)}
      </TableCell>
    </TableRow>
  )
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center py-6 text-sm text-slate-400">
        {label}
      </TableCell>
    </TableRow>
  )
}
