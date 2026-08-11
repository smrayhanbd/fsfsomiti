"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { approveLoan, rejectLoan, disburseLoan, writeOffLoan } from "@/app/actions/loan"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, CheckCircle2, XCircle, Landmark, Banknote, AlertTriangle,
  FileSignature, Calendar, Percent, Wallet, User, Phone, Hash,
} from "lucide-react"
import Link from "next/link"

export interface ScheduleRowData {
  id: string
  installmentNo: number
  dueDate: string
  principal: number
  interest: number
  installmentAmount: number
  balanceAfter: number
  status: string
  paidDate: string | null
  paidAmount: number
  fine: number
}

export interface RepaymentRowData {
  id: string
  receiptNo: string | null
  paymentDate: string
  principal: number
  interest: number
  fine: number
  totalAmount: number
  method: string
  referenceNo: string | null
}

export interface GuarantorRowData {
  id: string
  name: string
  relation: string | null
  phone: string | null
  nidNumber: string | null
  address: string | null
}

export interface LoanDetailData {
  id: string
  loanNo: string
  status: string
  member: { id: string; fullName: string; memberNo: string; phone: string }
  product: { id: string; name: string; allowInterestWaiver: boolean }
  principal: number
  interestRate: number
  interestType: string
  repaymentFreq: string
  numberOfInstallments: number
  totalInterest: number
  totalPayable: number
  installmentAmount: number
  outstandingBalance: number
  principalPaid: number
  interestPaid: number
  finePaid: number
  nextDueDate: string | null
  applicationDate: string
  approvedDate: string | null
  disbursedDate: string | null
  expectedCloseDate: string | null
  closedDate: string | null
  disbursementMethod: string | null
  purpose: string | null
  notes: string | null
  schedule: ScheduleRowData[]
  repayments: RepaymentRowData[]
  guarantors: GuarantorRowData[]
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  APPROVED: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  REJECTED: "bg-red-500/10 text-red-600 border-red-500/20",
  DISBURSED: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  REPAID: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  CLOSED: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  DEFAULTED: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  WRITTEN_OFF: "bg-rose-500/10 text-rose-600 border-rose-500/20",
}

const INST_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  PAID: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  PARTIAL: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  OVERDUE: "bg-red-500/10 text-red-600 border-red-500/20",
  WAIVED: "bg-purple-500/10 text-purple-600 border-purple-500/20",
}

export default function LoanDetailClient({ loan }: { loan: LoanDetailData }) {
  const router = useRouter()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [disburseOpen, setDisburseOpen] = useState(false)
  const [disbMethod, setDisbMethod] = useState("CASH")
  const [disbDate, setDisbDate] = useState(new Date().toISOString().split("T")[0])
  const [busy, setBusy] = useState(false)

  const progress = loan.totalPayable > 0
    ? Math.min(100, Math.round(((loan.principalPaid + loan.interestPaid + loan.finePaid) / loan.totalPayable) * 100))
    : 0

  const wrap = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true)
    try {
      await fn()
      toast.success(msg)
      router.refresh()
    } catch (e) {
      toast.error("Action failed", { description: e instanceof Error ? e.message : "Failed" })
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-white dark:bg-slate-950 border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="flex items-center justify-between max-w-7xl mx-auto gap-3">
          <Link href="/dashboard/loans">
            <Button variant="outline" size="sm" className="rounded-xl bg-slate-50 dark:bg-slate-900">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Loans
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`uppercase text-[10px] px-2.5 py-1 rounded-full font-bold ${STATUS_STYLES[loan.status] || ""}`}>
              {loan.status.replace("_", " ")}
            </Badge>
            <span className="font-mono text-sm font-bold text-slate-700 dark:text-slate-200 hidden sm:inline">{loan.loanNo}</span>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-600 font-bold text-xl">
            {loan.member.fullName.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{loan.member.fullName}</h1>
            <p className="text-sm text-slate-500 flex items-center gap-3">
              <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{loan.member.memberNo}</span>
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{loan.member.phone}</span>
              <Link href={`/dashboard/members/${loan.member.id}`} className="text-indigo-600 hover:underline">View profile</Link>
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Loan No</p>
          <p className="font-mono font-bold text-slate-900 dark:text-white">{loan.loanNo}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Principal" value={`৳ ${loan.principal.toLocaleString()}`} icon={Wallet} color="text-indigo-600" bg="bg-indigo-50 dark:bg-indigo-950/40" border="border-indigo-200/50 dark:border-indigo-900/50" />
        <SummaryCard label="Total Payable" value={`৳ ${loan.totalPayable.toLocaleString()}`} icon={FileSignature} color="text-slate-900 dark:text-white" bg="bg-slate-50 dark:bg-slate-900" border="border-slate-200/50 dark:border-slate-800/50" />
        <SummaryCard label="Total Interest" value={`৳ ${loan.totalInterest.toLocaleString()}`} icon={Percent} color="text-red-600" bg="bg-red-50 dark:bg-red-950/40" border="border-red-200/50 dark:border-red-900/50" />
        <SummaryCard label="Outstanding" value={`৳ ${loan.outstandingBalance.toLocaleString()}`} icon={AlertTriangle} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-950/40" border="border-amber-200/50 dark:border-amber-900/50" />
      </div>

      {/* Progress + workflow */}
      <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="p-5 space-y-4">
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="font-bold text-slate-500 uppercase tracking-wider">Repayment Progress</span>
              <span className="font-bold text-slate-900 dark:text-white">{progress}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 mt-1.5">
              <span>Paid: ৳ {(loan.principalPaid + loan.interestPaid + loan.finePaid).toLocaleString()}</span>
              <span>Per installment: ৳ {loan.installmentAmount.toLocaleString()}</span>
              <span>Next due: {loan.nextDueDate ? new Date(loan.nextDueDate).toLocaleDateString() : "—"}</span>
            </div>
          </div>

          {/* Workflow actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            {loan.status === "PENDING" && (
              <>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => wrap(() => approveLoan(loan.id), "Loan approved")}>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve
                </Button>
                <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => { setRejectReason(""); setRejectOpen(true) }}>
                  <XCircle className="mr-1.5 h-4 w-4" /> Reject
                </Button>
                <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                  <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Reject Loan</DialogTitle></DialogHeader>
                    <div className="space-y-3 py-2">
                      <div className="space-y-2">
                        <Label htmlFor="reason">Reason (optional)</Label>
                        <Input id="reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. Insufficient savings" />
                      </div>
                      <Button className="w-full bg-red-600 hover:bg-red-700" disabled={busy} onClick={() => wrap(() => rejectLoan(loan.id, rejectReason), "Loan rejected").then(() => setRejectOpen(false))}>
                        Confirm Reject
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}

            {loan.status === "APPROVED" && (
              <>
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setDisburseOpen(true)}>
                  <Landmark className="mr-1.5 h-4 w-4" /> Disburse Loan
                </Button>
                <Dialog open={disburseOpen} onOpenChange={setDisburseOpen}>
                  <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Disburse Loan</DialogTitle></DialogHeader>
                    <div className="space-y-3 py-2">
                      <div className="space-y-2">
                        <Label>Disbursement Method</Label>
                        <input type="hidden" name="method" value={disbMethod} />
                        <Select value={disbMethod} onValueChange={(v) => setDisbMethod(v ?? "CASH")}>
                          <SelectTrigger className="w-full bg-white dark:bg-slate-950"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CASH">Cash</SelectItem>
                            <SelectItem value="BKASH">bKash</SelectItem>
                            <SelectItem value="BANK">Bank Transfer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    <div className="space-y-2">
                      <Label htmlFor="disbDate">Disbursement Date</Label>
                      <Input id="disbDate" type="date" value={disbDate} onChange={(e) => setDisbDate(e.target.value)} className="bg-white dark:bg-slate-950" />
                    </div>
                    <Button className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={busy}
                      onClick={() => wrap(() => disburseLoan(loan.id, disbMethod, disbDate), "Loan disbursed").then(() => setDisburseOpen(false))}>
                      Confirm Disbursement
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              </>
            )}

            {(loan.status === "DISBURSED" || loan.status === "REPAID") && (
              <Link href={`/dashboard/loans/${loan.id}/repay`}>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                  <Banknote className="mr-1.5 h-4 w-4" /> Record Repayment
                </Button>
              </Link>
            )}

            {(loan.status === "DISBURSED" || loan.status === "DEFAULTED") && (
              <Button size="sm" variant="outline" className="border-rose-300 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30" disabled={busy}
                onClick={() => { if (confirm("Write off this loan? Outstanding will be marked unrecoverable.")) wrap(() => writeOffLoan(loan.id), "Loan written off") }}>
                <AlertTriangle className="mr-1.5 h-4 w-4" /> Write Off
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Schedule + side column */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        <div className="lg:col-span-3">
          <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-emerald-600 text-white rounded-t-2xl px-5 py-2.5">
              <CardTitle className="flex items-center gap-2 text-sm font-bold"><Calendar className="h-4 w-4" /> Amortization Schedule</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-800/50 hover:bg-transparent">
                      <TableHead className="px-4 text-[11px] uppercase tracking-widest font-bold text-slate-400">#</TableHead>
                      <TableHead className="px-4 text-[11px] uppercase tracking-widest font-bold text-slate-400">Due Date</TableHead>
                      <TableHead className="px-4 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Principal</TableHead>
                      <TableHead className="px-4 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Interest</TableHead>
                      <TableHead className="px-4 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Installment</TableHead>
                      <TableHead className="px-4 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Paid</TableHead>
                      <TableHead className="px-4 text-center text-[11px] uppercase tracking-widest font-bold text-slate-400">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loan.schedule.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-500">No schedule rows.</TableCell></TableRow>
                    ) : (
                      loan.schedule.map((s) => (
                        <TableRow key={s.id} className="border-b border-slate-100 dark:border-slate-800/50">
                          <TableCell className="px-4 py-2.5 font-mono text-xs text-slate-500">{s.installmentNo}</TableCell>
                          <TableCell className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">{new Date(s.dueDate).toLocaleDateString()}</TableCell>
                          <TableCell className="px-4 py-2.5 text-right text-sm text-slate-600 dark:text-slate-300">৳ {s.principal.toLocaleString()}</TableCell>
                          <TableCell className="px-4 py-2.5 text-right text-sm text-red-600">৳ {s.interest.toLocaleString()}</TableCell>
                          <TableCell className="px-4 py-2.5 text-right text-sm font-bold text-slate-900 dark:text-white">৳ {s.installmentAmount.toLocaleString()}</TableCell>
                          <TableCell className="px-4 py-2.5 text-right text-sm text-emerald-600">{s.paidAmount > 0 ? `৳ ${s.paidAmount.toLocaleString()}` : "—"}</TableCell>
                          <TableCell className="px-4 py-2.5 text-center">
                            <Badge variant="outline" className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${INST_STATUS_STYLES[s.status] || ""}`}>
                              {s.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: loan info + guarantors */}
        <div className="space-y-4">
          <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-blue-600 text-white rounded-t-2xl px-5 py-2.5">
              <CardTitle className="flex items-center gap-2 text-sm font-bold"><FileSignature className="h-4 w-4" /> Loan Info</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2.5 text-sm">
              <Info label="Product" value={loan.product.name} />
              <Info label="Interest Rate" value={`${loan.interestRate}% (${loan.interestType.toLowerCase()})`} />
              <Info label="Frequency" value={loan.repaymentFreq.toLowerCase()} />
              <Info label="Installments" value={String(loan.numberOfInstallments)} />
              <Info label="Applied" value={new Date(loan.applicationDate).toLocaleDateString()} />
              {loan.disbursedDate && <Info label="Disbursed" value={new Date(loan.disbursedDate).toLocaleDateString()} />}
              {loan.expectedCloseDate && <Info label="Expected Close" value={new Date(loan.expectedCloseDate).toLocaleDateString()} />}
              {loan.closedDate && <Info label="Closed" value={new Date(loan.closedDate).toLocaleDateString()} />}
              {loan.purpose && <Info label="Purpose" value={loan.purpose} />}
            </CardContent>
          </Card>

          {loan.guarantors.length > 0 && (
            <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="bg-purple-600 text-white rounded-t-2xl px-5 py-2.5">
                <CardTitle className="flex items-center gap-2 text-sm font-bold"><User className="h-4 w-4" /> Guarantors</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2.5">
                {loan.guarantors.map((g) => (
                  <div key={g.id} className="pb-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0 last:pb-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{g.name}</p>
                    <p className="text-[11px] text-slate-500">{g.relation || "—"} {g.phone ? `· ${g.phone}` : ""}</p>
                    {g.nidNumber && <p className="text-[11px] text-slate-400">NID: {g.nidNumber}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Repayment history */}
      {loan.repayments.length > 0 && (
        <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 px-5 py-2.5 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white"><Banknote className="h-4 w-4 text-emerald-600" /> Repayment History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800/50 hover:bg-transparent">
                    <TableHead className="px-4 text-[11px] uppercase tracking-widest font-bold text-slate-400">Receipt</TableHead>
                    <TableHead className="px-4 text-[11px] uppercase tracking-widest font-bold text-slate-400">Date</TableHead>
                    <TableHead className="px-4 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Principal</TableHead>
                    <TableHead className="px-4 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Interest</TableHead>
                    <TableHead className="px-4 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Fine</TableHead>
                    <TableHead className="px-4 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Total</TableHead>
                    <TableHead className="px-4 text-[11px] uppercase tracking-widest font-bold text-slate-400">Method</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loan.repayments.map((r) => (
                    <TableRow key={r.id} className="border-b border-slate-100 dark:border-slate-800/50">
                      <TableCell className="px-4 py-2.5 font-mono text-xs text-slate-500">{r.receiptNo || "—"}</TableCell>
                      <TableCell className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">{new Date(r.paymentDate).toLocaleDateString()}</TableCell>
                      <TableCell className="px-4 py-2.5 text-right text-sm text-slate-600 dark:text-slate-300">৳ {r.principal.toLocaleString()}</TableCell>
                      <TableCell className="px-4 py-2.5 text-right text-sm text-red-600">৳ {r.interest.toLocaleString()}</TableCell>
                      <TableCell className="px-4 py-2.5 text-right text-sm text-orange-600">৳ {r.fine.toLocaleString()}</TableCell>
                      <TableCell className="px-4 py-2.5 text-right text-sm font-bold text-emerald-600">৳ {r.totalAmount.toLocaleString()}</TableCell>
                      <TableCell className="px-4 py-2.5 text-xs text-slate-500">{r.method}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
  border,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  bg: string
  border: string
}) {
  return (
    <Card className={`bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border ${border} ${bg} shadow-sm rounded-2xl overflow-hidden`}>
      <CardContent className="p-3 flex flex-row items-center justify-between gap-2">
        <div>
          <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 dark:text-slate-400">{label}</span>
          <h3 className={`text-lg font-extrabold tracking-tight ${color}`}>{value}</h3>
        </div>
        <div className={`p-2 rounded-lg bg-white/50 dark:bg-slate-900/50 border ${border}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </CardContent>
    </Card>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider shrink-0">{label}</span>
      <span className="text-[13px] text-slate-800 dark:text-slate-100 font-semibold text-right">{value}</span>
    </div>
  )
}
