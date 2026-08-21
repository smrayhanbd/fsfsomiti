"use client"

import { useRef, useState, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
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
  SelectItem,
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
  Copy,
  Check,
  Sparkles,
  ChevronRight,
  Receipt,
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
  shortLabel: string
  icon: LucideIcon
  methods: { value: PaymentMethod; label: string }[]
  accent: string
}[] = [
  {
    group: "CASH",
    label: "Cash Deposit",
    shortLabel: "Cash",
    icon: Wallet,
    methods: [{ value: "CASH", label: "Cash" }],
    accent: "emerald",
  },
  {
    group: "BANK",
    label: "Bank Transfer / Cheque",
    shortLabel: "Bank",
    icon: Landmark,
    methods: [
      { value: "BANK_TRANSFER", label: "Bank Transfer" },
      { value: "CHEQUE", label: "Cheque" },
    ],
    accent: "blue",
  },
  {
    group: "MOBILE",
    label: "Mobile Banking",
    shortLabel: "Mobile",
    icon: Smartphone,
    methods: [
      { value: "BKASH", label: "bKash" },
      { value: "NAGAD", label: "Nagad" },
      { value: "ROCKET", label: "Rocket" },
    ],
    accent: "violet",
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

// ─── Status config (polished pills + icon-chip backgrounds) ──────────────
type StatusKey = "PENDING" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "RETURNED"
const STATUS_CONFIG: Record<StatusKey, {
  pill: string
  chip: string
  chipText: string
  dot: string
  icon: LucideIcon
  label: string
}> = {
  PENDING: {
    pill: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50",
    chip: "bg-amber-100 dark:bg-amber-950/50",
    chipText: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
    icon: Clock,
    label: "Pending",
  },
  PENDING_APPROVAL: {
    pill: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50",
    chip: "bg-amber-100 dark:bg-amber-950/50",
    chipText: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
    icon: Clock,
    label: "Pending Approval",
  },
  APPROVED: {
    pill: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50",
    chip: "bg-emerald-100 dark:bg-emerald-950/50",
    chipText: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
    icon: CheckCircle2,
    label: "Approved",
  },
  REJECTED: {
    pill: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50",
    chip: "bg-rose-100 dark:bg-rose-950/50",
    chipText: "text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
    icon: XCircle,
    label: "Rejected",
  },
  RETURNED: {
    pill: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50",
    chip: "bg-blue-100 dark:bg-blue-950/50",
    chipText: "text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500",
    icon: Undo2,
    label: "Returned",
  },
}

function getStatus(key: string) {
  return STATUS_CONFIG[key as StatusKey] ?? STATUS_CONFIG.PENDING
}

function StatusBadge({ status }: { status: string }) {
  const s = getStatus(status)
  const Icon = s.icon
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${s.pill}`}>
      <Icon className="h-3 w-3" />
      {s.label}
    </span>
  )
}

// ─── CopyButton (with check feedback) ────────────────────────────────────
function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success(label ? `${label} copied` : "Copied to clipboard")
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error("Could not copy")
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied!" : (label ? `Copy ${label}` : "Copy to clipboard")}
      aria-label={label ? `Copy ${label}` : "Copy to clipboard"}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

// ─── Stat tile (used in hero) ────────────────────────────────────────────
function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  accentClass,
  iconBgClass,
}: {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
  accentClass: string
  iconBgClass: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBgClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">{label}</p>
        <p className={`text-lg font-extrabold tracking-tight ${accentClass}`}>{value}</p>
        {sub && <p className="text-[11px] text-white/60">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Section header (consistent across cards) ────────────────────────────
function SectionHeader({
  step,
  icon: Icon,
  title,
  description,
  iconClass,
}: {
  step?: number
  icon: LucideIcon
  title: string
  description?: string
  iconClass?: string
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border-base px-5 py-4 sm:px-6">
      {step !== undefined && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
          {step}
        </div>
      )}
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${iconClass ?? "bg-primary/10 text-primary"}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold tracking-tight text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  )
}

// ─── Visual payment method picker (radio-card group) ────────────────────
function PaymentMethodPicker({
  value,
  onChange,
}: {
  value: PaymentMethod
  onChange: (v: PaymentMethod) => void
}) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {METHOD_GROUPS.flatMap((g) =>
        g.methods.map((m) => {
          const active = value === m.value
          const Icon = g.icon
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => onChange(m.value)}
              className={`group relative flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 transition-all ${
                active
                  ? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20"
                  : "border-border-base bg-surface hover:border-primary/40 hover:bg-subtle"
              }`}
              aria-pressed={active}
            >
              <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
              <span className={`text-[11px] font-semibold ${active ? "text-primary" : "text-foreground"}`}>
                {m.label}
              </span>
              {active && (
                <span className="absolute right-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
              )}
            </button>
          )
        })
      )}
    </div>
  )
}

// ─── File upload drop zone (shared between form + edit dialog) ──────────
function SlipDropZone({
  file,
  onFileChange,
  onDrop,
  onDragOver,
  onDragLeave,
  inputRef,
  inputId,
  existingUrl,
  existingName,
  isDragging,
}: {
  file: File | null
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void
  onDragLeave?: (e: React.DragEvent<HTMLDivElement>) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  inputId: string
  existingUrl?: string | null
  existingName?: string | null
  isDragging?: boolean
}) {
  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={`relative rounded-xl border-2 border-dashed p-5 transition-colors ${
        isDragging && onDrop
          ? "border-primary bg-primary/5"
          : "border-border-strong bg-subtle/40 hover:border-primary/40 hover:bg-subtle"
      }`}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/*"
        onChange={onFileChange}
        className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-semibold file:text-primary-foreground hover:file:bg-primary-hover file:cursor-pointer"
      />
      {file ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-medium">{file.name}</span>
          <span className="shrink-0 text-emerald-600/70 dark:text-emerald-400/70">({(file.size / 1024).toFixed(0)} KB)</span>
        </div>
      ) : existingUrl ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 text-xs text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
          <Paperclip className="h-3.5 w-3.5 shrink-0" />
          <span className="shrink-0 font-medium">Current:</span>
          <a
            href={existingUrl}
            target="_blank"
            rel="noreferrer"
            className="truncate font-medium text-primary hover:underline"
          >
            {existingName ?? "View slip"}
          </a>
          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
        </div>
      ) : !existingUrl ? (
        <p className="mt-3 text-[11px] text-rose-500">No slip on record — please attach one.</p>
      ) : null}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Drag &amp; drop or click to upload. PDF, PNG, JPG, WEBP, GIF · max 10 MB.
      </p>
    </div>
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
  const [isDragging, setIsDragging] = useState(false)

  // ── Resubmit dialog state
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

  // Bank accounts grouped by their payment method group
  const banksByGroup: Record<MethodGroup, BankAccountInfo[]> = useMemo(() => {
    const map: Record<MethodGroup, BankAccountInfo[]> = { CASH: [], BANK: [], MOBILE: [] }
    for (const b of bankAccounts) {
      const g = groupForMethod(b.paymentMethod)
      map[g].push(b)
    }
    return map
  }, [bankAccounts])

  const groupMissing = missingGroups.includes(groupForMethod(paymentMethod))
  const editGroupMissing = missingGroups.includes(groupForMethod(editPaymentMethod))

  // Stats for the hero
  const pendingCount = recentRequests.filter(
    (r) => r.status === "PENDING" || r.status === "PENDING_APPROVAL" || r.status === "RETURNED"
  ).length
  const approvedCount = recentRequests.filter((r) => r.status === "APPROVED").length

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setSlipFile(f)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) {
      const allowed = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"]
      if (!allowed.includes(f.type) && !f.name.match(/\.(pdf|png|jpe?g|webp|gif)$/i)) {
        toast.error("Unsupported file type", { description: "Accepted: PDF, PNG, JPG, WEBP, GIF" })
        return
      }
      if (f.size > 10 * 1024 * 1024) {
        toast.error("File too large", { description: "Maximum slip file size is 10 MB." })
        return
      }
      setSlipFile(f)
    }
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

  // ── Resubmit handlers ────────────────────────────────────────────────
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
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {/* ── HERO HEADER ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-border-base bg-gradient-to-br from-[#1a1d3a] via-[#221f47] to-[#1a1230] shadow-md">
        {/* Decorative glow orbs */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-12 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="pointer-events-none absolute right-1/3 top-1/2 h-32 w-32 rounded-full bg-amber-400/10 blur-3xl" />

        <div className="relative p-6 sm:p-8">
          {/* Top row: title + breadcrumb */}
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <nav className="flex items-center gap-1.5 text-[11px] font-medium text-white/50">
                <Link href="/portal" className="hover:text-white/80">Portal</Link>
                <ChevronRight className="h-3 w-3" />
                <span className="text-white/80">Deposit Request</span>
              </nav>
              <h1 className="mt-2 flex items-center gap-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/15 ring-1 ring-emerald-400/30">
                  <ArrowDownToLine className="h-5 w-5 text-emerald-300" />
                </span>
                Deposit Request
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">
                Already deposited to the Somiti account? Submit the details with your deposit slip — our admin team will verify and credit your balance within one business day.
              </p>

              {/* Steps indicator */}
              <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] font-medium text-white/60">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 text-emerald-200 ring-1 ring-emerald-400/30">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 text-[10px] font-bold text-emerald-950">1</span>
                  Deposit to Somiti
                </span>
                <ChevronRight className="h-3 w-3 text-white/30" />
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-white/80 ring-1 ring-white/15">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/15 text-[10px] font-bold text-white">2</span>
                  Submit Request
                </span>
                <ChevronRight className="h-3 w-3 text-white/30" />
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-white/80 ring-1 ring-white/15">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/15 text-[10px] font-bold text-white">3</span>
                  Admin Approval
                </span>
              </div>
            </div>

            {/* Stat tiles */}
            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
              <StatTile
                icon={Wallet}
                label="Current Balance"
                value={`৳ ${member.currentBalance.toLocaleString()}`}
                sub={`Member #${member.memberNo}`}
                accentClass="text-emerald-300"
                iconBgClass="bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30"
              />
              <StatTile
                icon={Clock}
                label="Pending / Returned"
                value={String(pendingCount)}
                sub={pendingCount === 0 ? "All caught up" : "Needs your attention"}
                accentClass="text-amber-300"
                iconBgClass="bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── FORM + RECENT REQUESTS ──────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Form (3 cols) */}
        <div className="lg:col-span-3">
          <Card className="overflow-hidden rounded-2xl border-border-base bg-surface shadow-sm">
            <SectionHeader
              step={2}
              icon={FileText}
              title="Submit New Deposit Request"
              description="Fill in the deposit details and attach the slip / transaction document."
              iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            />
            <CardContent className="p-5 sm:p-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Amount + Date */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="amount" className="text-xs font-semibold text-foreground">
                      Deposit Amount <span className="text-rose-500">*</span>
                    </Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm font-bold text-muted-foreground">৳</span>
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
                        className="pl-7 font-mono text-base font-semibold"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="transactionDate" className="text-xs font-semibold text-foreground">
                      Deposit Date <span className="text-rose-500">*</span>
                    </Label>
                    <div className="relative">
                      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
                <div className="space-y-1.5">
                  <Label htmlFor="collectionTypeId" className="text-xs font-semibold text-foreground">
                    Deposit Type
                  </Label>
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
                  <p className="text-[11px] text-muted-foreground">
                    Pick the category that best matches your deposit (e.g. Monthly Savings, Due Payment).
                  </p>
                </div>

                {/* Payment method — visual picker */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">
                    Payment Method <span className="text-rose-500">*</span>
                  </Label>
                  <PaymentMethodPicker
                    value={paymentMethod}
                    onChange={(v) => setPaymentMethod(v)}
                  />
                  {groupMissing && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-[11px] text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        The Somiti hasn&apos;t configured a receiving account for this method. Your request will still be submitted; admin will resolve the account before approval.
                      </span>
                    </div>
                  )}
                </div>

                {/* Reference number */}
                <div className="space-y-1.5">
                  <Label htmlFor="referenceNo" className="text-xs font-semibold text-foreground">
                    Reference / Transaction ID
                  </Label>
                  <div className="relative">
                    <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="referenceNo"
                      name="referenceNo"
                      value={referenceNo}
                      onChange={(e) => setReferenceNo(e.target.value)}
                      placeholder="Bank txn id / cheque no. / bKash trxId"
                      className="pl-9"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    The transaction ID printed on your slip or SMS confirmation — helps admin verify faster.
                  </p>
                </div>

                {/* Slip upload */}
                <div className="space-y-1.5">
                  <Label htmlFor="slip" className="text-xs font-semibold text-foreground">
                    Deposit Slip / Transaction Document <span className="text-rose-500">*</span>
                  </Label>
                  <SlipDropZone
                    file={slipFile}
                    onFileChange={handleFileChange}
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    inputRef={fileInputRef}
                    inputId="slip"
                    isDragging={isDragging}
                  />
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <Label htmlFor="notes" className="text-xs font-semibold text-foreground">
                    Notes <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any additional context for the admin reviewer…"
                    className="min-h-[72px] resize-y"
                  />
                </div>

                <Separator />

                {/* Submit */}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.back()}
                    disabled={isPending}
                    className="sm:w-auto"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 sm:min-w-[180px]"
                  >
                    {isPending ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Submitting…
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Submit Deposit Request
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* ── Recent requests (2 cols) ─────────────────────────────── */}
        <div className="lg:col-span-2">
          <Card className="flex h-full flex-col overflow-hidden rounded-2xl border-border-base bg-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-border-base px-5 py-4 sm:px-6">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold tracking-tight text-foreground">Recent Requests</h2>
                  <p className="text-[11px] text-muted-foreground">
                    {recentRequests.length} {recentRequests.length === 1 ? "request" : "requests"} · {approvedCount} approved
                  </p>
                </div>
              </div>
              <Link
                href="/portal/requests"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
              >
                View all
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            <CardContent className="flex-1 overflow-y-auto p-4 sm:p-5">
              {recentRequests.length === 0 ? (
                <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center">
                  <div className="relative mb-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-violet-500/10 ring-1 ring-primary/15">
                      <Receipt className="h-7 w-7 text-primary" />
                    </div>
                    <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-amber-900 shadow-sm">
                      <Sparkles className="h-3 w-3" />
                    </div>
                  </div>
                  <p className="font-bold text-foreground">No deposit requests yet</p>
                  <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">
                    Fill out the form on the left to submit your first deposit request.
                  </p>
                </div>
              ) : (
                <ol className="relative space-y-3">
                  {/* Vertical timeline line */}
                  <span className="absolute bottom-2 left-[15px] top-2 w-px bg-border-base" aria-hidden />
                  {recentRequests.map((r) => {
                    const s = getStatus(r.status)
                    return (
                      <li key={r.id} className="relative pl-10">
                        {/* Timeline dot */}
                        <span className={`absolute left-[7px] top-3 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-surface ${s.chip}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                        </span>

                        <div className="rounded-xl border border-border-base bg-surface p-3 shadow-xs transition-shadow hover:shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold tracking-tight text-foreground">
                                ৳ {r.amount ? Number(r.amount).toLocaleString() : "—"}
                              </p>
                              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <CalendarDays className="h-3 w-3" />
                                {fmtDate(r.transactionDate ?? r.createdAt)}
                                {r.method && (
                                  <>
                                    <span className="text-muted-foreground/40">·</span>
                                    <span>{PAYMENT_METHOD_LABEL[r.method as PaymentMethod] ?? r.method}</span>
                                  </>
                                )}
                              </p>
                            </div>
                            <StatusBadge status={r.status} />
                          </div>

                          {r.referenceNo && (
                            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <Hash className="h-3 w-3" />
                              <span className="font-mono">{r.referenceNo}</span>
                            </div>
                          )}

                          {r.notes && (
                            <p className="mt-2 line-clamp-2 rounded-md bg-subtle/60 px-2 py-1.5 text-[11px] italic text-muted-foreground">
                              &ldquo;{r.notes}&rdquo;
                            </p>
                          )}

                          {/* Attachment chip */}
                          {r.attachments?.[0] && (
                            <a
                              href={r.attachments[0].url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border-base bg-subtle/40 px-2 py-1 text-[11px] font-medium text-primary hover:bg-subtle hover:underline"
                            >
                              <Paperclip className="h-3 w-3" />
                              View slip
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}

                          {/* Rejection reason */}
                          {r.status === "REJECTED" && r.rejectionReason && (
                            <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50/60 p-2.5 text-[11px] text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">
                              <p className="flex items-center gap-1 font-semibold">
                                <XCircle className="h-3 w-3" /> Rejection reason
                              </p>
                              <p className="mt-0.5">{r.rejectionReason}</p>
                              {r.reviewedBy && (
                                <p className="mt-1 text-rose-500">— {r.reviewedBy} · {fmtDateTime(r.reviewedAt)}</p>
                              )}
                            </div>
                          )}

                          {/* Return reason + resubmit CTA */}
                          {r.status === "RETURNED" && (
                            <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/60 p-2.5 text-[11px] text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300">
                              <p className="flex items-center gap-1 font-semibold">
                                <Undo2 className="h-3 w-3" /> Returned for correction
                              </p>
                              {r.returnReason && <p className="mt-0.5">{r.returnReason}</p>}
                              {r.reviewedBy && (
                                <p className="mt-1 text-blue-500">— {r.reviewedBy} · {fmtDateTime(r.reviewedAt)}</p>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                className="mt-2 h-7 bg-blue-600 text-[11px] hover:bg-blue-700"
                                onClick={() => openEditDialog(r)}
                                disabled={isPending}
                              >
                                <Pencil className="h-3 w-3" /> Edit &amp; Resubmit
                              </Button>
                            </div>
                          )}

                          {/* Approved footer */}
                          {r.status === "APPROVED" && r.reviewedBy && (
                            <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                              Approved by {r.reviewedBy} · {fmtDateTime(r.reviewedAt)}
                              {r.voucherNo && (
                                <span className="ml-1 rounded bg-subtle px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                                  {r.voucherNo}
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── RESUBMIT DIALOG ─────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl bg-surface sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Pencil className="h-4 w-4" />
              </span>
              Edit &amp; Resubmit Deposit Request
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              {editVoucherNo && (
                <span className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
                  Voucher {editVoucherNo}
                </span>
              )}
              <span className="text-muted-foreground">
                Update the fields the admin flagged, then resubmit for approval.
              </span>
            </DialogDescription>
          </DialogHeader>

          {editReturnReason && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300">
              <p className="flex items-center gap-1 font-semibold">
                <Undo2 className="h-3 w-3" /> Admin&apos;s return reason:
              </p>
              <p className="mt-0.5">{editReturnReason}</p>
            </div>
          )}

          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-amount" className="text-xs font-semibold">
                  Amount (৳) <span className="text-rose-500">*</span>
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm font-bold text-muted-foreground">৳</span>
                  <Input
                    id="edit-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="pl-7 font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-date" className="text-xs font-semibold">
                  Deposit Date <span className="text-rose-500">*</span>
                </Label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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

            <div className="space-y-1.5">
              <Label htmlFor="edit-collection" className="text-xs font-semibold">
                Deposit Type
              </Label>
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

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Payment Method <span className="text-rose-500">*</span>
              </Label>
              <PaymentMethodPicker
                value={editPaymentMethod}
                onChange={(v) => setEditPaymentMethod(v)}
              />
              {editGroupMissing && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  No default receiving account configured for this method. Admin will resolve before approval.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-ref" className="text-xs font-semibold">
                Reference / Transaction ID
              </Label>
              <div className="relative">
                <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="edit-ref"
                  value={editReferenceNo}
                  onChange={(e) => setEditReferenceNo(e.target.value)}
                  placeholder="Bank txn id / cheque no. / bKash trxId"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-slip" className="text-xs font-semibold">
                Deposit Slip <span className="text-muted-foreground font-normal">(optional — leave blank to keep original)</span>
              </Label>
              <SlipDropZone
                file={editSlipFile}
                onFileChange={handleEditFileChange}
                inputRef={editFileInputRef}
                inputId="edit-slip"
                existingUrl={editExistingSlipUrl}
                existingName={editExistingSlipName}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-notes" className="text-xs font-semibold">
                Notes <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Any additional context for the admin reviewer…"
                className="min-h-[64px] resize-y"
              />
            </div>

            <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t border-border-base bg-surface px-1 pb-1 pt-3">
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
                {isPending ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Resubmitting…
                  </>
                ) : (
                  <>
                    <Undo2 className="h-4 w-4" />
                    Resubmit for Approval
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── DEPOSIT DESTINATIONS ────────────────────────────────────── */}
      <Card className="overflow-hidden rounded-2xl border-border-base bg-surface shadow-sm">
        <SectionHeader
          step={1}
          icon={Building2}
          title="Somiti Accounts — Deposit Here First"
          description="Send money to one of the accounts below, then come back and submit your request with the slip."
          iconClass="bg-primary/10 text-primary"
        />
        <CardContent className="p-5 sm:p-6">
          {bankAccounts.length === 0 ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">No active bank / mobile accounts configured.</p>
                <p className="mt-0.5 text-xs">Please contact management for deposit instructions before submitting a request.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(["CASH", "BANK", "MOBILE"] as MethodGroup[]).map((g) => {
                const groupCfg = METHOD_GROUPS.find((m) => m.group === g)!
                const accounts = banksByGroup[g]
                if (accounts.length === 0) return null
                const Icon = groupCfg.icon
                return (
                  <div
                    key={g}
                    className="rounded-xl border border-border-base bg-subtle/30 p-4"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {groupCfg.label}
                      </p>
                    </div>
                    <ul className="space-y-3">
                      {accounts.map((a) => (
                        <li key={a.id} className="rounded-lg border border-border-base bg-surface p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-bold text-foreground">{a.accountName}</p>
                            {a.isDefault && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/50">
                                <Sparkles className="h-2.5 w-2.5" />
                                Default
                              </span>
                            )}
                          </div>
                          {a.bankName && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{a.bankName}</p>
                          )}
                          {a.accountNumber && (
                            <div className="mt-1.5 flex items-center justify-between gap-1 rounded-md bg-subtle px-2 py-1">
                              <code className="font-mono text-xs text-foreground">{a.accountNumber}</code>
                              <CopyButton value={a.accountNumber} label="Account number" />
                            </div>
                          )}
                          {a.branch && (
                            <p className="mt-1 text-[11px] text-muted-foreground">{a.branch}</p>
                          )}
                          <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
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

    </div>
  )
}
