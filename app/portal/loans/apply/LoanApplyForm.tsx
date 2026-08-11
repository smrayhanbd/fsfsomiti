"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { applyMemberLoan } from "@/app/actions/portal"
import { generateSchedule } from "@/lib/loanSchedule"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { FilePlus2, Banknote, Percent, CalendarClock, TrendingUp, Users, Plus, Trash2, AlertCircle } from "lucide-react"
import { isNextRedirect } from "@/lib/nextRedirect"

export interface ProductOption {
  id: string
  name: string
  code: string | null
  minAmount: number
  maxAmount: number
  interestRate: number
  interestType: "FLAT" | "REDUCING"
  repaymentFreq: "DAILY" | "WEEKLY" | "FORTNIGHTLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM"
  numberOfInstallments: number
  gracePeriod: number
  processingFee: number
}

function fmt(n: number) {
  return `৳ ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

export default function LoanApplyForm({ memberId, products }: { memberId: string; products: ProductOption[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [productId, setProductId] = useState<string>("")
  const [principal, setPrincipal] = useState<string>("")
  const [installments, setInstallments] = useState<string>("")
  const [interestRate, setInterestRate] = useState<string>("")
  const [purpose, setPurpose] = useState<string>("")
  const [notes, setNotes] = useState<string>("")
  const [guarantors, setGuarantors] = useState<{ name: string; relation: string; phone: string }[]>([])

  const selected = useMemo(() => products.find((p) => p.id === productId) || null, [products, productId])

  // Live schedule preview using the same engine the server uses.
  const preview = useMemo(() => {
    if (!selected) return null
    const principalNum = parseFloat(principal)
    if (!Number.isFinite(principalNum) || principalNum <= 0) return null
    const tenure = parseInt(installments, 10) || selected.numberOfInstallments
    const rate = parseFloat(interestRate) || selected.interestRate
    try {
      return generateSchedule({
        principal: principalNum,
        annualRate: rate,
        interestType: selected.interestType,
        repaymentFreq: selected.repaymentFreq,
        numberOfInstallments: tenure,
        disburseDate: new Date(),
        gracePeriod: selected.gracePeriod,
      })
    } catch {
      return null
    }
  }, [selected, principal, installments, interestRate])

  // Validation messages for the amount field against product limits.
  const amountError = useMemo(() => {
    if (!selected || !principal) return null
    const n = parseFloat(principal)
    if (!Number.isFinite(n) || n <= 0) return "Enter a valid amount."
    if (selected.minAmount > 0 && n < selected.minAmount) return `Minimum is ${fmt(selected.minAmount)}.`
    if (selected.maxAmount > 0 && n > selected.maxAmount) return `Maximum is ${fmt(selected.maxAmount)}.`
    return null
  }, [selected, principal])

  const onProductChange = (id: string) => {
    const p = products.find((x) => x.id === id)
    setProductId(id)
    if (p) {
      setInterestRate(String(p.interestRate))
      setInstallments(String(p.numberOfInstallments))
      if (p.minAmount > 0 && !principal) setPrincipal(String(p.minAmount))
    }
  }

  const addGuarantor = () => setGuarantors((g) => [...g, { name: "", relation: "", phone: "" }])
  const removeGuarantor = (i: number) => setGuarantors((g) => g.filter((_, idx) => idx !== i))
  const updateGuarantor = (i: number, field: "name" | "relation" | "phone", value: string) =>
    setGuarantors((g) => g.map((x, idx) => (idx === i ? { ...x, [field]: value } : x)))

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selected) return toast.error("Select a loan product")
    if (amountError) return toast.error("Invalid amount", { description: amountError })

    setLoading(true)
    const formData = new FormData()
    formData.set("productId", productId)
    formData.set("principal", principal)
    formData.set("interestRate", interestRate || String(selected.interestRate))
    formData.set("numberOfInstallments", installments || String(selected.numberOfInstallments))
    formData.set("purpose", purpose)
    formData.set("notes", notes)
    formData.set(
      "guarantors",
      JSON.stringify(guarantors.filter((g) => g.name.trim()))
    )

    try {
      await applyMemberLoan(memberId, formData)
      // applyMemberLoan ends with redirect() → the lines below are normally
      // unreachable, but kept for clarity/type safety.
      toast.success("Application submitted", { description: "Your loan application is pending review." })
      router.push("/portal/loans")
    } catch (err: unknown) {
      // The action ends with redirect(), which throws NEXT_REDIRECT — that is
      // the success path (page navigates to /portal/loans), not an error.
      // Re-throw so Next handles navigation; only toast genuine errors
      // (validation throws, etc.).
      if (isNextRedirect(err)) throw err
      const msg = err instanceof Error ? err.message : "Something went wrong."
      toast.error("Application failed", { description: msg })
      setLoading(false)
    }
  }

  if (products.length === 0) {
    return (
      <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl">
        <CardContent className="p-12 text-center">
          <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-7 w-7 text-slate-400" />
          </div>
          <h3 className="font-semibold text-slate-800 dark:text-white">No loan products available</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            There are currently no active loan products configured. Please check back later or contact management.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      {/* Left: form */}
      <div className="lg:col-span-2 space-y-6">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4">
            <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
              <FilePlus2 className="h-4 w-4 text-indigo-500" /> Loan Application
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-5">
            {/* Product */}
            <div className="space-y-2">
              <Label htmlFor="product">Loan Product <span className="text-rose-500">*</span></Label>
              <Select value={productId} onValueChange={(v) => onProductChange(v ?? "")} required>
                <SelectTrigger id="product"><SelectValue placeholder="Choose a loan product" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.code ? `(${p.code})` : ""} · {Number(p.interestRate)}% {p.interestType.toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selected && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 text-xs">
                <div>
                  <p className="text-slate-400 uppercase tracking-wider font-bold">Range</p>
                  <p className="font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                    {selected.minAmount > 0 ? fmt(selected.minAmount) : "—"} – {selected.maxAmount > 0 ? fmt(selected.maxAmount) : "∞"}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 uppercase tracking-wider font-bold">Default Tenure</p>
                  <p className="font-semibold text-slate-700 dark:text-slate-200 mt-0.5">{selected.numberOfInstallments} {selected.repaymentFreq.toLowerCase().replace(/ly$/, "")}(s)</p>
                </div>
                <div>
                  <p className="text-slate-400 uppercase tracking-wider font-bold">Processing Fee</p>
                  <p className="font-semibold text-slate-700 dark:text-slate-200 mt-0.5">{fmt(selected.processingFee)}</p>
                </div>
              </div>
            )}

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="principal">Principal Amount <span className="text-rose-500">*</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">৳</span>
                <Input
                  id="principal"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="0.00"
                  value={principal}
                  onChange={(e) => setPrincipal(e.target.value)}
                  className={`pl-7 ${amountError ? "border-rose-400 focus-visible:ring-rose-500" : ""}`}
                />
              </div>
              {amountError ? (
                <p className="text-xs text-rose-600">{amountError}</p>
              ) : (
                selected && <p className="text-xs text-slate-500">Allowed: {selected.minAmount > 0 ? fmt(selected.minAmount) : "0"} to {selected.maxAmount > 0 ? fmt(selected.maxAmount) : "no limit"}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Rate */}
              <div className="space-y-2">
                <Label htmlFor="interestRate">Interest Rate (%)</Label>
                <Input
                  id="interestRate"
                  type="number"
                  step="0.01"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                  placeholder="Product default"
                />
                <p className="text-xs text-slate-500">Leave unchanged to use the product rate.</p>
              </div>
              {/* Tenure */}
              <div className="space-y-2">
                <Label htmlFor="numberOfInstallments">Number of Installments</Label>
                <Input
                  id="numberOfInstallments"
                  type="number"
                  min="1"
                  value={installments}
                  onChange={(e) => setInstallments(e.target.value)}
                  placeholder="Product default"
                />
              </div>
            </div>

            {/* Purpose */}
            <div className="space-y-2">
              <Label htmlFor="purpose">Purpose of Loan</Label>
              <Textarea
                id="purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Describe what the loan is for (optional)"
                rows={2}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything else management should know (optional)"
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Guarantors */}
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
              <Users className="h-4 w-4 text-indigo-500" /> Guarantors
              <span className="text-xs font-normal text-slate-400">(optional)</span>
            </CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addGuarantor}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </CardHeader>
          <CardContent className="p-6 space-y-3">
            {guarantors.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No guarantors added. Click &quot;Add&quot; to include one.</p>
            ) : (
              guarantors.map((g, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Name</Label>
                    <Input value={g.name} onChange={(e) => updateGuarantor(i, "name", e.target.value)} placeholder="Full name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Relation</Label>
                    <Input value={g.relation} onChange={(e) => updateGuarantor(i, "relation", e.target.value)} placeholder="e.g. Brother" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Phone</Label>
                    <Input value={g.phone} onChange={(e) => updateGuarantor(i, "phone", e.target.value)} placeholder="Phone" />
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeGuarantor(i)} className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right: live preview */}
      <div className="lg:sticky lg:top-6 space-y-6">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4">
            <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
              <TrendingUp className="h-4 w-4 text-indigo-500" /> Live Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {preview ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1"><Banknote className="h-3 w-3" /> Installment</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">{fmt(preview.installmentAmount)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1"><Percent className="h-3 w-3" /> Total Interest</p>
                    <p className="text-lg font-bold text-amber-600 mt-0.5">{fmt(preview.totalInterest)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Total Payable</p>
                    <p className="text-lg font-bold text-indigo-600 mt-0.5">{fmt(preview.totalPayable)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1"><CalendarClock className="h-3 w-3" /> First Due</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                      {preview.rows[0] ? new Date(preview.rows[0].dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-slate-200/60 dark:border-slate-800/60">
                        <TableHead className="px-3 py-2 text-[10px] uppercase font-bold text-slate-400">#</TableHead>
                        <TableHead className="px-3 py-2 text-[10px] uppercase font-bold text-slate-400">Due</TableHead>
                        <TableHead className="px-3 py-2 text-right text-[10px] uppercase font-bold text-slate-400">Amt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.rows.slice(0, 5).map((r) => (
                        <TableRow key={r.installmentNo} className="border-slate-100 dark:border-slate-800/50 last:border-0">
                          <TableCell className="px-3 py-1.5 text-xs text-slate-500">{r.installmentNo}</TableCell>
                          <TableCell className="px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200">
                            {new Date(r.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </TableCell>
                          <TableCell className="px-3 py-1.5 text-xs text-right font-semibold text-slate-900 dark:text-white">{fmt(r.installmentAmount)}</TableCell>
                        </TableRow>
                      ))}
                      {preview.rows.length > 5 && (
                        <TableRow className="border-0">
                          <TableCell colSpan={3} className="px-3 py-1.5 text-center text-[11px] text-slate-400">
                            + {preview.rows.length - 5} more installments
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <TrendingUp className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">
                  {selected ? "Enter a principal amount to see the repayment preview." : "Select a product to see a preview."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Submitting creates a <Badge variant="outline" className="mx-1 bg-white dark:bg-slate-900 text-amber-700 border-amber-200">PENDING</Badge>
            application. Management will review and approve before disbursement.
          </p>
        </div>

        <Button type="submit" disabled={loading || !selected || !!amountError} className="w-full bg-indigo-600 hover:bg-indigo-700 h-11 text-base shadow-sm">
          {loading ? "Submitting..." : "Submit Application"}
        </Button>
      </div>
    </form>
  )
}
