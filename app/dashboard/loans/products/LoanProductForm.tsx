"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, PackagePlus, Settings2 } from "lucide-react"
import Link from "next/link"

export interface LoanProductData {
  id?: string
  name: string
  code?: string | null
  description?: string | null
  minAmount?: string | number
  maxAmount?: string | number
  interestRate?: string | number
  interestType?: string
  repaymentFreq?: string
  numberOfInstallments?: string | number
  gracePeriod?: string | number
  lateFinePerDay?: string | number | null
  processingFee?: string | number
  allowEarlySettlement?: boolean
  allowInterestWaiver?: boolean
  allowReschedule?: boolean
  allowManualSchedule?: boolean
  isActive?: boolean
}

const FREQ_OPTIONS = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "FORTNIGHTLY", label: "Fortnightly (2 weeks)" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "YEARLY", label: "Yearly" },
]

export default function LoanProductForm({
  product,
  action,
}: {
  product?: LoanProductData
  action: (formData: FormData) => Promise<void>
}) {
  const isEdit = !!product?.id
  const [interestType, setInterestType] = useState(product?.interestType || "FLAT")
  const [repaymentFreq, setRepaymentFreq] = useState(product?.repaymentFreq || "MONTHLY")
  const [allowEarly, setAllowEarly] = useState(product?.allowEarlySettlement ?? true)
  const [allowWaiver, setAllowWaiver] = useState(product?.allowInterestWaiver ?? false)
  const [allowReschedule, setAllowReschedule] = useState(product?.allowReschedule ?? false)
  const [allowManual, setAllowManual] = useState(product?.allowManualSchedule ?? false)

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Sticky Action Bar */}
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-white dark:bg-slate-950 border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="flex items-center justify-between max-w-4xl">
          <Link href="/dashboard/loans">
            <Button variant="outline" size="sm" className="rounded-xl shadow-sm bg-slate-50 dark:bg-slate-900">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Loans
            </Button>
          </Link>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            {isEdit ? <Settings2 className="h-5 w-5 text-indigo-600" /> : <PackagePlus className="h-5 w-5 text-indigo-600" />}
            {isEdit ? "Edit Loan Product" : "New Loan Product"}
          </h1>
          <div className="w-[120px]" />
        </div>
      </div>

      <form action={action} className="space-y-6">
        {/* Identity & Amounts */}
        <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="bg-indigo-600 text-white rounded-t-2xl border-b border-slate-100 dark:border-slate-800 px-5 py-2.5">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <PackagePlus className="h-4 w-4" /> Product Identity & Limits
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label htmlFor="name">Product Name *</Label>
              <Input id="name" name="name" required defaultValue={product?.name} placeholder="e.g. Micro Business Loan" className="bg-white dark:bg-slate-950" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Product Code</Label>
              <Input id="code" name="code" defaultValue={product?.code || ""} placeholder="e.g. MBL-01" className="bg-white dark:bg-slate-950" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" defaultValue={product?.description || ""} rows={2} placeholder="Short description of the loan product" className="bg-white dark:bg-slate-950" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minAmount">Min Amount (৳)</Label>
              <Input id="minAmount" name="minAmount" type="number" step="0.01" defaultValue={product?.minAmount ?? 0} className="bg-white dark:bg-slate-950" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxAmount">Max Amount (৳) *</Label>
              <Input id="maxAmount" name="maxAmount" type="number" step="0.01" required defaultValue={product?.maxAmount ?? 0} className="bg-white dark:bg-slate-950" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="processingFee">Processing Fee (৳)</Label>
              <Input id="processingFee" name="processingFee" type="number" step="0.01" defaultValue={product?.processingFee ?? 0} className="bg-white dark:bg-slate-950" />
            </div>
            {/* Active toggle (create only) */}
            {!isEdit && (
              <div className="space-y-2 flex items-end">
                <label className="flex items-center gap-3 cursor-pointer">
                  <Input type="checkbox" name="isActive" defaultChecked className="hidden" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Active on creation</span>
                </label>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Interest & Repayment Terms */}
        <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="bg-emerald-600 text-white rounded-t-2xl border-b border-slate-100 dark:border-slate-800 px-5 py-2.5">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <Settings2 className="h-4 w-4" /> Interest & Repayment Terms
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label htmlFor="interestRate">Interest Rate (annual %) *</Label>
              <Input id="interestRate" name="interestRate" type="number" step="0.01" required defaultValue={product?.interestRate ?? 12} className="bg-white dark:bg-slate-950" />
            </div>
            <div className="space-y-2">
              <Label>Interest Type</Label>
              <input type="hidden" name="interestType" value={interestType} />
              <Select value={interestType} onValueChange={(v) => setInterestType(v ?? "FLAT")}>
                <SelectTrigger className="w-full bg-white dark:bg-slate-950"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FLAT">Flat (Simple on Principal)</SelectItem>
                  <SelectItem value="REDUCING">Reducing Balance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Repayment Frequency *</Label>
              <input type="hidden" name="repaymentFreq" value={repaymentFreq} />
              <Select value={repaymentFreq} onValueChange={(v) => setRepaymentFreq(v ?? "MONTHLY")}>
                <SelectTrigger className="w-full bg-white dark:bg-slate-950"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREQ_OPTIONS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="numberOfInstallments">Number of Installments *</Label>
              <Input id="numberOfInstallments" name="numberOfInstallments" type="number" required defaultValue={product?.numberOfInstallments ?? 12} className="bg-white dark:bg-slate-950" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gracePeriod">Grace Period (days)</Label>
              <Input id="gracePeriod" name="gracePeriod" type="number" defaultValue={product?.gracePeriod ?? 0} className="bg-white dark:bg-slate-950" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lateFinePerDay">Late Fine / Day (৳)</Label>
              <Input id="lateFinePerDay" name="lateFinePerDay" type="number" step="0.01" defaultValue={product?.lateFinePerDay ?? ""} placeholder="optional" className="bg-white dark:bg-slate-950" />
            </div>
          </CardContent>
        </Card>

        {/* Permissions */}
        <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="bg-amber-600 text-white rounded-t-2xl border-b border-slate-100 dark:border-slate-800 px-5 py-2.5">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <Settings2 className="h-4 w-4" /> Allowed Operations
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <ToggleRow name="allowEarlySettlement" label="Allow Early Settlement" checked={allowEarly} onChange={setAllowEarly} />
            <ToggleRow name="allowInterestWaiver" label="Allow Interest Waiver" checked={allowWaiver} onChange={setAllowWaiver} />
            <ToggleRow name="allowReschedule" label="Allow Reschedule" checked={allowReschedule} onChange={setAllowReschedule} />
            <ToggleRow name="allowManualSchedule" label="Allow Manual Schedule Override" checked={allowManual} onChange={setAllowManual} />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href="/dashboard/loans">
            <Button type="button" variant="outline" className="rounded-xl">Cancel</Button>
          </Link>
          <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 rounded-xl px-8">
            {isEdit ? "Save Changes" : "Create Product"}
          </Button>
        </div>
      </form>
    </div>
  )
}

function ToggleRow({ name, label, checked, onChange }: { name: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
      {/* Render a hidden checkbox so FormData carries the value when toggled on */}
      <input type="checkbox" name={name} checked={checked} readOnly className="hidden" />
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
