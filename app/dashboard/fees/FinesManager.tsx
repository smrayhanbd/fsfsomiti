"use client"

// Fines & Penalties management UI (FRS §5.5, §12.3).
//
// Three panels in tabs:
//   1. Issue Fine — pick member + fine type + amount → calls issueFine action.
//   2. Fine Types — list / create / deactivate configurable categories.
//   3. Fines Log — every issued fine with Pay / Waive actions (reverses penalty).

import { useState, useMemo, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  issueFine,
  createFineType,
  toggleFineTypeStatus,
  deleteFineType,
  payFine,
  waiveFine,
} from "@/app/actions/fines"
import {
  PlusCircle,
  Search,
  ScrollText,
  Tag,
  Coins,
  CheckCircle2,
  Ban,
  Trash2,
  Loader2,
  AlertCircle,
} from "lucide-react"

interface Member {
  id: string
  fullName: string
  memberNo: string
  phone: string
}

interface FineType {
  id: string
  typeName: string
  penaltyPoints: number
  isActive: boolean
}

interface FineRow {
  id: string
  status: "ISSUED" | "PAID" | "WAIVED"
  amount: number
  issuedDate: string
  resolvedDate: string | null
  notes: string | null
  member: { id: string; fullName: string; memberNo: string }
  fineType: { id: string; typeName: string; penaltyPoints: number }
}

export default function FinesManager({
  members,
  fineTypes,
  fines,
}: {
  members: Member[]
  fineTypes: FineType[]
  fines: FineRow[]
}) {
  const [tab, setTab] = useState<"issue" | "types" | "log">("issue")

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <TabButton active={tab === "issue"} onClick={() => setTab("issue")} icon={<Coins className="w-4 h-4" />}>
          Issue Fine
        </TabButton>
        <TabButton active={tab === "types"} onClick={() => setTab("types")} icon={<Tag className="w-4 h-4" />}>
          Fine Types
        </TabButton>
        <TabButton active={tab === "log"} onClick={() => setTab("log")} icon={<ScrollText className="w-4 h-4" />}>
          Fines Log ({fines.length})
        </TabButton>
      </div>

      {tab === "issue" && <IssueFinePanel members={members} fineTypes={fineTypes.filter((t) => t.isActive)} />}
      {tab === "types" && <FineTypesPanel fineTypes={fineTypes} />}
      {tab === "log" && <FinesLogPanel fines={fines} />}
    </div>
  )
}

// ─── Tab button ─────────────────────────────────────────────────────────────
function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
        active
          ? "bg-indigo-600 text-white shadow-sm"
          : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

// ─── Issue Fine panel ───────────────────────────────────────────────────────
function IssueFinePanel({ members, fineTypes }: { members: Member[]; fineTypes: FineType[] }) {
  const [search, setSearch] = useState("")
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [fineTypeId, setFineTypeId] = useState<string>(fineTypes[0]?.id ?? "")
  const [amount, setAmount] = useState("")
  const [notes, setNotes] = useState("")
  const [pending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    if (!search) return []
    const q = search.toLowerCase()
    return members
      .filter(
        (m) =>
          m.fullName.toLowerCase().includes(q) ||
          m.memberNo.toLowerCase().includes(q) ||
          m.phone.includes(q)
      )
      .slice(0, 6)
  }, [search, members])

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedMember) {
      toast.error("Please select a member.")
      return
    }
    if (!fineTypeId) {
      toast.error("Please select a fine type.")
      return
    }
    const fd = new FormData()
    fd.set("memberId", selectedMember.id)
    fd.set("fineTypeId", fineTypeId)
    fd.set("amount", amount || "0")
    fd.set("notes", notes)
    startTransition(async () => {
      try {
        await issueFine(fd)
        toast.success(`Fine issued to ${selectedMember.fullName}.`)
        setSelectedMember(null)
        setSearch("")
        setAmount("")
        setNotes("")
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to issue fine.")
      }
    })
  }

  return (
    <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      <CardHeader>
        <CardTitle className="text-base">Issue a Fine</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Member search */}
          <div className="space-y-2">
            <Label>Member *</Label>
            {selectedMember ? (
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/30">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {selectedMember.fullName}
                  </p>
                  <p className="text-xs font-mono text-indigo-500">{selectedMember.memberNo}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMember(null)}
                  className="text-xs text-slate-500 hover:text-red-600"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, ID, or phone..."
                  className="pl-9"
                />
                {filtered.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg max-h-60 overflow-auto">
                    {filtered.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setSelectedMember(m)
                          setSearch("")
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <span className="text-slate-900 dark:text-white">{m.fullName}</span>
                        <span className="text-xs font-mono text-slate-400">{m.memberNo}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Fine type select */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fine Type *</Label>
              <Select value={fineTypeId} onValueChange={(v) => setFineTypeId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select fine type" />
                </SelectTrigger>
                <SelectContent>
                  {fineTypes.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      No active fine types — create one first
                    </SelectItem>
                  ) : (
                    fineTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.typeName} (−{t.penaltyPoints} pts)
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (৳, optional)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Reason / context for this fine..."
            />
          </div>

          <Button type="submit" disabled={pending} className="bg-indigo-600 hover:bg-indigo-700">
            {pending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlusCircle className="w-4 h-4 mr-2" />}
            Issue Fine
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ─── Fine Types panel ───────────────────────────────────────────────────────
function FineTypesPanel({ fineTypes }: { fineTypes: FineType[] }) {
  const [name, setName] = useState("")
  const [points, setPoints] = useState("")
  const [pending, startTransition] = useTransition()

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !points) {
      toast.error("Name and penalty points are required.")
      return
    }
    const fd = new FormData()
    fd.set("typeName", name)
    fd.set("penaltyPoints", points)
    startTransition(async () => {
      try {
        await createFineType(fd)
        toast.success("Fine type created.")
        setName("")
        setPoints("")
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to create fine type.")
      }
    })
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-base">New Fine Type</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Fine Type Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Late Deposit" />
            </div>
            <div className="space-y-2">
              <Label>Penalty Points * (points deducted from FINE KPI)</Label>
              <Input
                type="number"
                min="1"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                placeholder="e.g. 4"
              />
            </div>
            <Button type="submit" disabled={pending} className="w-full bg-indigo-600 hover:bg-indigo-700">
              {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Type
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="lg:col-span-2 space-y-3">
        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Configured Types
        </h3>
        {fineTypes.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-slate-500">No fine types configured yet.</CardContent>
          </Card>
        ) : (
          fineTypes.map((t) => (
            <FineTypeRow key={t.id} fineType={t} />
          ))
        )}
      </div>
    </div>
  )
}

function FineTypeRow({ fineType }: { fineType: FineType }) {
  const [pending, startTransition] = useTransition()
  const onToggle = () =>
    startTransition(async () => {
      try {
        await toggleFineTypeStatus(fineType.id, !fineType.isActive)
        toast.success(`${fineType.typeName} ${fineType.isActive ? "deactivated" : "activated"}.`)
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed.")
      }
    })
  const onDelete = () => {
    if (!confirm(`Delete fine type "${fineType.typeName}"?`)) return
    startTransition(async () => {
      try {
        await deleteFineType(fineType.id)
        toast.success("Fine type deleted.")
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed.")
      }
    })
  }
  return (
    <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center ${
            fineType.isActive
              ? "bg-amber-100 dark:bg-amber-950/40 text-amber-600"
              : "bg-slate-100 dark:bg-slate-800 text-slate-400"
          }`}
        >
          <Tag className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{fineType.typeName}</p>
          <p className="text-xs text-slate-500">−{fineType.penaltyPoints} pts {fineType.isActive ? "" : "· inactive"}</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onToggle}
          disabled={pending}
          title={fineType.isActive ? "Deactivate" : "Activate"}
          className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : fineType.isActive ? <Ban className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
        </button>
        <button
          onClick={onDelete}
          disabled={pending}
          title="Delete"
          className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Fines log panel ────────────────────────────────────────────────────────
function FinesLogPanel({ fines }: { fines: FineRow[] }) {
  const [filter, setFilter] = useState<"ALL" | "ISSUED" | "PAID" | "WAIVED">("ALL")
  const shown = fines.filter((f) => filter === "ALL" || f.status === filter)

  return (
    <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      <CardContent className="p-0">
        <div className="flex items-center gap-2 p-4 border-b border-slate-100 dark:border-slate-800">
          {(["ALL", "ISSUED", "PAID", "WAIVED"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === f
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <div className="py-12 text-center text-slate-500 flex flex-col items-center gap-2">
            <AlertCircle className="w-8 h-8 text-slate-300" />
            No fines {filter !== "ALL" ? `with status "${filter}"` : ""} recorded.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="text-left font-bold px-4 py-2.5">Member</th>
                  <th className="text-left font-bold px-3 py-2.5">Type</th>
                  <th className="text-right font-bold px-3 py-2.5">Amount</th>
                  <th className="text-left font-bold px-3 py-2.5">Issued</th>
                  <th className="text-center font-bold px-3 py-2.5">Status</th>
                  <th className="text-right font-bold px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((f) => (
                  <FineLogRow key={f.id} fine={f} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function FineLogRow({ fine }: { fine: FineRow }) {
  const [pending, startTransition] = useTransition()
  const statusStyle: Record<string, string> = {
    ISSUED: "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400",
    PAID: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400",
    WAIVED: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  }
  return (
    <tr className="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-900/50">
      <td className="px-4 py-3">
        <p className="font-semibold text-slate-900 dark:text-white">{fine.member.fullName}</p>
        <p className="text-xs font-mono text-slate-400">{fine.member.memberNo}</p>
      </td>
      <td className="px-3 py-3 text-slate-700 dark:text-slate-300">
        {fine.fineType.typeName}
        <span className="block text-xs text-slate-400">−{fine.fineType.penaltyPoints} pts</span>
      </td>
      <td className="px-3 py-3 text-right font-semibold text-slate-900 dark:text-white">
        {fine.amount > 0 ? `৳ ${fine.amount.toLocaleString()}` : "—"}
      </td>
      <td className="px-3 py-3 text-slate-500 text-xs">
        {new Date(fine.issuedDate).toLocaleDateString()}
      </td>
      <td className="px-3 py-3 text-center">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${statusStyle[fine.status]}`}>
          {fine.status}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        {fine.status === "ISSUED" ? (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() =>
                startTransition(async () => {
                  try {
                    await payFine(fine.id)
                    toast.success("Fine marked as paid. Penalty reversed.")
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : "Failed.")
                  }
                })
              }
              disabled={pending}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/40 hover:bg-emerald-200 dark:hover:bg-emerald-900/40"
            >
              Pay
            </button>
            <button
              onClick={() =>
                startTransition(async () => {
                  try {
                    await waiveFine(fine.id)
                    toast.success("Fine waived. Penalty reversed.")
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : "Failed.")
                  }
                })
              }
              disabled={pending}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              Waive
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-400">
            {fine.resolvedDate ? new Date(fine.resolvedDate).toLocaleDateString() : "—"}
          </span>
        )}
      </td>
    </tr>
  )
}
