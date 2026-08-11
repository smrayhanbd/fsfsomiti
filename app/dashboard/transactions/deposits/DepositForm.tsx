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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createTransaction, submitTransaction } from "@/app/actions/transactions"
import { toast } from "sonner"
import {
  Save,
  Send,
  ArrowDownToLine,
  Search,
  Hash,
  Wallet,
  Landmark,
  Smartphone,
  AlertTriangle,
  BookOpen,
  Calendar,
  User,
  X,
  type LucideIcon,
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
  dueBalance: number
  lateFines: number
  totalDeposits: number
  lastDeposit: { amount: number; date: string } | null
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
  collectionTypes: { id: string; name: string }[]
  defaultCoas: DefaultCoa[]
  missingGroups: MethodGroup[]
  memberSavingsLiability: { id: string; accountCode: string; accountName: string } | null
}

// ─── Static option lists ────────────────────────────────────────────────
/** The 3 collection-method groups shown in the UI, each mapping to one or
 *  more granular PaymentMethod values that are what actually get stored. */
const METHOD_GROUPS: { group: MethodGroup; label: string; icon: LucideIcon; methods: { value: PaymentMethod; label: string }[] }[] = [
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

const METHOD_LABEL: Record<PaymentMethod, string> = {
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

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

/** Uniform medium field height to match the design (~40px). SelectTrigger uses
 *  data-[size=default]:h-8 by default, which has higher specificity than a
 *  bare h-10, so we override on the same variant. */
const FIELD_H = "h-10 data-[size=default]:h-10"

// ─── Component ───────────────────────────────────────────────────────────
export default function DepositForm({
  members,
  accounts,
  collectionTypes,
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
  const [collectionTypeId, setCollectionTypeId] = useState("")
  const [amount, setAmount] = useState("")
  const [depositDate, setDepositDate] = useState(new Date().toISOString().slice(0, 10))
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH")
  const [cashAccountId, setCashAccountId] = useState<string>("")
  const [coaOverridden, setCoaOverridden] = useState(false) // user manually changed the COA
  const [referenceNo, setReferenceNo] = useState("")
  const [remarks, setRemarks] = useState("")

  // Default COA per group (pre-seeded by the server from Somiti Settings).
  const defaultByGroup = useMemo(() => {
    const map: Partial<Record<MethodGroup, DefaultCoa>> = {}
    for (const d of defaultCoas) map[d.group] = d
    return map
  }, [defaultCoas])

  // Cash/bank/wallet accounts for the override dropdown (same filter as CashAccountSelect).
  const cashLikeAccounts = useMemo(
    () => accounts.filter((a) => a.isCash || a.isBank || a.accountCode.startsWith("MOBILE-WALLETS")),
    [accounts]
  )

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

  /** Resolve the auto-mapped COA for the current payment method. */
  const currentDefaultCoa = defaultByGroup[groupForMethod(paymentMethod)]

  /** The COA actually in effect: the auto-mapped one unless the user overrode it. */
  const effectiveCoa = useMemo(() => {
    return accounts.find((a) => a.id === cashAccountId) ?? null
  }, [accounts, cashAccountId])

  /** When the collection method changes, auto-map the COA (unless the user had
   *  manually overridden — in which case keep their choice but warn). */
  const handleMethodChange = (method: PaymentMethod) => {
    setPaymentMethod(method)
    const def = defaultByGroup[groupForMethod(method)]
    if (!coaOverridden) {
      setCashAccountId(def?.coaAccountId ?? "")
    }
  }

  /** Manual COA change marks the field as overridden so subsequent method
   *  switches no longer clobber the user's pick. */
  const handleCoaOverride = (id: string) => {
    setCashAccountId(id)
    setCoaOverridden(true)
  }

  const handleSelectMember = (m: MemberSummary) => {
    setSelectedMember(m)
    setSearchQuery("")
  }

  const buildPayload = () => {
    const selectedType = collectionTypes.find((c) => c.id === collectionTypeId)
    return {
      transactionType: "DEPOSIT" as const,
      subType: "SAVINGS_DEPOSIT" as const, // engine-level subtype; ChargeType carries the business label
      memberId: selectedMember?.id ?? "",
      amount: parseFloat(amount) || 0,
      paymentMethod,
      cashAccountId: cashAccountId || null,
      referenceNo: referenceNo.trim() || null,
      remarks: remarks.trim() || null,
      transactionDate: new Date(depositDate).toISOString(),
      // Store the chosen Collection Type (ChargeType id+name) in the JSON
      // breakdown column. Cast because TransactionBreakdown is a fixed shape
      // but the column is schemaless JSON and the engine treats it as opaque.
      breakdown: selectedType
        ? ({ collectionTypeId: selectedType.id, collectionTypeName: selectedType.name } as unknown as Record<string, string>)
        : null,
    }
  }

  const handleSave = (submit: boolean) => {
    if (!selectedMember) return toast.error("Select a member first.")
    if (!collectionTypeId) return toast.error("Select a deposit type.")
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return toast.error("Enter a valid amount.")
    if (!cashAccountId) return toast.error("No COA auto-mapped for this method. Select one manually or configure it in Somiti Settings.")

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
  const groupMissing = missingGroups.includes(groupForMethod(paymentMethod))
  const activeMethodGroup = METHOD_GROUPS.find((g) => g.group === groupForMethod(paymentMethod))

  return (
    <div className="flex flex-col gap-6 lg:h-[calc(100dvh-8.1875rem)] lg:gap-4">
      <PageHeader
        className="lg:shrink-0"
        title="Deposit Transaction"
        subtitle="Record money received from a member. Saved as draft, then submitted for Maker-Checker approval."
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-success bg-success-soft px-4 py-2 shadow-sm">
            <ArrowDownToLine className="h-5 w-5 text-success" />
            <span className="t-body font-bold text-success">Money In</span>
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
                      {m.dueBalance > 0 && (
                        <span className="t-caption shrink-0 rounded-full bg-debit-soft px-2 py-0.5 font-bold text-debit">
                          Due {formatBDT(m.dueBalance)}
                        </span>
                      )}
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
                  onClick={() => { setSelectedMember(null); setCoaOverridden(false) }}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 t-caption font-medium text-debit transition-colors hover:bg-debit-soft"
                >
                  <X className="h-3 w-3" /> Change
                </button>
              </div>
            )}
          </SectionCard>

          {/* Deposit Details + Received COA — side by side, equal height */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-stretch lg:gap-4">
            {/* Deposit details */}
            <SectionCard
              title="Deposit Details"
              subtitle="What is being deposited and when."
              icon={<ArrowDownToLine />}
              accent="emerald"
              bodyClassName="p-4"
            >
              <div className="grid grid-cols-1 gap-3 lg:gap-2.5">
                {/* Deposit Type — active collection types only */}
                <div className="space-y-2">
                  <Label>Deposit Type <span className="text-debit">*</span></Label>
                  <Select value={collectionTypeId} onValueChange={(v) => v && setCollectionTypeId(v)}>
                    <SelectTrigger className={`${FIELD_H} w-full bg-[var(--control-bg)]`}>
                      <SelectValue placeholder={collectionTypes.length ? "Select deposit type" : "No collection types configured"} />
                    </SelectTrigger>
                    <SelectContent>
                      {collectionTypes.length === 0 ? (
                        <div className="px-3 py-6 text-center t-body text-muted-ink">
                          No active collection types.{" "}
                          <Link href="/dashboard/collection-setup" className="font-medium text-brand underline">Add one →</Link>
                        </div>
                      ) : (
                        collectionTypes.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Deposit Amount + Deposit Date — share a row to save vertical
                    space so this card matches the Received COA card height. */}
                <div className="grid grid-cols-2 gap-3 lg:gap-2.5">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Deposit Amount (৳) <span className="text-debit">*</span></Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className={`t-num ${FIELD_H} bg-[var(--control-bg)]`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="depositDate">Deposit Date <span className="text-debit">*</span></Label>
                    <div className="relative">
                      <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint-ink" />
                      <Input
                        id="depositDate"
                        type="date"
                        value={depositDate}
                        onChange={(e) => setDepositDate(e.target.value)}
                        className={`${FIELD_H} w-full bg-[var(--control-bg)] pl-9`}
                      />
                    </div>
                  </div>
                </div>

                {/* Collection Method — 3 groups, stores granular PaymentMethod */}
                <div className="space-y-2">
                  <Label>Collection Method <span className="text-debit">*</span></Label>
                  <Select value={paymentMethod} onValueChange={(v) => v && handleMethodChange(v as PaymentMethod)}>
                    <SelectTrigger className={`${FIELD_H} w-full bg-[var(--control-bg)]`}>
                      <span className="flex items-center gap-2">
                        {activeMethodGroup && <activeMethodGroup.icon className="h-4 w-4 text-muted-ink" />}
                        <span>{METHOD_LABEL[paymentMethod]}</span>
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
                </div>
              </div>
            </SectionCard>

            {/* Payment source — auto-mapped COA with override */}
            <SectionCard
              title="Received COA"
              subtitle="Which account the money lands in."
              icon={<Wallet />}
              accent="violet"
              bodyClassName="p-4"
            >
              {groupMissing && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-warning bg-warning-soft p-3 t-caption text-warning">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    No default account configured for <strong>{METHOD_LABEL[paymentMethod]}</strong>. Select a COA manually, or{" "}
                    <Link href="/dashboard/settings/bank" className="font-medium underline">configure it in Somiti Settings →</Link>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 lg:gap-2.5">
                <div className="space-y-2">
                  <Label>
                    Received COA{" "}
                    <span className="text-faint-ink">
                      {coaOverridden ? "(overridden)" : currentDefaultCoa?.coaAccountName ? "(auto)" : ""}
                    </span>
                  </Label>
                  <Select value={cashAccountId} onValueChange={(v) => v && handleCoaOverride(v)}>
                    <SelectTrigger className={`${FIELD_H} w-full bg-[var(--control-bg)]`}>
                      <SelectValue placeholder={groupMissing ? "Select COA manually" : "Auto-selected from method"} />
                    </SelectTrigger>
                    <SelectContent>
                      {cashLikeAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.accountCode} · {a.accountName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {coaOverridden && (
                    <button
                      type="button"
                      onClick={() => { setCoaOverridden(false); setCashAccountId(currentDefaultCoa?.coaAccountId ?? "") }}
                      className="t-caption font-medium text-brand transition-colors hover:underline"
                    >
                      Reset to auto-mapped COA
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="referenceNo">Reference Number</Label>
                  <Input
                    id="referenceNo"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    placeholder="Txn / cheque / slip no."
                    className={`${FIELD_H} w-full bg-[var(--control-bg)]`}
                  />
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Additional Information / Remarks */}
          <SectionCard
            title="Additional Information"
            subtitle="Optional notes for the audit trail."
            icon={<BookOpen />}
            accent="gold"
            bodyClassName="p-4"
          >
            <Label htmlFor="remarks">Remarks</Label>
            <Textarea
              id="remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional notes…"
              className="min-h-[64px] resize-y bg-[var(--control-bg)]"
            />
          </SectionCard>

          {/* Action buttons */}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
            <Button variant="secondary" disabled={isPending} onClick={() => handleSave(false)}>
              <Save className="mr-2 h-4 w-4" /> Save Draft
            </Button>
            <Button className="brand-gradient shadow-brand-glow" disabled={isPending} onClick={() => handleSave(true)}>
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
                  Search &amp; select a member to view their balance and deposit history.
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
                  <div className="rounded-xl border border-debit bg-debit-soft p-3">
                    <div className="t-overline text-muted-ink">Due Balance</div>
                    <div className={`t-h3 t-num mt-0.5 ${selectedMember.dueBalance > 0 ? "text-debit" : "text-primary-ink"}`}>
                      {formatBDT(selectedMember.dueBalance)}
                    </div>
                    {selectedMember.lateFines > 0 && (
                      <div className="mt-0.5 t-caption text-warning">
                        incl. {formatBDT(selectedMember.lateFines)} fines
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-success bg-success-soft p-3">
                    <div className="t-overline text-muted-ink">Total Deposits</div>
                    <div className="t-h3 t-num mt-0.5 text-success">
                      {formatBDT(selectedMember.totalDeposits)}
                    </div>
                  </div>
                </div>

                {selectedMember.lastDeposit && (
                  <div className="flex items-center gap-2 rounded-xl bg-subtle p-3 t-body">
                    <Calendar className="h-4 w-4 shrink-0 text-faint-ink" />
                    <span className="text-muted-ink">Last deposit:</span>
                    <span className="t-num font-semibold text-secondary-ink">
                      {formatBDT(selectedMember.lastDeposit.amount)}
                    </span>
                    <span className="t-caption text-faint-ink">on {formatDate(selectedMember.lastDeposit.date)}</span>
                  </div>
                )}

                {selectedMember.dueBalance > 0 && (
                  <div className="flex items-start gap-1.5 pt-1 t-caption text-muted-ink">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                    <span>Tip: pick the <span className="font-semibold">Due Payment</span> deposit type to clear dues.</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Live journal preview */}
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
                  <tr className="border-t border-[var(--border-base)]">
                    <td className="px-3 py-2 text-secondary-ink">
                      {effectiveCoa ? (
                        <span>
                          {effectiveCoa.accountName}
                          <span className="t-num ml-1 text-faint-ink">{effectiveCoa.accountCode}</span>
                        </span>
                      ) : (
                        <span className="italic text-faint-ink">— received COA —</span>
                      )}
                    </td>
                    <td className="t-num px-3 py-2 text-right font-semibold text-success">
                      {amountNum > 0 ? formatBDT(amountNum) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-faint-ink">—</td>
                  </tr>
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
                    <td className="px-3 py-2 text-right text-faint-ink">—</td>
                    <td className="t-num px-3 py-2 text-right font-semibold text-debit">
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
              Posting occurs on approval. Voucher type: <span className="font-semibold text-secondary-ink">RECEIPT</span>.
            </p>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
