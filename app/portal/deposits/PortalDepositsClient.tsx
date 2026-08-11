"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Coins, Calendar, TrendingUp, Loader2, CheckCircle2, Clock,
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
import { applyForDeposit } from "@/app/actions/memberDeposits"
import { formatBDT, formatDate } from "@/lib/accounting"

interface Product {
  id: string
  name: string
  code: string
  termMonths: number
  minAmount: number
  maxAmount: number | null
  profitRate: number
  profitSharingRatio: number
  maturityBehavior: string
  previewProfitAtMin: number
}

interface MyDeposit {
  id: string
  principalAmount: number
  startDate: string
  maturityDate: string
  expectedProfit: number
  status: string
  product: { name: string; code: string; profitRate: number }
  transaction: { voucherNo: string; status: string } | null
}

interface Props {
  products: Product[]
  myDeposits: MyDeposit[]
}

export default function PortalDepositsClient({ products, myDeposits }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [openId, setOpenId] = useState<string | null>(null)
  const [amount, setAmount] = useState<number>(0)
  const [submittingId, setSubmittingId] = useState<string | null>(null)

  const openApply = (p: Product) => {
    setAmount(p.minAmount)
    setOpenId(p.id)
  }
  const close = () => {
    setOpenId(null)
    setAmount(0)
  }

  const selected = products.find((p) => p.id === openId)
  const expectedProfit = selected
    ? selected.minAmount && amount > 0
      ? Math.round(
          amount *
            selected.profitRate *
            (selected.termMonths / 12) *
            selected.profitSharingRatio
        )
      : 0
    : 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    if (amount < selected.minAmount) {
      toast.error(`Minimum amount is ৳${selected.minAmount.toLocaleString()}`)
      return
    }
    if (selected.maxAmount && amount > selected.maxAmount) {
      toast.error(`Maximum amount is ৳${selected.maxAmount.toLocaleString()}`)
      return
    }
    setSubmittingId(selected.id)
    startTransition(async () => {
      const res = await applyForDeposit(selected.id, amount)
      if (res.ok) {
        toast.success("Deposit application submitted", {
          description: "Pending admin approval. You'll be notified once approved.",
        })
        close()
        router.refresh()
      } else {
        toast.error("Failed", { description: res.error })
      }
      setSubmittingId(null)
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="t-h1 text-primary-ink">Term Deposits</h1>
        <p className="t-body mt-1 text-muted-ink">
          Browse available term-deposit products and apply. Your application
          goes to the admin approval queue — once approved, the principal is
          locked in and the profit is credited at maturity.
        </p>
      </div>

      {/* Active products */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products.length === 0 ? (
          <Card className="col-span-full bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
            <CardContent className="p-12 text-center">
              <Coins className="mx-auto h-12 w-12 text-faint-ink" />
              <p className="t-subheading mt-3 text-primary-ink">
                No deposit products available
              </p>
              <p className="t-body text-muted-ink">
                Please check back later or contact the office.
              </p>
            </CardContent>
          </Card>
        ) : (
          products.map((p) => (
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
                  <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    {(p.profitRate * 100).toFixed(2)}% p.a.
                  </Badge>
                </div>
                <div className="mt-4 space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-ink">Term</span>
                    <span className="font-medium text-primary-ink">
                      <Calendar className="inline h-3 w-3 mr-1" />
                      {p.termMonths} months
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-ink">Min Amount</span>
                    <span className="font-medium text-primary-ink">
                      {formatBDT(p.minAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-ink">Member Share</span>
                    <span className="font-medium text-primary-ink">
                      {(p.profitSharingRatio * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800/60">
                    <span className="text-muted-ink">Profit @ min</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {formatBDT(p.previewProfitAtMin)}
                    </span>
                  </div>
                </div>
                <Button
                  onClick={() => openApply(p)}
                  className="mt-4 w-full brand-gradient shadow-brand-glow"
                >
                  Apply
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* My deposits */}
      <div>
        <h2 className="t-h2 text-primary-ink mb-3">My Deposits</h2>
        {myDeposits.length === 0 ? (
          <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
            <CardContent className="p-8 text-center">
              <Clock className="mx-auto h-8 w-8 text-faint-ink" />
              <p className="t-body mt-2 text-muted-ink">
                No term deposits yet. Apply for one above to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {myDeposits.map((d) => (
              <Card
                key={d.id}
                className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl"
              >
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-primary-ink">
                        {d.product.name}
                      </p>
                      <p className="text-xs text-muted-ink">
                        {d.product.code} · {d.transaction?.voucherNo ?? "—"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-ink">Principal</p>
                      <p className="font-bold text-primary-ink">
                        {formatBDT(Number(d.principalAmount))}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-ink">Expected Profit</p>
                      <p className="font-bold text-emerald-600 dark:text-emerald-400">
                        {formatBDT(Number(d.expectedProfit))}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-ink">Matures</p>
                      <p className="font-medium text-primary-ink">
                        {formatDate(d.maturityDate)}
                      </p>
                    </div>
                    <Badge
                      className={`text-xs ${
                        d.status === "ACTIVE"
                          ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                          : d.status === "MATURED"
                            ? "bg-indigo-500/10 text-indigo-600 border border-indigo-500/20"
                            : "bg-slate-500/10 text-slate-600 border border-slate-500/20"
                      }`}
                    >
                      {d.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Apply dialog */}
      <Dialog open={!!openId} onOpenChange={(o) => (o ? null : close())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Apply for {selected?.name}
            </DialogTitle>
            <DialogDescription>
              {selected?.termMonths} months · {(selected ? selected.profitRate * 100 : 0).toFixed(2)}% p.a. · Member share {(selected ? selected.profitSharingRatio * 100 : 0).toFixed(0)}%
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Principal Amount (৳)</Label>
              <Input
                id="amount"
                type="number"
                min={selected?.minAmount ?? 0}
                max={selected?.maxAmount ?? undefined}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                required
              />
              {selected && (
                <p className="text-xs text-muted-ink">
                  Min: {formatBDT(selected.minAmount)}
                  {selected.maxAmount ? ` · Max: ${formatBDT(selected.maxAmount)}` : ""}
                </p>
              )}
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-xs text-muted-ink">Expected Profit at Maturity</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {formatBDT(expectedProfit)}
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || submittingId === selected?.id}>
                {isPending && submittingId === selected?.id && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Submit Application
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
