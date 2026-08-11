"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import {
  HandCoins, AlertCircle, CheckCircle2, Clock, XCircle,
  Wallet, TrendingUp, TrendingDown, Receipt,
  Download, FileText, ArrowDownToLine, Lock, Calendar, Building2,
  Printer, Search,
} from "lucide-react"
import { submitWithdrawalRequest } from "@/app/actions/portal"
import { isNextRedirect } from "@/lib/nextRedirect"
import { formatBDT, formatDate, formatNumber } from "@/lib/accounting"
import LedgerPrintStatement from "@/app/dashboard/_ledger-print/LedgerPrintStatement"
import type { OrgInfo } from "@/lib/organization"

// ─── Types ──────────────────────────────────────────────────────────────
interface MemberSummary {
  id: string
  memberNo: string
  fullName: string
  phone: string
  email: string | null
  membershipDate: string
  address: string | null
  currentBalance: number
  totalDeposit: number
  totalWithdrawal: number
  earliestDate: string
}

interface SavingsRow {
  id: string
  amount: number
  type: string
  method: string | null
  date: string
  receiptNo: string | null
  transactionMirror: {
    id: string
    voucherNo: string
    status: string
    transactionType: string
    paymentMethod: string | null
    referenceNo: string | null
    remarks: string | null
    chargeTypeName: string | null
    // Prisma's `Json?` field comes through as a wide union after `plain()`.
    // We only ever read `collectionTypeName` out of it (after a runtime cast),
    // so `unknown` is the honest type here.
    breakdown: unknown
    transactionDate: string
    approvedAt: string | null
  } | null
}

interface WithdrawalRequest {
  id: string
  amount: number | null
  createdAt: string
  method: string | null
  notes: string | null
  status: string
}

interface Props {
  member: MemberSummary
  savings: SavingsRow[]
  requests: WithdrawalRequest[]
  orgName: string
  org: OrgInfo
}

// ─── Static UI config ───────────────────────────────────────────────────
const SAVINGS_TYPE_STYLES: Record<string, string> = {
  WITHDRAWAL: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400",
  FINE: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400",
  LOAN_PAYMENT: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400",
}

/**
 * Helper — is this row eligible for a money-receipt download?
 *
 * Mirrors the gate in /api/portal/transactions/[id]/receipt: the linked GL
 * Transaction must be APPROVED and of type DEPOSIT or WITHDRAWAL. Anything
 * else (charges, fines that never went through the GL, pending requests, etc.)
 * is shown without a download button.
 */
function isReceiptEligible(row: SavingsRow): boolean {
  const mirror = row.transactionMirror
  if (!mirror) return false
  if (mirror.status !== "APPROVED") return false
  return (
    mirror.transactionType === "DEPOSIT" ||
    mirror.transactionType === "WITHDRAWAL"
  )
}

/**
 * Resolve the human-readable "Type" label for a row.
 *
 * The savings row's `type` field is hard-coded per TransactionType by
 * savingsTypeFor() (DEPOSIT → "MONTHLY"), so it doesn't reflect what the user
 * actually picked as the deposit type. The real name lives on the linked
 * Transaction — either inside the JSON `breakdown` (deposits: {
 * collectionTypeName }) or as the flat `chargeTypeName` column. Falls back to
 * the raw savings.type when neither is present.
 */
function typeLabelFor(row: SavingsRow): string {
  const mirror = row.transactionMirror
  if (!mirror) return row.type.replace("_", " ")
  const breakdown = mirror.breakdown as { collectionTypeName?: string } | null
  return (
    breakdown?.collectionTypeName?.trim() ||
    mirror.chargeTypeName?.trim() ||
    row.type.replace("_", " ")
  )
}

// ─── Main component ─────────────────────────────────────────────────────
export default function MySavingsClient({
  member,
  savings,
  requests,
  orgName,
  org,
}: Props) {
  return (
    <Tabs defaultValue="dashboard" className="w-full">
      <TabsList className="portal-no-print h-10 w-full justify-start gap-1 rounded-xl bg-slate-100 dark:bg-slate-900 p-1">
        <TabsTrigger
          value="dashboard"
          className="flex-1 sm:flex-none data-active:bg-white dark:data-active:bg-slate-950 data-active:shadow-sm rounded-lg"
        >
          <Wallet className="h-4 w-4 mr-1.5" />
          Savings Dashboard
        </TabsTrigger>
        <TabsTrigger
          value="ledger"
          className="flex-1 sm:flex-none data-active:bg-white dark:data-active:bg-slate-950 data-active:shadow-sm rounded-lg"
        >
          <FileText className="h-4 w-4 mr-1.5" />
          View Ledger
        </TabsTrigger>
        <TabsTrigger
          value="receipts"
          className="flex-1 sm:flex-none data-active:bg-white dark:data-active:bg-slate-950 data-active:shadow-sm rounded-lg"
        >
          <Receipt className="h-4 w-4 mr-1.5" />
          Money Receipts
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard" className="mt-6 outline-none">
        <DashboardTab member={member} savings={savings} requests={requests} orgName={orgName} />
      </TabsContent>

      <TabsContent value="ledger" className="mt-6 outline-none">
        <LedgerTab member={member} savings={savings} org={org} />
      </TabsContent>

      <TabsContent value="receipts" className="mt-6 outline-none">
        <ReceiptsTab savings={savings} member={member} />
      </TabsContent>
    </Tabs>
  )
}

// ─── Tab 1: Savings Dashboard ───────────────────────────────────────────
function DashboardTab({
  member,
  savings,
  requests,
  orgName,
}: {
  member: MemberSummary
  savings: SavingsRow[]
  requests: WithdrawalRequest[]
  orgName: string
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [amount, setAmount] = useState("")

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)

    if (parseFloat(amount) > member.currentBalance) {
      toast.error("Invalid Amount", {
        description: "Withdrawal amount cannot exceed your current balance.",
      })
      setLoading(false)
      return
    }

    try {
      await submitWithdrawalRequest(member.id, formData)
      toast.success("Request Submitted", {
        description: "Your withdrawal request is pending approval.",
      })
      setOpen(false)
    } catch (err: unknown) {
      if (isNextRedirect(err)) throw err
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Failed",
      })
      setLoading(false)
    }
  }

  const stats = [
    {
      label: "Current Balance",
      value: `৳ ${member.currentBalance.toLocaleString()}`,
      icon: Wallet,
      color: "text-emerald-600",
      iconBg: "bg-emerald-100 dark:bg-emerald-950/50",
    },
    {
      label: "Total Deposited",
      value: `৳ ${member.totalDeposit.toLocaleString()}`,
      icon: TrendingUp,
      color: "text-blue-600",
      iconBg: "bg-blue-100 dark:bg-blue-950/50",
    },
    {
      label: "Total Withdrawn",
      value: `৳ ${member.totalWithdrawal.toLocaleString()}`,
      icon: TrendingDown,
      color: "text-rose-600",
      iconBg: "bg-rose-100 dark:bg-rose-950/50",
    },
  ]

  // Running balance per row. Savings are newest-first, so walk oldest-first.
  const chronological = [...savings].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )
  let running = 0
  const balanceById = new Map<string, number>()
  for (const s of chronological) {
    running += s.type === "WITHDRAWAL" ? -Number(s.amount) : Number(s.amount)
    balanceById.set(s.id, running)
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

  return (
    <>
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl"
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 ${stat.iconBg}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-widest font-bold text-slate-500 dark:text-slate-400">
                  {stat.label}
                </p>
                <p className={`text-xl font-extrabold tracking-tight ${stat.color} mt-0.5`}>{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Withdrawal requests + history */}
      <div className="space-y-6 mt-6">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
              <HandCoins className="h-4 w-4 text-amber-500" /> Withdrawal Requests
            </CardTitle>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger
                render={<Button size="sm" className="bg-rose-600 hover:bg-rose-700" />}
              >
                <HandCoins className="h-4 w-4 mr-1" /> Request Withdrawal
              </DialogTrigger>
              <DialogContent className="max-w-md bg-white dark:bg-slate-950 rounded-2xl">
                <DialogHeader>
                  <DialogTitle>Request Withdrawal</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                  {/* Withdrawal Type — mirrors admin's WithdrawalForm.
                      Stored in breakdown.withdrawalType for the audit trail. */}
                  <div className="space-y-2">
                    <Label htmlFor="withdrawalType">Withdrawal Type</Label>
                    <Select name="withdrawalType" required defaultValue="SAVINGS">
                      <SelectTrigger id="withdrawalType"><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SAVINGS">Savings Withdrawal</SelectItem>
                        <SelectItem value="PROFIT">Profit Withdrawal</SelectItem>
                        <SelectItem value="FULL_CLOSURE">Full Closure</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount (৳)</Label>
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
                    />
                    <p className="text-xs text-slate-500">
                      Available Balance: ৳ {member.currentBalance.toLocaleString()}
                    </p>
                  </div>
                  {/* Payment Method — per spec §7, withdrawals are bank-only
                      (Bank Transfer or Cheque). Uses the correct Prisma enum
                      values (BANK_TRANSFER / CHEQUE), NOT the old "BANK" /
                      "CASH" / "BKASH" values that broke the DB insert. */}
                  <div className="space-y-2">
                    <Label htmlFor="method">Payment Method</Label>
                    <Select name="method" required defaultValue="BANK_TRANSFER">
                      <SelectTrigger id="method"><SelectValue placeholder="Select method" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                        <SelectItem value="CHEQUE">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reason">Reason</Label>
                    <Input
                      id="reason"
                      name="reason"
                      placeholder="Describe the reason for this withdrawal…"
                    />
                  </div>
                  <Button type="submit" className="w-full bg-rose-600 hover:bg-rose-700" disabled={loading}>
                    {loading ? "Submitting..." : "Submit Request"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="p-6">
            {requests.length === 0 ? (
              <div className="text-center py-8 flex flex-col items-center">
                <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                  <AlertCircle className="h-6 w-6 text-slate-400" />
                </div>
                <p className="font-medium text-slate-700 dark:text-slate-200">No withdrawal requests yet</p>
                <p className="text-sm text-slate-500 mt-0.5">Click &quot;Request Withdrawal&quot; to create one.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/50"
                  >
                    <div>
                      <p className="font-bold text-lg text-slate-900 dark:text-white">
                        ৳ {Number(req.amount).toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {new Date(req.createdAt).toLocaleDateString()} · {req.method}
                      </p>
                      {req.notes && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-1">&ldquo;{req.notes}&rdquo;</p>
                      )}
                    </div>
                    <Badge variant="outline" className={statusStyle(req.status)}>
                      <StatusIcon status={req.status} />
                      {req.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
              <Receipt className="h-4 w-4 text-indigo-500" /> Transaction History
            </CardTitle>
            <span className="text-xs text-slate-400">{savings.length} records</span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-slate-200/60 dark:border-slate-800/60 hover:bg-transparent">
                    <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Date</TableHead>
                    <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Receipt/Voucher</TableHead>
                    <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Type</TableHead>
                    <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Method</TableHead>
                    <TableHead className="px-6 py-3 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Amount</TableHead>
                    <TableHead className="px-6 py-3 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {savings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                        No transactions yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    savings.map((sav) => (
                      <TableRow
                        key={sav.id}
                        className="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                      >
                        <TableCell className="px-6 py-3 text-sm text-slate-700 dark:text-slate-200">
                          {new Date(sav.date).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-6 py-3 text-sm font-mono text-slate-500">
                          {sav.receiptNo || sav.transactionMirror?.voucherNo || "—"}
                        </TableCell>
                        <TableCell className="px-6 py-3 text-sm">
                          <Badge
                            variant="outline"
                            className={SAVINGS_TYPE_STYLES[sav.type] || "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300"}
                          >
                            {typeLabelFor(sav)}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-6 py-3 text-sm text-slate-500">{sav.method || "—"}</TableCell>
                        <TableCell className={`px-6 py-3 text-right font-bold text-sm ${sav.type === "WITHDRAWAL" ? "text-rose-600" : "text-emerald-600"}`}>
                          {sav.type === "WITHDRAWAL" ? "− " : "+ "}৳ {Number(sav.amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="px-6 py-3 text-right text-sm font-medium text-slate-700 dark:text-slate-200">
                          ৳ {(balanceById.get(sav.id) ?? 0).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Printable statement (only visible when printing the page) */}
      <div className="portal-print-area">
        <div className="portal-statement p-8 max-w-3xl mx-auto">
          <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">{orgName}</h1>
                <p className="text-xs text-slate-500">Member Savings Statement</p>
              </div>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>Generated: {new Date().toLocaleString()}</p>
              <p>Member ID: <span className="font-mono font-semibold">{member.memberNo}</span></p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Member Name</p>
              <p className="text-sm font-semibold text-slate-900">{member.fullName}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Current Balance</p>
              <p className="text-sm font-bold text-emerald-700">৳ {member.currentBalance.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Total Deposited</p>
              <p className="text-sm font-semibold text-slate-900">৳ {member.totalDeposit.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Total Withdrawn</p>
              <p className="text-sm font-semibold text-slate-900">৳ {member.totalWithdrawal.toLocaleString()}</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Date</th>
                <th style={{ textAlign: "left" }}>Receipt</th>
                <th style={{ textAlign: "left" }}>Type</th>
                <th style={{ textAlign: "left" }}>Method</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th style={{ textAlign: "right" }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {[...savings]
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map((sav) => (
                  <tr key={sav.id}>
                    <td>{new Date(sav.date).toLocaleDateString()}</td>
                    <td>{sav.receiptNo || sav.transactionMirror?.voucherNo || "—"}</td>
                    <td>{typeLabelFor(sav)}</td>
                    <td>{sav.method}</td>
                    <td style={{ textAlign: "right" }}>
                      {sav.type === "WITHDRAWAL" ? "− " : "+ "}৳ {Number(sav.amount).toLocaleString()}
                    </td>
                    <td style={{ textAlign: "right" }}>৳ {(balanceById.get(sav.id) ?? 0).toLocaleString()}</td>
                  </tr>
                ))}
            </tbody>
          </table>

          <p className="text-[10px] text-slate-400 mt-8 text-center">
            This is a computer-generated statement. Please contact management for any discrepancies.
          </p>
        </div>
      </div>
    </>
  )
}

// ─── Tab 2: View Ledger ─────────────────────────────────────────────────
// Ports the admin dashboard's MemberLedgerClient UI into the member portal.
// Per spec: remove the member picker + member-summary header + the all-time
// stat cards. KEEP the date-range filter bar, the toolbar (Print + Download
// PDF + Export CSV), and the 8-column running-balance statement table.
function LedgerTab({
  member,
  savings,
  org,
}: {
  member: MemberSummary
  savings: SavingsRow[]
  org: OrgInfo
}) {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const earliestStr = new Date(member.earliestDate).toISOString().slice(0, 10)

  const [from, setFrom] = useState<string>(earliestStr)
  const [to, setTo] = useState<string>(todayStr)
  // Has the member clicked "Generate" yet? Until then, the on-screen table
  // area shows a prompt instead of the statement.
  const [generated, setGenerated] = useState(false)

  // Running-balance computation — mirrors admin's `rows` + `totals` useMemo.
  // Walks savings oldest-first, threads an accumulator from `openingAtFrom`.
  const { rows, totals, openingAtFrom, closingBalance } = useMemo(() => {
    const fromTime = from ? new Date(from).getTime() : null
    const toDate = to ? new Date(to) : null
    if (toDate) toDate.setHours(23, 59, 59, 999)
    const toTime = toDate ? toDate.getTime() : null

    const chronological = [...savings].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    // Opening balance = sum of all movement BEFORE `from`.
    let opening = 0
    for (const s of chronological) {
      const t = new Date(s.date).getTime()
      if (fromTime !== null && t >= fromTime) break
      opening += s.type === "WITHDRAWAL" ? -Number(s.amount) : Number(s.amount)
    }

    // In-window rows + running balance.
    let running = opening
    let totalDebit = 0
    let totalCredit = 0
    const inWindow: {
      line: SavingsRow
      typeLabel: string
      description: string
      ref: string
      method: string
      debit: number
      credit: number
      balance: number
    }[] = []
    for (const s of chronological) {
      const t = new Date(s.date).getTime()
      if (fromTime !== null && t < fromTime) continue
      if (toTime !== null && t > toTime) continue

      const amount = Number(s.amount)
      const isWithdrawal = s.type === "WITHDRAWAL"
      const debit = isWithdrawal ? amount : 0
      const credit = isWithdrawal ? 0 : amount
      running += credit - debit
      totalDebit += debit
      totalCredit += credit

      const mirror = s.transactionMirror
      const breakdown = mirror?.breakdown as { collectionTypeName?: string } | null
      const typeLabel =
        breakdown?.collectionTypeName?.trim() ||
        mirror?.chargeTypeName?.trim() ||
        s.type.replace("_", " ")
      const remarks = mirror?.remarks?.trim() || ""
      const referenceNo = mirror?.referenceNo?.trim() || ""
      const description = [remarks, referenceNo ? `Ref: ${referenceNo}` : ""]
        .filter(Boolean)
        .join(" | ")
      const ref = s.receiptNo || mirror?.voucherNo || ""
      // Humanize the method label (BANK_TRANSFER → Bank Transfer).
      const method = s.method
        ? s.method.toLowerCase().replace(/_+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : "—"

      inWindow.push({ line: s, typeLabel, description, ref, method, debit, credit, balance: running })
    }

    const close = opening + totalCredit - totalDebit
    return {
      rows: inWindow,
      totals: { debit: totalDebit, credit: totalCredit },
      openingAtFrom: opening,
      closingBalance: close,
    }
  }, [savings, from, to])

  const periodLabel = `${from ? formatDate(from) : "Start"} to ${to ? formatDate(to) : "Today"}`

  const handleGenerate = () => {
    if (from && to && new Date(from) > new Date(to)) {
      toast.error("Invalid date range", {
        description: "The start date must be on or before the end date.",
      })
      return
    }
    setGenerated(true)
    toast.success("Ledger generated", {
      description: `${rows.length} transactions for ${periodLabel}.`,
    })
  }

  // Export CSV — mirrors admin's `handleExport` so members get the same
  // column order (Date / Receipt-Voucher / Description / Type / Method /
  // Debit / Credit / Balance) as the on-screen table.
  const handleExport = () => {
    const header = [
      "Date",
      "Receipt/Voucher",
      "Description",
      "Type",
      "Method",
      "Withdrawal",
      "Deposit",
      "Balance",
    ]
    const data = rows.map(({ line, typeLabel, description, ref, method, debit, credit, balance }) => [
      formatDate(line.date),
      ref || "",
      description || "",
      typeLabel,
      method,
      debit.toFixed(2),
      credit.toFixed(2),
      balance.toFixed(2),
    ])
    const csv = [header, ...data]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `ledger-${member.memberNo}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const resetFilter = () => {
    setFrom(earliestStr)
    setTo(todayStr)
    setGenerated(false)
  }

  // Printable-statement columns/cells — derived from the same `rows` shown on
  // screen so the on-screen table, the browser-print output, and the pdfkit
  // PDF all agree. Mirrors admin's `printColumns` + `printRows` + `footerLines`.
  const printColumns = [
    { key: "date", label: "Date" },
    { key: "desc", label: "Description" },
    { key: "ref", label: "Receipt / Voucher" },
    { key: "type", label: "Type" },
    { key: "method", label: "Method" },
    { key: "withdrawal", label: "Withdrawal", align: "right" as const },
    { key: "deposit", label: "Deposit", align: "right" as const },
    { key: "balance", label: "Balance", align: "right" as const },
  ]
  const printRows = rows.map(({ line, typeLabel, description, ref, method, debit, credit, balance }) => ({
    date: formatDate(line.date),
    desc: description || "—",
    ref: ref || "—",
    type: typeLabel,
    method,
    withdrawal: debit > 0 ? formatNumber(debit) : "",
    deposit: credit > 0 ? formatNumber(credit) : "",
    balance: formatNumber(balance),
  }))
  const footerLines = [
    `Total Withdrawal : ${formatNumber(totals.debit)} BDT`,
    `Total Deposit : ${formatNumber(totals.credit)} BDT`,
    `Opening Balance : ${formatNumber(openingAtFrom)} BDT`,
    `Closing Balance as of ${to ? formatDate(to) : formatDate(new Date().toISOString())} : ${formatNumber(closingBalance)} BDT`,
  ]

  return (
    <div className="space-y-6">
      {/* On-screen section — hidden during print via `ledger-no-print`. */}
      <div className="ledger-no-print space-y-6">
      {/* Filter bar — mirrors admin's filter card but WITHOUT the member picker
          (the member is always the logged-in user). Keeps From / To / Generate / Reset.
          No min/max constraints so the member can pick any date freely. */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl">
        <CardContent className="p-4 grid md:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              From
            </Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setGenerated(false) }}
              className="bg-white dark:bg-slate-950"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              To
            </Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setGenerated(false) }}
              className="bg-white dark:bg-slate-950"
            />
          </div>
          <Button onClick={handleGenerate} className="bg-indigo-600 hover:bg-indigo-700">
            <Search className="mr-2 h-4 w-4" /> Generate
          </Button>
          <Button variant="outline" onClick={resetFilter}>
            Reset
          </Button>
        </CardContent>
      </Card>

      {/* Toolbar — shown only after the member clicks "Generate".
          Print / Save as PDF (browser-native, matches admin exactly) +
          Export CSV. No pdfkit "Download PDF" button — the browser print
          output is the canonical PDF. */}
      {generated && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={rows.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={rows.length === 0}>
            <Printer className="mr-2 h-4 w-4" /> Print / Save as PDF
          </Button>
        </div>
      )}

      {/* Running-balance ledger — shown only after "Generate" is clicked.
          8-column table matching admin's design.
          Opening row (italic) → movement rows → period totals row (bold). */}
      {generated ? (
        <>
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-500" />
            <span className="text-sm font-semibold text-slate-800 dark:text-white">
              Ledger Statement
            </span>
          </div>
          <span className="text-xs text-slate-400 inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {periodLabel}
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-800/50 hover:bg-transparent">
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                Date
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                Receipt / Voucher
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                Description
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                Type
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                Method
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                Withdrawal
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                Deposit
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                Balance
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Opening row */}
            <TableRow className="bg-slate-50/60 dark:bg-slate-900/40 font-medium">
              <TableCell colSpan={5} className="text-slate-500 italic text-xs">
                Opening balance
              </TableCell>
              <TableCell className="text-right text-slate-400">—</TableCell>
              <TableCell className="text-right text-slate-400">—</TableCell>
              <TableCell className="text-right font-bold tabular-nums text-slate-700 dark:text-slate-200">
                ৳ {openingAtFrom.toLocaleString()}
              </TableCell>
            </TableRow>

            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                  No transactions in this period.
                </TableCell>
              </TableRow>
            ) : (
              rows.map(({ line, typeLabel, description, ref, method, debit, credit, balance }) => (
                <TableRow
                  key={line.id}
                  className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                >
                  <TableCell className="text-xs text-slate-500">
                    {formatDate(line.date)}
                  </TableCell>
                  <TableCell>
                    {ref ? (
                      <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                        {ref}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                    {description ? (
                      <span className="whitespace-pre-wrap break-words">{description}</span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[10px] py-0 px-1.5 ${
                        SAVINGS_TYPE_STYLES[line.type] ??
                        "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300"
                      }`}
                    >
                      {typeLabel}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">{method}</TableCell>
                  <TableCell className="text-right tabular-nums text-rose-700 dark:text-rose-400">
                    {debit > 0 ? formatBDT(debit) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                    {credit > 0 ? formatBDT(credit) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-bold tabular-nums text-slate-900 dark:text-white">
                    {formatBDT(balance)}
                  </TableCell>
                </TableRow>
              ))
            )}

            {/* Period totals row */}
            <TableRow className="border-t-2 border-slate-200 dark:border-slate-700 font-bold bg-slate-50/80 dark:bg-slate-900/60">
              <TableCell colSpan={5} className="text-slate-700 dark:text-slate-200">
                Period totals
              </TableCell>
              <TableCell className="text-right tabular-nums text-slate-900 dark:text-white">
                {formatBDT(totals.debit)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-slate-900 dark:text-white">
                {formatBDT(totals.credit)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-slate-900 dark:text-white">
                {formatBDT(closingBalance)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>

      {/* Footer summary — mirrors admin's `footerLines` block. */}
      <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1 px-1">
        <div>Total Withdrawal : {formatBDT(totals.debit)}</div>
        <div>Total Deposit : {formatBDT(totals.credit)}</div>
        <div>Opening Balance : {formatBDT(openingAtFrom)}</div>
        <div className="font-bold">
          Closing Balance as of {to ? formatDate(to) : formatDate(new Date().toISOString())} : {formatBDT(closingBalance)}
        </div>
      </div>
        </>
      ) : (
        <Card className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 shadow-sm rounded-2xl">
          <CardContent className="p-12 text-center">
            <FileText className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
            <p className="font-medium text-slate-700 dark:text-slate-200">No statement generated yet</p>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              Pick a date range above and click <strong>Generate</strong> to view your ledger statement here.
              Then use <strong>Print / Save as PDF</strong> to save a copy.
            </p>
          </CardContent>
        </Card>
      )}
      </div>

      {/* Printable statement — revealed ONLY in print via @media print.
          This is the EXACT SAME component the admin panel uses
          (`app/dashboard/_ledger-print/LedgerPrintStatement.tsx`), so the
          browser's "Save as PDF" output is pixel-identical to what an admin
          prints from `/dashboard/member-ledger`. Only rendered after the
          member clicks "Generate" so an accidental Ctrl+P doesn't print an
          empty statement. */}
      {generated && (
        <LedgerPrintStatement
          org={org}
          entity={{
            kind: "MEMBER",
            name: `${member.fullName} (${member.memberNo})`,
            phone: member.phone,
            email: member.email,
            address: member.address,
          }}
          period={periodLabel}
          columns={printColumns}
          openingCells={[
            "Opening balance", "", "", "", "", "", "",
            formatNumber(openingAtFrom),
          ]}
          rows={printRows}
          closingCells={[
            "Period totals", "", "", "", "",
            formatNumber(totals.debit),
            formatNumber(totals.credit),
            formatNumber(closingBalance),
          ]}
          footerLines={footerLines}
        />
      )}
    </div>
  )
}

// ─── Tab 3: Money Receipts ──────────────────────────────────────────────
function ReceiptsTab({ savings, member }: { savings: SavingsRow[]; member: MemberSummary }) {
  const eligible = savings.filter(isReceiptEligible)
  const ineligible = savings.filter((s) => !isReceiptEligible(s))

  return (
    <div className="space-y-6">
      {/* Header card with summary + policy note */}
      <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
            <Receipt className="h-4 w-4 text-emerald-500" />
            Money Receipt Vouchers
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Each approved deposit or withdrawal has a printable money-receipt voucher.
            Click <strong>View Receipt</strong> to open the voucher, then use
            <strong> Print / Save as PDF</strong> to save a copy — identical to what the admin prints.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400">
              <ArrowDownToLine className="h-3 w-3 mr-1" />
              {eligible.length} available
            </Badge>
            <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300">
              {savings.length} total transactions
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Eligible transactions table */}
      <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4 flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Approved Transactions
          </CardTitle>
          <span className="text-xs text-slate-400">{eligible.length} receipts available</span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-200/60 dark:border-slate-800/60 hover:bg-transparent">
                  <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Date</TableHead>
                  <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Voucher No</TableHead>
                  <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Type</TableHead>
                  <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Method</TableHead>
                  <TableHead className="px-6 py-3 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Amount</TableHead>
                  <TableHead className="px-6 py-3 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eligible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                      <div className="flex flex-col items-center gap-2">
                        <AlertCircle className="h-6 w-6 text-slate-300" />
                        <span>No approved deposit or withdrawal transactions yet.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  eligible.map((sav) => {
                    const mirror = sav.transactionMirror!
                    return (
                      <TableRow
                        key={sav.id}
                        className="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                      >
                        <TableCell className="px-6 py-3 text-sm text-slate-700 dark:text-slate-200">
                          {new Date(sav.date).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-6 py-3 text-sm font-mono text-slate-500">
                          {mirror.voucherNo}
                        </TableCell>
                        <TableCell className="px-6 py-3 text-sm">
                          <Badge
                            variant="outline"
                            className={
                              sav.type === "WITHDRAWAL"
                                ? SAVINGS_TYPE_STYLES.WITHDRAWAL
                                : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400"
                            }
                          >
                            {typeLabelFor(sav)}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-6 py-3 text-sm text-slate-500">
                          {sav.method || "—"}
                        </TableCell>
                        <TableCell className={`px-6 py-3 text-right font-bold text-sm ${sav.type === "WITHDRAWAL" ? "text-rose-600" : "text-emerald-600"}`}>
                          {sav.type === "WITHDRAWAL" ? "− " : "+ "}৳ {Number(sav.amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="px-6 py-3 text-right">
                          <Link href={`/portal/receipts/${mirror.id}`}>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                            >
                              <Receipt className="h-3.5 w-3.5" />
                              View Receipt
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Other transactions (no receipt available) — collapsed, low-emphasis */}
      {ineligible.length > 0 && (
        <Card className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 shadow-sm rounded-2xl overflow-hidden opacity-80">
          <CardHeader className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 px-6 py-4 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm text-slate-800 dark:text-white">
              <Lock className="h-4 w-4 text-slate-400" />
              Other Transactions
            </CardTitle>
            <span className="text-xs text-slate-400">{ineligible.length} records · no receipt available</span>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-slate-200/60 dark:border-slate-800/60 hover:bg-transparent">
                    <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Date</TableHead>
                    <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Receipt/Voucher</TableHead>
                    <TableHead className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Type</TableHead>
                    <TableHead className="px-6 py-3 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Amount</TableHead>
                    <TableHead className="px-6 py-3 text-right text-[11px] uppercase tracking-widest font-bold text-slate-400">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ineligible.map((sav) => {
                    const mirror = sav.transactionMirror
                    const status = mirror?.status || sav.type
                    return (
                      <TableRow
                        key={sav.id}
                        className="border-b border-slate-100 dark:border-slate-800/50 last:border-0"
                      >
                        <TableCell className="px-6 py-3 text-sm text-slate-700 dark:text-slate-200">
                          {new Date(sav.date).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="px-6 py-3 text-sm font-mono text-slate-500">
                          {sav.receiptNo || mirror?.voucherNo || "—"}
                        </TableCell>
                        <TableCell className="px-6 py-3 text-sm">
                          <Badge
                            variant="outline"
                            className={SAVINGS_TYPE_STYLES[sav.type] || "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300"}
                          >
                            {typeLabelFor(sav)}
                          </Badge>
                        </TableCell>
                        <TableCell className={`px-6 py-3 text-right font-bold text-sm ${sav.type === "WITHDRAWAL" ? "text-rose-600" : "text-emerald-600"}`}>
                          {sav.type === "WITHDRAWAL" ? "− " : "+ "}৳ {Number(sav.amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="px-6 py-3 text-right">
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                            <Lock className="h-3 w-3" />
                            {status}
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
