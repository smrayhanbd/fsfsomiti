import DateFilterBar from "../DateFilterBar"
import { generateCashFlowStatement, type CashFlowSection } from "@/lib/financialStatements/cashFlow"
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
import { TrendingUp, TrendingDown, DollarSign, ArrowDownCircle, ArrowUpCircle } from "lucide-react"

export const dynamic = "force-dynamic"

// Default period: current financial year so far (Jan 1 → today).
function defaultRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), 0, 1)
  return { from, to: now }
}

/**
 * Cash Flow Statement dashboard page.
 *
 * Calls the cash-flow engine (lib/financialStatements/cashFlow) and renders
 * a three-section table (operating / investing / financing) with a net
 * change row at the bottom. Cash/bank accounts are intentionally absent —
 * they're the reconciling item.
 */
export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const params = await searchParams
  const defaultR = defaultRange()
  const fromDate = params.from ? new Date(params.from) : defaultR.from
  const toDate = params.to ? new Date(params.to) : defaultR.to

  const cf = await generateCashFlowStatement(fromDate, toDate)

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Cash Flow Statement
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Period movements grouped by IAS 7 categories. Cash / bank accounts
            are the reconciling item (net change in cash).
          </p>
        </div>
        <Badge className="px-3 py-1.5 text-xs bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">
          {cf.netChange >= 0 ? (
            <TrendingUp className="h-3.5 w-3.5 mr-1" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 mr-1" />
          )}
          {cf.netChange >= 0 ? "Net Inflow" : "Net Outflow"}
        </Badge>
      </div>

      <DateFilterBar
        basePath="/dashboard/financials/cash-flow"
        from={params.from || fromDate.toISOString().slice(0, 10)}
        to={params.to || toDate.toISOString().slice(0, 10)}
        mode="range"
      />

      {/* Headline */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Net Operating"
          value={formatBDT(cf.operating.net)}
          tone={cf.operating.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}
          icon={ArrowDownCircle}
        />
        <StatCard
          label="Net Investing"
          value={formatBDT(cf.investing.net)}
          tone={cf.investing.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}
          icon={ArrowUpCircle}
        />
        <StatCard
          label="Net Financing"
          value={formatBDT(cf.financing.net)}
          tone={cf.financing.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}
          icon={DollarSign}
        />
      </div>

      {/* Statement table */}
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
                Inflows
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                Outflows
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                Net
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <SectionBlock label="Operating Activities" section={cf.operating} tone="emerald" />
            <SectionBlock label="Investing Activities" section={cf.investing} tone="indigo" />
            <SectionBlock label="Financing Activities" section={cf.financing} tone="amber" />

            {/* Net change row */}
            <TableRow className="border-t-2 border-slate-300 dark:border-slate-600 font-extrabold bg-slate-50/80 dark:bg-slate-900/60">
              <TableCell colSpan={4} className="text-slate-900 dark:text-white">
                Net Change in Cash
              </TableCell>
              <TableCell
                className={`text-right tabular-nums ${
                  cf.netChange >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {formatBDT(cf.netChange)}
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

function SectionBlock({
  label,
  section,
  tone,
}: {
  label: string
  section: CashFlowSection
  tone: "emerald" | "indigo" | "amber"
}) {
  const toneClass = {
    emerald: "bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400",
    indigo: "bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400",
    amber: "bg-amber-50/70 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400",
  }[tone]

  return (
    <>
      <TableRow className={`${toneClass} font-bold`}>
        <TableCell colSpan={5} className="text-xs uppercase tracking-widest">
          {label}
        </TableCell>
      </TableRow>
      {section.lines.length === 0 ? (
        <TableRow>
          <TableCell colSpan={5} className="text-center py-4 text-sm text-slate-400">
            No movement in this section
          </TableCell>
        </TableRow>
      ) : (
        section.lines.map((l) => (
          <TableRow
            key={l.accountId}
            className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
          >
            <TableCell className="font-mono text-xs text-slate-500">{l.accountCode}</TableCell>
            <TableCell className="text-slate-700 dark:text-slate-200">{l.accountName}</TableCell>
            <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
              {l.amount > 0 ? formatBDT(l.amount) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums text-rose-700 dark:text-rose-400">
              {l.amount < 0 ? formatBDT(Math.abs(l.amount)) : "—"}
            </TableCell>
            <TableCell
              className={`text-right tabular-nums font-medium ${
                l.amount >= 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-rose-700 dark:text-rose-400"
              }`}
            >
              {formatBDT(l.amount)}
            </TableCell>
          </TableRow>
        ))
      )}
      <TableRow className="border-t border-slate-200 dark:border-slate-700 font-bold bg-slate-50/60 dark:bg-slate-900/40">
        <TableCell colSpan={2} className="text-slate-900 dark:text-white">
          Net {label}
        </TableCell>
        <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
          {formatBDT(section.inflows)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-rose-700 dark:text-rose-400">
          {formatBDT(section.outflows)}
        </TableCell>
        <TableCell
          className={`text-right tabular-nums ${
            section.net >= 0
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-rose-700 dark:text-rose-400"
          }`}
        >
          {formatBDT(section.net)}
        </TableCell>
      </TableRow>
    </>
  )
}
