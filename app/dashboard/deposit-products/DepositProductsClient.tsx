"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Plus, Pencil, Trash2, Loader2, Lock, Coins, Calendar,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Card, CardContent,
} from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  createDepositProduct, updateDepositProduct, deleteDepositProduct,
  type DepositProductInput,
} from "@/app/actions/depositProducts"
import { formatBDT } from "@/lib/accounting"

interface DepositProduct {
  id: string
  name: string
  code: string
  termMonths: number
  minAmount: number
  maxAmount: number | null
  profitRate: number
  profitSharingRatio: number
  maturityBehavior: string
  status: string
  _count?: { deposits: number }
}

interface Props {
  products: DepositProduct[]
  canEdit: boolean
}

const EMPTY_FORM: DepositProductInput = {
  name: "",
  code: "",
  termMonths: 12,
  minAmount: 1000,
  maxAmount: null,
  profitRate: 0.08,
  profitSharingRatio: 0.7,
  maturityBehavior: "REINVEST",
  status: "ACTIVE",
}

export default function DepositProductsClient({ products, canEdit }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<DepositProductInput>(EMPTY_FORM)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const openAdd = () => {
    setForm({ ...EMPTY_FORM })
    setOpen(true)
  }
  const openEdit = (p: DepositProduct) => {
    setForm({
      id: p.id,
      name: p.name,
      code: p.code,
      termMonths: p.termMonths,
      minAmount: Number(p.minAmount),
      maxAmount: p.maxAmount ? Number(p.maxAmount) : null,
      profitRate: Number(p.profitRate),
      profitSharingRatio: Number(p.profitSharingRatio),
      maturityBehavior: p.maturityBehavior as DepositProductInput["maturityBehavior"],
      status: p.status as DepositProductInput["status"],
    })
    setOpen(true)
  }
  const close = () => {
    setOpen(false)
    setForm(EMPTY_FORM)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.code.trim()) {
      toast.error("Name and code are required")
      return
    }
    startTransition(async () => {
      const res = form.id
        ? await updateDepositProduct(form)
        : await createDepositProduct(form)
      if (res.ok) {
        toast.success(form.id ? "Product updated" : "Product created")
        close()
        router.refresh()
      } else {
        toast.error("Failed", { description: res.error })
      }
    })
  }

  const handleDelete = (p: DepositProduct) => {
    if (!confirm(`Delete product "${p.name}"? This cannot be undone.`)) return
    setPendingDeleteId(p.id)
    startTransition(async () => {
      const res = await deleteDepositProduct(p.id)
      if (res.ok) {
        toast.success("Product deleted")
        router.refresh()
      } else {
        toast.error("Failed", { description: res.error })
      }
      setPendingDeleteId(null)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="t-h1 text-primary-ink">Deposit Products</h1>
          <p className="t-body mt-1 text-muted-ink">
            Manage the rate sheet for term-deposit products offered to members.
          </p>
        </div>
        {canEdit ? (
          <Button onClick={openAdd} className="brand-gradient shadow-brand-glow">
            <Plus className="h-4 w-4 mr-2" /> New Product
          </Button>
        ) : (
          <Badge variant="outline" className="text-muted-ink">
            <Lock className="h-3 w-3 mr-1" /> Read-only
          </Badge>
        )}
      </div>

      {products.length === 0 ? (
        <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
          <CardContent className="p-12 text-center">
            <Coins className="mx-auto h-12 w-12 text-faint-ink" />
            <p className="t-subheading mt-3 text-primary-ink">No products yet</p>
            <p className="t-body text-muted-ink">
              Create a term-deposit product to start accepting member deposits.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {products.map((p) => (
            <Card
              key={p.id}
              className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl"
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="t-subheading text-primary-ink">{p.name}</h3>
                    <p className="t-num text-xs text-muted-ink">{p.code}</p>
                  </div>
                  <Badge
                    className={`text-xs ${
                      p.status === "ACTIVE"
                        ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                        : "bg-slate-500/10 text-slate-600 border border-slate-500/20"
                    }`}
                  >
                    {p.status}
                  </Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <Stat
                    label="Term"
                    value={
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {p.termMonths} months
                      </span>
                    }
                  />
                  <Stat label="Rate" value={`${(Number(p.profitRate) * 100).toFixed(2)}% p.a.`} />
                  <Stat
                    label="Min"
                    value={formatBDT(Number(p.minAmount))}
                  />
                  <Stat
                    label="Max"
                    value={p.maxAmount ? formatBDT(Number(p.maxAmount)) : "—"}
                  />
                  <Stat
                    label="Member Share"
                    value={`${(Number(p.profitSharingRatio) * 100).toFixed(0)}%`}
                  />
                  <Stat label="Active Deposits" value={String(p._count?.deposits ?? 0)} />
                </div>
                <div className="mt-3 text-xs text-muted-ink">
                  On maturity: <span className="font-medium">{p.maturityBehavior}</span>
                </div>
                {canEdit && (
                  <div className="mt-4 flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(p)}
                      disabled={isPending}
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-rose-600 hover:bg-rose-50"
                      onClick={() => handleDelete(p)}
                      disabled={isPending || pendingDeleteId === p.id}
                      title="Delete"
                    >
                      {pendingDeleteId === p.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {form.id ? "Edit Product" : "New Deposit Product"}
            </DialogTitle>
            <DialogDescription>
              Configure the rate sheet for this term-deposit product.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="termMonths">Term (months)</Label>
                <Input
                  id="termMonths"
                  type="number"
                  min={1}
                  value={form.termMonths}
                  onChange={(e) =>
                    setForm({ ...form, termMonths: Number(e.target.value) })
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profitRate">Annual Profit Rate</Label>
                <Input
                  id="profitRate"
                  type="number"
                  step="0.0001"
                  min={0}
                  value={form.profitRate}
                  onChange={(e) =>
                    setForm({ ...form, profitRate: Number(e.target.value) })
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="minAmount">Min Amount</Label>
                <Input
                  id="minAmount"
                  type="number"
                  min={0}
                  value={form.minAmount}
                  onChange={(e) =>
                    setForm({ ...form, minAmount: Number(e.target.value) })
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maxAmount">Max Amount (blank = none)</Label>
                <Input
                  id="maxAmount"
                  type="number"
                  min={0}
                  value={form.maxAmount ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      maxAmount: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profitSharingRatio">Member Share (0–1)</Label>
                <Input
                  id="profitSharingRatio"
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  value={form.profitSharingRatio}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      profitSharingRatio: Number(e.target.value),
                    })
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maturityBehavior">At Maturity</Label>
                <Select
                  value={form.maturityBehavior}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      maturityBehavior: v as DepositProductInput["maturityBehavior"],
                    })
                  }
                >
                  <SelectTrigger id="maturityBehavior">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REINVEST">Reinvest</SelectItem>
                    <SelectItem value="WITHDRAW">Withdraw</SelectItem>
                    <SelectItem value="RENEW">Renew</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {form.id ? "Save Changes" : "Create Product"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="t-overline text-muted-ink">{label}</p>
      <p className="text-sm font-medium text-primary-ink">{value}</p>
    </div>
  )
}
