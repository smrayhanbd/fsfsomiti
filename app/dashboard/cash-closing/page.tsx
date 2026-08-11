import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatBDT, formatDate } from "@/lib/accounting"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Wallet, TrendingUp, TrendingDown } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function CashClosingPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")

  // Today's window (server local time).
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  end.setHours(23, 59, 59, 999)

  const [cashAccounts, txns] = await Promise.all([
    prisma.account.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ isCash: true }, { isBank: true }],
      },
      select: {
        id: true,
        accountCode: true,
        accountName: true,
        isCash: true,
        isBank: true,
        openingBalance: true,
        currentBalance: true,
      },
      orderBy: { accountCode: "asc" },
    }),
    prisma.transaction.findMany({
      where: {
        status: "APPROVED",
        approvedAt: { gte: start, lte: end },
        cashAccountId: { not: null },
      },
      select: {
        id: true,
        voucherNo: true,
        transactionType: true,
        amount: true,
        cashAccountId: true,
        approvedAt: true,
      },
    }),
  ])

  // Group transactions per cash account.
  const byAccount = new Map<
    string,
    { inflow: number; outflow: number; count: number }
  >()
  for (const t of txns) {
    const key = t.cashAccountId!
    const agg = byAccount.get(key) ?? { inflow: 0, outflow: 0, count: 0 }
    if (t.transactionType === "DEPOSIT") agg.inflow += Number(t.amount)
    else if (t.transactionType === "WITHDRAWAL") agg.outflow += Number(t.amount)
    agg.count += 1
    byAccount.set(key, agg)
  }

  const rows = cashAccounts.map((a) => {
    const agg = byAccount.get(a.id) ?? { inflow: 0, outflow: 0, count: 0 }
    const opening = Number(a.openingBalance)
    const current = Number(a.currentBalance)
    return {
      id: a.id,
      code: a.accountCode,
      name: a.accountName,
      isCash: a.isCash,
      isBank: a.isBank,
      opening,
      current,
      inflow: agg.inflow,
      outflow: agg.outflow,
      net: agg.inflow - agg.outflow,
      count: agg.count,
    }
  })

  const totalInflow = rows.reduce((s, r) => s + r.inflow, 0)
  const totalOutflow = rows.reduce((s, r) => s + r.outflow, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <Wallet className="h-7 w-7 text-indigo-600" />
          Cash Closing
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
          Daily summary per Cash Drawer / Bank / Wallet for {formatDate(new Date())}.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Today&apos;s Inflow
            </p>
            <p className="text-xl font-extrabold tabular-nums text-emerald-600">
              {formatBDT(totalInflow)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1">
              <TrendingDown className="h-3 w-3" /> Today&apos;s Outflow
            </p>
            <p className="text-xl font-extrabold tabular-nums text-rose-600">
              {formatBDT(totalOutflow)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
              Net Movement
            </p>
            <p className="text-xl font-extrabold tabular-nums text-indigo-600">
              {formatBDT(totalInflow - totalOutflow)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider text-slate-500">
            Account-wise Closing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                  Account
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                  Opening
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                  Inflow
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                  Outflow
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                  Net
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                  Closing
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-slate-400">
                    No cash / bank accounts configured.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">{r.code}</span>
                        <span className="text-sm text-slate-700 dark:text-slate-200">
                          {r.name}
                        </span>
                        {r.isCash && (
                          <Badge variant="outline" className="text-[9px]">
                            Cash
                          </Badge>
                        )}
                        {r.isBank && (
                          <Badge variant="outline" className="text-[9px]">
                            Bank
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-slate-500">
                      {formatBDT(r.opening)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-emerald-600">
                      {r.inflow > 0 ? formatBDT(r.inflow) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-rose-600">
                      {r.outflow > 0 ? formatBDT(r.outflow) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm font-semibold">
                      {r.net !== 0 ? formatBDT(r.net) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-bold">
                      {formatBDT(r.current)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
