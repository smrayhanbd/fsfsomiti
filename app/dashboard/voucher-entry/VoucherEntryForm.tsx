"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import AccountSelect from "@/components/AccountSelect"
import { toast } from "sonner"
import { createJournalEntry } from "@/app/actions/journal"
import {
  formatBDT,
  type AccountType,
  type VoucherType,
} from "@/lib/accounting"
import {
  Plus,
  Trash2,
  Copy,
  Loader2,
  Save,
  Scale,
  CheckCircle2,
  ArrowLeft,
  FileText,
  Banknote,
  ArrowRightLeft,
  ScrollText,
} from "lucide-react"

interface SelectableAccount {
  id: string
  accountCode: string
  accountName: string
  accountType: AccountType
  currentBalance: number | string
}

interface SimpleMember {
  id: string
  fullName: string
  memberNo: string
}

interface Line {
  key: string
  accountId: string
  debit: string
  credit: string
  memo: string
}

let lineSeq = 0
const newLine = (): Line => ({
  key: `line-${++lineSeq}`,
  accountId: "",
  debit: "",
  credit: "",
  memo: "",
})

const VOUCHER_TABS: {
  value: VoucherType
  label: string
  icon: typeof FileText
  hint: string
  defaultOpposite: AccountType[] | undefined
}[] = [
  {
    value: "JOURNAL",
    label: "Journal",
    icon: ScrollText,
    hint: "General adjustment between any accounts",
    defaultOpposite: undefined,
  },
  {
    value: "RECEIPT",
    label: "Receipt",
    icon: Banknote,
    hint: "Money received — debits a bank/cash account",
    defaultOpposite: ["ASSET"],
  },
  {
    value: "PAYMENT",
    label: "Payment",
    icon: FileText,
    hint: "Money paid out — credits a bank/cash account",
    defaultOpposite: ["ASSET"],
  },
  {
    value: "CONTRA",
    label: "Contra",
    icon: ArrowRightLeft,
    hint: "Transfer between two bank/cash accounts",
    defaultOpposite: ["ASSET"],
  },
]

export default function VoucherEntryForm({
  accounts,
  members,
  nextVoucherHints,
}: {
  accounts: SelectableAccount[]
  members: SimpleMember[]
  nextVoucherHints: Record<VoucherType, string>
}) {
  const router = useRouter()
  const [voucherType, setVoucherType] = useState<VoucherType>("JOURNAL")
  const [entryDate, setEntryDate] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [narration, setNarration] = useState("")
  const [referenceNo, setReferenceNo] = useState("")
  const [memberId, setMemberId] = useState("")
  const [postImmediately, setPostImmediately] = useState(true)
  const [lines, setLines] = useState<Line[]>([newLine(), newLine()])
  const [submitting, setSubmitting] = useState(false)

  // --- Line manipulation ---
  const addLine = () => setLines((prev) => [...prev, newLine()])
  const removeLine = (key: string) =>
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((l) => l.key !== key)))
  const duplicateLine = (key: string) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.key === key)
      if (idx < 0) return prev
      const copy = { ...prev[idx], key: `line-${++lineSeq}` }
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      return next
    })
  }
  const updateLine = (key: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  // --- Totals & balancing ---
  const totals = useMemo(() => {
    let debit = 0
    let credit = 0
    for (const l of lines) {
      const d = parseFloat(l.debit) || 0
      const c = parseFloat(l.credit) || 0
      debit += d
      credit += c
    }
    return { debit, credit, diff: Math.round((debit - credit) * 100) / 100 }
  }, [lines])

  const validLines = lines.filter(
    (l) => l.accountId && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0)
  )
  const uniqueAccounts = new Set(validLines.map((l) => l.accountId))
  const balanced = totals.diff === 0 && totals.debit > 0
  const canSubmit =
    balanced && validLines.length >= 2 && uniqueAccounts.size >= 2 && !!narration.trim()

  // --- Submit ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) {
      toast.error("Voucher is not ready", {
        description: !narration.trim()
          ? "Add a narration."
          : !balanced
          ? `Out of balance by ${formatBDT(Math.abs(totals.diff))}.`
          : "Need at least two distinct accounts.",
      })
      return
    }

    setSubmitting(true)
    try {
      const res = await createJournalEntry({
        voucherType,
        entryDate,
        narration: narration.trim(),
        referenceNo: referenceNo.trim() || undefined,
        memberId: memberId || null,
        status: postImmediately ? "POSTED" : "DRAFT",
        lines: validLines.map((l) => ({
          accountId: l.accountId,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
          memo: l.memo.trim() || undefined,
        })),
      })

      if (res.ok) {
        toast.success(postImmediately ? "Voucher posted" : "Draft saved", {
          description: `${res.voucherNo} — ${formatBDT(totals.debit)}`,
        })
        router.push("/dashboard/vouchers")
      } else {
        toast.error("Could not save voucher", { description: res.error })
      }
    } catch (e) {
      toast.error("Unexpected error", { description: e instanceof Error ? e.message : "Failed" })
    } finally {
      setSubmitting(false)
    }
  }

  const activeTab = VOUCHER_TABS.find((t) => t.value === voucherType)!

  return (
    <form onSubmit={handleSubmit} className="grid lg:grid-cols-3 gap-6">
      {/* Left: header + lines */}
      <div className="lg:col-span-2 space-y-6">
        <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <activeTab.icon className="h-4 w-4 text-indigo-600" />
              {activeTab.label} Voucher
            </CardTitle>
            <p className="text-xs text-slate-500">{activeTab.hint}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Voucher type tabs */}
            <Tabs
              value={voucherType}
              onValueChange={(v) => setVoucherType(v as VoucherType)}
            >
              <TabsList className="grid grid-cols-4 w-full bg-slate-100 dark:bg-slate-800/60">
                {VOUCHER_TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value} className="text-xs">
                    <t.icon className="h-3.5 w-3.5 mr-1" />
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {/* Posting lines */}
            <div className="space-y-2">
              {/* Column header */}
              <div className="grid grid-cols-[1fr_120px_120px_32px] gap-2 px-1 text-[10px] uppercase tracking-wider font-bold text-slate-400">
                <span>Account</span>
                <span className="text-right">Debit (৳)</span>
                <span className="text-right">Credit (৳)</span>
                <span></span>
              </div>

              {lines.map((line, idx) => (
                <div
                  key={line.key}
                  className="grid grid-cols-[1fr_120px_120px_32px] gap-2 items-start"
                >
                  <div className="space-y-1">
                    <AccountSelect
                      accounts={accounts}
                      value={line.accountId}
                      onValueChange={(id) => updateLine(line.key, { accountId: id })}
                      placeholder={`Line ${idx + 1} — select account`}
                      renderMeta={(a) =>
                        formatBDT((a as SelectableAccount).currentBalance)
                      }
                    />
                    <Input
                      placeholder="Memo (optional)"
                      value={line.memo}
                      onChange={(e) => updateLine(line.key, { memo: e.target.value })}
                      className="h-7 text-xs"
                    />
                  </div>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={line.debit}
                    onChange={(e) =>
                      updateLine(line.key, {
                        debit: e.target.value,
                        credit: e.target.value ? "" : line.credit,
                      })
                    }
                    className="text-right tabular-nums"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={line.credit}
                    onChange={(e) =>
                      updateLine(line.key, {
                        credit: e.target.value,
                        debit: e.target.value ? "" : line.debit,
                      })
                    }
                    className="text-right tabular-nums"
                  />
                  <div className="flex flex-col gap-0.5 pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-indigo-600"
                      onClick={() => duplicateLine(line.key)}
                      title="Duplicate"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                      onClick={() => removeLine(line.key)}
                      disabled={lines.length <= 2}
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLine}
                className="mt-2"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Line
              </Button>
            </div>

            {/* Totals footer */}
            <div
              className={`grid grid-cols-[1fr_120px_120px] gap-2 items-center rounded-xl p-3 border ${
                balanced
                  ? "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50"
                  : "bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50"
              }`}
            >
              <div className="flex items-center gap-2">
                {balanced ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Scale className="h-4 w-4 text-rose-600" />
                )}
                <span
                  className={`text-xs font-bold ${
                    balanced ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
                  }`}
                >
                  {balanced
                    ? "Balanced"
                    : `Out of balance by ${formatBDT(Math.abs(totals.diff))}`}
                </span>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase text-slate-400 font-bold">Total Dr</p>
                <p className="font-bold text-sm tabular-nums text-slate-900 dark:text-white">
                  {formatBDT(totals.debit)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase text-slate-400 font-bold">Total Cr</p>
                <p className="font-bold text-sm tabular-nums text-slate-900 dark:text-white">
                  {formatBDT(totals.credit)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right: meta sidebar */}
      <div className="space-y-6">
        <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Voucher Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Voucher No.
              </Label>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono">
                  {nextVoucherHints[voucherType]}
                </Badge>
                <span className="text-[11px] text-slate-400">
                  auto-assigned on save
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="entryDate" className="text-xs font-semibold">
                Date *
              </Label>
              <Input
                id="entryDate"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="referenceNo" className="text-xs font-semibold">
                Reference No.
              </Label>
              <Input
                id="referenceNo"
                placeholder="Invoice / cheque no."
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="member" className="text-xs font-semibold">
                Member (optional)
              </Label>
              <Select value={memberId} onValueChange={(v) => setMemberId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Link to a member" />
                </SelectTrigger>
                <SelectContent>
                  {members.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No active members
                    </SelectItem>
                  ) : (
                    members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="font-mono text-xs text-slate-400">
                          {m.memberNo}
                        </span>
                        {m.fullName}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="narration" className="text-xs font-semibold">
                Narration *
              </Label>
              <Textarea
                id="narration"
                placeholder="Describe this transaction…"
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                rows={3}
                required
              />
            </div>

            {/* Posting toggle */}
            <label className="flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Post immediately
                </p>
                <p className="text-[11px] text-slate-400">
                  {postImmediately
                    ? "Updates account balances now"
                    : "Save as draft — post later"}
                </p>
              </div>
              <input
                type="checkbox"
                checked={postImmediately}
                onChange={(e) => setPostImmediately(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
            </label>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            disabled={!canSubmit || submitting}
            className="bg-indigo-600 hover:bg-indigo-700 w-full h-11"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {postImmediately ? "Post Voucher" : "Save Draft"}
          </Button>
          <Link href="/dashboard/vouchers">
            <Button type="button" variant="outline" className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" /> View All Vouchers
            </Button>
          </Link>
        </div>
      </div>
    </form>
  )
}
