"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  approveTransaction,
  bulkApproveTransactions,
  rejectTransaction,
  returnTransaction,
} from "@/app/actions/transactions"
import { approveMemberRequest, rejectMemberRequest } from "@/app/actions/portal"
import { toast } from "sonner"
import { formatBDT, formatDate } from "@/lib/accounting"
import {
  TRANSACTION_TYPE_LABELS,
  SUBTYPE_LABELS,
  type TransactionType,
} from "@/lib/transactions/types"
import {
  CheckCircle2,
  XCircle,
  Undo2,
  Eye,
  Layers,
  Clock,
  CheckCheck,
  Paperclip,
  ExternalLink,
  UserCircle2,
  Download,
} from "lucide-react"
import BulkActionBar, { type BulkAction } from "@/components/ui/bulk-action-bar"

interface PendingTxn {
  id: string
  voucherNo: string
  transactionType: TransactionType
  subType: string
  chargeTypeName: string | null
  amount: number
  approvalLevel: string | null
  submittedBy: string | null
  submittedAt: string
  createdBy: string
  createdById: string
  paymentMethod: string | null
  memberSubmitted: boolean
  attachments: { type: string; name: string; url: string }[]
  member: { id: string; memberNo: string; fullName: string } | null
  cashAccountName: string | null
}

interface MemberRequest {
  id: string
  type: string
  amount: number | null
  method: string | null
  reason: string | null
  notes: string | null
  createdAt: string
  member: { id: string; memberNo: string; fullName: string; phone: string | null }
}

interface Props {
  pendingTxns: PendingTxn[]
  memberRequests: MemberRequest[]
  currentUserId: string
}

export default function ApprovalsClient({
  pendingTxns,
  memberRequests,
  currentUserId,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTab = searchParams.get("tab") === "member" ? "member" : "admin"
  const [tab, setTab] = useState(initialTab)
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // ── Source filter (All / Admin / Member) ────────────────────────────────
  // Lets admins isolate member-submitted deposit requests from regular
  // admin-submitted transactions in the approval queue. Persisted in the URL
  // search-param `src` so a refresh keeps the filter. Defaults to "all".
  const initialSrc = (searchParams.get("src") as "all" | "admin" | "member") ?? "all"
  const [srcFilter, setSrcFilter] = useState<"all" | "admin" | "member">(initialSrc)

  const setSrcFilterAndPersist = (next: "all" | "admin" | "member") => {
    setSrcFilter(next)
    const params = new URLSearchParams(searchParams.toString())
    if (next === "all") params.delete("src")
    else params.set("src", next)
    const qs = params.toString()
    router.replace(`/dashboard/transaction-approvals${qs ? `?${qs}` : ""}`, { scroll: false })
  }

  // Apply the filter to the pending-txns list. Member-submitted rows have
  // memberSubmitted=true (set by submitDepositRequest); admin-submitted rows
  // have memberSubmitted=false.
  const filteredTxns = pendingTxns.filter((t) => {
    if (srcFilter === "member") return t.memberSubmitted
    if (srcFilter === "admin") return !t.memberSubmitted
    return true
  })
  const memberSubmittedCount = pendingTxns.filter((t) => t.memberSubmitted).length
  const adminSubmittedCount = pendingTxns.length - memberSubmittedCount

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const isMaker = (t: PendingTxn) => t.createdById === currentUserId

  const approveOne = (id: string) => {
    startTransition(async () => {
      const res = await approveTransaction(id)
      if (res.ok) {
        toast.success("Approved")
        router.refresh()
      } else {
        toast.error("Cannot approve", { description: res.error })
      }
    })
  }

  const bulkApprove = () => {
    if (selected.size === 0) return toast.error("Select transactions first")
    const ids = filteredTxns.filter((t) => selected.has(t.id) && !isMaker(t)).map((t) => t.id)
    if (ids.length === 0)
      return toast.error("Nothing to approve (Maker-Checker blocks your own)")
    startTransition(async () => {
      const res = await bulkApproveTransactions(ids)
      toast.success(`${res.approved.length} approved`)
      if (res.failed.length > 0) {
        toast.warning(`${res.failed.length} failed`, {
          description: res.failed.map((f) => `${f.id.slice(0, 8)}: ${f.error}`).join("\n"),
        })
      }
      setSelected(new Set())
      router.refresh()
    })
  }

  const handleReject = (id: string) => {
    const reason = prompt("Rejection reason?")
    if (!reason?.trim()) return
    startTransition(async () => {
      const res = await rejectTransaction(id, reason)
      if (res.ok) {
        toast.success("Rejected")
        router.refresh()
      } else toast.error("Failed", { description: res.error })
    })
  }

  const handleReturn = (id: string) => {
    const reason = prompt("What needs correction?")
    if (!reason?.trim()) return
    startTransition(async () => {
      const res = await returnTransaction(id, reason)
      if (res.ok) {
        toast.success("Returned to maker")
        router.refresh()
      } else toast.error("Failed", { description: res.error })
    })
  }

  const handleMemberRequest = async (id: string, action: "approve" | "reject") => {
    startTransition(async () => {
      const res =
        action === "approve"
          ? await approveMemberRequest(id)
          : await rejectMemberRequest(id)
      if (res.ok) {
        toast.success(action === "approve" ? "Request approved" : "Request rejected")
        router.refresh()
      } else toast.error("Failed", { description: res.error })
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Transaction Approvals
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
          Centralized Maker-Checker dashboard. You cannot approve transactions
          you created yourself (spec §12).
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="admin" className="gap-1">
            <Layers className="h-3.5 w-3.5" />
            Pending Transactions
            <span className="ml-1 inline-flex items-center justify-center h-5 min-w-5 px-1 text-[10px] font-bold rounded-full bg-amber-100 text-amber-700">
              {pendingTxns.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="member" className="gap-1">
            <Clock className="h-3.5 w-3.5" />
            Member Requests
            <span className="ml-1 inline-flex items-center justify-center h-5 min-w-5 px-1 text-[10px] font-bold rounded-full bg-indigo-100 text-indigo-700">
              {memberRequests.length}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* Pending Transactions (admin-submitted + member-submitted deposits) */}
        <TabsContent value="admin" className="space-y-4">
          {/* Source filter — chip group isolating admin vs member-submitted rows */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-widest font-bold text-slate-400 mr-1">
              Source:
            </span>
            {([
              { key: "all", label: "All", count: pendingTxns.length },
              { key: "admin", label: "Admin Submitted", count: adminSubmittedCount },
              { key: "member", label: "Member Submitted", count: memberSubmittedCount },
            ] as const).map((chip) => {
              const active = srcFilter === chip.key
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setSrcFilterAndPersist(chip.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {chip.label}
                  <span
                    className={`inline-flex items-center justify-center h-4 min-w-4 px-1 text-[10px] font-bold rounded-full ${
                      active
                        ? "bg-indigo-200 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                  >
                    {chip.count}
                  </span>
                </button>
              )
            })}
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="ml-auto text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
              >
                Clear selection ({selected.size})
              </button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {filteredTxns.length} pending · {selected.size} selected
              {filteredTxns.some((t) => t.memberSubmitted) && (
                <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-indigo-600">
                  <UserCircle2 className="h-3 w-3" />
                  Includes member-submitted deposit requests
                </span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <a
                href={`/api/transactions/export?status=PENDING_APPROVAL${
                  srcFilter === "member"
                    ? "&type=DEPOSIT"
                    : srcFilter === "admin"
                      ? ""
                      : ""
                }`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" disabled={isPending}>
                  <Download className="h-4 w-4 mr-2" /> Export CSV
                </Button>
              </a>
              <Button onClick={bulkApprove} disabled={isPending || selected.size === 0}>
                <CheckCheck className="h-4 w-4 mr-2" /> Bulk Approve
              </Button>
            </div>
          </div>
          <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                    Voucher
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                    Member
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                    Amount
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                    Maker
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTxns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-16 text-slate-400">
                      <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-300" />
                      <p className="font-medium">
                        {pendingTxns.length === 0
                          ? "All caught up!"
                          : `No ${srcFilter === "member" ? "member-submitted" : srcFilter === "admin" ? "admin-submitted" : ""} pending approvals.`}
                      </p>
                      <p className="text-sm">
                        {pendingTxns.length === 0
                          ? "No pending approvals."
                          : `Switch the Source filter to see the other ${pendingTxns.length - filteredTxns.length} pending transaction${pendingTxns.length - filteredTxns.length === 1 ? "" : "s"}.`}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTxns.map((t) => {
                    const maker = isMaker(t)
                    const slip = t.attachments?.[0]
                    return (
                      <TableRow key={t.id}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(t.id)}
                            onCheckedChange={() => toggle(t.id)}
                            disabled={maker}
                          />
                        </TableCell>
                        <TableCell>
                          <p className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                            {t.voucherNo}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {TRANSACTION_TYPE_LABELS[t.transactionType]} ·{" "}
                            {t.chargeTypeName ?? SUBTYPE_LABELS[t.subType as keyof typeof SUBTYPE_LABELS] ?? t.subType}
                            {t.approvalLevel ? ` · ${t.approvalLevel}` : ""}
                          </p>
                          {t.memberSubmitted && (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                              <UserCircle2 className="h-3 w-3" /> Member Submitted
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {t.member ? (
                            <div>
                              <p className="text-sm text-slate-700 dark:text-slate-200">
                                {t.member.fullName}
                              </p>
                              <p className="text-[11px] text-slate-400">{t.member.memberNo}</p>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums">
                          {formatBDT(t.amount)}
                        </TableCell>
                        <TableCell>
                          <p className="text-xs text-slate-500">{t.createdBy}</p>
                          <p className="text-[11px] text-slate-400">{formatDate(t.submittedAt)}</p>
                          {slip && (
                            <a
                              href={slip.url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline"
                              title="View deposit slip"
                            >
                              <Paperclip className="h-3 w-3" />
                              {slip.type}
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Link href={`/dashboard/transactions/${t.id}`}>
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Review">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-emerald-600 hover:bg-emerald-50"
                              disabled={isPending || maker}
                              onClick={() => approveOne(t.id)}
                              title={maker ? "Maker-Checker: you created this" : "Approve"}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-blue-600 hover:bg-blue-50"
                              disabled={isPending}
                              onClick={() => handleReturn(t.id)}
                              title="Return for correction"
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-rose-600 hover:bg-rose-50"
                              disabled={isPending}
                              onClick={() => handleReject(t.id)}
                              title="Reject"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Member Requests (portal) */}
        <TabsContent value="member" className="space-y-4">
          <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                  <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                    Member
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                    Type
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                    Amount
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                    Reason
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                    Requested
                  </TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-16 text-slate-400">
                      <Clock className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                      <p className="font-medium">No pending member requests</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  memberRequests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <p className="text-sm text-slate-700 dark:text-slate-200">
                          {r.member.fullName}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {r.member.memberNo} · {r.member.phone}
                        </p>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-semibold uppercase text-indigo-600">
                          {r.type}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.amount ? formatBDT(r.amount) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 max-w-xs truncate">
                        {r.reason ?? r.notes ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">
                        {formatDate(r.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-emerald-600 hover:bg-emerald-50"
                            disabled={isPending}
                            onClick={() => handleMemberRequest(r.id, "approve")}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-rose-600 hover:bg-rose-50"
                            disabled={isPending}
                            onClick={() => handleMemberRequest(r.id, "reject")}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <BulkActionBar
        selected={selected}
        onClear={() => setSelected(new Set())}
        actions={[
          {
            key: "approve",
            label: "Approve All",
            tone: "success",
            icon: <CheckCheck className="h-4 w-4" />,
            loading: isPending,
            onClick: (ids) => {
              const eligible = filteredTxns
                .filter((t) => ids.includes(t.id) && !isMaker(t))
                .map((t) => t.id)
              if (eligible.length === 0) {
                toast.error("Nothing to approve (Maker-Checker blocks your own)")
                return
              }
              startTransition(async () => {
                const res = await bulkApproveTransactions(eligible)
                toast.success(`${res.approved.length} approved`)
                if (res.failed.length > 0) {
                  toast.warning(`${res.failed.length} failed`, {
                    description: res.failed
                      .map((f) => `${f.id.slice(0, 8)}: ${f.error}`)
                      .join("\n"),
                  })
                }
                setSelected(new Set())
                router.refresh()
              })
            },
          },
          {
            key: "export",
            label: "Export CSV",
            tone: "outline",
            icon: <Download className="h-4 w-4" />,
            onClick: (ids) => {
              // Export uses the server endpoint with the PENDING_APPROVAL filter.
              // For per-id export we'd need a POST body — for now we open the
              // filtered CSV which is what admins typically want.
              const url = `/api/transactions/export?status=PENDING_APPROVAL`
              window.open(url, "_blank")
            },
          },
        ]}
      />
    </div>
  )
}
