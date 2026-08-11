"use client"

import Link from "next/link"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  HandCoins, FileText, UserCog, Clock, CheckCircle2, XCircle,
  Banknote, CalendarDays, Hash, ArrowDownToLine, Paperclip, ExternalLink,
  Undo2,
} from "lucide-react"

export interface WithdrawalRequest {
  id: string
  type: "WITHDRAWAL"
  amount: number
  method: string | null
  notes: string | null
  status: string
  createdAt: string
}

export interface ClosingRequest {
  id: string
  type: "CLOSING"
  reason: string | null
  status: string
  createdAt: string
}

export interface ProfileRequestItem {
  id: string
  payload: Record<string, string>
  status: string
  createdAt: string
}

export interface DepositRequestItem {
  id: string
  type: "DEPOSIT"
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

const STATUS_STYLES: Record<string, { cls: string; icon: typeof Clock }> = {
  PENDING: { cls: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Clock },
  PENDING_APPROVAL: { cls: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Clock },
  APPROVED: { cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle2 },
  REJECTED: { cls: "bg-rose-500/10 text-rose-600 border-rose-500/20", icon: XCircle },
  RETURNED: { cls: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Undo2 },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.PENDING
  const Icon = s.icon
  return (
    <Badge variant="outline" className={s.cls}>
      <Icon className="h-3 w-3 mr-1" /> {status.replace("_", " ")}
    </Badge>
  )
}

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })

const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket",
}

function EmptyState({ icon: Icon, title, hint }: { icon: typeof Clock; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
        <Icon className="h-6 w-6 text-slate-400" />
      </div>
      <p className="font-medium text-slate-700 dark:text-slate-200">{title}</p>
      <p className="text-sm text-slate-500">{hint}</p>
    </div>
  )
}

export default function RequestsClient({
  withdrawals,
  closings,
  profiles,
  deposits,
}: {
  withdrawals: WithdrawalRequest[]
  closings: ClosingRequest[]
  profiles: ProfileRequestItem[]
  deposits: DepositRequestItem[]
}) {
  const pendingCount = (arr: { status: string }[]) => arr.filter((x) => x.status === "PENDING").length

  return (
    <Tabs defaultValue="deposits" className="w-full">
      <TabsList className="bg-slate-100 dark:bg-slate-800/60 h-auto p-1 rounded-2xl">
        <TabsTrigger value="deposits" className="rounded-xl data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 gap-1.5">
          <ArrowDownToLine className="h-3.5 w-3.5" /> Deposits
          {pendingCount(deposits) > 0 && (
            <span className="ml-1 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold px-1.5 py-0.5 dark:bg-rose-900/40 dark:text-rose-300">
              {pendingCount(deposits)}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="withdrawals" className="rounded-xl data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 gap-1.5">
          <HandCoins className="h-3.5 w-3.5" /> Withdrawals
          {pendingCount(withdrawals) > 0 && (
            <span className="ml-1 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold px-1.5 py-0.5 dark:bg-rose-900/40 dark:text-rose-300">
              {pendingCount(withdrawals)}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="profiles" className="rounded-xl data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 gap-1.5">
          <UserCog className="h-3.5 w-3.5" /> Profile Updates
          {pendingCount(profiles) > 0 && (
            <span className="ml-1 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold px-1.5 py-0.5 dark:bg-rose-900/40 dark:text-rose-300">
              {pendingCount(profiles)}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="closings" className="rounded-xl data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 gap-1.5">
          <FileText className="h-3.5 w-3.5" /> Account Closure
          {pendingCount(closings) > 0 && (
            <span className="ml-1 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold px-1.5 py-0.5 dark:bg-rose-900/40 dark:text-rose-300">
              {pendingCount(closings)}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      {/* Deposits */}
      <TabsContent value="deposits" className="mt-6">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-6">
            {deposits.length === 0 ? (
              <EmptyState icon={ArrowDownToLine} title="No deposit requests" hint="Submit deposit requests from the Deposit Request page." />
            ) : (
              <div className="space-y-3">
                {deposits.map((r) => {
                  const slip = r.attachments?.[0]
                  return (
                    <div
                      key={r.id}
                      className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 p-4 border border-emerald-200 dark:border-emerald-900/50 rounded-xl bg-emerald-50/40 dark:bg-emerald-950/20"
                    >
                      <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
                        <ArrowDownToLine className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-slate-900 dark:text-white">
                            ৳ {r.amount ? Number(r.amount).toLocaleString() : "—"}
                          </p>
                          {r.method && (
                            <span className="text-xs text-slate-500">
                              · {PAYMENT_METHOD_LABEL[r.method] ?? r.method}
                            </span>
                          )}
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {fmtDate(r.transactionDate ?? r.createdAt)}
                          </span>
                        </div>
                        {r.referenceNo && (
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                            <Hash className="h-3 w-3" /> Ref: {r.referenceNo}
                          </p>
                        )}
                        {r.notes && (
                          <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">&ldquo;{r.notes}&rdquo;</p>
                        )}
                        {slip && (
                          <a
                            href={slip.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline"
                          >
                            <Paperclip className="h-3 w-3" /> View slip
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                        {r.status === "REJECTED" && r.rejectionReason && (
                          <div className="mt-2 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20 p-2 text-[11px] text-rose-700 dark:text-rose-400">
                            <p className="font-semibold mb-0.5">Rejection reason:</p>
                            <p>{r.rejectionReason}</p>
                            {r.reviewedBy && (
                              <p className="mt-1 text-rose-500">
                                — {r.reviewedBy}, {r.reviewedAt ? fmtDateTime(r.reviewedAt) : ""}
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
                                — {r.reviewedBy}, {r.reviewedAt ? fmtDateTime(r.reviewedAt) : ""}
                              </p>
                            )}
                            <Link href="/portal/deposit-request">
                              <Button
                                size="sm"
                                className="mt-2 h-7 bg-blue-600 hover:bg-blue-700 text-[11px]"
                              >
                                <Undo2 className="h-3 w-3 mr-1" /> Edit &amp; Resubmit
                              </Button>
                            </Link>
                          </div>
                        )}
                        {r.status === "APPROVED" && r.reviewedBy && (
                          <p className="mt-1 text-[10px] text-slate-400">
                            Approved by {r.reviewedBy}
                            {r.reviewedAt ? ` on ${fmtDateTime(r.reviewedAt)}` : ""}
                          </p>
                        )}
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Withdrawals */}
      <TabsContent value="withdrawals" className="mt-6">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-6">
            {withdrawals.length === 0 ? (
              <EmptyState icon={HandCoins} title="No withdrawal requests" hint="Withdrawals you request will be tracked here." />
            ) : (
              <div className="space-y-3">
                {withdrawals.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/50"
                  >
                    <div className="h-10 w-10 rounded-xl bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center shrink-0">
                      <Banknote className="h-5 w-5 text-rose-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white">৳ {Number(r.amount).toLocaleString()}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                        <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {fmtDate(r.createdAt)}</span>
                        {r.method && <span>· {r.method}</span>}
                      </div>
                      {r.notes && <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">&ldquo;{r.notes}&rdquo;</p>}
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Profile updates */}
      <TabsContent value="profiles" className="mt-6">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-6">
            {profiles.length === 0 ? (
              <EmptyState icon={UserCog} title="No profile update requests" hint="Profile change requests will appear here." />
            ) : (
              <div className="space-y-3">
                {profiles.map((r) => {
                  const changes = Object.entries(r.payload || {})
                  return (
                    <div
                      key={r.id}
                      className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/50"
                    >
                      <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/40 flex items-center justify-center shrink-0">
                        <UserCog className="h-5 w-5 text-indigo-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900 dark:text-white">Profile update</p>
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" /> {fmtDate(r.createdAt)}
                          </span>
                        </div>
                        {changes.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {changes.map(([key, val]) => (
                              <span
                                key={key}
                                className="inline-flex items-center gap-1 text-[11px] rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-0.5"
                              >
                                <Hash className="h-2.5 w-2.5 text-slate-400" />
                                <span className="text-slate-400">{key}:</span>
                                <span className="font-medium text-slate-700 dark:text-slate-200 truncate max-w-[160px]">
                                  {key === "photoUrl" ? "New photo" : String(val)}
                                </span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 mt-1">No field changes recorded.</p>
                        )}
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* Closings */}
      <TabsContent value="closings" className="mt-6">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-6">
            {closings.length === 0 ? (
              <EmptyState icon={FileText} title="No closure requests" hint="Account closure requests will appear here." />
            ) : (
              <div className="space-y-3">
                {closings.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 p-4 border border-rose-200 dark:border-rose-900/50 rounded-xl bg-rose-50/50 dark:bg-rose-950/20"
                  >
                    <div className="h-10 w-10 rounded-xl bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5 text-rose-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900 dark:text-white">Account closure request</p>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" /> {fmtDate(r.createdAt)}
                        </span>
                      </div>
                      {r.reason && <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5">&ldquo;{r.reason}&rdquo;</p>}
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
