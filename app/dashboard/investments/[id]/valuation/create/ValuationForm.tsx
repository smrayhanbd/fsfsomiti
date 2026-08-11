"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { ArrowLeft, TrendingUp, Save } from "lucide-react"

import PageHeader from "@/components/somiti/PageHeader"
import SectionCard from "@/components/somiti/SectionCard"
import { formatBDT } from "@/components/somiti/Money"
import { recordValuation } from "@/app/actions/investments"

const FIELD_H = "h-10 data-[size=default]:h-10"

interface Props {
  investment: { id: string; investmentNo: string; name: string; currentValue: number }
}

const METHODS = [
  { value: "MARKET", label: "Market Rate" },
  { value: "GOVT_RATE", label: "Government Rate" },
  { value: "APPRAISER", label: "Appraiser" },
]

export default function ValuationForm({ investment }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [valuationDate, setValuationDate] = useState(new Date().toISOString().slice(0, 10))
  const [marketValue, setMarketValue] = useState(investment.currentValue.toString())
  const [method, setMethod] = useState("MARKET")
  const [valuer, setValuer] = useState("")
  const [notes, setNotes] = useState("")

  const mv = parseFloat(marketValue) || 0
  const change = +(mv - investment.currentValue).toFixed(2)
  const changePct = investment.currentValue > 0 ? (change / investment.currentValue) * 100 : 0

  const handleSubmit = () => {
    if (!valuationDate) return toast.error("Valuation date is required.")
    if (!(mv > 0)) return toast.error("Enter a valid market value.")
    startTransition(async () => {
      const res = await recordValuation({
        investmentId: investment.id,
        valuationDate,
        marketValue: mv,
        method: method as "MARKET" | "GOVT_RATE" | "APPRAISER",
        valuer: valuer || null,
        notes: notes || null,
      })
      if (!res.ok) { toast.error("Could not record valuation", { description: res.error }); return }
      toast.success("Valuation updated")
      router.push(`/dashboard/investments/${investment.id}`)
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Update Valuation"
        subtitle={`${investment.investmentNo} · ${investment.name}`}
        actions={<Link href={`/dashboard/investments/${investment.id}`}><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button></Link>}
      />

      <SectionCard title="Valuation Details" icon={<TrendingUp />} accent="violet" bodyClassName="p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Valuation Date <span className="text-debit">*</span></Label>
            <Input type="date" value={valuationDate} onChange={(e) => setValuationDate(e.target.value)} className={`${FIELD_H} bg-[var(--control-bg)]`} />
          </div>
          <div className="space-y-1.5">
            <Label>New Market Value (৳) <span className="text-debit">*</span></Label>
            <Input type="number" value={marketValue} onChange={(e) => setMarketValue(e.target.value)} className={`${FIELD_H} t-num bg-[var(--control-bg)]`} />
          </div>
          <div className="space-y-1.5">
            <Label>Valuation Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v ?? "MARKET")}>
              <SelectTrigger className={`${FIELD_H} bg-[var(--control-bg)]`}><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Appraiser / Source</Label>
            <Input value={valuer} onChange={(e) => setValuer(e.target.value)} placeholder="Optional" className={`${FIELD_H} bg-[var(--control-bg)]`} />
          </div>
          <div className="space-y-1.5 rounded-xl border border-[var(--border-base)] bg-subtle px-4 py-3 sm:col-span-2">
            <div className="flex justify-between t-caption text-muted-ink"><span>Previous Value</span><span className="t-num font-semibold">{formatBDT(investment.currentValue)}</span></div>
            <div className="mt-1 flex justify-between t-caption text-muted-ink">
              <span>Change</span>
              <span className={`t-num font-bold ${change >= 0 ? "t-num-pos" : "t-num-neg"}`}>
                {change >= 0 ? "+" : ""}{formatBDT(change)} ({changePct >= 0 ? "+" : ""}{changePct.toFixed(1)}%)
              </span>
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="bg-[var(--control-bg)]" />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Link href={`/dashboard/investments/${investment.id}`}><Button variant="outline">Cancel</Button></Link>
          <Button className="brand-gradient shadow-brand-glow" disabled={isPending} onClick={handleSubmit}>
            {isPending ? "Saving…" : <><Save className="mr-2 h-4 w-4" /> Update Valuation</>}
          </Button>
        </div>
      </SectionCard>
    </div>
  )
}
