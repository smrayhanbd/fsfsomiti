"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import {
  HandCoins, AlertCircle, CheckCircle2, Clock, XCircle, Wallet,
} from "lucide-react"
import { submitWithdrawalRequest } from "@/app/actions/portal"
import { isNextRedirect } from "@/lib/nextRedirect"
import type { WithdrawalRequest } from "../savings/shared"

interface Props {
  member: {
    id: string
    memberNo: string
    fullName: string
    currentBalance: number
  }
  requests: WithdrawalRequest[]
}

// ─── Withdrawal request form + recent-requests feed ─────────────────────
// Ports the old savings-dashboard withdrawal dialog into a standalone page.
// Same fields, same submitWithdrawalRequest action, same validation.
export default function WithdrawalRequestClient({ member, requests }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [amount, setAmount] = useState("")

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Capture the form element synchronously — e.currentTarget is nulled
    // once the handler awaits.
    const formEl = e.currentTarget
    setLoading(true)
    const formData = new FormData(formEl)

    if (parseFloat(amount) > member.currentBalance) {
      toast.error("Invalid Amount", {
        description: "Withdrawal amount cannot exceed your current balance.",
      })
      setLoading(false)
      return
    }

    try {
      const res = await submitWithdrawalRequest(member.id, formData)
      if (res && res.error) {
        toast.error("Failed", { description: res.error })
        setLoading(false)
        return
      }
      toast.success("Request Submitted", {
        description: "Your withdrawal request is pending approval.",
      })
      formEl.reset()
      setAmount("")
      router.refresh()
    } catch (err: unknown) {
      // Success redirects back to this page (fresh data) — rethrow so
      // Next.js can perform the navigation.
      if (isNextRedirect(err)) throw err
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Failed",
      })
      setLoading(false)
    }
  }

  const statusStyle = (status: string) =>
    status === "APPROVED"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400"
      : status === "REJECTED"
        ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400"
        : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400"

  const StatusIcon = ({ status }: { status: string }) =>
    status === "PENDING" ? <Clock className="w-3 h-3 mr-1" /> :
    status === "APPROVED" ? <CheckCircle2 className="w-3 h-3 mr-1" /> :
    <XCircle className="w-3 h-3 mr-1" />

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* Request form */}
      <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
            <HandCoins className="h-4 w-4 text-amber-500" /> Request Withdrawal
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="mb-6 flex items-center gap-4 rounded-xl border border-emerald-200/60 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/30 p-4">
            <div className="h-11 w-11 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center shrink-0">
              <Wallet className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500 dark:text-slate-400">
                Available Balance
              </p>
              <p className="text-lg font-extrabold tracking-tight text-emerald-600">
                ৳ {member.currentBalance.toLocaleString()}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Withdrawal Type — mirrors admin's WithdrawalForm.
                Stored in breakdown.withdrawalType for the audit trail. */}
            <div className="space-y-2">
              <Label htmlFor="withdrawalType">Withdrawal Type</Label>
              <Select name="withdrawalType" required defaultValue="SAVINGS">
                <SelectTrigger id="withdrawalType"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SAVINGS">Savings Withdrawal</SelectItem>
                  <SelectItem value="PROFIT">Profit Withdrawal</SelectItem>
                  <SelectItem value="FULL_CLOSURE">Full Closure</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (৳)</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            {/* Payment Method — per spec §7, withdrawals are bank-only
                (Bank Transfer or Cheque). Uses the correct Prisma enum
                values (BANK_TRANSFER / CHEQUE), NOT the old "BANK" /
                "CASH" / "BKASH" values that broke the DB insert. */}
            <div className="space-y-2">
              <Label htmlFor="method">Payment Method</Label>
              <Select name="method" required defaultValue="BANK_TRANSFER">
                <SelectTrigger id="method"><SelectValue placeholder="Select method" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Input
                id="reason"
                name="reason"
                placeholder="Describe the reason for this withdrawal…"
              />
            </div>
            <Button type="submit" className="w-full bg-rose-600 hover:bg-rose-700" disabled={loading}>
              {loading ? "Submitting..." : "Submit Request"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Recent requests */}
      <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4 flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
            <HandCoins className="h-4 w-4 text-amber-500" /> Withdrawal Requests
          </CardTitle>
          <span className="text-xs text-slate-400">Latest {requests.length}</span>
        </CardHeader>
        <CardContent className="p-6">
          {requests.length === 0 ? (
            <div className="text-center py-8 flex flex-col items-center">
              <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                <AlertCircle className="h-6 w-6 text-slate-400" />
              </div>
              <p className="font-medium text-slate-700 dark:text-slate-200">No withdrawal requests yet</p>
              <p className="text-sm text-slate-500 mt-0.5">Fill out the form to create one.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/50"
                >
                  <div>
                    <p className="font-bold text-lg text-slate-900 dark:text-white">
                      ৳ {Number(req.amount).toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(req.createdAt).toLocaleDateString()} · {req.method}
                    </p>
                    {req.notes && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-1">&ldquo;{req.notes}&rdquo;</p>
                    )}
                  </div>
                  <Badge variant="outline" className={statusStyle(req.status)}>
                    <StatusIcon status={req.status} />
                    {req.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
