import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft, HandCoins, CalendarDays, Percent, Clock, Wallet,
  TrendingUp, Banknote, FileText, Info, Users, CheckCircle2,
} from "lucide-react"

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

const INSTALLMENT_STATUS_STYLES: Record<string, string> = {
  PAID: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  PARTIAL: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  OVERDUE: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  WAIVED: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  PENDING: "bg-slate-500/10 text-slate-600 border-slate-500/20",
}

const fmt = (d: Date | string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"

export default async function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") redirect("/")

  const memberId = session.user.id

  const loan = await prisma.loan.findUnique({
    where: { id },
    include: {
      product: true,
      schedule: { orderBy: { installmentNo: "asc" } },
      repayments: { orderBy: { paymentDate: "desc" } },
      guarantors: true,
    },
  })

  if (!loan || loan.memberId !== memberId) {
    notFound()
  }

  const principal = Number(loan.principal)
  const totalInterest = Number(loan.totalInterest)
  const totalPayable = Number(loan.totalPayable)
  const outstanding = Number(loan.outstandingBalance)
  const paid = totalPayable - outstanding
  const paidPct = totalPayable > 0 ? Math.min(100, Math.round((paid / totalPayable) * 100)) : 0

  const terms = [
    { label: "Principal", value: `৳ ${principal.toLocaleString()}`, icon: Wallet },
    { label: "Interest Rate", value: `${Number(loan.interestRate)}% (${loan.interestType.toLowerCase()})`, icon: Percent },
    { label: "Tenure", value: `${loan.numberOfInstallments} ${loan.repaymentFreq.toLowerCase().replace(/ly$/, "")}(s)`, icon: Clock },
    { label: "Installment", value: `৳ ${Number(loan.installmentAmount).toLocaleString()}`, icon: CalendarDays },
    { label: "Total Interest", value: `৳ ${totalInterest.toLocaleString()}`, icon: TrendingUp },
    { label: "Total Payable", value: `৳ ${totalPayable.toLocaleString()}`, icon: Banknote },
  ]

  const dates = [
    { label: "Applied", value: fmt(loan.applicationDate) },
    { label: "Approved", value: fmt(loan.approvedDate) },
    { label: "Disbursed", value: fmt(loan.disbursedDate) },
    { label: "Expected Close", value: fmt(loan.expectedCloseDate) },
    { label: "Closed", value: fmt(loan.closedDate) },
  ]

  return (
    <div className="space-y-6">
      {/* Back link + header */}
      <div>
        <Link href="/portal/loans" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors mb-3">
          <ArrowLeft className="h-4 w-4" /> Back to My Loans
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                {loan.loanNo}
              </h1>
              <Badge variant="outline" className={LOAN_STATUS_STYLES[loan.status] || ""}>
                {loan.status.replace("_", " ")}
              </Badge>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {loan.product?.name || "Loan"} {loan.purpose ? `· ${loan.purpose}` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Repayment progress */}
      <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
            <div>
              <p className="text-[11px] uppercase tracking-widest font-bold text-slate-400">Outstanding Balance</p>
              <p className="text-3xl font-extrabold text-rose-600">৳ {outstanding.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-widest font-bold text-slate-400">Paid</p>
              <p className="text-xl font-bold text-emerald-600">৳ {Math.max(0, paid).toLocaleString()}</p>
            </div>
          </div>
          <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all"
              style={{ width: `${paidPct}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2 text-right">{paidPct}% repaid</p>
        </CardContent>
      </Card>

      {/* Terms */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {terms.map((t) => (
          <Card key={t.label} className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl">
            <CardContent className="p-5 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center shrink-0">
                <t.icon className="h-4 w-4 text-indigo-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-widest font-bold text-slate-400">{t.label}</p>
                <p className="text-base font-bold text-slate-900 dark:text-white mt-0.5">{t.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Schedule + side column */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4">
            <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
              <CalendarDays className="h-4 w-4 text-indigo-500" /> Repayment Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-slate-200/60 dark:border-slate-800/60 hover:bg-transparent">
                    <TableHead className="px-4 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">#</TableHead>
                    <TableHead className="px-4 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Due Date</TableHead>
                    <TableHead className="px-4 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Principal</TableHead>
                    <TableHead className="px-4 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Interest</TableHead>
                    <TableHead className="px-4 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Amount</TableHead>
                    <TableHead className="px-4 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loan.schedule.map((inst) => (
                    <TableRow
                      key={inst.id}
                      className="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                    >
                      <TableCell className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {inst.installmentNo}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                        {fmt(inst.dueDate)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                        ৳ {Number(inst.principal).toLocaleString()}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                        ৳ {Number(inst.interest).toLocaleString()}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white">
                        ৳ {Number(inst.installmentAmount).toLocaleString()}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge variant="outline" className={INSTALLMENT_STATUS_STYLES[inst.status] || ""}>
                          {inst.status === "PAID" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                          {inst.status.toLowerCase()}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Key dates */}
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4">
              <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
                <Clock className="h-4 w-4 text-indigo-500" /> Key Dates
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-3">
              {dates.map((d) => (
                <div key={d.label} className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">{d.label}</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{d.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Guarantors */}
          {loan.guarantors.length > 0 && (
            <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4">
                <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
                  <Users className="h-4 w-4 text-indigo-500" /> Guarantors
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-3">
                {loan.guarantors.map((g) => (
                  <div key={g.id} className="text-sm">
                    <p className="font-semibold text-slate-900 dark:text-white">{g.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {[g.relation, g.phone].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Notes / purpose */}
          {(loan.purpose || loan.notes) && (
            <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4">
                <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
                  <FileText className="h-4 w-4 text-indigo-500" /> Details
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-3 text-sm">
                {loan.purpose && (
                  <div>
                    <p className="text-[11px] uppercase tracking-widest font-bold text-slate-400">Purpose</p>
                    <p className="text-slate-700 dark:text-slate-200 mt-0.5">{loan.purpose}</p>
                  </div>
                )}
                {loan.notes && (
                  <div>
                    <p className="text-[11px] uppercase tracking-widest font-bold text-slate-400">Notes</p>
                    <p className="text-slate-700 dark:text-slate-200 mt-0.5 whitespace-pre-line">{loan.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Repayment history */}
      <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
            <HandCoins className="h-4 w-4 text-emerald-500" /> Repayment History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-slate-200/60 dark:border-slate-800/60 hover:bg-transparent">
                <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Receipt</TableHead>
                <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Date</TableHead>
                <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Method</TableHead>
                <TableHead className="px-6 py-3 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Principal</TableHead>
                <TableHead className="px-6 py-3 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Interest</TableHead>
                <TableHead className="px-6 py-3 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loan.repayments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-slate-500">
                    No repayments recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                loan.repayments.map((r) => (
                  <TableRow
                    key={r.id}
                    className="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                  >
                    <TableCell className="px-6 py-3 text-sm font-mono text-slate-500">{r.receiptNo || "—"}</TableCell>
                    <TableCell className="px-6 py-3 text-sm text-slate-700 dark:text-slate-200">{fmt(r.paymentDate)}</TableCell>
                    <TableCell className="px-6 py-3 text-sm text-slate-700 dark:text-slate-200">{r.method}</TableCell>
                    <TableCell className="px-6 py-3 text-right text-sm text-slate-700 dark:text-slate-200">৳ {Number(r.principal).toLocaleString()}</TableCell>
                    <TableCell className="px-6 py-3 text-right text-sm text-slate-700 dark:text-slate-200">৳ {Number(r.interest).toLocaleString()}</TableCell>
                    <TableCell className="px-6 py-3 text-right text-sm font-bold text-emerald-600">৳ {Number(r.totalAmount).toLocaleString()}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50">
        <Info className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
        <p className="text-sm text-indigo-800 dark:text-indigo-200">
          Repayments are recorded by management. If you have already paid but it&apos;s not reflected here, please
          contact your society administrator with your payment receipt.
        </p>
      </div>
    </div>
  )
}
