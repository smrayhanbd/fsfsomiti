"use client"

import { useState } from "react"
import { submitDepositRequest } from "@/app/actions/portal"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import {
  Wallet, Upload, FileText, X, CheckCircle2, Clock, XCircle,
  ExternalLink, Banknote, Building, Smartphone, Info,
} from "lucide-react"
import { isNextRedirect } from "@/lib/nextRedirect"

interface DepositAttachment {
  type: string
  name: string
  url: string
}

interface DepositRequest {
  id: string
  amount: number | null
  method: string | null
  notes: string | null
  // JSONB column on MemberRequest: [{ type, name, url }]. The first entry is
  // the deposit slip / transaction screenshot the member uploaded.
  attachments: DepositAttachment[]
  // Member-entered bank/MFS transaction id (replaces the dropped `transactionRef`).
  referenceNo: string | null
  status: string
  createdAt: string
}

interface OrgInfo {
  name: string
  addressLine: string | null
  phone: string | null
  email: string | null
}

interface BankAccountInfo {
  id: string
  accountName: string
  bankName: string | null
  accountNumber: string | null
  paymentMethod: string
  isActive: boolean
  isDefault: boolean
}

interface DepositClientProps {
  memberId: string
  memberName: string
  memberNo: string
  currentBalance: number
  requests: DepositRequest[]
  org: OrgInfo | null
  bankAccounts: BankAccountInfo[]
}

export default function DepositClient({
  memberId, memberName, memberNo, currentBalance, requests, org, bankAccounts,
}: DepositClientProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [slipFile, setSlipFile] = useState<File | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)

    // Validate slip file
    if (!slipFile || slipFile.size === 0) {
      toast.error("Deposit slip required", { description: "Please upload the deposit slip or transaction screenshot." })
      setLoading(false)
      return
    }
    formData.set("slip", slipFile)

    try {
      await submitDepositRequest(memberId, formData)
      toast.success("Deposit request submitted", { description: "Your request is pending admin review." })
      setOpen(false)
      setSlipFile(null)
    } catch (err: unknown) {
      if (isNextRedirect(err)) throw err
      toast.error("Failed", { description: err instanceof Error ? err.message : "Please try again." })
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

  const methodIcon = (method: string | null) => {
    if (method === "BKASH" || method === "NAGAD" || method === "ROCKET") return <Smartphone className="h-4 w-4" />
    if (method === "BANK_TRANSFER" || method === "BANK") return <Building className="h-4 w-4" />
    return <Banknote className="h-4 w-4" />
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="t-h1 text-primary-ink">Deposit Request</h1>
        <p className="t-body text-muted-ink mt-1">
          Deposit money to the somiti account, then submit a request with the deposit slip as proof.
        </p>
      </div>

      {/* Balance + New Request button */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">Current Balance</p>
                <p className="text-xl font-extrabold text-slate-900 dark:text-white">৳ {currentBalance.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center">
                <FileText className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">Pending Requests</p>
                <p className="text-xl font-extrabold text-slate-900 dark:text-white">{requests.filter(r => r.status === "PENDING").length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center">
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSlipFile(null) }}>
            <DialogTrigger render={<Button className="w-full h-12 brand-gradient shadow-brand-glow rounded-xl">
              <Upload className="h-4 w-4 mr-2" /> New Deposit Request
            </Button>} />
            <DialogContent className="max-w-lg bg-white dark:bg-slate-950 rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">Submit Deposit Request</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 py-2">
                {/* Amount */}
                <div className="space-y-2">
                  <Label htmlFor="amount">Deposit Amount (৳) <span className="text-rose-500">*</span></Label>
                  <Input id="amount" name="amount" type="number" step="0.01" min="1" required placeholder="0.00" />
                </div>

                {/* Payment Method */}
                <div className="space-y-2">
                  <Label htmlFor="method">Payment Method <span className="text-rose-500">*</span></Label>
                  <Select name="method" required>
                    <SelectTrigger id="method"><SelectValue placeholder="Select method" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BANK">Bank Transfer</SelectItem>
                      <SelectItem value="BKASH">bKash</SelectItem>
                      <SelectItem value="NAGAD">Nagad</SelectItem>
                      <SelectItem value="ROCKET">Rocket</SelectItem>
                      <SelectItem value="CASH">Cash (Hand)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Transaction Reference */}
                <div className="space-y-2">
                  <Label htmlFor="referenceNo">Transaction Reference No.</Label>
                  <Input id="referenceNo" name="referenceNo" placeholder="e.g., bKash TrxID, Bank Ref No." />
                  <p className="text-xs text-slate-400">Enter the transaction ID from your bank/MFS confirmation.</p>
                </div>

                {/* Deposit Slip Upload */}
                <div className="space-y-2">
                  <Label>Deposit Slip / Screenshot <span className="text-rose-500">*</span></Label>
                  <div className="rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 p-4 hover:border-indigo-500 transition-colors">
                    {slipFile ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-5 w-5 text-indigo-600 shrink-0" />
                          <span className="text-sm text-slate-700 dark:text-slate-200 truncate max-w-[200px]">{slipFile.name}</span>
                          <span className="text-xs text-slate-400">({(slipFile.size / 1024).toFixed(1)} KB)</span>
                        </div>
                        <button type="button" onClick={() => setSlipFile(null)} className="text-rose-500 hover:text-rose-700 shrink-0">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center cursor-pointer">
                        <Upload className="h-8 w-8 text-slate-400 mb-1" />
                        <span className="text-sm text-slate-500">Upload deposit slip or screenshot</span>
                        <span className="text-xs text-slate-400 mt-0.5">PNG, JPG, or PDF · Click to select</span>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,.pdf"
                          onChange={(e) => setSlipFile(e.target.files?.[0] || null)}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea id="notes" name="notes" rows={2} placeholder="Any additional information about this deposit..." />
                </div>

                <Button type="submit" disabled={loading} className="w-full brand-gradient shadow-brand-glow rounded-xl h-11">
                  {loading ? "Submitting..." : "Submit Deposit Request"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Somiti Account Info (for the member to deposit to) */}
      {bankAccounts && bankAccounts.length > 0 && (
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-500 to-blue-600">
            <Info className="h-4 w-4 text-white" />
            <h3 className="text-sm font-bold text-white">Somiti Bank/MFS Accounts — Deposit Here</h3>
          </div>
          <CardContent className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {bankAccounts.map((acc) => (
                <div key={acc.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-center gap-2 mb-2">
                    {methodIcon(acc.paymentMethod)}
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{acc.accountName}</span>
                    {acc.isDefault && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Default</Badge>}
                  </div>
                  {acc.bankName && <p className="text-xs text-slate-500">{acc.bankName}</p>}
                  {acc.accountNumber && <p className="text-sm font-mono font-semibold text-slate-700 dark:text-slate-200 mt-1">{acc.accountNumber}</p>}
                  <p className="text-[10px] uppercase font-bold text-slate-400 mt-1">{acc.paymentMethod.replace(/_/g, " ")}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Deposit Requests */}
      <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600">
          <Wallet className="h-4 w-4 text-white" />
          <h3 className="text-sm font-bold text-white">My Deposit Requests</h3>
        </div>
        <CardContent className="p-5">
          {requests.length === 0 ? (
            <div className="text-center py-12">
              <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                <Wallet className="h-6 w-6 text-slate-400" />
              </div>
              <p className="font-medium text-slate-700 dark:text-slate-200">No deposit requests yet</p>
              <p className="text-sm text-slate-500 mt-0.5">Click &quot;New Deposit Request&quot; to submit one.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div key={req.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
                    {methodIcon(req.method)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-900 dark:text-white">৳ {Number(req.amount || 0).toLocaleString()}</p>
                      <span className="text-xs text-slate-500">via {req.method || "N/A"}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(req.createdAt).toLocaleDateString()} · {new Date(req.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {req.referenceNo && <p className="text-xs text-slate-400 mt-0.5">Ref: {req.referenceNo}</p>}
                    {req.notes && <p className="text-xs text-slate-400 mt-0.5 italic">&quot;{req.notes}&quot;</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {req.attachments[0]?.url && (
                      <a href={req.attachments[0].url} target="_blank" rel="noopener noreferrer" className="text-xs flex items-center gap-1 font-medium text-indigo-600 hover:underline">
                        <ExternalLink className="h-3 w-3" /> View Slip
                      </a>
                    )}
                    <Badge variant="outline" className={statusStyle(req.status)}>
                      <StatusIcon status={req.status} />
                      {req.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
