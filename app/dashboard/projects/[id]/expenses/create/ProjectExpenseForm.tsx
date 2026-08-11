"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { ArrowLeft, TrendingDown, BookOpen, Save } from "lucide-react"

import PageHeader from "@/components/somiti/PageHeader"
import SectionCard from "@/components/somiti/SectionCard"
import { formatBDT } from "@/components/somiti/Money"
import { recordProjectExpense } from "@/app/actions/projects"

const FIELD_H = "h-10 data-[size=default]:h-10"

interface Props {
  project: { id: string; projectNo: string; name: string }
  costCenters: Array<{ id: string; name: string }>
  bankAccounts: Array<{ id: string; accountName: string; bankName: string | null }>
}

const CATEGORIES = [
  { value: "MATERIAL", label: "Material" }, { value: "LABOR", label: "Labor" },
  { value: "SERVICE", label: "Service" }, { value: "ASSET", label: "Asset" }, { value: "OTHER", label: "Other" },
]

export default function ProjectExpenseForm({ project, costCenters, bankAccounts }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10))
  const [referenceNo, setReferenceNo] = useState("")
  const [description, setDescription] = useState("")
  const [costCenterId, setCostCenterId] = useState(costCenters[0]?.id ?? "")
  const [category, setCategory] = useState("OTHER")
  const [amount, setAmount] = useState("")
  const [vendor, setVendor] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("CASH")
  const [bankAccountId, setBankAccountId] = useState("")
  const [chequeNo, setChequeNo] = useState("")
  const [notes, setNotes] = useState("")
  const [autoGenerateVoucher, setAutoGenerateVoucher] = useState(true)

  const amountNum = parseFloat(amount) || 0
  const ccName = costCenters.find((c) => c.id === costCenterId)?.name ?? "General"
  const bankName = bankAccounts.find((b) => b.id === bankAccountId)?.accountName ?? "Cash in Hand"

  const preview = useMemo(() => {
    if (!autoGenerateVoucher || amountNum <= 0) return []
    return [
      { account: `Project Expense — ${ccName}`, debit: amountNum, credit: 0 },
      { account: bankName, debit: 0, credit: amountNum },
    ]
  }, [autoGenerateVoucher, amountNum, ccName, bankName])

  const totalDr = preview.reduce((s, l) => s + l.debit, 0)
  const totalCr = preview.reduce((s, l) => s + l.credit, 0)

  const handleSubmit = () => {
    if (!expenseDate) return toast.error("Expense date is required.")
    if (!description.trim()) return toast.error("Description is required.")
    if (!(amountNum > 0)) return toast.error("Enter a valid amount.")
    startTransition(async () => {
      const res = await recordProjectExpense({
        projectId: project.id,
        expenseDate,
        referenceNo: referenceNo || null,
        description: description.trim(),
        costCenterId: costCenterId || null,
        category: category as "MATERIAL" | "LABOR" | "SERVICE" | "ASSET" | "OTHER",
        amount: amountNum,
        vendor: vendor || null,
        paymentMethod,
        bankAccountId: bankAccountId || null,
        chequeNo: chequeNo || null,
        notes: notes || null,
        autoGenerateVoucher,
      })
      if (!res.ok) { toast.error("Could not record expense", { description: res.error }); return }
      toast.success("Expense recorded", { description: res.voucherNo })
      router.push(`/dashboard/projects/${project.id}`)
    })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Record Project Expense" subtitle={`${project.projectNo} · ${project.name}`}
        actions={<Link href={`/dashboard/projects/${project.id}`}><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button></Link>} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Expense Details" icon={<TrendingDown />} accent="crimson" bodyClassName="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Expense Date <span className="text-debit">*</span></Label><Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className={`${FIELD_H} bg-[var(--control-bg)]`} /></div>
              <div className="space-y-1.5"><Label>Reference No</Label><Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="Auto or manual" className={`${FIELD_H} bg-[var(--control-bg)]`} /></div>
              <div className="sm:col-span-2 space-y-1.5"><Label>Description <span className="text-debit">*</span></Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was this expense for?" className={`${FIELD_H} bg-[var(--control-bg)]`} /></div>
              <div className="space-y-1.5">
                <Label>Cost Center</Label>
                <Select value={costCenterId} onValueChange={(v) => setCostCenterId(v ?? "")}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue placeholder="Select cost center" /></SelectTrigger>
                  <SelectContent>{costCenters.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={category} onValueChange={(v) => setCategory(v ?? "OTHER")}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Amount (৳) <span className="text-debit">*</span></Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={`${FIELD_H} t-num bg-[var(--control-bg)]`} /></div>
              <div className="space-y-1.5"><Label>Vendor / Payee</Label><Input value={vendor} onChange={(e) => setVendor(e.target.value)} className={`${FIELD_H} bg-[var(--control-bg)]`} /></div>
              <div className="space-y-1.5">
                <Label>Payment Mode</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v ?? "CASH")}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem><SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                    <SelectItem value="CHEQUE">Cheque</SelectItem><SelectItem value="CREDIT">Credit</SelectItem><SelectItem value="ACCRUED">Accrued</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Bank Account</Label>
                <Select value={bankAccountId} onValueChange={(v) => setBankAccountId(v ?? "")}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>{bankAccounts.map((b) => <SelectItem key={b.id} value={b.id}>{b.accountName}{b.bankName ? ` — ${b.bankName}` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {paymentMethod === "CHEQUE" && (
                <div className="space-y-1.5"><Label>Cheque No</Label><Input value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} className={`${FIELD_H} bg-[var(--control-bg)]`} /></div>
              )}
              <div className="sm:col-span-2 space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="bg-[var(--control-bg)]" /></div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--border-base)] bg-subtle px-4 py-3 sm:col-span-2">
                <div><p className="t-body font-semibold text-primary-ink">Auto-generate Voucher</p><p className="t-caption text-muted-ink">Posts a balanced journal entry on save.</p></div>
                <Switch checked={autoGenerateVoucher} onCheckedChange={setAutoGenerateVoucher} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Link href={`/dashboard/projects/${project.id}`}><Button variant="outline">Cancel</Button></Link>
              <Button className="brand-gradient shadow-brand-glow" disabled={isPending} onClick={handleSubmit}>
                {isPending ? "Saving…" : <><Save className="mr-2 h-4 w-4" /> Record Expense</>}
              </Button>
            </div>
          </SectionCard>
        </div>

        <div>
          <SectionCard title="Accounting Preview" icon={<BookOpen />} accent="blue" bodyClassName="p-4">
            {preview.length === 0 ? (
              <p className="t-caption text-muted-ink">Enter an amount to preview the entry.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-[var(--border-base)]">
                <table className="w-full text-sm">
                  <thead><tr className="bg-subtle/60">
                    <th className="t-overline px-3 py-2 text-left text-muted-ink">Account</th>
                    <th className="t-overline px-3 py-2 text-right text-muted-ink">Dr</th>
                    <th className="t-overline px-3 py-2 text-right text-muted-ink">Cr</th>
                  </tr></thead>
                  <tbody>
                    {preview.map((l, i) => (
                      <tr key={i} className="border-t border-[var(--border-base)]">
                        <td className="t-caption px-3 py-2 text-secondary-ink">{l.account}</td>
                        <td className="t-num px-3 py-2 text-right">{l.debit > 0 ? formatBDT(l.debit) : "—"}</td>
                        <td className="t-num px-3 py-2 text-right">{l.credit > 0 ? formatBDT(l.credit) : "—"}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-[var(--border-strong)] bg-subtle/40">
                      <td className="t-caption px-3 py-2 font-bold text-primary-ink">Total</td>
                      <td className="t-num px-3 py-2 text-right font-bold">{formatBDT(totalDr)}</td>
                      <td className="t-num px-3 py-2 text-right font-bold">{formatBDT(totalCr)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
