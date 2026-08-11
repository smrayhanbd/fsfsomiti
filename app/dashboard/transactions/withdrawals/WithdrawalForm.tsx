"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createTransaction, submitTransaction } from "@/app/actions/transactions"
import { toast } from "sonner"
import {
  Save,
  Send,
  ArrowUpFromLine,
  Search,
  Hash,
  Landmark,
  AlertTriangle,
  BookOpen,
  Calendar,
  User,
  X,
} from "lucide-react"
import type { AccountType } from "@/lib/accounting"
import type { PaymentMethod } from "@/lib/transactions/types"
import type { MethodGroup } from "@/lib/transactions/bankAccounts"

import PageHeader from "@/components/somiti/PageHeader"
import SectionCard from "@/components/somiti/SectionCard"
import { formatBDT } from "@/components/somiti/Money"

// ─── Types ───────────────────────────────────────────────────────────────
interface MemberSummary {
  id: string
  memberNo: string
  fullName: string
  phone: string | null
  photoUrl: string | null
  gender: string | null
  status: string
  availableBalance: number
  totalWithdrawn: number
  loanBalance: number
  lastWithdrawal: { amount: number; date: string } | null
}

interface AccountOption {
  id: string
  accountCode: string
  accountName: string
  accountType: AccountType
  isCash: boolean
  isBank: boolean
  currentBalance: number
}

interface DefaultCoa {
  group: MethodGroup
  paymentMethod: PaymentMethod
  bankAccountId: string | null
  coaAccountId: string | null
  coaAccountCode: string | null
  coaAccountName: string | null
  missing: boolean
}

interface Props {
  members: MemberSummary[]
  accounts: AccountOption[]
  defaultCoas: DefaultCoa[]
  missingGroups: MethodGroup[]
  memberSavingsLiability: { id: string; accountCode: string; accountName: string } | null
}

// ─── Static option lists ────────────────────────────────────────────────
/** Business reason for the withdrawal. Stored in the JSON breakdown column
 *  for the audit trail (the posting engine treats all withdrawals the same). */
type WithdrawalType = "SAVINGS" | "PROFIT" | "FULL_CLOSURE"

const WITHDRAWAL_TYPES: { value: WithdrawalType; label: string }[] = [
  { value: "SAVINGS", label: "Savings Withdrawal" },
  { value: "PROFIT", label: "Profit Withdrawal" },
  { value: "FULL_CLOSURE", label: "Full Closure" },
]

// Per spec §7: withdrawals are bank-only (Bank Transfer or Cheque).
const WITHDRAWAL_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CHEQUE", label: "Bank Cheque" },
]

const METHOD_LABEL: Partial<Record<PaymentMethod, string>> = {
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

/** Uniform medium field height to match the design (~40px). SelectTrigger uses
 *  data-[size=default]:h-8 by default, which has higher specificity than a
 *  bare h-10, so we override on the same variant. */
const FIELD_H = "h-10 data-[size=default]:h-10"

// ─── Component ───────────────────────────────────────────────────────────
export default function WithdrawalForm({
  members,
  accounts,
  defaultCoas,
  missingGroups,
  memberSavingsLiability,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Member search + selection
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedMember, setSelectedMember] = useState<MemberSummary | null>(null)

  // Form fields
  const [withdrawalType, setWithdrawalType] = useState<WithdrawalType>("SAVINGS")
  const [amount, setAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("BANK_TRANSFER")
  const [cashAccountId, setCashAccountId] = useState<string>("")
  const [coaOverridden, setCoaOverridden] = useState(false) // user manually changed the source account
  const [referenceNo, setReferenceNo] = useState("")
  const [reason, setReason] = useState("")

  // Default COA per group (pre-seeded by the server from Somiti Settings).
  const defaultByGroup = useMemo(() => {
    const map: Partial<Record<MethodGroup, DefaultCoa>> = {}
    for (const d of defaultCoas) map[d.group] = d
    return map
  }, [defaultCoas])

  // Bank accounts only — withdrawals pay out from a bank account (spec §7).
  const bankAccounts = useMemo(() => accounts.filter((a) => a.isBank), [accounts])

  // Member search results (top 5 by name / memberNo / phone).
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return members
      .filter(
        (m) =>
          m.fullName.toLowerCase().includes(q) ||
          m.memberNo.toLowerCase().includes(q) ||
          (m.phone ?? "").includes(q)
      )
      .slice(0, 5)
  }, [searchQuery, members])

  /** Resolve the auto-mapped source account for the current payment method. */
  const currentDefaultCoa = defaultByGroup["BANK"]

  /** The source COA actually in effect: the auto-mapped one unless the user
   *  overrode it. */
  const effectiveCoa = useMemo(() => {
    return accounts.find((a) => a.id === cashAccountId) ?? null
  }, [accounts, cashAccountId])

  /** When the payment method changes, re-pin the auto-mapped source account
   *  (unless the user had manually overridden — keep their pick). Both options
   *  here are BANK-group, so the default stays the same either way. */
  const handleMethodChange = (method: PaymentMethod) => {
    setPaymentMethod(method)
    if (!coaOverridden) {
      setCashAccountId(currentDefaultCoa?.coaAccountId ?? "")
    }
  }

  /** Manual source change marks the field as overridden so subsequent method
   *  switches no longer clobber the user's pick. */
  const handleCoaOverride = (id: string) => {
    setCashAccountId(id)
    setCoaOverridden(true)
  }

  const handleSelectMember = (m: MemberSummary) => {
    setSelectedMember(m)
    setSearchQuery("")
    // FULL_CLOSURE amount follows the selected member's available balance.
    if (withdrawalType === "FULL_CLOSURE") setAmount(m.availableBalance.toFixed(2))
  }

  const handleTypeChange = (t: WithdrawalType) => {
    setWithdrawalType(t)
    if (t === "FULL_CLOSURE" && selectedMember) {
      setAmount(selectedMember.availableBalance.toFixed(2))
    } else if (t !== "FULL_CLOSURE") {
      setAmount("")
    }
  }

  const buildPayload = () => {
    return {
      transactionType: "WITHDRAWAL" as const,
      subType: "SAVINGS_DEPOSIT" as const, // engine-level subtype; breakdown carries the business label
      memberId: selectedMember?.id ?? "",
      amount: parseFloat(amount) || 0,
      paymentMethod,
      cashAccountId: cashAccountId || null,
      referenceNo: referenceNo.trim() || null,
      remarks: reason.trim() || null,
      // Store the chosen withdrawal type in the JSON breakdown column. Cast
      // because TransactionBreakdown is a fixed shape but the column is
      // schemaless JSON and the engine treats it as opaque.
      breakdown: { withdrawalType } as unknown as Record<string, string>,
    }
  }

  const handleSave = (submit: boolean) => {
    if (!selectedMember) return toast.error("Select a member first.")
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return toast.error("Enter a valid amount.")
    if (amt > selectedMember.availableBalance) {
      return toast.error("Amount exceeds available balance", {
        description: `Available: ${formatBDT(selectedMember.availableBalance)}`,
      })
    }
    if (!cashAccountId) {
      return toast.error(
        "No bank account auto-mapped. Select a source account manually or configure it in Somiti Settings."
      )
    }

    startTransition(async () => {
      const res = await createTransaction(buildPayload())
      if (!res.ok) {
        toast.error("Could not create", { description: res.error })
        return
      }
      toast.success(submit ? "Submitted for approval" : "Saved as draft", {
        description: res.voucherNo,
      })
      if (submit && res.id) {
        const sub = await submitTransaction(res.id)
        if (!sub.ok) toast.error("Submit failed", { description: sub.error })
      }
      router.push("/dashboard/transactions")
    })
  }

  // ─── Derived display values ───────────────────────────────────────────
  const initials = selectedMember
    ? selectedMember.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : ""
  const amountNum = parseFloat(amount) || 0
  const groupMissing = missingGroups.includes("BANK")
  const isFullClosure = withdrawalType === "FULL_CLOSURE"
  const exceedsBalance =
    !!selectedMember && amountNum > 0 && amountNum > selectedMember.availableBalance
  const remainingAfter =
    selectedMember && amountNum > 0 ? selectedMember.availableBalance - amountNum : null
  const submitDisabled = isPending || exceedsBalance

  return (
    <div className="flex flex-col gap-6 lg:h-[calc(100dvh-8.1875rem)] lg:gap-4">
      <PageHeader
        className="lg:shrink-0"
        title="Withdrawal Transaction"
        subtitle="Pay out from a member's savings. Saved as draft, then submitted for Maker-Checker approval."
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-debit bg-debit-soft px-4 py-2 shadow-sm">
            <ArrowUpFromLine className="h-5 w-5 text-debit" />
            <span className="t-body font-bold text-debit">Money Out</span>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-3 lg:grid-rows-[minmax(0,1fr)] lg:gap-4">
        {/* ═══ LEFT (2 cols): Entry form ═══ */}
        <div className="space-y-6 lg:col-span-2 lg:min-h-0 lg:space-y-4 lg:overflow-y-auto lg:pr-1">
          {/* Member search — overflow-visible so the dropdown can float over the
              cards below. */}
          <SectionCard
            title="Member"
            subtitle="Quick search by member ID, name, or mobile."
            icon={<User />}
            accent="blue"
            bodyClassName="p-4 overflow-visible relative z-20"
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint-ink" />
              <Input
                placeholder="Type to search member…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${FIELD_H} bg-[var(--control-bg)] pl-9 text-base`}
              />
              {filteredMembers.length > 0 && (
                <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-[var(--border-base)] bg-[var(--bg-elevated)] shadow-pop">
                  {filteredMembers.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSelectMember(m)}
                      className="flex w-full items-center gap-3 border-b border-[var(--border-base)] px-4 py-3 text-left transition-colors last:border-0 hover:bg-subtle"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient-soft t-subheading font-bold text-brand">
                        {m.fullName.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="t-subheading truncate text-primary-ink">{m.fullName}</div>
                        <div className="t-num t-caption text-muted-ink">
                          {m.memberNo} {m.phone ? `· ${m.phone}` : ""}
                        </div>
                      </div>
                      <span className="t-caption shrink-0 rounded-full bg-success-soft px-2 py-0.5 font-bold text-success">
                        Avail {formatBDT(m.availableBalance)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedMember && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--border-base)] bg-subtle px-3 py-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success-soft text-success">
                  <User className="h-3.5 w-3.5" />
                </span>
                <span className="t-body text-secondary-ink">
                  Selected: <span className="font-semibold text-primary-ink">{selectedMember.fullName}</span>
                  <span className="t-num text-muted-ink"> ({selectedMember.memberNo})</span>
                </span>
                <button
                  type="button"
                  onClick={() => { setSelectedMember(null); setCoaOverridden(false); setAmount("") }}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 t-caption font-medium text-debit transition-colors hover:bg-debit-soft"
                >
                  <X className="h-3 w-3" /> Change
                </button>
              </div>
            )}
          </SectionCard>

          {/* ─── Section 1: Withdrawal Details ─── */}
          <SectionCard
            title="Withdrawal Details"
            subtitle="Amount, method, and the bank account funds are paid from."
            icon={<ArrowUpFromLine />}
            accent="crimson"
            bodyClassName="p-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-2.5">
              {/* Withdrawal Type */}
              <div className="space-y-2">
                <Label>Withdrawal Type <span className="text-debit">*</span></Label>
                <Select value={withdrawalType} onValueChange={(v) => v && handleTypeChange(v as WithdrawalType)}>
                  <SelectTrigger className={`${FIELD_H} w-full bg-[var(--control-bg)]`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WITHDRAWAL_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <Label htmlFor="amount">
                  Amount (৳) <span className="text-debit">*</span>
                </Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  disabled={isFullClosure}
                  className={`t-num ${FIELD_H} w-full bg-[var(--control-bg)] ${
                    exceedsBalance ? "border-debit focus-visible:ring-debit" : ""
                  }`}
                />
              </div>

              {/* Payment Method */}
              <div className="space-y-2">
                <Label>Payment Method <span className="text-debit">*</span></Label>
                <Select value={paymentMethod} onValueChange={(v) => v && handleMethodChange(v as PaymentMethod)}>
                  <SelectTrigger className={`${FIELD_H} w-full bg-[var(--control-bg)]`}>
                    <span className="flex items-center gap-2">
                      <Landmark className="h-4 w-4 text-muted-ink" />
                      <span>{METHOD_LABEL[paymentMethod] ?? paymentMethod}</span>
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {WITHDRAWAL_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Source Bank Account — auto-mapped from the BANK group + override */}
              <div className="space-y-2">
                <Label>
                  Source Bank Account{" "}
                  <span className="text-faint-ink">
                    {coaOverridden ? "(overridden)" : currentDefaultCoa?.coaAccountName ? "(auto)" : ""}
                  </span>
                </Label>
                <Select value={cashAccountId} onValueChange={(v) => v && handleCoaOverride(v)}>
                  <SelectTrigger className={`${FIELD_H} w-full bg-[var(--control-bg)]`}>
                    <SelectValue placeholder={groupMissing ? "Select source account" : "Auto-selected from method"} />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.length === 0 ? (
                      <div className="px-3 py-6 text-center t-body text-muted-ink">
                        No bank accounts.{" "}
                        <Link href="/dashboard/settings/bank" className="font-medium text-brand underline">Add one →</Link>
                      </div>
                    ) : (
                      bankAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.accountCode} · {a.accountName}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {coaOverridden && (
                  <button
                    type="button"
                    onClick={() => { setCoaOverridden(false); setCashAccountId(currentDefaultCoa?.coaAccountId ?? "") }}
                    className="t-caption font-medium text-brand transition-colors hover:underline"
                  >
                    Reset to auto-mapped account
                  </button>
                )}
              </div>

              {/* Reference Number */}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="referenceNo">Reference No</Label>
                <Input
                  id="referenceNo"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="Cheque / transfer no."
                  className={`${FIELD_H} w-full bg-[var(--control-bg)]`}
                />
              </div>
            </div>

            {groupMissing && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-warning bg-warning-soft p-3 t-caption text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  No default bank account configured for withdrawals. Select one manually, or{" "}
                  <Link href="/dashboard/settings/bank" className="font-medium underline">configure it in Somiti Settings →</Link>
                </div>
              </div>
            )}

            {/* Balance guard banner */}
            {selectedMember && amountNum > 0 && (
              exceedsBalance ? (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-debit bg-debit-soft p-3 t-caption text-debit">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    Exceeds available balance by{" "}
                    <strong className="t-num">{formatBDT(amountNum - selectedMember.availableBalance)}</strong>.{" "}
                    Reduce the amount or select Full Closure.
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-subtle p-3 t-body">
                  <span className="text-muted-ink">Available balance:</span>
                  <span className="t-num font-semibold text-secondary-ink">{formatBDT(selectedMember.availableBalance)}</span>
                  <span className="mx-2 text-faint-ink">·</span>
                  <span className="text-muted-ink">Remaining after withdrawal:</span>
                  <span className={`t-num font-semibold ${remainingAfter && remainingAfter < 0 ? "text-debit" : "text-success"}`}>
                    {remainingAfter !== null ? formatBDT(remainingAfter) : "—"}
                  </span>
                </div>
              )
            )}
          </SectionCard>

          {/* ─── Section 2: Withdrawal Reason ─── */}
          <SectionCard
            title="Withdrawal Reason"
            subtitle="Why the member is withdrawing funds."
            icon={<BookOpen />}
            accent="gold"
            bodyClassName="p-4"
          >
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the reason for this withdrawal…"
              className="min-h-[80px] resize-y bg-[var(--control-bg)]"
            />
          </SectionCard>

          {/* Action buttons */}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
            <Button variant="secondary" disabled={isPending} onClick={() => handleSave(false)}>
              <Save className="mr-2 h-4 w-4" /> Save Draft
            </Button>
            <Button
              className="brand-gradient shadow-brand-glow"
              disabled={submitDisabled}
              onClick={() => handleSave(true)}
            >
              <Send className="mr-2 h-4 w-4" /> Save & Submit
            </Button>
          </div>
        </div>

        {/* ═══ RIGHT (1 col): Member profile card + journal preview ═══ */}
        <div className="space-y-6 lg:min-h-0 lg:space-y-4 lg:overflow-y-auto lg:pr-1">
          {/* Member profile card */}
          {!selectedMember ? (
            <SectionCard bodyClassName="p-0">
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center lg:py-10">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-gradient-soft shadow-sm">
                  <User className="h-8 w-8 text-brand" />
                </div>
                <p className="t-subheading text-primary-ink">No member selected</p>
                <p className="mt-1 max-w-xs t-body text-muted-ink">
                  Search &amp; select a member to view their available balance and loan position.
                </p>
              </div>
            </SectionCard>
          ) : (
            <section className="card-premium overflow-hidden">
              {/* Gradient header with photo */}
              <div className="brand-gradient relative px-5 pb-4 pt-5 text-[var(--brand-primary-foreground)]">
                <div className="flex items-center gap-4">
                  {selectedMember.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedMember.photoUrl}
                      alt={selectedMember.fullName}
                      className="h-20 w-20 rounded-2xl object-cover shadow-xl ring-4 ring-[var(--glass-border)]"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/20 text-2xl font-bold shadow-xl ring-4 ring-[var(--glass-border)] backdrop-blur-sm">
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h2 className="t-h3 truncate">{selectedMember.fullName}</h2>
                    <p className="t-num t-caption mt-0.5 flex items-center gap-1.5 opacity-90">
                      <Hash className="h-3.5 w-3.5" /> {selectedMember.memberNo}
                    </p>
                    <span className="mt-2 inline-flex rounded-full bg-white/20 px-2 py-0.5 t-overline font-bold backdrop-blur-sm">
                      {selectedMember.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Financial summary */}
              <div className="space-y-3 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-success bg-success-soft p-3">
                    <div className="t-overline text-muted-ink">Available Balance</div>
                    <div className="t-h3 t-num mt-0.5 text-success">
                      {formatBDT(selectedMember.availableBalance)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-warning bg-warning-soft p-3">
                    <div className="t-overline text-muted-ink">Loan Balance</div>
                    <div className={`t-h3 t-num mt-0.5 ${selectedMember.loanBalance > 0 ? "text-warning" : "text-primary-ink"}`}>
                      {formatBDT(selectedMember.loanBalance)}
                    </div>
                  </div>
                </div>

                {selectedMember.lastWithdrawal ? (
                  <div className="flex items-center gap-2 rounded-xl bg-subtle p-3 t-body">
                    <Calendar className="h-4 w-4 shrink-0 text-faint-ink" />
                    <span className="text-muted-ink">Last withdrawal:</span>
                    <span className="t-num font-semibold text-secondary-ink">
                      {formatBDT(selectedMember.lastWithdrawal.amount)}
                    </span>
                    <span className="t-caption text-faint-ink">on {formatDate(selectedMember.lastWithdrawal.date)}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl bg-subtle p-3 t-body text-muted-ink">
                    <Calendar className="h-4 w-4 shrink-0 text-faint-ink" />
                    <span>No previous withdrawals.</span>
                  </div>
                )}

                {selectedMember.loanBalance > 0 && (
                  <div className="flex items-start gap-1.5 pt-1 t-caption text-muted-ink">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                    <span>Member has an outstanding loan of <span className="t-num font-semibold">{formatBDT(selectedMember.loanBalance)}</span>. Confirm settlement terms before paying out.</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Live journal preview — mirror of deposit, PAYMENT direction */}
          <SectionCard
            title="Accounting Preview"
            subtitle="Double-entry posting generated on approval."
            icon={<BookOpen />}
            accent="blue"
            bodyClassName="p-5"
          >
            <div className="overflow-hidden rounded-lg border border-[var(--border-base)]">
              <table className="w-full t-body">
                <thead>
                  <tr className="bg-subtle t-overline text-muted-ink">
                    <th className="px-3 py-2 text-left font-bold">Account</th>
                    <th className="px-3 py-2 text-right font-bold">Debit</th>
                    <th className="px-3 py-2 text-right font-bold">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Member Savings Liability — Debited (money leaves savings) */}
                  <tr className="border-t border-[var(--border-base)]">
                    <td className="px-3 py-2 text-secondary-ink">
                      {memberSavingsLiability ? (
                        <span>
                          {memberSavingsLiability.accountName}
                          <span className="t-num ml-1 text-faint-ink">{memberSavingsLiability.accountCode}</span>
                        </span>
                      ) : (
                        <span className="italic text-debit">Member Savings Liability (missing)</span>
                      )}
                    </td>
                    <td className="t-num px-3 py-2 text-right font-semibold text-debit">
                      {amountNum > 0 ? formatBDT(amountNum) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-faint-ink">—</td>
                  </tr>
                  {/* Source bank account — Credited (money paid out) */}
                  <tr className="border-t border-[var(--border-base)]">
                    <td className="px-3 py-2 text-secondary-ink">
                      {effectiveCoa ? (
                        <span>
                          {effectiveCoa.accountName}
                          <span className="t-num ml-1 text-faint-ink">{effectiveCoa.accountCode}</span>
                        </span>
                      ) : (
                        <span className="italic text-faint-ink">— source account —</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-faint-ink">—</td>
                    <td className="t-num px-3 py-2 text-right font-semibold text-success">
                      {amountNum > 0 ? formatBDT(amountNum) : "—"}
                    </td>
                  </tr>
                  <tr className="border-t border-[var(--border-strong)] bg-subtle/50 font-semibold">
                    <td className="px-3 py-2 text-secondary-ink">Total</td>
                    <td className="t-num px-3 py-2 text-right text-secondary-ink">
                      {amountNum > 0 ? formatBDT(amountNum) : "—"}
                    </td>
                    <td className="t-num px-3 py-2 text-right text-secondary-ink">
                      {amountNum > 0 ? formatBDT(amountNum) : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 t-caption text-muted-ink">
              Posting occurs on approval. Voucher type: <span className="font-semibold text-secondary-ink">PAYMENT</span>.
            </p>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
