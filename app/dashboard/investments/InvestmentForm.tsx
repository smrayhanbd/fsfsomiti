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
import {
  Save, X, FileText, Gem, Coins, TrendingUp, BookOpen, FolderOpen, Link2,
  Banknote, Calendar, Hash, Plus, Trash2,
} from "lucide-react"

import PageHeader from "@/components/somiti/PageHeader"
import SectionCard from "@/components/somiti/SectionCard"
import { formatBDT } from "@/components/somiti/Money"
import { saveInvestment } from "@/app/actions/investments"
import {
  INVESTMENT_TYPE_FIELDS, type TypeFieldDef,
  type InvestmentTypeOption, type AccountOption,
} from "@/lib/portfolio/types"

// Works around the SelectTrigger default h-8 specificity.
const FIELD_H = "h-10 data-[size=default]:h-10"

interface BankAccountOption {
  id: string
  accountName: string
  bankName: string | null
  paymentMethod: string
  coaAccountId: string
}

interface Props {
  mode: "create" | "edit"
  types: InvestmentTypeOption[]
  accounts: AccountOption[]
  bankAccounts: BankAccountOption[]
  investment: {
    id: string
    name: string
    investmentTypeId: string
    subCategory: string | null
    investmentDate: string
    maturityDate: string | null
    description: string | null
    tags: string[]
    investedAmount: number
    currency: string
    exchangeRate: number
    feesAmount: number
    paymentMethod: string | null
    bankAccountId: string | null
    referenceNo: string | null
    expectedAnnualReturn: number
    incomeTypes: string[]
    paymentFrequency: string | null
    details: Record<string, unknown>
    documents: Array<{ name: string; type?: string; url: string; date?: string; notes?: string }>
  } | null
  linkInvestmentId?: string | null
}

const INCOME_TYPES = ["Dividend", "Interest", "Rent", "Capital Gain", "None"]
const FREQUENCIES = ["Monthly", "Quarterly", "Half-Yearly", "Yearly", "On Maturity"]

export default function InvestmentForm({ mode, types, accounts, bankAccounts, investment, linkInvestmentId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Section 1 — Basic
  const [name, setName] = useState(investment?.name ?? "")
  const [typeId, setTypeId] = useState(investment?.investmentTypeId ?? types[0]?.id ?? "")
  const [subCategory, setSubCategory] = useState(investment?.subCategory ?? "")
  const [investmentDate, setInvestmentDate] = useState(
    investment?.investmentDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  )
  const [maturityDate, setMaturityDate] = useState(investment?.maturityDate?.slice(0, 10) ?? "")
  const [description, setDescription] = useState(investment?.description ?? "")
  const [tagInput, setTagInput] = useState("")
  const [tags, setTags] = useState<string[]>(investment?.tags ?? [])

  // Section 2 — Financial
  const [investedAmount, setInvestedAmount] = useState(investment?.investedAmount?.toString() ?? "")
  const [currency, setCurrency] = useState(investment?.currency ?? "BDT")
  const [exchangeRate, setExchangeRate] = useState(investment?.exchangeRate?.toString() ?? "1")
  const [feesAmount, setFeesAmount] = useState(investment?.feesAmount?.toString() ?? "")
  const [paymentMethod, setPaymentMethod] = useState(investment?.paymentMethod ?? "CASH")
  const [bankAccountId, setBankAccountId] = useState(investment?.bankAccountId ?? "")
  const [referenceNo, setReferenceNo] = useState(investment?.referenceNo ?? "")

  // Section 3 — type-specific details
  const [details, setDetails] = useState<Record<string, string>>(() => {
    const d = investment?.details ?? {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(d)) out[k] = String(v ?? "")
    return out
  })

  // Section 4 — Expected returns
  const [expectedAnnualReturn, setExpectedAnnualReturn] = useState(investment?.expectedAnnualReturn?.toString() ?? "")
  const [incomeTypes, setIncomeTypes] = useState<string[]>(investment?.incomeTypes ?? [])
  const [paymentFrequency, setPaymentFrequency] = useState(investment?.paymentFrequency ?? "")
  const [expectedNextIncomeDate, setExpectedNextIncomeDate] = useState("")
  const [expectedIncomeAmount, setExpectedIncomeAmount] = useState("")

  // Section 5 — Accounting
  const [autoGenerateVoucher, setAutoGenerateVoucher] = useState(true)

  // Section 6 — Documents
  const [documents, setDocuments] = useState(investment?.documents ?? [])

  // ── Derived ──
  const selectedType = types.find((t) => t.id === typeId)
  const typeFields: TypeFieldDef[] = selectedType ? (INVESTMENT_TYPE_FIELDS[selectedType.slug] ?? []) : []
  const feeExpenseLabel = selectedType?.slug === "land" || selectedType?.slug === "building-property"
    ? "Registration / Stamp Duty (৳)"
    : "Brokerage / Fee / Commission (৳)"

  const investedNum = parseFloat(investedAmount) || 0
  const feesNum = parseFloat(feesAmount) || 0
  const rateNum = parseFloat(exchangeRate) || 1
  const bdtEquivalent = currency === "BDT" ? investedNum : investedNum * rateNum
  const costBasis = bdtEquivalent + feesNum

  // The asset account (debit) auto-resolved from the type's account code.
  const assetAccount = accounts.find((a) => a.accountCode === selectedType?.assetAccountCode)
  // Cash/bank account (credit) — from selected bank, else cash-in-hand.
  const cashAccount = useMemo(() => {
    const ba = bankAccounts.find((b) => b.id === bankAccountId)
    if (ba) return accounts.find((a) => a.id === ba.coaAccountId)
    return accounts.find((a) => a.accountCode === "CASH-IN-HAND")
  }, [bankAccountId, bankAccounts, accounts])

  // Live journal preview lines.
  const previewLines = useMemo(() => {
    if (!autoGenerateVoucher || !assetAccount) return []
    const lines: { account: string; debit: number; credit: number }[] = [
      { account: assetAccount.accountName, debit: bdtEquivalent, credit: 0 },
    ]
    if (feesNum > 0) {
      const feeName = selectedType?.slug === "land" || selectedType?.slug === "building-property"
        ? "Land Registration & Stamp Expense"
        : "Brokerage / Commission"
      lines.push({ account: feeName, debit: feesNum, credit: 0 })
    }
    lines.push({ account: cashAccount?.accountName ?? "Cash in Hand", debit: 0, credit: bdtEquivalent + feesNum })
    return lines
  }, [autoGenerateVoucher, assetAccount, cashAccount, bdtEquivalent, feesNum, selectedType])

  const totalDr = previewLines.reduce((s, l) => s + l.debit, 0)
  const totalCr = previewLines.reduce((s, l) => s + l.credit, 0)
  const balanced = Math.abs(totalDr - totalCr) < 0.005

  // ── Handlers ──
  const addTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) setTags([...tags, t])
    setTagInput("")
  }
  const toggleIncomeType = (t: string) => {
    setIncomeTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

  const handleSave = (autoVoucher: boolean) => {
    if (!name.trim()) return toast.error("Investment name is required.")
    if (!typeId) return toast.error("Select an investment type.")
    if (!investmentDate) return toast.error("Investment date is required.")
    if (!(investedNum > 0)) return toast.error("Enter a valid invested amount.")
    if (autoVoucher && !assetAccount) {
      return toast.error("No asset account mapped for this type. Run the seed or pick a type.")
    }

    startTransition(async () => {
      const res = await saveInvestment({
        id: mode === "edit" ? investment?.id : undefined,
        name: name.trim(),
        investmentTypeId: typeId,
        typeSlug: selectedType?.slug ?? "other",
        subCategory: subCategory || null,
        investmentDate,
        maturityDate: maturityDate || null,
        description: description || null,
        tags,
        investedAmount: investedNum,
        currency,
        exchangeRate: rateNum,
        feesAmount: feesNum,
        paymentMethod,
        bankAccountId: bankAccountId || null,
        referenceNo: referenceNo || null,
        expectedAnnualReturn: parseFloat(expectedAnnualReturn) || 0,
        incomeTypes,
        paymentFrequency: paymentFrequency || null,
        expectedNextIncomeDate: expectedNextIncomeDate || null,
        expectedIncomeAmount: parseFloat(expectedIncomeAmount) || null,
        details,
        documents,
        autoGenerateVoucher: autoVoucher,
        ...(linkInvestmentId ? { linkInvestmentId } : {}),
      } as Parameters<typeof saveInvestment>[0])
      if (!res.ok) {
        toast.error("Could not save investment", { description: res.error })
        return
      }
      toast.success(autoVoucher ? "Investment created & voucher posted" : "Investment saved", {
        description: res.voucherNo,
      })
      router.push("/dashboard/investments")
    })
  }

  return (
    <div className="flex flex-col gap-6 lg:h-[calc(100dvh-8.1875rem)] lg:gap-4">
      <PageHeader
        className="lg:shrink-0"
        title={mode === "edit" ? "Edit Investment" : "New Investment"}
        subtitle="Record a financial asset the Somiti is investing in. A balanced journal entry is posted automatically."
        actions={
          <Link href="/dashboard/investments">
            <Button variant="outline"><X className="mr-2 h-4 w-4" /> Cancel</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-3 lg:grid-rows-[minmax(0,1fr)] lg:gap-4">
        {/* ═══ LEFT (2 cols): Entry form ═══ */}
        <div className="space-y-6 lg:col-span-2 lg:min-h-0 lg:space-y-4 lg:overflow-y-auto lg:pr-1">
          {/* Section 1 — Basic Information */}
          <SectionCard title="Basic Information" icon={<FileText />} accent="blue" bodyClassName="p-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Investment Name <span className="text-debit">*</span></Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grameenphone Shares" className={`${FIELD_H} bg-[var(--control-bg)]`} />
              </div>
              <div className="space-y-1.5">
                <Label>Investment Type <span className="text-debit">*</span></Label>
                <Select value={typeId} onValueChange={(v) => { setTypeId(v ?? ""); setSubCategory("") }}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sub-category</Label>
                {selectedType && selectedType.subCategories.length > 0 ? (
                  <Select value={subCategory} onValueChange={(v) => setSubCategory(v ?? "")}>
                    <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue placeholder="Select sub-category" /></SelectTrigger>
                    <SelectContent>
                      {selectedType.subCategories.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={subCategory} onChange={(e) => setSubCategory(e.target.value)} placeholder="Optional" className={`${FIELD_H} bg-[var(--control-bg)]`} />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Investment Date <span className="text-debit">*</span></Label>
                <Input type="date" value={investmentDate} onChange={(e) => setInvestmentDate(e.target.value)} className={`${FIELD_H} bg-[var(--control-bg)]`} />
              </div>
              <div className="space-y-1.5">
                <Label>Maturity Date</Label>
                <Input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} className={`${FIELD_H} bg-[var(--control-bg)]`} />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional notes" className="bg-[var(--control-bg)]" />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Tags</Label>
                <div className="flex gap-2">
                  <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag() } }} placeholder="Type a tag and press Enter" className={`${FIELD_H} bg-[var(--control-bg)]`} />
                  <Button type="button" variant="outline" onClick={addTag}><Plus className="h-4 w-4" /></Button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <button key={t} type="button" onClick={() => setTags(tags.filter((x) => x !== t))} className="inline-flex items-center gap-1 rounded-full bg-subtle px-2.5 py-1 t-caption text-secondary-ink hover:bg-debit-soft hover:text-debit">
                        {t} <X className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Section 2 — Financial Details */}
          <SectionCard title="Financial Details" icon={<Coins />} accent="gold" bodyClassName="p-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Invested Amount <span className="text-debit">*</span></Label>
                <Input type="number" value={investedAmount} onChange={(e) => setInvestedAmount(e.target.value)} placeholder="0.00" className={`${FIELD_H} t-num bg-[var(--control-bg)]`} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v ?? "BDT")}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BDT">BDT (৳)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {currency !== "BDT" && (
                <div className="space-y-1.5">
                  <Label>Exchange Rate</Label>
                  <Input type="number" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} className={`${FIELD_H} t-num bg-[var(--control-bg)]`} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{feeExpenseLabel}</Label>
                <Input type="number" value={feesAmount} onChange={(e) => setFeesAmount(e.target.value)} placeholder="0.00" className={`${FIELD_H} t-num bg-[var(--control-bg)]`} />
              </div>
              <div className="space-y-1.5 sm:col-span-2 rounded-xl border border-[var(--border-base)] bg-subtle px-4 py-3">
                <div className="flex items-center justify-between t-caption text-muted-ink">
                  <span>BDT Equivalent</span><span className="t-num font-semibold text-primary-ink">{formatBDT(bdtEquivalent)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between t-caption text-muted-ink">
                  <span>Total Cost Basis</span><span className="t-num font-bold text-brand">{formatBDT(costBasis)}</span>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Section 3 — Type-specific fields */}
          {typeFields.length > 0 && (
            <SectionCard title={`${selectedType?.name} Details`} icon={<Gem />} accent="violet" bodyClassName="p-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {typeFields.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label>{f.label}{f.required ? <span className="text-debit"> *</span> : null}</Label>
                    {f.kind === "select" ? (
                      <Select value={details[f.key] ?? ""} onValueChange={(v) => setDetails((d) => ({ ...d, [f.key]: v ?? "" }))}>
                        <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{(f.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : f.kind === "textarea" ? (
                      <Textarea value={details[f.key] ?? ""} onChange={(e) => setDetails((d) => ({ ...d, [f.key]: e.target.value }))} rows={2} className="bg-[var(--control-bg)]" />
                    ) : (
                      <Input
                        type={f.kind === "number" ? "number" : f.kind === "date" ? "date" : "text"}
                        value={details[f.key] ?? ""}
                        onChange={(e) => setDetails((d) => ({ ...d, [f.key]: e.target.value }))}
                        className={`${FIELD_H} ${f.kind === "number" || f.kind === "date" ? "t-num" : ""} bg-[var(--control-bg)]`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Section 4 — Expected Returns */}
          <SectionCard title="Expected Returns" icon={<TrendingUp />} accent="emerald" bodyClassName="p-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Expected Annual Return (%)</Label>
                <Input type="number" value={expectedAnnualReturn} onChange={(e) => setExpectedAnnualReturn(e.target.value)} placeholder="0.00" className={`${FIELD_H} t-num bg-[var(--control-bg)]`} />
              </div>
              <div className="space-y-1.5">
                <Label>Income Type</Label>
                <div className="flex flex-wrap gap-1.5 pt-1.5">
                  {INCOME_TYPES.map((t) => (
                    <button key={t} type="button" onClick={() => toggleIncomeType(t)}
                      className={`rounded-full px-2.5 py-1 t-caption font-medium transition-colors ${incomeTypes.includes(t) ? "bg-success-soft text-success border border-success" : "bg-subtle text-muted-ink border border-[var(--border-base)]"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              {incomeTypes.length > 0 && incomeTypes[0] !== "None" && (
                <>
                  <div className="space-y-1.5">
                    <Label>Payment Frequency</Label>
                    <Select value={paymentFrequency} onValueChange={(v) => setPaymentFrequency(v ?? "")}>
                      <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Expected Next Income Date</Label>
                    <Input type="date" value={expectedNextIncomeDate} onChange={(e) => setExpectedNextIncomeDate(e.target.value)} className={`${FIELD_H} bg-[var(--control-bg)]`} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Expected Income Amount</Label>
                    <Input type="number" value={expectedIncomeAmount} onChange={(e) => setExpectedIncomeAmount(e.target.value)} placeholder="0.00" className={`${FIELD_H} t-num bg-[var(--control-bg)]`} />
                  </div>
                </>
              )}
            </div>
          </SectionCard>

          {/* Section 5 — Accounting */}
          <SectionCard title="Accounting" icon={<BookOpen />} accent="blue" bodyClassName="p-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v ?? "CASH")}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                    <SelectItem value="CHEQUE">Cheque</SelectItem>
                    <SelectItem value="BKASH">bKash</SelectItem>
                    <SelectItem value="NAGAD">Nagad</SelectItem>
                    <SelectItem value="ROCKET">Rocket</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Bank / Wallet Account</Label>
                <Select value={bankAccountId} onValueChange={(v) => setBankAccountId(v ?? "")}>
                  <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((b) => <SelectItem key={b.id} value={b.id}>{b.accountName}{b.bankName ? ` — ${b.bankName}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Reference / Cheque No</Label>
                <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="Optional" className={`${FIELD_H} bg-[var(--control-bg)]`} />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--border-base)] bg-subtle px-4 py-3 sm:col-span-2">
                <div>
                  <p className="t-body font-semibold text-primary-ink">Auto-generate Voucher</p>
                  <p className="t-caption text-muted-ink">Posts a balanced journal entry on save.</p>
                </div>
                <Switch checked={autoGenerateVoucher} onCheckedChange={setAutoGenerateVoucher} />
              </div>
            </div>
          </SectionCard>

          {/* Section 6 — Documents (light; uploader in Phase 2) */}
          <SectionCard title="Documents" icon={<FolderOpen />} accent="amber" bodyClassName="p-4">
            {documents.length === 0 ? (
              <p className="t-caption text-muted-ink">No documents attached. Document upload is available after creation.</p>
            ) : (
              <div className="space-y-2">
                {documents.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-[var(--border-base)] bg-subtle px-3 py-2">
                    <FileText className="h-4 w-4 text-muted-ink" />
                    <span className="t-body text-secondary-ink truncate">{d.name}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ═══ RIGHT (1 col): Live preview ═══ */}
        <div className="space-y-4 lg:min-h-0 lg:overflow-y-auto">
          <SectionCard title="Summary" icon={<Gem />} accent="violet" bodyClassName="p-5 space-y-3">
            <div className="space-y-2">
              <Row label="Type" value={selectedType?.name ?? "—"} />
              <Row label="Sub-category" value={subCategory || "—"} />
              <Row label="Investment Date" value={investmentDate || "—"} />
              <Row label="Invested (BDT equiv.)" value={formatBDT(bdtEquivalent)} />
              <Row label="Fees" value={formatBDT(feesNum)} />
              <div className="my-1 border-t border-[var(--border-base)]" />
              <Row label="Total Cost Basis" value={formatBDT(costBasis)} strong />
            </div>
          </SectionCard>

          {autoGenerateVoucher && (
            <SectionCard title="Accounting Preview" icon={<BookOpen />} accent="blue" bodyClassName="p-4">
              {!assetAccount ? (
                <p className="t-caption text-debit">No asset account mapped for this type. The voucher can&apos;t be posted until one is configured.</p>
              ) : (
                <>
                  <div className="overflow-hidden rounded-lg border border-[var(--border-base)]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-subtle/60">
                          <th className="t-overline px-3 py-2 text-left text-muted-ink">Account</th>
                          <th className="t-overline px-3 py-2 text-right text-muted-ink">Dr</th>
                          <th className="t-overline px-3 py-2 text-right text-muted-ink">Cr</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewLines.map((l, i) => (
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
          )}
        </div>
      </div>

      {/* Floating action bar */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-base)] pt-4 lg:shrink-0">
        <Link href="/dashboard/investments"><Button variant="outline" type="button">Cancel</Button></Link>
        {mode === "create" && (
          <Button variant="secondary" type="button" disabled={isPending} onClick={() => handleSave(false)}>
            Save as Draft
          </Button>
        )}
        <Button type="button" className="brand-gradient shadow-brand-glow" disabled={isPending} onClick={() => handleSave(true)}>
          {isPending ? "Saving…" : mode === "edit" ? "Save Changes" : "Save & Create Voucher"}
        </Button>
      </div>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="t-caption text-muted-ink">{label}</span>
      <span className={`t-num ${strong ? "font-bold text-brand" : "font-semibold text-primary-ink"}`}>{value}</span>
    </div>
  )
}
