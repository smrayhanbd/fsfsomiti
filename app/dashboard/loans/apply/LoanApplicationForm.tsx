"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { generateSchedule, type InterestType, type RepaymentFreq } from "@/lib/loanSchedule"
import { applyLoan, quickDisburseLoan } from "@/app/actions/loan"
import { toast } from "sonner"
import {
  ArrowLeft, Search, User, Landmark, Percent, Calendar, Wallet,
  FileSignature, PlusCircle, Trash2, Sparkles, Calculator,
} from "lucide-react"
import Link from "next/link"

export interface ProductOption {
  id: string
  name: string
  code: string | null
  interestRate: string | number
  interestType: string
  repaymentFreq: string
  numberOfInstallments: number
  minAmount: string | number
  maxAmount: string | number
  gracePeriod: number
  allowManualSchedule: boolean
}

export interface MemberOption {
  id: string
  fullName: string
  memberNo: string
  phone: string
}

const FREQ_LABEL: Record<string, string> = {
  DAILY: "Daily", WEEKLY: "Weekly", FORTNIGHTLY: "Fortnightly",
  MONTHLY: "Monthly", QUARTERLY: "Quarterly", YEARLY: "Yearly", CUSTOM: "Custom",
}

export default function LoanApplicationForm({
  products, members, defaultProductId,
}: {
  products: ProductOption[]
  members: MemberOption[]
  defaultProductId?: string
}) {
  const today = new Date().toISOString().split("T")[0]

  // Member search & selection
  const [search, setSearch] = useState("")
  const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null)
  const filteredMembers = useMemo(() => {
    if (!search) return []
    const q = search.toLowerCase()
    return members
      .filter((m) => m.fullName.toLowerCase().includes(q) || m.memberNo.toLowerCase().includes(q) || m.phone.includes(q))
      .slice(0, 6)
  }, [search, members])

  // Product + terms
  const [productId, setProductId] = useState(defaultProductId || products[0]?.id || "")
  const [principal, setPrincipal] = useState("")
  const [numberOfInstallments, setNumberOfInstallments] = useState("")
  const [interestRate, setInterestRate] = useState("")
  const [interestType, setInterestType] = useState<string>("FLAT")
  const [repaymentFreq, setRepaymentFreq] = useState<string>("MONTHLY")
  const [gracePeriod, setGracePeriod] = useState("0")
  const [disburseDate, setDisburseDate] = useState(today)
  const [purpose, setPurpose] = useState("")

  // Guarantors
  const [guarantors, setGuarantors] = useState<{ name: string; relation: string; phone: string; nidNumber: string; address: string }[]>([])

  const product = products.find((p) => p.id === productId)

  // When a product is selected, prefill its defaults if the field is empty.
  const applyProductDefaults = (id: string) => {
    setProductId(id)
    const p = products.find((x) => x.id === id)
    if (!p) return
    setInterestRate(String(p.interestRate))
    setInterestType(p.interestType)
    setRepaymentFreq(p.repaymentFreq)
    setNumberOfInstallments(String(p.numberOfInstallments))
    setGracePeriod(String(p.gracePeriod ?? 0))
  }

  // Live schedule preview (client-side, same engine as the server action).
  const preview = useMemo(() => {
    const p = parseFloat(principal)
    const n = parseInt(numberOfInstallments, 10)
    const rate = parseFloat(interestRate)
    if (!p || p <= 0 || !n || n <= 0 || !disburseDate) return null
    try {
      return generateSchedule({
        principal: p,
        annualRate: rate || 0,
        interestType: interestType as InterestType,
        repaymentFreq: repaymentFreq as RepaymentFreq,
        numberOfInstallments: n,
        disburseDate: new Date(disburseDate),
        gracePeriod: parseInt(gracePeriod, 10) || 0,
      })
    } catch {
      return null
    }
  }, [principal, numberOfInstallments, interestRate, interestType, repaymentFreq, gracePeriod, disburseDate])

  // Validate against product limits for inline feedback.
  const limitWarning = useMemo(() => {
    if (!product || !principal) return null
    const p = parseFloat(principal)
    if (Number(product.minAmount) > 0 && p < Number(product.minAmount))
      return `Below minimum (৳ ${Number(product.minAmount).toLocaleString()})`
    if (Number(product.maxAmount) > 0 && p > Number(product.maxAmount))
      return `Above maximum (৳ ${Number(product.maxAmount).toLocaleString()})`
    return null
  }, [product, principal])

  const addGuarantor = () =>
    setGuarantors((g) => [...g, { name: "", relation: "", phone: "", nidNumber: "", address: "" }])
  const removeGuarantor = (i: number) => setGuarantors((g) => g.filter((_, idx) => idx !== i))
  const updateGuarantor = (i: number, field: string, value: string) =>
    setGuarantors((g) => g.map((x, idx) => (idx === i ? { ...x, [field]: value } : x)))

  const buildFormData = (): FormData | null => {
    if (!selectedMember) { toast.error("Select a member first."); return null }
    if (!productId) { toast.error("Select a loan product."); return null }
    if (!principal || parseFloat(principal) <= 0) { toast.error("Enter a valid principal."); return null }
    if (!numberOfInstallments || parseInt(numberOfInstallments, 10) <= 0) { toast.error("Enter number of installments."); return null }
    if (limitWarning) { toast.error("Amount out of product limits.", { description: limitWarning }); return null }

    const fd = new FormData()
    fd.append("memberId", selectedMember.id)
    fd.append("productId", productId)
    fd.append("principal", principal)
    fd.append("numberOfInstallments", numberOfInstallments)
    fd.append("interestRate", interestRate || String(product?.interestRate ?? 0))
    fd.append("interestType", interestType)
    fd.append("repaymentFreq", repaymentFreq)
    fd.append("gracePeriod", gracePeriod || "0")
    fd.append("disburseDate", disburseDate)
    fd.append("purpose", purpose)
    fd.append("guarantors", JSON.stringify(guarantors.filter((g) => g.name.trim())))
    return fd
  }

  const handleApply = async () => {
    const fd = buildFormData()
    if (!fd) return
    try {
      await applyLoan(fd)
      toast.success("Loan application submitted", { description: "Awaiting approval." })
    } catch (e) {
      toast.error("Could not submit", { description: e instanceof Error ? e.message : "Failed" })
    }
  }

  const handleQuickDisburse = async () => {
    const fd = buildFormData()
    if (!fd) return
    if (!confirm("Disburse this loan directly now? It will be marked active immediately.")) return
    try {
      await quickDisburseLoan(fd)
      toast.success("Loan disbursed", { description: "The loan is now active." })
    } catch (e) {
      toast.error("Could not disburse", { description: e instanceof Error ? e.message : "Failed" })
    }
  }

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link href="/dashboard/loans" className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline mb-2">
            <ArrowLeft className="h-4 w-4" /> Back to Loans
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <FileSignature className="h-7 w-7 text-indigo-600" /> New Loan
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Create a loan application or disburse directly.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: form (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Member search */}
          <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-indigo-600 text-white rounded-t-2xl px-5 py-2.5">
              <CardTitle className="flex items-center gap-2 text-sm font-bold"><User className="h-4 w-4" /> Select Member</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by name, member no, or phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-white dark:bg-slate-950 h-11"
                  disabled={!!selectedMember}
                />
              </div>
              {!selectedMember && filteredMembers.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredMembers.map((m) => (
                    <button key={m.id} onClick={() => { setSelectedMember(m); setSearch("") }}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 font-bold text-xs">
                        {m.fullName.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{m.fullName}</p>
                        <p className="text-xs text-slate-500">{m.memberNo} • {m.phone}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {selectedMember && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 font-bold">
                      {selectedMember.fullName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{selectedMember.fullName}</p>
                      <p className="text-xs text-slate-500">{selectedMember.memberNo} • {selectedMember.phone}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedMember(null)}>Change</Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Loan terms */}
          <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-emerald-600 text-white rounded-t-2xl px-5 py-2.5">
              <CardTitle className="flex items-center gap-2 text-sm font-bold"><Calculator className="h-4 w-4" /> Loan Terms</CardTitle>
            </CardHeader>
            <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>Loan Product *</Label>
                <input type="hidden" name="productId" value={productId} />
                <Select value={productId} onValueChange={(v) => v && applyProductDefaults(v)}>
                  <SelectTrigger className="w-full bg-white dark:bg-slate-950"><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.interestRate}% · {FREQ_LABEL[p.repaymentFreq]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {products.length === 0 && <p className="text-xs text-red-500">Create a loan product first.</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="principal">Principal Amount (৳) *</Label>
                <div className="relative">
                  <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input id="principal" type="number" step="0.01" value={principal} onChange={(e) => setPrincipal(e.target.value)} className="pl-9 bg-white dark:bg-slate-950" placeholder="50000" />
                </div>
                {limitWarning && <p className="text-xs text-red-500">{limitWarning}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="interestRate">Interest Rate (annual %)</Label>
                <div className="relative">
                  <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input id="interestRate" type="number" step="0.01" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} className="pl-9 bg-white dark:bg-slate-950" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Interest Type</Label>
                <input type="hidden" name="interestType" value={interestType} />
                <Select value={interestType} onValueChange={(v) => setInterestType(v ?? "FLAT")}>
                  <SelectTrigger className="w-full bg-white dark:bg-slate-950"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FLAT">Flat</SelectItem>
                    <SelectItem value="REDUCING">Reducing Balance</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Repayment Frequency</Label>
                <input type="hidden" name="repaymentFreq" value={repaymentFreq} />
                <Select value={repaymentFreq} onValueChange={(v) => setRepaymentFreq(v ?? "MONTHLY")}>
                  <SelectTrigger className="w-full bg-white dark:bg-slate-950"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQ_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="numberOfInstallments">Number of Installments *</Label>
                <Input id="numberOfInstallments" type="number" value={numberOfInstallments} onChange={(e) => setNumberOfInstallments(e.target.value)} className="bg-white dark:bg-slate-950" placeholder="12" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gracePeriod">Grace Period (days)</Label>
                <Input id="gracePeriod" type="number" value={gracePeriod} onChange={(e) => setGracePeriod(e.target.value)} className="bg-white dark:bg-slate-950" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="disburseDate">Start / Disburse Date *</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input id="disburseDate" type="date" value={disburseDate} onChange={(e) => setDisburseDate(e.target.value)} className="pl-9 bg-white dark:bg-slate-950" />
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="purpose">Purpose / Notes</Label>
                <Textarea id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2} placeholder="Reason for loan..." className="bg-white dark:bg-slate-950" />
              </div>
            </CardContent>
          </Card>

          {/* Guarantors */}
          <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-purple-600 text-white rounded-t-2xl px-5 py-2.5 flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-bold"><FileSignature className="h-4 w-4" /> Guarantors</CardTitle>
              <Button type="button" size="sm" variant="secondary" onClick={addGuarantor} className="bg-white/20 hover:bg-white/30 text-white">
                <PlusCircle className="h-4 w-4 mr-1" /> Add
              </Button>
            </CardHeader>
            <CardContent className="p-5 space-y-3">
              {guarantors.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No guarantors added (optional).</p>
              ) : (
                guarantors.map((g, i) => (
                  <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="space-y-1 md:col-span-3">
                      <Label className="text-xs">Name</Label>
                      <Input value={g.name} onChange={(e) => updateGuarantor(i, "name", e.target.value)} className="bg-white dark:bg-slate-950 h-9" />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-xs">Relation</Label>
                      <Input value={g.relation} onChange={(e) => updateGuarantor(i, "relation", e.target.value)} className="bg-white dark:bg-slate-950 h-9" />
                    </div>
                    <div className="space-y-1 md:col-span-3">
                      <Label className="text-xs">Phone</Label>
                      <Input value={g.phone} onChange={(e) => updateGuarantor(i, "phone", e.target.value)} className="bg-white dark:bg-slate-950 h-9" />
                    </div>
                    <div className="space-y-1 md:col-span-3">
                      <Label className="text-xs">NID</Label>
                      <Input value={g.nidNumber} onChange={(e) => updateGuarantor(i, "nidNumber", e.target.value)} className="bg-white dark:bg-slate-950 h-9" />
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="md:col-span-1 text-red-500" onClick={() => removeGuarantor(i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: summary + schedule preview (1 col, sticky) */}
        <div className="space-y-6">
          <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden sticky top-4">
            <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 px-5 py-2.5 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white">
                <Sparkles className="h-4 w-4 text-indigo-600" /> Live Calculation
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-3">
              <SummaryRow label="Principal" value={preview ? `৳ ${preview.totalPrincipal.toLocaleString()}` : "—"} />
              <SummaryRow label="Total Interest" value={preview ? `৳ ${preview.totalInterest.toLocaleString()}` : "—"} accent="text-red-600" />
              <SummaryRow label="Total Payable" value={preview ? `৳ ${preview.totalPayable.toLocaleString()}` : "—"} accent="text-slate-900 dark:text-white" bold />
              <SummaryRow label="Per Installment" value={preview ? `৳ ${preview.installmentAmount.toLocaleString()}` : "—"} accent="text-emerald-600" bold />
              {product && (
                <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{product.name}</Badge>
                  <Badge variant="outline" className="text-[10px] capitalize">{interestType.toLowerCase()}</Badge>
                  <Badge variant="outline" className="text-[10px] capitalize">{FREQ_LABEL[repaymentFreq]}</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="space-y-3">
            <Button onClick={handleApply} disabled={!preview} className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-base">
              <FileSignature className="mr-2 h-5 w-5" /> Submit Application
            </Button>
            <Button onClick={handleQuickDisburse} disabled={!preview} variant="outline" className="w-full h-11 border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
              <Landmark className="mr-2 h-4 w-4" /> Quick Disburse
            </Button>
          </div>
        </div>
      </div>

      {/* Schedule preview table */}
      {preview && (
        <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 px-5 py-2.5 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white">
              <Calendar className="h-4 w-4 text-indigo-600" /> Amortization Schedule Preview
            </CardTitle>
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
                    <TableHead className="px-4 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.slice(0, 24).map((r) => (
                    <TableRow key={r.installmentNo} className="border-b border-slate-100 dark:border-slate-800/50">
                      <TableCell className="px-4 py-2 font-mono text-xs text-slate-500">{r.installmentNo}</TableCell>
                      <TableCell className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300">{new Date(r.dueDate).toLocaleDateString()}</TableCell>
                      <TableCell className="px-4 py-2 text-right text-sm text-slate-600 dark:text-slate-300">৳ {r.principal.toLocaleString()}</TableCell>
                      <TableCell className="px-4 py-2 text-right text-sm text-red-600">৳ {r.interest.toLocaleString()}</TableCell>
                      <TableCell className="px-4 py-2 text-right text-sm font-bold text-slate-900 dark:text-white">৳ {r.installmentAmount.toLocaleString()}</TableCell>
                      <TableCell className="px-4 py-2 text-right text-sm text-slate-500">৳ {r.balanceAfter.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {preview.rows.length > 24 && (
                    <TableRow>
                      <TableCell colSpan={6} className="px-4 py-3 text-center text-xs text-slate-400">
                        + {preview.rows.length - 24} more installments
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SummaryRow({ label, value, accent, bold }: { label: string; value: string; accent?: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`${bold ? "font-bold text-base" : "font-semibold"} ${accent || "text-slate-900 dark:text-white"}`}>{value}</span>
    </div>
  )
}
