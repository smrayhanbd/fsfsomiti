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
import { ArrowLeft, Coins, BookOpen, Save } from "lucide-react"

import PageHeader from "@/components/somiti/PageHeader"
import SectionCard from "@/components/somiti/SectionCard"
import { formatBDT } from "@/components/somiti/Money"
import { recordProjectRevenue } from "@/app/actions/projects"

const FIELD_H = "h-10 data-[size=default]:h-10"

interface Props {
  project: { id: string; projectNo: string; name: string }
  bankAccounts: Array<{ id: string; accountName: string; bankName: string | null }>
}

const REVENUE_TYPES = [
  { value: "PLOT_SALE", label: "Plot Sale" }, { value: "PRODUCT_SALE", label: "Product Sale" },
  { value: "SERVICE", label: "Service" }, { value: "RENTAL", label: "Rental" }, { value: "OTHER", label: "Other" },
]

export default function ProjectRevenueForm({ project, bankAccounts }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [revenueDate, setRevenueDate] = useState(new Date().toISOString().slice(0, 10))
  const [referenceNo, setReferenceNo] = useState("")
  const [description, setDescription] = useState("")
  const [revenueType, setRevenueType] = useState("PLOT_SALE")
  const [customer, setCustomer] = useState("")
  const [amount, setAmount] = useState("")
  const [taxPercent, setTaxPercent] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("CASH")
  const [bankAccountId, setBankAccountId] = useState("")
  const [notes, setNotes] = useState("")
  const [autoGenerateVoucher, setAutoGenerateVoucher] = useState(true)

  const gross = parseFloat(amount) || 0
  const taxPct = parseFloat(taxPercent) || 0
  const taxAmount = +((gross * taxPct) / 100).toFixed(2)
  const netAmount = +(gross - taxAmount).toFixed(2)
  const bankName = bankAccounts.find((b) => b.id === bankAccountId)?.accountName ?? "Cash in Hand"

  const preview = useMemo(() => {
    if (!autoGenerateVoucher || gross <= 0) return []
    const lines = [{ account: bankName, debit: netAmount, credit: 0 }]
    if (taxAmount > 0) lines.push({ account: "Tax Collected Payable", debit: taxAmount, credit: 0 })
    lines.push({ account: "Project Revenue", debit: 0, credit: gross })
    return lines
  }, [autoGenerateVoucher, gross, netAmount, taxAmount, bankName])

  const totalDr = preview.reduce((s, l) => s + l.debit, 0)
  const totalCr = preview.reduce((s, l) => s + l.credit, 0)

  const handleSubmit = () => {
    if (!revenueDate) return toast.error("Revenue date is required.")
    if (!description.trim()) return toast.error("Description is required.")
    if (!(gross > 0)) return toast.error("Enter a valid amount.")
    startTransition(async () => {
      const res = await recordProjectRevenue({
        projectId: project.id,
        revenueDate,
        referenceNo: referenceNo || null,
        description: description.trim(),
        revenueType: revenueType as "PLOT_SALE" | "PRODUCT_SALE" | "SERVICE" | "RENTAL" | "OTHER",
        customer: customer || null,
        amount: gross,
        taxPercent: taxPct,
        paymentMethod,
        bankAccountId: bankAccountId || null,
        notes: notes || null,
        autoGenerateVoucher,
      })
      if (!res.ok) { toast.error("Could not record revenue", { description: res.error }); return }
      toast.success("Revenue recorded", { description: res.voucherNo })
      router.push(`/dashboard/projects/${project.id}`)
    })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Record Project Revenue" subtitle={`${project.projectNo} · ${project.name}`}
        actions={<Link href={`/dashboard/projects/${project.id}`}><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button></Link>} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Revenue Details" icon={<Coins />} accent="emerald" bodyClassName="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Revenue Date <span className="text-debit">*</span></Label><Input type="date" value={revenueDate} onChange={(e) => setRevenueDate(e.target.value)} className={`${FIELD_H} bg-[var(--control-bg)]`} /></div>
              <div className="space-y-1.5"><Label>Reference No</Label><Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="Auto or manual" className={`${FIELD_H} bg-[var(--control-bg)]`} /></div>
              <div className="sm:col-span-2 space-y-1.5"><Label>Description <span className="text-debit">*</span></Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className={`${FIELD_H} bg-[var(--control-bg)]`} /></div>
              <div className="space-y-1.5">
                <Label>Revenue Type</Label>
                <Select value={revenueType} onValueChange={(v) => setRevenueType(v ?? "PLOT_SALE")}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue /></SelectTrigger>
                  <SelectContent>{REVENUE_TYPES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Customer / Payer</Label><Input value={customer} onChange={(e) => setCustomer(e.target.value)} className={`${FIELD_H} bg-[var(--control-bg)]`} /></div>
              <div className="space-y-1.5"><Label>Amount (৳) <span className="text-debit">*</span></Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={`${FIELD_H} t-num bg-[var(--control-bg)]`} /></div>
              <div className="space-y-1.5"><Label>Tax / VAT (%)</Label><Input type="number" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} placeholder="0" className={`${FIELD_H} t-num bg-[var(--control-bg)]`} /></div>
              <div className="space-y-1.5 rounded-xl border border-[var(--border-base)] bg-subtle px-4 py-3 sm:col-span-2">
                <div className="flex justify-between t-caption text-muted-ink"><span>Tax Amount</span><span className="t-num font-semibold">{formatBDT(taxAmount)}</span></div>
                <div className="mt-1 flex justify-between t-caption text-muted-ink"><span>Net Amount</span><span className="t-num font-bold text-brand">{formatBDT(netAmount)}</span></div>
              </div>
              <div className="space-y-1.5">
                <Label>Payment Mode</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v ?? "CASH")}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem><SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                    <SelectItem value="CHEQUE">Cheque</SelectItem><SelectItem value="INSTALLMENT">Installment</SelectItem>
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
              <div className="sm:col-span-2 space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="bg-[var(--control-bg)]" /></div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--border-base)] bg-subtle px-4 py-3 sm:col-span-2">
                <div><p className="t-body font-semibold text-primary-ink">Auto-generate Voucher</p><p className="t-caption text-muted-ink">Posts a balanced journal entry on save.</p></div>
                <Switch checked={autoGenerateVoucher} onCheckedChange={setAutoGenerateVoucher} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Link href={`/dashboard/projects/${project.id}`}><Button variant="outline">Cancel</Button></Link>
              <Button className="brand-gradient shadow-brand-glow" disabled={isPending} onClick={handleSubmit}>
                {isPending ? "Saving…" : <><Save className="mr-2 h-4 w-4" /> Record Revenue</>}
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
