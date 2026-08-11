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
import { ArrowLeft, LogOut, BookOpen, Save } from "lucide-react"

import PageHeader from "@/components/somiti/PageHeader"
import SectionCard from "@/components/somiti/SectionCard"
import { formatBDT } from "@/components/somiti/Money"
import { recordInvestmentExit } from "@/app/actions/investments"

const FIELD_H = "h-10 data-[size=default]:h-10"

interface Props {
  investment: { id: string; investmentNo: string; name: string; currentValue: number; costBasis: number; typeSlug: string }
  bankAccounts: Array<{ id: string; accountName: string; bankName: string | null }>
}

const EXIT_TYPES = [
  { value: "FULL_EXIT", label: "Full Exit" },
  { value: "PARTIAL_EXIT", label: "Partial Exit" },
  { value: "MATURED", label: "Matured" },
  { value: "WRITTEN_OFF", label: "Written Off" },
]

const isShareType = (slug: string) => slug === "stock-shares" || slug === "mutual-fund-bond" || slug === "business-equity"

export default function ExitForm({ investment, bankAccounts }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [exitType, setExitType] = useState("FULL_EXIT")
  const [exitDate, setExitDate] = useState(new Date().toISOString().slice(0, 10))
  const [unitsSold, setUnitsSold] = useState("")
  const [salePricePerUnit, setSalePricePerUnit] = useState("")
  const [proceeds, setProceeds] = useState(investment.currentValue.toString())
  const [costBasisSold, setCostBasisSold] = useState(investment.costBasis.toString())
  const [taxPercent, setTaxPercent] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("CASH")
  const [bankAccountId, setBankAccountId] = useState("")
  const [notes, setNotes] = useState("")
  const [autoGenerateVoucher, setAutoGenerateVoucher] = useState(true)

  const proceedsNum = parseFloat(proceeds) || 0
  const costNum = parseFloat(costBasisSold) || 0
  const gainLoss = exitType === "WRITTEN_OFF" ? -costNum : +(proceedsNum - costNum).toFixed(2)
  const taxPct = parseFloat(taxPercent) || 0
  const taxAmount = +(Math.max(gainLoss, 0) * (taxPct / 100)).toFixed(2)
  const netProceeds = +(proceedsNum - taxAmount).toFixed(2)

  // Auto-calc proceeds from units × price when both are set.
  const calcProceeds = () => {
    const u = parseFloat(unitsSold)
    const p = parseFloat(salePricePerUnit)
    if (u > 0 && p > 0) setProceeds((u * p).toFixed(2))
  }

  const bankName = bankAccounts.find((b) => b.id === bankAccountId)?.accountName ?? "Cash in Hand"

  const preview = useMemo(() => {
    if (!autoGenerateVoucher) return []
    if (exitType === "WRITTEN_OFF") {
      return [
        { account: "Investment Write-Off", debit: costNum, credit: 0 },
        { account: "Investment Asset", debit: 0, credit: costNum },
      ]
    }
    const lines = [{ account: bankName, debit: netProceeds, credit: 0 }]
    if (taxAmount > 0) lines.push({ account: "Capital Gains Tax Payable", debit: taxAmount, credit: 0 })
    lines.push({ account: "Investment Asset", debit: 0, credit: costNum })
    if (gainLoss >= 0) {
      const gain = netProceeds + taxAmount - costNum
      if (gain > 0) lines.push({ account: "Capital Gain Income", debit: 0, credit: gain })
    } else {
      const loss = costNum - (netProceeds + taxAmount)
      if (loss > 0) lines.push({ account: "Capital Loss Expense", debit: loss, credit: 0 })
    }
    return lines
  }, [autoGenerateVoucher, exitType, costNum, netProceeds, taxAmount, gainLoss, bankName])

  const totalDr = preview.reduce((s, l) => s + l.debit, 0)
  const totalCr = preview.reduce((s, l) => s + l.credit, 0)
  const balanced = Math.abs(totalDr - totalCr) < 0.005

  const handleSubmit = () => {
    if (!exitDate) return toast.error("Exit date is required.")
    if (exitType !== "WRITTEN_OFF" && !(proceedsNum > 0)) return toast.error("Enter valid sale proceeds.")
    startTransition(async () => {
      const res = await recordInvestmentExit({
        investmentId: investment.id,
        exitType: exitType as "FULL_EXIT" | "PARTIAL_EXIT" | "MATURED" | "WRITTEN_OFF",
        exitDate,
        unitsSold: isShareType(investment.typeSlug) ? parseFloat(unitsSold) || null : null,
        salePricePerUnit: isShareType(investment.typeSlug) ? parseFloat(salePricePerUnit) || null : null,
        proceeds: proceedsNum,
        costBasisSold: costNum,
        capitalGainLoss: gainLoss,
        taxPercent: taxPct,
        paymentMethod,
        bankAccountId: bankAccountId || null,
        notes: notes || null,
        autoGenerateVoucher,
      })
      if (!res.ok) { toast.error("Could not record exit", { description: res.error }); return }
      toast.success("Exit recorded", { description: res.voucherNo })
      router.push(`/dashboard/investments/${investment.id}`)
    })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Record Exit / Disposal"
        subtitle={`${investment.investmentNo} · ${investment.name}`}
        actions={<Link href={`/dashboard/investments/${investment.id}`}><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button></Link>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Exit Details" icon={<LogOut />} accent="crimson" bodyClassName="p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Exit Type <span className="text-debit">*</span></Label>
                <Select value={exitType} onValueChange={(v) => setExitType(v ?? "FULL_EXIT")}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue /></SelectTrigger>
                  <SelectContent>{EXIT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Exit Date <span className="text-debit">*</span></Label>
                <Input type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} className={`${FIELD_H} bg-[var(--control-bg)]`} />
              </div>

              {isShareType(investment.typeSlug) && exitType !== "WRITTEN_OFF" && (
                <>
                  <div className="space-y-1.5">
                    <Label>Units / Shares Sold</Label>
                    <Input type="number" value={unitsSold} onChange={(e) => setUnitsSold(e.target.value)} onBlur={calcProceeds} className={`${FIELD_H} t-num bg-[var(--control-bg)]`} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sale Price / Unit</Label>
                    <Input type="number" value={salePricePerUnit} onChange={(e) => setSalePricePerUnit(e.target.value)} onBlur={calcProceeds} className={`${FIELD_H} t-num bg-[var(--control-bg)]`} />
                  </div>
                </>
              )}

              {exitType !== "WRITTEN_OFF" && (
                <>
                  <div className="space-y-1.5">
                    <Label>Sale Proceeds (৳)</Label>
                    <Input type="number" value={proceeds} onChange={(e) => setProceeds(e.target.value)} className={`${FIELD_H} t-num bg-[var(--control-bg)]`} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Cost Basis of Sold Units (৳)</Label>
                    <Input type="number" value={costBasisSold} onChange={(e) => setCostBasisSold(e.target.value)} className={`${FIELD_H} t-num bg-[var(--control-bg)]`} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Capital Gains Tax (%)</Label>
                    <Input type="number" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} placeholder="0" className={`${FIELD_H} t-num bg-[var(--control-bg)]`} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Payment Mode</Label>
                    <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v ?? "CASH")}>
                      <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CASH">Cash</SelectItem>
                        <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                        <SelectItem value="CHEQUE">Cheque</SelectItem>
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
                </>
              )}

              <div className="space-y-1.5 rounded-xl border border-[var(--border-base)] bg-subtle px-4 py-3 sm:col-span-2">
                <div className="flex justify-between t-caption text-muted-ink">
                  <span>Capital Gain / Loss</span>
                  <span className={`t-num font-bold ${gainLoss >= 0 ? "t-num-pos" : "t-num-neg"}`}>{formatBDT(gainLoss)}</span>
                </div>
                {exitType !== "WRITTEN_OFF" && (
                  <>
                    <div className="mt-1 flex justify-between t-caption text-muted-ink"><span>Tax Amount</span><span className="t-num font-semibold">{formatBDT(taxAmount)}</span></div>
                    <div className="mt-1 flex justify-between t-caption text-muted-ink"><span>Net Proceeds</span><span className="t-num font-bold text-brand">{formatBDT(netProceeds)}</span></div>
                  </>
                )}
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="bg-[var(--control-bg)]" />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--border-base)] bg-subtle px-4 py-3 sm:col-span-2">
                <div>
                  <p className="t-body font-semibold text-primary-ink">Auto-generate Voucher</p>
                  <p className="t-caption text-muted-ink">Posts a balanced journal entry on save.</p>
                </div>
                <Switch checked={autoGenerateVoucher} onCheckedChange={setAutoGenerateVoucher} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Link href={`/dashboard/investments/${investment.id}`}><Button variant="outline">Cancel</Button></Link>
              <Button className="brand-gradient shadow-brand-glow" disabled={isPending} onClick={handleSubmit}>
                {isPending ? "Saving…" : <><Save className="mr-2 h-4 w-4" /> Record Exit</>}
              </Button>
            </div>
          </SectionCard>
        </div>

        <div>
          <SectionCard title="Accounting Preview" icon={<BookOpen />} accent="blue" bodyClassName="p-4">
            {preview.length === 0 ? (
              <p className="t-caption text-muted-ink">Enter amounts to preview the entry.</p>
            ) : (
              <>
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
                <div className={`mt-2 flex items-center gap-1.5 t-caption font-semibold ${balanced ? "text-success" : "text-debit"}`}>
                  {balanced ? "✓ Balanced entry" : "⚠ Unbalanced — cannot post"}
                </div>
              </>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
