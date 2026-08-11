"use client"

import { useState, useMemo, useTransition, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { toast } from "sonner"
import {
  deleteAccount,
  toggleAccountStatus,
  type ActionResult,
} from "@/app/actions/accounts"
import AccountModal from "@/components/AccountModal"
import {
  Search,
  Download,
  Printer,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Wallet,
  Landmark,
  Scale,
  TrendingUp,
  TrendingDown,
  Banknote,
  Layers,
  Trash2,
  Edit,
  Plus,
  ListTree,
  FolderTree,
  Archive,
  Loader2,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  type LucideIcon,
} from "lucide-react"
import {
  ACCOUNT_TYPE_META,
  accountTypeMeta,
  computeSummary,
  flattenTree,
  formatBDT,
  humanizeEnum,
  type AccountNode,
  type AccountType,
  type AccountNature,
  type AccountStatus,
} from "@/lib/accounting"

// ---------------------------------------------------------------------------
// Small presentational helper for summary cards
// ---------------------------------------------------------------------------
interface StatCard {
  label: string
  value: string | number
  icon: LucideIcon
  text: string
  chip: string
  hint?: string
}

export default function ChartOfAccountsClient({
  accounts,
}: {
  accounts: AccountNode[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // --- UI state ---
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<AccountType | null>(null)
  const [statusFilter, setStatusFilter] = useState<AccountStatus | null>(null)
  const [natureFilter, setNatureFilter] = useState<AccountNature | null>(null)
  const [viewMode, setViewMode] = useState<"tree" | "grouped">("tree")
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Debounce the search input so typing stays smooth.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250)
    return () => clearTimeout(t)
  }, [searchInput])

  const flat = useMemo(() => flattenTree(accounts), [accounts])
  const byId = useMemo(() => {
    const m = new Map<string, AccountNode>()
    flat.forEach((a) => m.set(a.id, a))
    return m
  }, [flat])

  const summary = useMemo(() => computeSummary(accounts), [accounts])

  // --- Matching & expansion logic ---
  // A node matches if it satisfies the active search + filter chips.
  const matches = useCallback(
    (node: AccountNode) => {
      if (typeFilter && node.accountType !== typeFilter) return false
      if (statusFilter && node.status !== statusFilter) return false
      if (natureFilter && node.nature !== natureFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          node.accountName.toLowerCase().includes(q) ||
          node.accountCode.toLowerCase().includes(q)
        )
      }
      return true
    },
    [search, typeFilter, statusFilter, natureFilter]
  )

  // When a search/filter is active, compute the set of node ids that should be
  // visible = matching nodes + all of their ancestors.
  const visibleIds = useMemo(() => {
    if (!search && !typeFilter && !statusFilter && !natureFilter) return null
    const ids = new Set<string>()
    const collect = (node: AccountNode) => {
      if (matches(node)) {
        // include node + ancestors
        let cursor: AccountNode | undefined = node
        while (cursor) {
          ids.add(cursor.id)
          cursor = cursor.parentAccountId ? byId.get(cursor.parentAccountId) : undefined
        }
      }
      node.childAccounts?.forEach(collect)
    }
    accounts.forEach(collect)
    return ids
  }, [search, typeFilter, statusFilter, natureFilter, matches, accounts, byId])

  // When a filter is active, treat every visible node as expanded so matches
  // (and their ancestors) are shown. Derived during render instead of synced
  // through an effect to avoid cascading renders.
  const effectiveExpanded = visibleIds ?? expanded

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => setExpanded(new Set(flat.map((a) => a.id)))
  const collapseAll = () => setExpanded(new Set())

  const hasActiveFilters = !!(search || typeFilter || statusFilter || natureFilter)
  const clearFilters = () => {
    setSearchInput("")
    setSearch("")
    setTypeFilter(null)
    setStatusFilter(null)
    setNatureFilter(null)
  }

  // --- Actions ---
  const handleArchive = async (account: AccountNode) => {
    const verb = account.status === "ACTIVE" ? "deactivate" : "activate"
    if (!confirm(`${verb.charAt(0).toUpperCase() + verb.slice(1)} "${account.accountName}"?`)) return
    startTransition(async () => {
      const res: ActionResult = await toggleAccountStatus(account.id)
      if (res.ok) toast.success(`Account ${verb}d`)
      else toast.error("Action failed", { description: res.error })
    })
  }

  const handleDelete = async (account: AccountNode) => {
    if (
      !confirm(
        `Delete "${account.accountName}" (${account.accountCode})?\nThis cannot be undone.`
      )
    )
      return
    startTransition(async () => {
      const res: ActionResult = await deleteAccount(account.id)
      if (res.ok) {
        toast.success("Account deleted")
        setSelectedId(null)
      } else {
        toast.error("Cannot delete", { description: res.error })
      }
    })
  }

  const handleRefresh = () => {
    startTransition(() => router.refresh())
  }

  const handleExport = () => {
    const rows = [
      ["Code", "Name", "Type", "Nature", "Category", "Balance", "Currency", "Status"],
      ...flat.map((a) => [
        a.accountCode,
        a.accountName,
        a.accountType,
        a.nature,
        a.category || "",
        Number(a.currentBalance ?? 0).toFixed(2),
        a.currency,
        a.status,
      ]),
    ]
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "chart-of-accounts.csv"
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Exported CSV")
  }

  const selectedAccount = selectedId ? byId.get(selectedId) ?? null : null

  // Build the breadcrumb path for the selected account.
  const selectedPath = useMemo(() => {
    if (!selectedAccount) return []
    const path: AccountNode[] = []
    let cursor: AccountNode | undefined = selectedAccount
    while (cursor) {
      path.unshift(cursor)
      cursor = cursor.parentAccountId ? byId.get(cursor.parentAccountId) : undefined
    }
    return path
  }, [selectedAccount, byId])

  // --- Summary cards ---
  const statCards: StatCard[] = [
    {
      label: "Total Assets",
      value: formatBDT(summary.assets),
      icon: Wallet,
      text: "text-emerald-600 dark:text-emerald-400",
      chip: "bg-emerald-50 dark:bg-emerald-950/40",
      hint: "What you own",
    },
    {
      label: "Total Liabilities",
      value: formatBDT(summary.liabilities),
      icon: Landmark,
      text: "text-rose-600 dark:text-rose-400",
      chip: "bg-rose-50 dark:bg-rose-950/40",
      hint: "What you owe",
    },
    {
      label: "Total Equity",
      value: formatBDT(summary.equity),
      icon: Scale,
      text: "text-blue-600 dark:text-blue-400",
      chip: "bg-blue-50 dark:bg-blue-950/40",
      hint: "Net worth",
    },
    {
      label: "Total Income",
      value: formatBDT(summary.income),
      icon: TrendingUp,
      text: "text-green-600 dark:text-green-400",
      chip: "bg-green-50 dark:bg-green-950/40",
      hint: "Earnings",
    },
    {
      label: "Total Expenses",
      value: formatBDT(summary.expenses),
      icon: TrendingDown,
      text: "text-red-600 dark:text-red-400",
      chip: "bg-red-50 dark:bg-red-950/40",
      hint: "Spend",
    },
    {
      label: "Bank Accounts",
      value: summary.bankAccounts,
      icon: Banknote,
      text: "text-purple-600 dark:text-purple-400",
      chip: "bg-purple-50 dark:bg-purple-950/40",
    },
    {
      label: "Cash Accounts",
      value: summary.cashAccounts,
      icon: Wallet,
      text: "text-amber-600 dark:text-amber-400",
      chip: "bg-amber-50 dark:bg-amber-950/40",
    },
    {
      label: "Total Accounts",
      value: summary.totalAccounts,
      icon: Layers,
      text: "text-indigo-600 dark:text-indigo-400",
      chip: "bg-indigo-50 dark:bg-indigo-950/40",
      hint: `${summary.activeAccounts} active`,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card
            key={stat.label}
            className={`bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 ${stat.chip} shadow-sm hover:shadow-md rounded-2xl transition-shadow`}
          >
            <CardContent className="p-4 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-widest font-bold text-slate-500 dark:text-slate-400">
                  {stat.label}
                </span>
                <stat.icon className={`h-4 w-4 ${stat.text}`} />
              </div>
              <h3 className={`text-lg font-extrabold tracking-tight ${stat.text}`}>
                {stat.value}
              </h3>
              {stat.hint && (
                <p className="text-[11px] text-slate-400">{stat.hint}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl">
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by code or name…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 bg-white dark:bg-slate-950"
              />
            </div>

            {/* View toggle */}
            <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800/60 p-1">
              <button
                onClick={() => setViewMode("tree")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  viewMode === "tree"
                    ? "bg-white dark:bg-slate-950 text-indigo-600 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                <ListTree className="h-3.5 w-3.5" /> Tree
              </button>
              <button
                onClick={() => setViewMode("grouped")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  viewMode === "grouped"
                    ? "bg-white dark:bg-slate-950 text-indigo-600 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                <FolderTree className="h-3.5 w-3.5" /> Grouped
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handleExport}
                title="Export CSV"
                className="rounded-xl shadow-sm bg-white dark:bg-slate-950"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => window.print()}
                title="Print"
                className="rounded-xl shadow-sm bg-white dark:bg-slate-950"
              >
                <Printer className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleRefresh}
                disabled={isPending}
                title="Refresh"
                className="rounded-xl shadow-sm bg-white dark:bg-slate-950"
              >
                <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
              </Button>
              <AccountModal accounts={accounts} />
            </div>
          </div>

          {/* Filter chips row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mr-1">
              Type
            </span>
            {(Object.keys(ACCOUNT_TYPE_META) as AccountType[]).map((t) => {
              const meta = accountTypeMeta(t)
              const active = typeFilter === t
              return (
                <button
                  key={t}
                  onClick={() => setTypeFilter(active ? null : t)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                    active
                      ? `${meta.badge} ring-2 ring-offset-1 ring-offset-white dark:ring-offset-slate-950`
                      : "bg-white dark:bg-slate-950 text-slate-500 border-slate-200 dark:border-slate-800 hover:border-slate-300"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                  {meta.label}
                </button>
              )
            })}

            <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mx-1 ml-3">
              Status
            </span>
            {(["ACTIVE", "INACTIVE"] as AccountStatus[]).map((s) => {
              const active = statusFilter === s
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(active ? null : s)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                    active
                      ? s === "ACTIVE"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300"
                      : "bg-white dark:bg-slate-950 text-slate-500 border-slate-200 dark:border-slate-800 hover:border-slate-300"
                  }`}
                >
                  {humanizeEnum(s)}
                </button>
              )
            })}

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="ml-auto text-xs text-slate-500 h-7"
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Accounts view */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
        {/* Tree controls header */}
        {viewMode === "tree" && flat.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
            <p className="text-xs font-semibold text-slate-500">
              {visibleIds ? `${visibleIds.size} matching` : `${flat.length} accounts`}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={expandAll} className="h-7 text-xs">
                Expand all
              </Button>
              <Button variant="ghost" size="sm" onClick={collapseAll} className="h-7 text-xs">
                Collapse all
              </Button>
            </div>
          </div>
        )}

        {viewMode === "tree" ? (
          <TreeTable
            accounts={accounts}
            expanded={effectiveExpanded}
            visibleIds={visibleIds}
            onToggle={toggleExpand}
            onSelect={setSelectedId}
            selectedId={selectedId}
            level={0}
          />
        ) : (
          <GroupedView
            accounts={accounts}
            visibleIds={visibleIds}
            onSelect={setSelectedId}
          />
        )}
      </Card>

      {/* Detail sheet */}
      <AccountDetailSheet
        account={selectedAccount}
        path={selectedPath}
        open={!!selectedAccount}
        onOpenChange={(o) => !o && setSelectedId(null)}
        accounts={accounts}
        onArchive={handleArchive}
        onDelete={handleDelete}
        isPending={isPending}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tree table — renders the nested chart of accounts with guide lines
// ---------------------------------------------------------------------------
function TreeTable({
  accounts,
  expanded,
  visibleIds,
  onToggle,
  onSelect,
  selectedId,
  level,
}: {
  accounts: AccountNode[]
  expanded: Set<string>
  visibleIds: Set<string> | null
  onToggle: (id: string) => void
  onSelect: (id: string) => void
  selectedId: string | null
  level: number
}) {
  if (accounts.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/50 dark:border-slate-800/50">
          <tr>
            <th className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Code</th>
            <th className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Account Name</th>
            <th className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Type</th>
            <th className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Nature</th>
            <th className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">Balance</th>
            <th className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400 text-center">Status</th>
            <th className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => (
            <TreeRow
              key={account.id}
              account={account}
              expanded={expanded}
              visibleIds={visibleIds}
              onToggle={onToggle}
              onSelect={onSelect}
              selectedId={selectedId}
              level={level}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TreeRow({
  account,
  expanded,
  visibleIds,
  onToggle,
  onSelect,
  selectedId,
  level,
}: {
  account: AccountNode
  expanded: Set<string>
  visibleIds: Set<string> | null
  onToggle: (id: string) => void
  onSelect: (id: string) => void
  selectedId: string | null
  level: number
}) {
  const hasChildren = !!account.childAccounts?.length
  const isExpanded = expanded.has(account.id)
  const isSelected = selectedId === account.id
  // If a filter is active, only render this row if it's in the visible set.
  if (visibleIds && !visibleIds.has(account.id)) return null

  const meta = accountTypeMeta(account.accountType)

  return (
    <>
      <tr
        onClick={() => onSelect(account.id)}
        className={`border-b border-slate-100 dark:border-slate-800/60 cursor-pointer transition-colors ${
          isSelected
            ? "bg-indigo-50/60 dark:bg-indigo-950/30"
            : "hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
        }`}
      >
        {/* Code with expand toggle + guide lines */}
        <td className="px-6 py-3">
          <div className="flex items-center" style={{ paddingLeft: `${level * 22}px` }}>
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle(account.id)
                }}
                className="mr-1.5 p-0.5 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            ) : (
              <span
                className="mr-1.5 w-5 inline-flex justify-center"
                style={{ marginLeft: level > 0 ? 0 : 0 }}
              >
                {level > 0 && (
                  <span className="text-slate-300 dark:text-slate-700 select-none">└</span>
                )}
              </span>
            )}
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {account.accountCode}
            </span>
          </div>
        </td>

        {/* Name */}
        <td className="px-6 py-3">
          <div className="flex items-center gap-2">
            <span
              className={`font-medium ${
                hasChildren
                  ? "text-slate-900 dark:text-white font-semibold"
                  : "text-slate-700 dark:text-slate-200"
              }`}
            >
              {account.accountName}
            </span>
            {account.isBank && <MiniBadge color="purple" label="Bank" />}
            {account.isCash && <MiniBadge color="amber" label="Cash" />}
            {!account.allowPosting && <MiniBadge color="slate" label="Group" />}
          </div>
        </td>

        {/* Type */}
        <td className="px-6 py-3">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.badge}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        </td>

        {/* Nature */}
        <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">
          {humanizeEnum(account.nature)}
        </td>

        {/* Balance */}
        <td className="px-6 py-3 text-right">
          <span className="font-bold text-sm text-slate-900 dark:text-white tabular-nums">
            {formatBDT(account.currentBalance)}
          </span>
        </td>

        {/* Status */}
        <td className="px-6 py-3 text-center">
          {account.status === "ACTIVE" ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3" /> Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/10 text-slate-500 border border-slate-500/20">
              <XCircle className="w-3 h-3" /> Inactive
            </span>
          )}
        </td>

        {/* Actions */}
        <td className="px-6 py-3">
          <div
            className="flex items-center justify-end gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <AccountModal
              accounts={[]}
              editing={account}
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 hover:text-indigo-600"
                  title="Edit"
                >
                  <Edit className="h-4 w-4" />
                </Button>
              }
            />
            <AccountModal
              accounts={[]}
              presetParentId={account.id}
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 hover:text-indigo-600"
                  title="Add sub-account"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              }
            />
          </div>
        </td>
      </tr>

      {isExpanded &&
        hasChildren &&
        account.childAccounts!.map((child) => (
          <TreeRow
            key={child.id}
            account={child}
            expanded={expanded}
            visibleIds={visibleIds}
            onToggle={onToggle}
            onSelect={onSelect}
            selectedId={selectedId}
            level={level + 1}
          />
        ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Grouped view — flat list grouped by account type
// ---------------------------------------------------------------------------
function GroupedView({
  accounts,
  visibleIds,
  onSelect,
}: {
  accounts: AccountNode[]
  visibleIds: Set<string> | null
  onSelect: (id: string) => void
}) {
  const flat = flattenTree(accounts)
  const filtered = visibleIds ? flat.filter((a) => visibleIds.has(a.id)) : flat

  const grouped = (Object.keys(ACCOUNT_TYPE_META) as AccountType[])
    .map((type) => ({
      type,
      items: filtered.filter((a) => a.accountType === type),
    }))
    .filter((g) => g.items.length > 0)

  if (filtered.length === 0) return <EmptyState />

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
      {grouped.map(({ type, items }) => {
        const meta = accountTypeMeta(type)
        const total = items.reduce((s, a) => s + Number(a.currentBalance ?? 0), 0)
        return (
          <div key={type} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
                <h3 className={`text-sm font-bold ${meta.text}`}>{meta.label}</h3>
                <span className="text-xs text-slate-400">({items.length})</span>
              </div>
              <span className={`text-sm font-bold tabular-nums ${meta.text}`}>
                {formatBDT(total)}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {items.map((a) => (
                <button
                  key={a.id}
                  onClick={() => onSelect(a.id)}
                  className={`text-left flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-all hover:shadow-sm ${
                    a.status === "INACTIVE"
                      ? "bg-slate-50/50 dark:bg-slate-900/30 border-slate-200/50 dark:border-slate-800/50 opacity-70"
                      : `bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300`
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-slate-400">
                        {a.accountCode}
                      </span>
                      {a.isBank && <MiniBadge color="purple" label="B" />}
                      {a.isCash && <MiniBadge color="amber" label="C" />}
                    </div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                      {a.accountName}
                    </p>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white shrink-0">
                    {formatBDT(a.currentBalance)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail sheet — slide-over with full account info & quick actions
// ---------------------------------------------------------------------------
function AccountDetailSheet({
  account,
  path,
  open,
  onOpenChange,
  accounts,
  onArchive,
  onDelete,
  isPending,
}: {
  account: AccountNode | null
  path: AccountNode[]
  open: boolean
  onOpenChange: (o: boolean) => void
  accounts: AccountNode[]
  onArchive: (a: AccountNode) => void
  onDelete: (a: AccountNode) => void
  isPending: boolean
}) {
  if (!account) return null
  const meta = accountTypeMeta(account.accountType)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg bg-white dark:bg-slate-950 p-0 overflow-y-auto"
      >
        {/* Coloured header */}
        <div className={`${meta.chip} px-5 pt-6 pb-5 border-b border-slate-200/60 dark:border-slate-800/60`}>
          {/* Breadcrumb */}
          <div className="flex items-center flex-wrap gap-1 text-[11px] text-slate-500 mb-3">
            {path.map((node, i) => (
              <span key={node.id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3" />}
                <span className="font-mono">{node.accountCode}</span>
              </span>
            ))}
          </div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.badge}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                  {meta.label}
                </span>
                {account.status === "ACTIVE" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                    <CheckCircle2 className="w-3 h-3" /> Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                    <XCircle className="w-3 h-3" /> Inactive
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {account.accountName}
              </h2>
            </div>
          </div>
          {/* Balance highlight */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/70 dark:bg-slate-900/60 p-3">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                Current Balance
              </p>
              <p className={`text-lg font-extrabold ${meta.text} tabular-nums`}>
                {formatBDT(account.currentBalance)}
              </p>
            </div>
            <div className="rounded-xl bg-white/70 dark:bg-slate-900/60 p-3">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                Opening Balance
              </p>
              <p className="text-lg font-extrabold text-slate-700 dark:text-slate-200 tabular-nums">
                {formatBDT(account.openingBalance)}
              </p>
            </div>
          </div>
        </div>

        {/* Attributes */}
        <div className="p-5 space-y-5">
          <DetailGrid account={account} />

          {/* Flags */}
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2">
              Attributes
            </p>
            <div className="flex flex-wrap gap-2">
              <AttrTag on={account.isBank} label="Bank Account" />
              <AttrTag on={account.isCash} label="Cash Account" />
              <AttrTag on={account.allowPosting} label="Posting Allowed" />
              <AttrTag on={account.allowJournal} label="Journal Allowed" />
              <AttrTag on={account.taxDeductible ?? false} label="Tax Deductible" />
            </div>
          </div>

          {account.description && (
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1">
                Description
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {account.description}
              </p>
            </div>
          )}

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Link href={`/dashboard/account-ledger?accountId=${account.id}`}>
              <Button variant="outline" className="w-full">
                <FileSpreadsheet className="mr-2 h-4 w-4" /> View Ledger
              </Button>
            </Link>
            <AccountModal
              accounts={accounts}
              editing={account}
              trigger={
                <Button variant="outline" className="w-full">
                  <Edit className="mr-2 h-4 w-4" /> Edit
                </Button>
              }
            />
            <AccountModal
              accounts={accounts}
              presetParentId={account.id}
              trigger={
                <Button variant="outline" className="w-full">
                  <Plus className="mr-2 h-4 w-4" /> Sub-account
                </Button>
              }
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onArchive(account)}
              disabled={isPending}
            >
              <Archive className="mr-2 h-4 w-4" />
              {account.status === "ACTIVE" ? "Deactivate" : "Activate"}
            </Button>
            <Button
              variant="outline"
              className="w-full col-span-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/30 border-rose-200 dark:border-rose-900/50"
              onClick={() => onDelete(account)}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete Account
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function DetailGrid({ account }: { account: AccountNode }) {
  const rows = [
    { label: "Account Code", value: account.accountCode, mono: true },
    { label: "Type", value: accountTypeMeta(account.accountType).label },
    { label: "Nature", value: humanizeEnum(account.nature) },
    { label: "Category", value: account.category || "—" },
    { label: "Currency", value: account.currency },
    { label: "Status", value: humanizeEnum(account.status) },
  ]
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
            {r.label}
          </p>
          <p
            className={`text-sm font-medium text-slate-700 dark:text-slate-200 ${
              r.mono ? "font-mono" : ""
            }`}
          >
            {r.value}
          </p>
        </div>
      ))}
    </div>
  )
}

function AttrTag({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border ${
        on
          ? "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900/50"
          : "bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-900/40 dark:border-slate-800"
      }`}
    >
      {on ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Small bits
// ---------------------------------------------------------------------------
function MiniBadge({
  color,
  label,
}: {
  color: "purple" | "amber" | "slate"
  label: string
}) {
  const styles = {
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
    slate: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  }
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${styles[color]}`}
    >
      {label}
    </span>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-16 text-slate-500">
      <Layers className="h-12 w-12 mx-auto mb-3 text-slate-300" />
      <p className="font-medium text-slate-600 dark:text-slate-300">No accounts found</p>
      <p className="text-sm">Adjust your filters or create your first ledger account.</p>
    </div>
  )
}
