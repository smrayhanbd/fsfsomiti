"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { saveApprovalLimits, type ApprovalLimitInput } from "@/app/actions/approvalLimits"
import { Plus, Trash2, Save, SlidersHorizontal } from "lucide-react"

interface Props {
  limits: ApprovalLimitInput[]
}

export default function ApprovalLimitsForm({ limits }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rows, setRows] = useState<ApprovalLimitInput[]>(
    limits.length > 0
      ? limits
      : [
          {
            level: 1,
            label: "Branch Manager",
            role: "ADMIN",
            minAmount: 0,
            maxAmount: 50000,
            isActive: true,
          },
        ]
  )

  const update = (idx: number, patch: Partial<ApprovalLimitInput>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      {
        level: prev.length + 1,
        label: "",
        role: "ADMIN",
        permission: null,
        minAmount: 0,
        maxAmount: 0,
        isActive: true,
      },
    ])

  const removeRow = (idx: number) =>
    setRows((prev) => prev.filter((_, i) => i !== idx))

  const handleSave = () => {
    startTransition(async () => {
      const res = await saveApprovalLimits(rows)
      if (res.ok) {
        toast.success("Approval limits saved")
        router.refresh()
      } else toast.error("Failed", { description: res.error })
    })
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <SlidersHorizontal className="h-7 w-7 text-indigo-600" />
          Approval Limits
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
          Configure who can approve what amount. Ranges must be contiguous and
          non-overlapping. At least one tier must be SUPER_ADMIN (spec §13).
        </p>
      </div>

      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm uppercase tracking-wider text-slate-500">
            Approval Tiers
          </CardTitle>
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Tier
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {rows.map((r, idx) => (
            <div
              key={idx}
              className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-3 rounded-xl border border-slate-200 dark:border-slate-800"
            >
              <div className="md:col-span-3 space-y-1">
                <Label className="text-[10px] uppercase">Label</Label>
                <Input
                  value={r.label}
                  onChange={(e) => update(idx, { label: e.target.value })}
                  placeholder="Branch Manager"
                  className="bg-white dark:bg-slate-950"
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label className="text-[10px] uppercase">Role</Label>
                <Select
                  value={r.role}
                  onValueChange={(v) => { if (v) update(idx, { role: v as "ADMIN" | "SUPER_ADMIN" }) }}
                >
                  <SelectTrigger className="bg-white dark:bg-slate-950">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {r.role === "ADMIN" && (
                <div className="md:col-span-2 space-y-1">
                  <Label className="text-[10px] uppercase">Permission</Label>
                  <Select
                    value={r.permission ?? "NONE"}
                    onValueChange={(v) =>
                      update(idx, { permission: v === "NONE" ? null : v })
                    }
                  >
                    <SelectTrigger className="bg-white dark:bg-slate-950">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Any admin</SelectItem>
                      <SelectItem value="TRANSACTION_APPROVE">Transaction Approver</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="md:col-span-2 space-y-1">
                <Label className="text-[10px] uppercase">Min (৳)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={r.minAmount}
                  onChange={(e) => update(idx, { minAmount: parseFloat(e.target.value) || 0 })}
                  className="bg-white dark:bg-slate-950"
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label className="text-[10px] uppercase">Max (৳)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={r.maxAmount}
                  onChange={(e) => update(idx, { maxAmount: parseFloat(e.target.value) || 0 })}
                  className="bg-white dark:bg-slate-950"
                />
              </div>
              <div className="md:col-span-1 flex items-center justify-center gap-2">
                <Switch
                  checked={r.isActive}
                  onCheckedChange={(v) => update(idx, { isActive: v as boolean })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-rose-500"
                  onClick={() => removeRow(idx)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isPending}>
          <Save className="h-4 w-4 mr-2" /> Save Configuration
        </Button>
      </div>
    </div>
  )
}
