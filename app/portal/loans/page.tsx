import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { HandCoins, Wallet, TrendingUp, FilePlus2, Eye, Clock, ArrowRight } from "lucide-react"

export const dynamic = "force-dynamic"

const LOAN_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  APPROVED: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  DISBURSED: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  REPAID: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  CLOSED: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  DEFAULTED: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  WRITTEN_OFF: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  REJECTED: "bg-rose-500/10 text-rose-600 border-rose-500/20",
}

export default async function MyLoansPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") redirect("/")

  const memberId = session.user.id
  const member = await prisma.member.findUnique({ where: { id: memberId } })
  if (!member) redirect("/")

  const loans = await prisma.loan.findMany({
    where: { memberId },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  })

  // KPIs
  const activeLoans = loans.filter((l) => ["DISBURSED", "DEFAULTED"].includes(l.status))
  const totalBorrowed = loans
    .filter((l) => ["DISBURSED", "REPAID", "CLOSED", "DEFAULTED"].includes(l.status))
    .reduce((sum, l) => sum + Number(l.principal), 0)
  const totalOutstanding = activeLoans.reduce((sum, l) => sum + Number(l.outstandingBalance), 0)

  const stats = [
    {
      label: "Total Borrowed",
      value: `৳ ${totalBorrowed.toLocaleString()}`,
      icon: TrendingUp,
      color: "text-blue-600",
      iconBg: "bg-blue-100 dark:bg-blue-950/50",
    },
    {
      label: "Total Outstanding",
      value: `৳ ${totalOutstanding.toLocaleString()}`,
      icon: Wallet,
      color: "text-rose-600",
      iconBg: "bg-rose-100 dark:bg-rose-950/50",
    },
    {
      label: "Active Loans",
      value: String(activeLoans.length),
      icon: HandCoins,
      color: "text-indigo-600",
      iconBg: "bg-indigo-100 dark:bg-indigo-950/50",
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">My Loans</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            View your loan history and apply for new financing.
          </p>
        </div>
        <Link href="/portal/loans/apply">
          <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-sm">
            <FilePlus2 className="h-4 w-4 mr-1.5" /> Apply for Loan
          </Button>
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl">
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

      {/* Loans table */}
      <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
            <HandCoins className="h-4 w-4 text-indigo-500" /> Loan History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-slate-200/60 dark:border-slate-800/60 hover:bg-transparent">
                <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Loan No</TableHead>
                <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Product</TableHead>
                <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Principal</TableHead>
                <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Outstanding</TableHead>
                <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Next Due</TableHead>
                <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Status</TableHead>
                <TableHead className="px-6 py-3 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-14 w-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center">
                        <HandCoins className="h-7 w-7 text-indigo-400" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-700 dark:text-slate-200">No loans yet</p>
                        <p className="text-sm text-slate-500 mt-0.5">
                          When you take out a loan it will appear here.
                        </p>
                      </div>
                      <Link href="/portal/loans/apply">
                        <Button className="mt-1 bg-indigo-600 hover:bg-indigo-700" size="sm">
                          <FilePlus2 className="h-4 w-4 mr-1.5" /> Apply for your first loan
                        </Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                loans.map((loan) => (
                  <TableRow
                    key={loan.id}
                    className="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                  >
                    <TableCell className="px-6 py-3 text-sm font-mono font-semibold text-slate-900 dark:text-white">
                      {loan.loanNo}
                    </TableCell>
                    <TableCell className="px-6 py-3 text-sm text-slate-700 dark:text-slate-200">
                      {loan.product?.name || "—"}
                    </TableCell>
                    <TableCell className="px-6 py-3 text-sm text-slate-700 dark:text-slate-200">
                      ৳ {Number(loan.principal).toLocaleString()}
                    </TableCell>
                    <TableCell className="px-6 py-3 text-sm font-semibold text-slate-900 dark:text-white">
                      ৳ {Number(loan.outstandingBalance).toLocaleString()}
                    </TableCell>
                    <TableCell className="px-6 py-3 text-sm text-slate-500">
                      {loan.nextDueDate ? (
                        new Date(loan.nextDueDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-6 py-3">
                      <Badge variant="outline" className={LOAN_STATUS_STYLES[loan.status] || "bg-slate-50 text-slate-700 border-slate-200"}>
                        {loan.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-6 py-3 text-right">
                      <Link href={`/portal/loans/${loan.id}`}>
                        <Button variant="ghost" size="sm" className="text-indigo-600 hover:text-indigo-700">
                          <Eye className="h-4 w-4 mr-1" /> View
                        </Button>
                      </Link>
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
