import DateFilterBar from "../DateFilterBar"
import { buildBalanceSheet } from "@/lib/financialStatements"
import { accountTypeMeta, formatBDT, formatDate } from "@/lib/accounting"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Wallet,
  Landmark,
  Scale,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"

export const dynamic = "force-dynamic"

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>
}) {
  const params = await searchParams
  const asOf = params.asOf ? new Date(params.asOf) : undefined
  const bs = await buildBalanceSheet({ asOf })

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Balance Sheet
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Snapshot of what the organisation owns and owes.
          </p>
        </div>
        <Badge
          className={`px-3 py-1.5 text-xs ${
            bs.balanced
              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
              : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
          }`}
        >
          {bs.balanced ? (
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 mr-1" />
          )}
          {bs.balanced ? "Balanced" : "Adjustment needed"}
        </Badge>
      </div>

      <DateFilterBar
        basePath="/dashboard/financials/balance-sheet"
        asOf={params.asOf}
        mode="asOf"
      />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ASSETS */}
        <Section
          title="Assets"
          icon={Wallet}
          accent="emerald"
          rows={bs.assets.rows}
          total={bs.assets.total}
        />
        {/* LIABILITIES + EQUITY */}
        <div className="space-y-6">
          <Section
            title="Liabilities"
            icon={Landmark}
            accent="rose"
            rows={bs.liabilities.rows}
            total={bs.liabilities.total}
          />
          <Section
            title="Equity"
            icon={Scale}
            accent="blue"
            rows={bs.equity.rows}
            total={bs.equity.total}
          />
          {/* Net income (retained earnings) pseudo-row */}
          <Card className="bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200/50 dark:border-indigo-900/50 rounded-2xl">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500">
                  Net Income (Period)
                </p>
                <p className="text-xs text-slate-400">
                  Income − Expenses, added to equity
                </p>
              </div>
              <p
                className={`text-lg font-extrabold tabular-nums ${
                  bs.netIncome >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {formatBDT(bs.netIncome)}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer totals */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl">
        <CardContent className="p-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 p-4">
              <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500">
                Total Assets
              </p>
              <p className="text-2xl font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatBDT(bs.totalAssets)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                As of {asOf ? formatDate(asOf) : "today"}
              </p>
            </div>
            <div className="rounded-xl bg-rose-50/60 dark:bg-rose-950/20 p-4">
              <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500">
                Total Liabilities + Equity
              </p>
              <p className="text-2xl font-extrabold tabular-nums text-rose-600 dark:text-rose-400">
                {formatBDT(bs.totalLiabilitiesAndEquity)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Difference: {formatBDT(bs.totalAssets - bs.totalLiabilitiesAndEquity)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Section({
  title,
  icon: Icon,
  accent,
  rows,
  total,
}: {
  title: string
  icon: typeof Wallet
  accent: "emerald" | "rose" | "blue"
  rows: { id: string; code: string; name: string; balance: number }[]
  total: number
}) {
  const accents = {
    emerald: { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50/60 dark:bg-emerald-950/20" },
    rose: { text: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50/60 dark:bg-rose-950/20" },
    blue: { text: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50/60 dark:bg-blue-950/20" },
  }[accent]

  return (
    <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
      <div className={`px-5 py-3 border-b border-slate-100 dark:border-slate-800/60 flex items-center justify-between ${accents.bg}`}>
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${accents.text}`} />
          <h3 className={`text-sm font-bold ${accents.text}`}>{title}</h3>
        </div>
        <span className="text-xs text-slate-400">{rows.length} accounts</span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">
            No accounts of this type.
          </p>
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-[11px] text-slate-400 shrink-0">
                  {r.code}
                </span>
                <span className="text-sm text-slate-700 dark:text-slate-200 truncate">
                  {r.name}
                </span>
              </div>
              <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white shrink-0">
                {formatBDT(r.balance)}
              </span>
            </div>
          ))
        )}
      </div>
      <div className={`px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between ${accents.bg}`}>
        <span className={`text-xs font-bold uppercase tracking-wider ${accents.text}`}>
          Total {title}
        </span>
        <span className={`text-lg font-extrabold tabular-nums ${accents.text}`}>
          {formatBDT(total)}
        </span>
      </div>
    </Card>
  )
}
