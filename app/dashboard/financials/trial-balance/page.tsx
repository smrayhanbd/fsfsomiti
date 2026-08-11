import DateFilterBar from "../DateFilterBar"
import { buildTrialBalance } from "@/lib/financialStatements"
import { accountTypeMeta, formatBDT, formatDate } from "@/lib/accounting"
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
import {
  Scale,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"

export const dynamic = "force-dynamic"

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>
}) {
  const params = await searchParams
  const asOf = params.asOf ? new Date(params.asOf) : undefined

  const tb = await buildTrialBalance({ asOf })

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Trial Balance
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Verify that total debits equal total credits across the ledger.
          </p>
        </div>
        <Badge
          className={`px-3 py-1.5 text-xs ${
            tb.balanced
              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
              : "bg-rose-500/10 text-rose-600 border border-rose-500/20"
          }`}
        >
          {tb.balanced ? (
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 mr-1" />
          )}
          {tb.balanced ? "Balanced" : "Out of balance"}
        </Badge>
      </div>

      <DateFilterBar
        basePath="/dashboard/financials/trial-balance"
        asOf={params.asOf}
        mode="asOf"
      />

      {/* Headline stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Total Debits"
          value={formatBDT(tb.totalDebit)}
          tone="text-emerald-600 dark:text-emerald-400"
          icon={Scale}
        />
        <StatCard
          label="Total Credits"
          value={formatBDT(tb.totalCredit)}
          tone="text-rose-600 dark:text-rose-400"
          icon={Scale}
        />
        <StatCard
          label="Difference"
          value={formatBDT(tb.totalDebit - tb.totalCredit)}
          tone={
            tb.balanced
              ? "text-slate-500"
              : "text-amber-600 dark:text-amber-400"
          }
          icon={AlertTriangle}
        />
      </div>

      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/40">
          <p className="text-xs font-semibold text-slate-500">
            As of {asOf ? formatDate(asOf) : "today"}
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
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                Type
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                Debit
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                Credit
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tb.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-16 text-slate-500">
                  <Scale className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                  No posted transactions yet.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {tb.rows.map((r) => {
                  const meta = accountTypeMeta(r.type)
                  return (
                    <TableRow
                      key={r.id}
                      className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                    >
                      <TableCell className="font-mono text-xs text-slate-500">
                        {r.code}
                      </TableCell>
                      <TableCell className="font-medium text-slate-800 dark:text-slate-100">
                        {r.name}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.badge}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                        {r.debit > 0 ? formatBDT(r.debit) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-rose-700 dark:text-rose-400">
                        {r.credit > 0 ? formatBDT(r.credit) : "—"}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {/* Totals row */}
                <TableRow className="border-t-2 border-slate-200 dark:border-slate-700 font-extrabold bg-slate-50/80 dark:bg-slate-900/60">
                  <TableCell colSpan={3} className="text-slate-900 dark:text-white">
                    Total
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-slate-900 dark:text-white">
                    {formatBDT(tb.totalDebit)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-slate-900 dark:text-white">
                    {formatBDT(tb.totalCredit)}
                  </TableCell>
                </TableRow>
              </>
            )}
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
  icon: typeof Scale
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
