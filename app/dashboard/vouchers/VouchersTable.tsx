"use client"

import { useState, useMemo, useTransition, Fragment } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { postJournalEntry, deleteJournalEntry } from "@/app/actions/journal"
import {
  formatBDT,
  formatDate,
  VOUCHER_TYPE_LABELS,
  type VoucherType,
  type JournalStatus,
} from "@/lib/accounting"
import {
  Search,
  Plus,
  ChevronDown,
  ChevronRight,
  Trash2,
  CheckCircle2,
  FileText,
  Banknote,
  ArrowRightLeft,
  ScrollText,
  Printer,
  Loader2,
  Filter,
} from "lucide-react"

interface VoucherLine {
  id: string
  accountId: string
  debit: number | string
  credit: number | string
  memo: string | null
  account: { accountCode: string; accountName: string }
}

interface VoucherEntry {
  id: string
  voucherNo: string
  voucherType: VoucherType
  entryDate: string
  narration: string
  referenceNo: string | null
  status: JournalStatus
  totalDebit: number | string
  totalCredit: number | string
  member?: { fullName: string; memberNo: string } | null
  lines: VoucherLine[]
}

const TYPE_ICON: Record<VoucherType, typeof FileText> = {
  JOURNAL: ScrollText,
  RECEIPT: Banknote,
  PAYMENT: FileText,
  CONTRA: ArrowRightLeft,
}

const TYPE_BADGE: Record<VoucherType, string> = {
  JOURNAL: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
  RECEIPT: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400",
  PAYMENT: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400",
  CONTRA: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400",
}

export default function VouchersTable({ entries }: { entries: VoucherEntry[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<VoucherType | "ALL">("ALL")
  const [statusFilter, setStatusFilter] = useState<JournalStatus | "ALL">("ALL")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (typeFilter !== "ALL" && e.voucherType !== typeFilter) return false
      if (statusFilter !== "ALL" && e.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const inLines = e.lines.some(
          (l) =>
            l.account.accountName.toLowerCase().includes(q) ||
            l.account.accountCode.toLowerCase().includes(q)
        )
        return (
          e.voucherNo.toLowerCase().includes(q) ||
          e.narration.toLowerCase().includes(q) ||
          (e.referenceNo ?? "").toLowerCase().includes(q) ||
          inLines
        )
      }
      return true
    })
  }, [entries, search, typeFilter, statusFilter])

  const stats = useMemo(() => {
    return {
      total: entries.length,
      posted: entries.filter((e) => e.status === "POSTED").length,
      drafts: entries.filter((e) => e.status === "DRAFT").length,
      value: entries
        .filter((e) => e.status === "POSTED")
        .reduce((s, e) => s + Number(e.totalDebit ?? 0), 0),
    }
  }, [entries])

  const handlePost = async (id: string, voucherNo: string) => {
    if (!confirm(`Post voucher ${voucherNo}? This will update account balances.`)) return
    startTransition(async () => {
      const res = await postJournalEntry(id)
      if (res.ok) {
        toast.success("Voucher posted", { description: voucherNo })
        router.refresh()
      } else {
        toast.error("Could not post", { description: res.error })
      }
    })
  }

  const handleDelete = async (id: string, voucherNo: string) => {
    if (!confirm(`Delete draft voucher ${voucherNo}?`)) return
    startTransition(async () => {
      const res = await deleteJournalEntry(id)
      if (res.ok) {
        toast.success("Draft deleted")
        router.refresh()
      } else {
        toast.error("Cannot delete", { description: res.error })
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* Mini stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Total Vouchers" value={stats.total} />
        <MiniStat label="Posted" value={stats.posted} tone="text-emerald-600" />
        <MiniStat label="Drafts" value={stats.drafts} tone="text-amber-600" />
        <MiniStat label="Posted Value" value={formatBDT(stats.value)} tone="text-indigo-600" />
      </div>

      {/* Toolbar */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl">
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search voucher no., narration, account…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white dark:bg-slate-950"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as VoucherType | "ALL")}>
              <SelectTrigger className="w-36 bg-white dark:bg-slate-950">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                <SelectItem value="JOURNAL">Journal</SelectItem>
                <SelectItem value="RECEIPT">Receipt</SelectItem>
                <SelectItem value="PAYMENT">Payment</SelectItem>
                <SelectItem value="CONTRA">Contra</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as JournalStatus | "ALL")}>
              <SelectTrigger className="w-32 bg-white dark:bg-slate-950">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="POSTED">Posted</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
              </SelectContent>
            </Select>
            <Link href="/dashboard/voucher-entry">
              <Button className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="mr-2 h-4 w-4" /> New Voucher
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-800/50 hover:bg-transparent">
              <TableHead className="w-10"></TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                Voucher
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                Date
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400">
                Narration
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                Amount
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-center">
                Status
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-16 text-slate-500">
                  <FileText className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                  <p className="font-medium">No vouchers found</p>
                  <p className="text-sm">Create your first voucher to get started.</p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((e) => {
                const isOpen = expanded.has(e.id)
                const Icon = TYPE_ICON[e.voucherType]
                return (
                  <Fragment key={e.id}>
                    <TableRow
                      className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 cursor-pointer"
                      onClick={() => toggle(e.id)}
                    >
                      <TableCell className="text-slate-400">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <Icon className="h-4 w-4 text-slate-500" />
                          </div>
                          <div>
                            <p className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                              {e.voucherNo}
                            </p>
                            <Badge
                              variant="outline"
                              className={`text-[9px] px-1.5 py-0 ${TYPE_BADGE[e.voucherType]}`}
                            >
                              {VOUCHER_TYPE_LABELS[e.voucherType]}
                            </Badge>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {formatDate(e.entryDate)}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="text-sm text-slate-700 dark:text-slate-200 truncate">
                          {e.narration}
                        </p>
                        {e.member && (
                          <p className="text-[11px] text-slate-400">
                            {e.member.memberNo} · {e.member.fullName}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatBDT(e.totalDebit)}
                      </TableCell>
                      <TableCell className="text-center">
                        {e.status === "POSTED" ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Posted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                            Draft
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          {e.status === "DRAFT" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                disabled={isPending}
                                onClick={() => handlePost(e.id, e.voucherNo)}
                              >
                                {isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                )}
                                Post
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                disabled={isPending}
                                onClick={() => handleDelete(e.id, e.voucherNo)}
                                title="Delete draft"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-slate-700"
                            onClick={() => window.print()}
                            title="Print"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-slate-50/60 dark:bg-slate-900/40">
                        <TableCell colSpan={7} className="py-3">
                          <div className="ml-10 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-950">
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
                                {e.lines.map((l) => (
                                  <tr
                                    key={l.id}
                                    className="border-t border-slate-100 dark:border-slate-800/60"
                                  >
                                    <td className="px-3 py-2">
                                      <span className="font-mono text-xs text-slate-400 mr-2">
                                        {l.account.accountCode}
                                      </span>
                                      <span className="text-slate-700 dark:text-slate-200">
                                        {l.account.accountName}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-slate-400 text-xs">
                                      {l.memo || "—"}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200">
                                      {Number(l.debit) > 0 ? formatBDT(l.debit) : "—"}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200">
                                      {Number(l.credit) > 0 ? formatBDT(l.credit) : "—"}
                                    </td>
                                  </tr>
                                ))}
                                <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-bold">
                                  <td className="px-3 py-2" colSpan={2}>
                                    Total
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {formatBDT(e.totalDebit)}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {formatBDT(e.totalCredit)}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                            {e.referenceNo && (
                              <p className="px-3 py-2 text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800/60">
                                Reference: <span className="font-mono">{e.referenceNo}</span>
                              </p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

function MiniStat({
  label,
  value,
  tone = "text-slate-900 dark:text-white",
}: {
  label: string
  value: string | number
  tone?: string
}) {
  return (
    <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
      <CardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
          {label}
        </p>
        <p className={`text-lg font-extrabold tabular-nums ${tone}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
