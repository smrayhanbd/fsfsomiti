"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TransactionStatusBadge } from "@/components/transactions/TransactionStatusBadge"
import { AuditTrail } from "@/components/transactions/AuditTrail"
import { toast } from "sonner"
import {
  approveTransaction,
  rejectTransaction,
  returnTransaction,
  reverseTransaction,
  submitTransaction,
} from "@/app/actions/transactions"
import {
  formatBDT,
  formatDate,
} from "@/lib/accounting"
import {
  TRANSACTION_TYPE_LABELS,
  SUBTYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  type TransactionType,
  type TransactionStatus,
} from "@/lib/transactions/types"
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Undo2,
  Send,
  Printer,
  Paperclip,
  UserCircle2,
} from "lucide-react"

export interface TransactionDetailData {
  id: string
  voucherNo: string
  transactionType: TransactionType
  subType: string
  chargeTypeName: string | null
  status: TransactionStatus
  approvalLevel: string | null
  amount: number
  paymentMethod: string | null
  referenceNo: string | null
  remarks: string | null
  breakdown: Record<string, number> | null
  attachments: { type: string; name: string; url: string }[]
  createdAt: string
  approvedAt: string | null
  memberSubmitted: boolean
  memberRequest: {
    id: string
    type: string
    reason: string | null
    notes: string | null
    referenceNo: string | null
  } | null
  member: { id: string; memberNo: string; fullName: string; phone: string | null } | null
  cashAccount: { id: string; name: string; code: string; balance: number } | null
  journalEntry: {
    id: string
    voucherNo: string
    narration: string
    totalDebit: number
    totalCredit: number
    lines: {
      id: string
      accountCode: string
      accountName: string
      debit: number
      credit: number
      memo: string | null
    }[]
  } | null
  audit: {
    createdBy: string
    createdAt: string
    submittedBy: string | null
    submittedAt: string | null
    approvedBy: string | null
    approvedAt: string | null
    returnedBy: string | null
    returnedAt: string | null
    returnReason: string | null
    rejectedBy: string | null
    rejectedAt: string | null
    rejectionReason: string | null
    reversedByUser: string | null
    reversedAt: string | null
    reversalReason: string | null
  }
  reversalOf: { id: string; voucherNo: string } | null
  reversedBy: { id: string; voucherNo: string } | null
}

interface Props {
  txn: TransactionDetailData
  canApprove: boolean
  canReverse: boolean
  canSubmit: boolean
  isSuperAdmin: boolean
}

export default function TransactionDetailClient({
  txn,
  canApprove,
  canReverse,
  canSubmit,
  isSuperAdmin,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [reverseOpen, setReverseOpen] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [returnReason, setReturnReason] = useState("")
  const [reverseReason, setReverseReason] = useState("")
  const [overrideReason, setOverrideReason] = useState("")

  const doAction = (action: () => Promise<{ ok: boolean; error?: string }>, successMsg: string) => {
    startTransition(async () => {
      const res = await action()
      if (res.ok) {
        toast.success(successMsg)
        router.refresh()
      } else {
        toast.error("Action failed", { description: res.error })
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <Link
            href="/dashboard/transactions"
            className="inline-flex items-center text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to history
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {txn.voucherNo}
            </h1>
            <TransactionStatusBadge status={txn.status} />
            {txn.approvalLevel && (
              <Badge variant="outline" className="text-[10px]">
                {txn.approvalLevel}
              </Badge>
            )}
            {txn.memberSubmitted && (
              <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900/50">
                <UserCircle2 className="h-3 w-3 mr-1" /> Member Submitted
              </Badge>
            )}
            {txn.reversalOf && (
              <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                Reversal of {txn.reversalOf.voucherNo}
              </Badge>
            )}
            {txn.reversedBy && (
              <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                Reversed by {txn.reversedBy.voucherNo}
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {TRANSACTION_TYPE_LABELS[txn.transactionType]} ·{" "}
            {txn.chargeTypeName ?? SUBTYPE_LABELS[txn.subType as keyof typeof SUBTYPE_LABELS] ?? txn.subType}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {txn.status === "APPROVED" && (txn.transactionType === "DEPOSIT" || txn.transactionType === "WITHDRAWAL") && (
            <Link href={`/dashboard/receipts/${txn.id}`}>
              <Button variant="outline">
                <Printer className="h-4 w-4 mr-2" /> Print Money Receipt
              </Button>
            </Link>
          )}
          {canSubmit && (
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              disabled={isPending}
              onClick={() =>
                doAction(() => submitTransaction(txn.id), "Submitted for approval")
              }
            >
              <Send className="h-4 w-4 mr-2" /> Submit for Approval
            </Button>
          )}
          {canApprove && (
            <>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={isPending}
                onClick={() =>
                  doAction(() => approveTransaction(txn.id), "Transaction approved")
                }
              >
                <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
              </Button>
              <Button
                variant="outline"
                disabled={isPending}
                onClick={() => setReturnOpen(true)}
              >
                <Undo2 className="h-4 w-4 mr-2" /> Return
              </Button>
              <Button
                variant="outline"
                className="text-rose-600 hover:bg-rose-50"
                disabled={isPending}
                onClick={() => setRejectOpen(true)}
              >
                <XCircle className="h-4 w-4 mr-2" /> Reject
              </Button>
            </>
          )}
          {isSuperAdmin && canApprove && (
            <Button variant="outline" disabled={isPending} onClick={() => setOverrideOpen(true)}>
              Override & Approve
            </Button>
          )}
          {canReverse && (
            <Button
              variant="outline"
              className="text-purple-600 hover:bg-purple-50"
              disabled={isPending}
              onClick={() => setReverseOpen(true)}
            >
              <RotateCcw className="h-4 w-4 mr-2" /> Reverse
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: details + voucher */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-wider text-slate-500">
                Transaction Details
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <Detail label="Amount" value={formatBDT(txn.amount)} bold />
              <Detail
                label="Payment Method"
                value={
                  txn.paymentMethod
                    ? PAYMENT_METHOD_LABELS[
                        txn.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS
                      ] ?? txn.paymentMethod
                    : "—"
                }
              />
              <Detail label="Cash / Bank Account" value={txn.cashAccount?.name ?? "—"} />
              <Detail label="Reference No." value={txn.referenceNo ?? "—"} />
              <Detail
                label="Member"
                value={
                  txn.member ? (
                    <Link
                      href={`/dashboard/members/${txn.member.id}`}
                      className="text-indigo-600 hover:underline"
                    >
                      {txn.member.fullName} ({txn.member.memberNo})
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <Detail label="Created At" value={formatDate(txn.createdAt)} />
              {txn.remarks && (
                <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">
                    Remarks
                  </p>
                  <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                    {txn.remarks}
                  </p>
                </div>
              )}
              {txn.attachments.length > 0 && (
                <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">
                    Attachments
                  </p>
                  <ul className="space-y-1">
                    {txn.attachments.map((a, i) => (
                      <li key={i}>
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
                        >
                          <Paperclip className="h-3 w-3" />
                          {a.type}: {a.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Double-entry voucher */}
          {txn.journalEntry && (
            <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-wider text-slate-500">
                  Accounting Voucher — {txn.journalEntry.voucherNo}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900">
                      <tr className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                        <th className="text-left px-3 py-2">Account</th>
                        <th className="text-left px-3 py-2">Memo</th>
                        <th className="text-right px-3 py-2">Debit</th>
                        <th className="text-right px-3 py-2">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txn.journalEntry.lines.map((l) => (
                        <tr
                          key={l.id}
                          className="border-t border-slate-100 dark:border-slate-800/60"
                        >
                          <td className="px-3 py-2">
                            <span className="font-mono text-xs text-slate-400 mr-2">
                              {l.accountCode}
                            </span>
                            <span className="text-slate-700 dark:text-slate-200">
                              {l.accountName}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-400 text-xs">{l.memo ?? "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {l.debit > 0 ? formatBDT(l.debit) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {l.credit > 0 ? formatBDT(l.credit) : "—"}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-bold">
                        <td className="px-3 py-2" colSpan={2}>
                          Total
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatBDT(txn.journalEntry.totalDebit)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatBDT(txn.journalEntry.totalCredit)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-slate-400">{txn.journalEntry.narration}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: audit trail */}
        <div>
          <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-wider text-slate-500">
                Audit Trail
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AuditTrail
                events={[
                  { label: "Created", by: txn.audit.createdBy, at: txn.audit.createdAt },
                  {
                    label: "Submitted for Approval",
                    by: txn.audit.submittedBy,
                    at: txn.audit.submittedAt,
                  },
                  {
                    label: "Approved",
                    by: txn.audit.approvedBy,
                    at: txn.audit.approvedAt,
                  },
                  {
                    label: "Returned for Correction",
                    by: txn.audit.returnedBy,
                    at: txn.audit.returnedAt,
                    reason: txn.audit.returnReason,
                  },
                  {
                    label: "Rejected",
                    by: txn.audit.rejectedBy,
                    at: txn.audit.rejectedAt,
                    reason: txn.audit.rejectionReason,
                  },
                  {
                    label: "Reversed",
                    by: txn.audit.reversedByUser,
                    at: txn.audit.reversedAt,
                    reason: txn.audit.reversalReason,
                  },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rejectReason">Reason (required)</Label>
            <Textarea
              id="rejectReason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why is this transaction being rejected?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isPending || !rejectReason.trim()}
              onClick={() => {
                doAction(
                  () => rejectTransaction(txn.id, rejectReason),
                  "Transaction rejected"
                )
                setRejectOpen(false)
                setRejectReason("")
              }}
            >
              Reject Transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return dialog */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return for Correction</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="returnReason">What needs correction?</Label>
            <Textarea
              id="returnReason"
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="Tell the maker what to fix."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={isPending || !returnReason.trim()}
              onClick={() => {
                doAction(
                  () => returnTransaction(txn.id, returnReason),
                  "Returned to maker"
                )
                setReturnOpen(false)
                setReturnReason("")
              }}
            >
              Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reverse dialog */}
      <Dialog open={reverseOpen} onOpenChange={setReverseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reverse Transaction</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            This will create a reversing voucher and restore balances. The original
            transaction stays on record (immutable audit, spec §29).
          </p>
          <div className="space-y-2">
            <Label htmlFor="reverseReason">Reason (required)</Label>
            <Textarea
              id="reverseReason"
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder="Why is this being reversed?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700"
              disabled={isPending || !reverseReason.trim()}
              onClick={() => {
                doAction(
                  () => reverseTransaction(txn.id, reverseReason),
                  "Transaction reversed"
                )
                setReverseOpen(false)
                setReverseReason("")
              }}
            >
              Reverse Transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Override dialog (Super Admin only) */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Super Admin Override — Approve Own Transaction</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            Maker-Checker normally forbids approving your own transaction. As Super
            Admin you may override, but the reason is permanently recorded in the
            audit log (spec §12).
          </p>
          <div className="space-y-2">
            <Label htmlFor="overrideReason">Reason (required)</Label>
            <Input
              id="overrideReason"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Exceptional circumstance justifying the override"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={isPending || !overrideReason.trim()}
              onClick={() => {
                doAction(
                  () => approveTransaction(txn.id, { overrideReason }),
                  "Approved with override"
                )
                setOverrideOpen(false)
                setOverrideReason("")
              }}
            >
              Override & Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Detail({
  label,
  value,
  bold,
}: {
  label: string
  value: React.ReactNode
  bold?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">
        {label}
      </p>
      <p
        className={`text-sm ${bold ? "font-bold text-slate-900 dark:text-white" : "text-slate-700 dark:text-slate-200"}`}
      >
        {value}
      </p>
    </div>
  )
}
