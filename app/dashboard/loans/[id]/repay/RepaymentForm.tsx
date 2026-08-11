"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { recordRepayment } from "@/app/actions/loan"
import { toast } from "sonner"
import { ArrowLeft, Banknote, Percent, AlertCircle, Calendar, CheckCircle, Wallet } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

export interface RepaymentLoanData {
  id: string
  loanNo: string
  memberName: string
  memberNo: string
  outstanding: number
  nextDueAmount: number
  nextDueDate: string | null
  installmentAmount: number
}

export default function RepaymentForm({ loan }: { loan: RepaymentLoanData }) {
  const router = useRouter()
  const today = new Date().toISOString().split("T")[0]

  const [principal, setPrincipal] = useState("")
  const [interest, setInterest] = useState("")
  const [fine, setFine] = useState("")
  const [method, setMethod] = useState("CASH")
  const [referenceNo, setReferenceNo] = useState("")
  const [paymentDate, setPaymentDate] = useState(today)
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const total = useMemo(() => {
    const p = parseFloat(principal) || 0
    const i = parseFloat(interest) || 0
    const f = parseFloat(fine) || 0
    return Math.round((p + i + f) * 100) / 100
  }, [principal, interest, fine])

  // Prefill with the next-due installment suggestion.
  const applySuggested = () => {
    setPrincipal(String(loan.installmentAmount))
    setInterest("")
    setFine("")
  }

  const handleSubmit = async () => {
    if (total <= 0) { toast.error("Enter an amount greater than zero."); return }
    setSaving(true)
    try {
      await recordRepayment(loan.id, {
        principal: parseFloat(principal) || 0,
        interest: parseFloat(interest) || 0,
        fine: parseFloat(fine) || 0,
        method,
        referenceNo,
        paymentDate,
        notes,
      })
      toast.success("Repayment recorded", { description: `Receipt for ${loan.memberName}` })
      router.push(`/dashboard/loans/${loan.id}`)
    } catch (e) {
      toast.error("Could not record repayment", { description: e instanceof Error ? e.message : "Failed" })
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link href={`/dashboard/loans/${loan.id}`} className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline mb-2">
          <ArrowLeft className="h-4 w-4" /> Back to Loan
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <Wallet className="h-7 w-7 text-emerald-600" /> Record Repayment
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Loan <span className="font-mono font-semibold">{loan.loanNo}</span> · {loan.memberName} ({loan.memberNo})
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="Outstanding" value={`৳ ${loan.outstanding.toLocaleString()}`} accent="text-rose-600" />
        <Stat label="Next Due Amount" value={`৳ ${loan.nextDueAmount.toLocaleString()}`} accent="text-slate-900 dark:text-white" />
        <Stat label="Next Due Date" value={loan.nextDueDate ? new Date(loan.nextDueDate).toLocaleDateString() : "—"} accent="text-amber-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-emerald-600 text-white rounded-t-2xl px-5 py-2.5">
              <CardTitle className="flex items-center gap-2 text-sm font-bold"><Banknote className="h-4 w-4" /> Payment Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="principal">Principal (৳)</Label>
                <div className="relative">
                  <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input id="principal" type="number" step="0.01" value={principal} onChange={(e) => setPrincipal(e.target.value)} className="pl-9 bg-white dark:bg-slate-950" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="interest">Interest (৳)</Label>
                <div className="relative">
                  <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input id="interest" type="number" step="0.01" value={interest} onChange={(e) => setInterest(e.target.value)} className="pl-9 bg-white dark:bg-slate-950" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fine">Fine (৳)</Label>
                <div className="relative">
                  <AlertCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input id="fine" type="number" step="0.01" value={fine} onChange={(e) => setFine(e.target.value)} className="pl-9 bg-white dark:bg-slate-950" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <input type="hidden" name="method" value={method} />
                <Select value={method} onValueChange={(v) => setMethod(v ?? "CASH")}>
                  <SelectTrigger className="w-full bg-white dark:bg-slate-950"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="BKASH">bKash</SelectItem>
                    <SelectItem value="BANK">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentDate">Payment Date</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input id="paymentDate" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="pl-9 bg-white dark:bg-slate-950" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="referenceNo">Reference No</Label>
                <Input id="referenceNo" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} className="bg-white dark:bg-slate-950" placeholder="Txn / Cheque No" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-white dark:bg-slate-950" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        <div className="space-y-4">
          <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden sticky top-4">
            <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 px-5 py-2.5 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-sm font-bold text-slate-800 dark:text-white">Summary</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-3">
              <Button variant="outline" className="w-full" onClick={applySuggested} disabled={loan.installmentAmount <= 0}>
                Use Next Due (৳ {loan.installmentAmount.toLocaleString()})
              </Button>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Total Collected:</span>
                <span className="text-xl font-extrabold text-emerald-600">৳ {total.toLocaleString()}</span>
              </div>
              <Button onClick={handleSubmit} disabled={saving || total <= 0} className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-base">
                <CheckCircle className="mr-2 h-5 w-5" /> {saving ? "Saving..." : "Record Payment"}
              </Button>
              <p className="text-[11px] text-slate-400 text-center">
                A mirrored LOAN_PAYMENT entry will be added to the member&apos;s ledger.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
      <CardContent className="p-4">
        <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">{label}</p>
        <p className={`text-lg font-extrabold ${accent}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
