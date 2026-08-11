"use client"

// KPI configuration form (FRS §12).
//
// Admin-only. Validates that the five KPI weights sum to exactly 100 (FRS §12.1)
// both live (sum badge) and on submit (the action re-validates and blocks).

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { saveKpiConfig } from "@/app/actions/trustScore"
import { Save, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"

interface ConfigData {
  depositWeight: number
  loanWeight: number
  attendanceWeight: number
  fineWeight: number
  referralWeight: number
  initialScore: number
  suspensionThreshold: number
  reactivationThreshold: number
  badgeDiamondMin: number
  badgePlatinumMin: number
  badgeGoldMin: number
  badgeSilverMin: number
  badgeWarningMin: number
  badgeHighRiskMin: number
  approvedAbsenceCounts: boolean
  depositLinearInterp: boolean
  loanRecoveryMonths: number
}

export default function KpiConfigForm({ config }: { config: ConfigData }) {
  const [data, setData] = useState<ConfigData>(config)
  const [pending, startTransition] = useTransition()

  const set = (key: keyof ConfigData, value: number | boolean) =>
    setData((p) => ({ ...p, [key]: value }))

  const weightSum =
    data.depositWeight +
    data.loanWeight +
    data.attendanceWeight +
    data.fineWeight +
    data.referralWeight

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (weightSum !== 100) {
      toast.error(`KPI weights must sum to 100. Current sum: ${weightSum}.`)
      return
    }
    const fd = new FormData()
    for (const [k, v] of Object.entries(data)) {
      fd.set(k, String(v))
    }
    // Checkboxes: the action reads `=== "on"`.
    fd.set("approvedAbsenceCounts", data.approvedAbsenceCounts ? "on" : "off")
    fd.set("depositLinearInterp", data.depositLinearInterp ? "on" : "off")

    startTransition(async () => {
      try {
        await saveKpiConfig(fd)
        toast.success("Configuration saved. All member scores recalculated.")
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to save configuration.")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* KPI Weights */}
      <Card className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>KPI Weights</span>
            <WeightBadge sum={weightSum} />
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <WeightField label="Deposit Discipline" value={data.depositWeight} onChange={(v) => set("depositWeight", v)} />
          <WeightField label="Loan Repayment" value={data.loanWeight} onChange={(v) => set("loanWeight", v)} />
          <WeightField label="Meeting Attendance" value={data.attendanceWeight} onChange={(v) => set("attendanceWeight", v)} />
          <WeightField label="Fine History" value={data.fineWeight} onChange={(v) => set("fineWeight", v)} />
          <WeightField label="Referral" value={data.referralWeight} onChange={(v) => set("referralWeight", v)} />
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Suspension & Reactivation */}
        <Card className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
          <CardHeader><CardTitle className="text-base">Suspension &amp; Reactivation</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>New Member Initial Score (0–100)</Label>
              <Input type="number" min={0} max={100} value={data.initialScore} onChange={(e) => set("initialScore", +e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Auto-Suspension Threshold (score below this → suspended)</Label>
              <Input type="number" min={0} max={100} value={data.suspensionThreshold} onChange={(e) => set("suspensionThreshold", +e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Reactivation Threshold (must be &gt; suspension threshold)</Label>
              <Input type="number" min={0} max={100} value={data.reactivationThreshold} onChange={(e) => set("reactivationThreshold", +e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Loan Default Recovery Window (months)</Label>
              <Input type="number" min={0} value={data.loanRecoveryMonths} onChange={(e) => set("loanRecoveryMonths", +e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Badge Thresholds */}
        <Card className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
          <CardHeader><CardTitle className="text-base">Badge Tier Thresholds</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <ThresholdField label="💎 Diamond min" value={data.badgeDiamondMin} onChange={(v) => set("badgeDiamondMin", v)} />
            <ThresholdField label="🏆 Platinum min" value={data.badgePlatinumMin} onChange={(v) => set("badgePlatinumMin", v)} />
            <ThresholdField label="🥇 Gold min" value={data.badgeGoldMin} onChange={(v) => set("badgeGoldMin", v)} />
            <ThresholdField label="🥈 Silver min" value={data.badgeSilverMin} onChange={(v) => set("badgeSilverMin", v)} />
            <ThresholdField label="⚠️ Warning min" value={data.badgeWarningMin} onChange={(v) => set("badgeWarningMin", v)} />
            <ThresholdField label="🚨 High Risk min" value={data.badgeHighRiskMin} onChange={(v) => set("badgeHighRiskMin", v)} />
            <div className="col-span-2 flex flex-col gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <CheckRow
                label="Approved absences count as attended"
                checked={data.approvedAbsenceCounts}
                onChange={(v) => set("approvedAbsenceCounts", v)}
              />
              <CheckRow
                label="Linear interpolation between deposit-rate tiers"
                checked={data.depositLinearInterp}
                onChange={(v) => set("depositLinearInterp", v)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || weightSum !== 100} className="bg-indigo-600 hover:bg-indigo-700">
          {pending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save &amp; Recalculate All Members
        </Button>
        {weightSum !== 100 && (
          <span className="text-sm text-red-600 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> Weights must sum to 100 (currently {weightSum}).
          </span>
        )}
      </div>
    </form>
  )
}

function WeightField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="number" min={0} max={100} value={value} onChange={(e) => onChange(+e.target.value)} />
    </div>
  )
}

function ThresholdField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="number" min={0} max={100} value={value} onChange={(e) => onChange(+e.target.value)} />
    </div>
  )
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-slate-300 dark:border-slate-700"
      />
      {label}
    </label>
  )
}

function WeightBadge({ sum }: { sum: number }) {
  const ok = sum === 100
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${
        ok
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
      }`}
    >
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
      Sum: {sum}
    </span>
  )
}
