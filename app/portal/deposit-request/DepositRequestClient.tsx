"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { submitDepositRequest, resubmitDepositRequest } from "@/app/actions/portal"
import { toast } from "sonner"
import {
  ArrowDownToLine,
  Upload,
  FileText,
  Wallet,
  Landmark,
  Smartphone,
  Building2,
  Hash,
  CalendarDays,
  Paperclip,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  ExternalLink,
  Undo2,
  Pencil,
  type LucideIcon,
} from "lucide-react"
import type { PaymentMethod } from "@/lib/transactions/types"
import type { MethodGroup } from "@/lib/transactions/bankAccounts"

// ─── Types ───────────────────────────────────────────────────────────────
interface BankAccountInfo {
  id: string
  accountName: string
  bankName: string | null
  accountNumber: string | null
  branch: string | null
  paymentMethod: PaymentMethod
  isDefault: boolean
}

interface CollectionTypeOption {
  id: string
  name: string
}

interface RecentDepositRequest {
  id: string
  amount: number | null
  method: string | null
  notes: string | null
  status: string
  collectionTypeId: string | null
  referenceNo: string | null
  transactionDate: string | null
  rejectionReason: string | null
  returnReason: string | null
  voucherNo: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
  attachments: { type: string; name: string; url: string }[]
}

interface Props {
  memberId: string
  member: {
    memberNo: string
    fullName: string
    currentBalance: number
  }
  collectionTypes: CollectionTypeOption[]
  bankAccounts: BankAccountInfo[]
  missingGroups: MethodGroup[]
  recentRequests: RecentDepositRequest[]
}

// ─── Static config (mirrors the admin Deposit form's method groups) ──────
const METHOD_GROUPS: {
  group: MethodGroup
  label: string
  icon: LucideIcon
  methods: { value: PaymentMethod; label: string }[]
}[] = [
  { group: "CASH", label: "Cash", icon: Wallet, methods: [{ value: "CASH", label: "Cash" }] },
  {
    group: "BANK",
    label: "Bank Transfer / Cheque",
    icon: Landmark,
    methods: [
      { value: "BANK_TRANSFER", label: "Bank Transfer" },
      { value: "CHEQUE", label: "Cheque" },
    ],
  },
  {
    group: "MOBILE",
    label: "Mobile Banking",
    icon: Smartphone,
    methods: [
      { value: "BKASH", label: "bKash" },
      { value: "NAGAD", label: "Nagad" },
      { value: "ROCKET", label: "Rocket" },
    ],
  },
]

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket",
}

function groupForMethod(method: PaymentMethod): MethodGroup {
  if (method === "CASH") return "CASH"
  if (method === "BANK_TRANSFER" || method === "CHEQUE") return "BANK"
  return "MOBILE"
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const STATUS_STYLES: Record<string, { cls: string; icon: LucideIcon }> = {
  PENDING: { cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400", icon: Clock },
  PENDING_APPROVAL: { cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400", icon: Clock },
  APPROVED: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400", icon: CheckCircle2 },
  REJECTED: { cls: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400", icon: XCircle },
  RETURNED: { cls: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400", icon: Undo2 },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.PENDING
  const Icon = s.icon
  return (
    <Badge variant="outline" className={s.cls}>
      <Icon className="h-3 w-3 mr-1" /> {status.replace("_", " ")}
    </Badge>
  )
}

// ─── Component ───────────────────────────────────────────────────────────
export default function DepositRequestClient({
  memberId,
  member,
  collectionTypes,
  bankAccounts,
  missingGroups,
  recentRequests,
}: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editFileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  // Form fields (initial submission)
  const [amount, setAmount] = useState("")
  const [collectionTypeId, setCollectionTypeId] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("BKASH")
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10))
  const [referenceNo, setReferenceNo] = useState("")
  const [notes, setNotes] = useState("")
  const [slipFile, setSlipFile] = useState<File | null>(null)

  // ── Resubmit dialog state ("Returned for correction" path) ──────────────
  // When a member clicks "Edit & Resubmit" on a RETURNED request, we open a
  // dialog pre-filled with the original values + the admin's return reason.
  // The member can edit any field, optionally attach a NEW slip (otherwise
  // the original is kept), and submit. Calls `resubmitDepositRequest`.
  const [editOpen, setEditOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState("")
  const [editCollectionTypeId, setEditCollectionTypeId] = useState("")
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>("BKASH")
  const [editTransactionDate, setEditTransactionDate] = useState("")
  const [editReferenceNo, setEditReferenceNo] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [editSlipFile, setEditSlipFile] = useState<File | null>(null)
  const [editReturnReason, setEditReturnReason] = useState("")
  const [editVoucherNo, setEditVoucherNo] = useState<string | null>(null)
  const [editExistingSlipUrl, setEditExistingSlipUrl] = useState<string | null>(null)
  const [editExistingSlipName, setEditExistingSlipName] = useState<string | null>(null)

  // Bank accounts grouped by their payment method group — shown read-only so
  // the member knows where to send money.
  const banksByGroup: Record<MethodGroup, BankAccountInfo[]> = {
    CASH: [],
    BANK: [],
    MOBILE: [],
  }
  for (const b of bankAccounts) {
    const g = groupForMethod(b.paymentMethod)
    banksByGroup[g].push(b)
  }

  const activeMethodGroup = METHOD_GROUPS.find((g) => g.group === groupForMethod(paymentMethod))
  const groupMissing = missingGroups.includes(groupForMethod(paymentMethod))
  const editActiveMethodGroup = METHOD_GROUPS.find(
    (g) => g.group === groupForMethod(editPaymentMethod)
  )
  const editGroupMissing = missingGroups.includes(groupForMethod(editPaymentMethod))

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setSlipFile(f)
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) {
      toast.error("Invalid amount", { description: "Please enter a valid deposit amount." })
      return
    }
    if (!slipFile) {
      toast.error("Deposit slip required", { description: "Please attach the deposit slip / transaction document as proof." })
      return
    }
    if (slipFile.size > 10 * 1024 * 1024) {
      toast.error("File too large", { description: "Maximum slip file size is 10 MB." })
      return
    }

    const formData = new FormData()
    formData.append("amount", String(amt))
    formData.append("method", paymentMethod)
    if (collectionTypeId) formData.append("collectionTypeId", collectionTypeId)
    if (referenceNo.trim()) formData.append("referenceNo", referenceNo.trim())
    if (transactionDate) formData.append("transactionDate", transactionDate)
    if (notes.trim()) formData.append("notes", notes.trim())
    formData.append("slip", slipFile)

    startTransition(async () => {
      const res = await submitDepositRequest(memberId, formData)
      if (res.ok) {
        toast.success("Deposit request submitted", {
          description: "Your request is pending admin approval. You'll be notified once it's reviewed.",
        })
        // Reset form
        setAmount("")
        setReferenceNo("")
        setNotes("")
        setSlipFile(null)
        setCollectionTypeId("")
        if (fileInputRef.current) fileInputRef.current.value = ""
        router.refresh()
      } else {
        toast.error("Submission failed", { description: res.error })
      }
    })
  }

  // ── Resubmit handlers ("Returned for correction" path) ──────────────────
  const openEditDialog = (r: RecentDepositRequest) => {
    setEditingId(r.id)
    setEditAmount(r.amount ? String(r.amount) : "")
    setEditCollectionTypeId(r.collectionTypeId ?? "")
    setEditPaymentMethod((r.method as PaymentMethod) ?? "BKASH")
    setEditTransactionDate(
      r.transactionDate ? r.transactionDate.slice(0, 10) : new Date().toISOString().slice(0, 10)
    )
    setEditReferenceNo(r.referenceNo ?? "")
    setEditNotes(r.notes ?? "")
    setEditSlipFile(null)
    setEditReturnReason(r.returnReason ?? "")
    setEditVoucherNo(r.voucherNo)
    const slip = r.attachments?.[0]
    setEditExistingSlipUrl(slip?.url ?? null)
    setEditExistingSlipName(slip?.name ?? null)
    if (editFileInputRef.current) editFileInputRef.current.value = ""
    setEditOpen(true)
  }

  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setEditSlipFile(f)
  }

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingId) return
    const amt = parseFloat(editAmount)
    if (!amt || amt <= 0) {
      toast.error("Invalid amount", { description: "Please enter a valid deposit amount." })
      return
    }
    if (editSlipFile && editSlipFile.size > 10 * 1024 * 1024) {
      toast.error("File too large", { description: "Maximum slip file size is 10 MB." })
      return
    }

    const formData = new FormData()
    formData.append("amount", String(amt))
    formData.append("method", editPaymentMethod)
    if (editCollectionTypeId) formData.append("collectionTypeId", editCollectionTypeId)
    if (editReferenceNo.trim()) formData.append("referenceNo", editReferenceNo.trim())
    if (editTransactionDate) formData.append("transactionDate", editTransactionDate)
    if (editNotes.trim()) formData.append("notes", editNotes.trim())
    if (editSlipFile) {
      formData.append("slip", editSlipFile)
    } else {
      // Send an empty File so the action sees `slipFile` as null and keeps
      // the original. FormData.append with a Blob is required for the field
      // to exist; we send an empty 0-byte Blob named "slip" so the action's
      // `slipFile.size === 0` branch fires correctly.
      formData.append("slip", new Blob([], { type: "application/octet-stream" }), "")
    }

    startTransition(async () => {
      const res = await resubmitDepositRequest(memberId, editingId, formData)
      if (res.ok) {
        toast.success("Deposit request resubmitted", {
          description: "Your updated request is back in the admin approval queue.",
        })
        setEditOpen(false)
        setEditingId(null)
        router.refresh()
      } else {
        toast.error("Resubmission failed", { description: res.error })
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <ArrowDownToLine className="h-7 w-7 text-emerald-500" /> Deposit Request
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Already deposited to the Somiti account? Submit the details with your deposit slip — admin will verify and credit your balance.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2">
          <Wallet className="h-5 w-5 text-emerald-600" />
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 dark:text-slate-400">
              Current Balance
            </p>
            <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
              ৳ {member.currentBalance.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Where to deposit (read-only bank accounts) */}
      <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
            <Building2 className="h-4 w-4 text-indigo-500" /> Somiti Accounts — Deposit Here First
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {bankAccounts.length === 0 ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                No active bank/mobile accounts configured. Please contact management for deposit instructions before submitting a request.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(["CASH", "BANK", "MOBILE"] as MethodGroup[]).map((g) => {
                const groupCfg = METHOD_GROUPS.find((m) => m.group === g)!
                const accounts = banksByGroup[g]
                if (accounts.length === 0) return null
                const Icon = groupCfg.icon
                return (
                  <div
                    key={g}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-4"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-8 w-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/40 flex items-center justify-center">
                        <Icon className="h-4 w-4 text-indigo-600" />
                      </div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {groupCfg.label}
                      </p>
                    </div>
                    <ul className="space-y-2">
                      {accounts.map((a) => (
                        <li key={a.id} className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-slate-700 dark:text-slate-200">
                              {a.accountName}
                            </p>
                            {a.isDefault && (
                              <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase font-bold border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400">
                                Default
                              </Badge>
                            )}
                          </div>
                          {a.bankName && (
                            <p className="text-slate-500 dark:text-slate-400">{a.bankName}</p>
                          )}
                          {a.accountNumber && (
                            <p className="font-mono text-slate-600 dark:text-slate-300">
                              {a.accountNumber}
                            </p>
                          )}
                          {a.branch && (
                            <p className="text-slate-400">{a.branch}</p>
                          )}
                          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-400">
                            {PAYMENT_METHOD_LABEL[a.paymentMethod]}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submission form + recent requests */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form (3 cols) */}
        <div className="lg:col-span-3">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4">
              <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
                <FileText className="h-4 w-4 text-emerald-500" /> Submit New Deposit Request
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Amount + Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">
                      Deposit Amount (৳) <span className="text-rose-500">*</span>
                    </Label>
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
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transactionDate">
                      Deposit Date <span className="text-rose-500">*</span>
                    </Label>
                    <div className="relative">
                      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        id="transactionDate"
                        name="transactionDate"
                        type="date"
                        required
                        value={transactionDate}
                        onChange={(e) => setTransactionDate(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                </div>

                {/* Collection type */}
                <div className="space-y-2">
                  <Label htmlFor="collectionTypeId">Deposit Type</Label>
                  <Select value={collectionTypeId} onValueChange={(v) => v && setCollectionTypeId(v)}>
                    <SelectTrigger id="collectionTypeId">
                      <SelectValue placeholder={collectionTypes.length ? "Select deposit type (optional)" : "No collection types configured"} />
                    </SelectTrigger>
                    <SelectContent>
                      {collectionTypes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    Pick the category that best matches your deposit (e.g. Monthly Savings, Due Payment).
                  </p>
                </div>

                {/* Payment method */}
                <div className="space-y-2">
                  <Label htmlFor="method">
                    Payment Method <span className="text-rose-500">*</span>
                  </Label>
                  <Select
                    value={paymentMethod}
                    onValueChange={(v) => v && setPaymentMethod(v as PaymentMethod)}
                    name="method"
                  >
                    <SelectTrigger id="method">
                      <span className="flex items-center gap-2">
                        {activeMethodGroup && <activeMethodGroup.icon className="h-4 w-4 text-slate-500" />}
                        <span>{PAYMENT_METHOD_LABEL[paymentMethod]}</span>
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {METHOD_GROUPS.map((g) => (
                        <SelectGroup key={g.group}>
                          <SelectLabel>{g.label}</SelectLabel>
                          {g.methods.map((m) => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  {groupMissing && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-2 text-xs text-amber-700 dark:text-amber-400">
                      <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>
                        The Somiti hasn&apos;t configured a receiving account for this method. Your request will still be submitted; admin will resolve the account before approval.
                      </span>
                    </div>
                  )}
                </div>

                {/* Reference number */}
                <div className="space-y-2">
                  <Label htmlFor="referenceNo">Reference / Transaction ID</Label>
                  <div className="relative">
                    <Hash className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="referenceNo"
                      name="referenceNo"
                      value={referenceNo}
                      onChange={(e) => setReferenceNo(e.target.value)}
                      placeholder="Bank txn id / cheque no. / bKash trxId"
                      className="pl-9"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    The transaction ID printed on your slip or SMS confirmation — helps admin verify faster.
                  </p>
                </div>

                {/* Slip upload */}
                <div className="space-y-2">
                  <Label htmlFor="slip">
                    Deposit Slip / Transaction Document <span className="text-rose-500">*</span>
                  </Label>
                  <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 p-4">
                    <input
                      ref={fileInputRef}
                      id="slip"
                      name="slip"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/*"
                      onChange={handleFileChange}
                      className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 dark:file:bg-emerald-950/40 dark:file:text-emerald-400"
                    />
                    {slipFile && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <Paperclip className="h-3 w-3" />
                        <span className="truncate">{slipFile.name}</span>
                        <span className="text-slate-400">({(slipFile.size / 1024).toFixed(0)} KB)</span>
                      </div>
                    )}
                    <p className="mt-2 text-[11px] text-slate-400">
                      Accepted: PDF, PNG, JPG, WEBP, GIF. Max 10 MB.
                    </p>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any additional context for the admin reviewer…"
                    className="min-h-[64px] resize-y"
                  />
                </div>

                {/* Submit */}
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.back()}
                    disabled={isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    disabled={isPending}
                  >
                    <Upload className="h-4 w-4 mr-1.5" />
                    {isPending ? "Submitting…" : "Submit Deposit Request"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Recent requests (2 cols) */}
        <div className="lg:col-span-2">
          <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden h-full">
            <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4 flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
                <Clock className="h-4 w-4 text-amber-500" /> Recent Deposit Requests
              </CardTitle>
              <Link
                href="/portal/requests"
                className="text-xs font-medium text-indigo-600 hover:underline"
              >
                View all →
              </Link>
            </CardHeader>
            <CardContent className="p-6">
              {recentRequests.length === 0 ? (
                <div className="text-center py-8 flex flex-col items-center">
                  <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                    <ArrowDownToLine className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="font-medium text-slate-700 dark:text-slate-200">No deposit requests yet</p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Submit your first request using the form on the left.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {recentRequests.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 dark:text-white">
                            ৳ {r.amount ? Number(r.amount).toLocaleString() : "—"}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <CalendarDays className="h-3 w-3" />
                            {fmtDate(r.transactionDate ?? r.createdAt)}
                            {r.method && <span>· {PAYMENT_METHOD_LABEL[r.method as PaymentMethod] ?? r.method}</span>}
                            {r.referenceNo && <span>· Ref: {r.referenceNo}</span>}
                          </p>
                          {r.notes && (
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">&ldquo;{r.notes}&rdquo;</p>
                          )}
                          {r.attachments?.[0] && (
                            <a
                              href={r.attachments[0].url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline"
                            >
                              <Paperclip className="h-3 w-3" />
                              View slip
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                          {r.status === "REJECTED" && r.rejectionReason && (
                            <div className="mt-2 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20 p-2 text-[11px] text-rose-700 dark:text-rose-400">
                              <p className="font-semibold mb-0.5">Rejection reason:</p>
                              <p>{r.rejectionReason}</p>
                              {r.reviewedBy && (
                                <p className="mt-1 text-rose-500">
                                  — {r.reviewedBy}, {fmtDateTime(r.reviewedAt)}
                                </p>
                              )}
                            </div>
                          )}
                          {r.status === "RETURNED" && (
                            <div className="mt-2 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/20 p-2 text-[11px] text-blue-700 dark:text-blue-400">
                              <p className="font-semibold mb-0.5 flex items-center gap-1">
                                <Undo2 className="h-3 w-3" /> Returned for correction
                              </p>
                              {r.returnReason && <p>{r.returnReason}</p>}
                              {r.reviewedBy && (
                                <p className="mt-1 text-blue-500">
                                  — {r.reviewedBy}, {fmtDateTime(r.reviewedAt)}
                                </p>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                className="mt-2 h-7 bg-blue-600 hover:bg-blue-700 text-[11px]"
                                onClick={() => openEditDialog(r)}
                                disabled={isPending}
                              >
                                <Pencil className="h-3 w-3 mr-1" /> Edit &amp; Resubmit
                              </Button>
                            </div>
                          )}
                          {r.status === "APPROVED" && r.reviewedBy && (
                            <p className="mt-1 text-[10px] text-slate-400">
                              Approved by {r.reviewedBy} on {fmtDateTime(r.reviewedAt)}
                            </p>
                          )}
                        </div>
                        <StatusBadge status={r.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Resubmit dialog ("Returned for correction" path) ───────────────────
          Pre-fills the original request values + shows the admin's return
          reason. Member can edit any field, optionally attach a NEW slip
          (otherwise the original slip URL is kept), and resubmit. */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-950 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-blue-600" />
              Edit &amp; Resubmit Deposit Request
            </DialogTitle>
            <DialogDescription>
              {editVoucherNo && (
                <span className="font-mono text-[11px]">Voucher {editVoucherNo}</span>
              )}
              <span className="text-slate-500">
                Update the fields the admin flagged, then resubmit for approval.
              </span>
            </DialogDescription>
          </DialogHeader>

          {editReturnReason && (
            <div className="rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/20 p-3 text-xs text-blue-700 dark:text-blue-400">
              <p className="font-semibold mb-0.5 flex items-center gap-1">
                <Undo2 className="h-3 w-3" /> Admin&apos;s return reason:
              </p>
              <p>{editReturnReason}</p>
            </div>
          )}

          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-amount">Amount (৳) <span className="text-rose-500">*</span></Label>
                <Input
                  id="edit-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-date">Deposit Date <span className="text-rose-500">*</span></Label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="edit-date"
                    type="date"
                    required
                    value={editTransactionDate}
                    onChange={(e) => setEditTransactionDate(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-collection">Deposit Type</Label>
              <Select value={editCollectionTypeId} onValueChange={(v) => v && setEditCollectionTypeId(v)}>
                <SelectTrigger id="edit-collection">
                  <SelectValue placeholder={collectionTypes.length ? "Select deposit type (optional)" : "No collection types configured"} />
                </SelectTrigger>
                <SelectContent>
                  {collectionTypes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-method">Payment Method <span className="text-rose-500">*</span></Label>
              <Select
                value={editPaymentMethod}
                onValueChange={(v) => v && setEditPaymentMethod(v as PaymentMethod)}
              >
                <SelectTrigger id="edit-method">
                  <span className="flex items-center gap-2">
                    {editActiveMethodGroup && <editActiveMethodGroup.icon className="h-4 w-4 text-slate-500" />}
                    <span>{PAYMENT_METHOD_LABEL[editPaymentMethod]}</span>
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {METHOD_GROUPS.map((g) => (
                    <SelectGroup key={g.group}>
                      <SelectLabel>{g.label}</SelectLabel>
                      {g.methods.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {editGroupMissing && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  No default receiving account configured for this method. Admin will resolve before approval.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-ref">Reference / Transaction ID</Label>
              <div className="relative">
                <Hash className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="edit-ref"
                  value={editReferenceNo}
                  onChange={(e) => setEditReferenceNo(e.target.value)}
                  placeholder="Bank txn id / cheque no. / bKash trxId"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-slip">Deposit Slip (optional — leave blank to keep original)</Label>
              <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 p-3">
                <input
                  ref={editFileInputRef}
                  id="edit-slip"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/*"
                  onChange={handleEditFileChange}
                  className="block w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-950/40 dark:file:text-blue-400"
                />
                {editSlipFile ? (
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <Paperclip className="h-3 w-3" />
                    <span className="truncate">{editSlipFile.name}</span>
                    <span className="text-slate-400">({(editSlipFile.size / 1024).toFixed(0)} KB)</span>
                  </div>
                ) : editExistingSlipUrl ? (
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <Paperclip className="h-3 w-3" />
                    <span>Current:</span>
                    <a
                      href={editExistingSlipUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:underline truncate max-w-[200px]"
                    >
                      {editExistingSlipName ?? "View slip"}
                    </a>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-rose-500">No slip on record — please attach one.</p>
                )}
                <p className="mt-1 text-[11px] text-slate-400">
                  Upload a new file to replace the original. PDF, PNG, JPG, WEBP, GIF. Max 10 MB.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes (Optional)</Label>
              <Textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Any additional context for the admin reviewer…"
                className="min-h-[64px] resize-y"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-white dark:bg-slate-950 -mx-1 px-1 pb-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700"
                disabled={isPending}
              >
                <Undo2 className="h-4 w-4 mr-1.5" />
                {isPending ? "Resubmitting…" : "Resubmit for Approval"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
