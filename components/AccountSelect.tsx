"use client"

import { useMemo, useState } from "react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
  ACCOUNT_TYPE_META,
  type AccountNode,
  type AccountType,
} from "@/lib/accounting"
import { Search } from "lucide-react"

export interface FlatAccount {
  id: string
  accountCode: string
  accountName: string
  accountType: AccountType
  /** Optional depth used to indent nested accounts in the list. */
  depth?: number
  /** Optional posting flag carried over from the full Account node. */
  allowPosting?: boolean
  /** Marks a Cash Drawer / Main Cash / Petty Cash account. */
  isCash?: boolean
  /** Marks a Bank account. */
  isBank?: boolean
  /** Optional current balance for display in selectors. */
  currentBalance?: number | string
}

interface AccountSelectProps {
  accounts: FlatAccount[]
  value?: string
  onValueChange: (id: string) => void
  placeholder?: string
  /** When provided, only accounts whose type is in this list are shown. */
  restrictToTypes?: AccountType[]
  /** Hide accounts that don't allow direct posting (group headers). */
  postingOnly?: boolean
  className?: string
  /** Optional render of extra trailing content per item (e.g. balance). */
  renderMeta?: (a: FlatAccount) => React.ReactNode
}

/**
 * Searchable, type-grouped account picker built on the base-ui Select.
 * Used by Voucher Entry, Account Ledger, and Financial Statements so the
 * account-selection UX stays consistent everywhere.
 */
export default function AccountSelect({
  accounts,
  value,
  onValueChange,
  placeholder = "Select account",
  restrictToTypes,
  postingOnly,
  className,
  renderMeta,
}: AccountSelectProps) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    let list = accounts
    if (restrictToTypes?.length) {
      list = list.filter((a) => restrictToTypes.includes(a.accountType))
    }
    if (postingOnly) {
      // Posting-only flag isn't always present on the flat type; if absent,
      // fall back to showing everything.
      list = list.filter((a) => a.allowPosting !== false)
    }
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(
        (a) =>
          a.accountName.toLowerCase().includes(q) ||
          a.accountCode.toLowerCase().includes(q)
      )
    }
    return list
  }, [accounts, restrictToTypes, postingOnly, query])

  // Group the filtered accounts by type for visual structure.
  const grouped = useMemo(() => {
    const map = new Map<AccountType, FlatAccount[]>()
    for (const a of filtered) {
      const arr = map.get(a.accountType) ?? []
      arr.push(a)
      map.set(a.accountType, arr)
    }
    return map
  }, [filtered])

  const selected = accounts.find((a) => a.id === value)

  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(v ?? "")}
      items={filtered.map((a) => ({ label: a.accountName, value: a.id }))}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder}>
          {selected ? (
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs text-slate-400">
                {selected.accountCode}
              </span>
              <span className="truncate">{selected.accountName}</span>
            </span>
          ) : (
            placeholder
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-[20rem]">
        {/* Sticky search box inside the dropdown */}
        <div className="p-2 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-popover z-10">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Search account…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // Prevent the select from closing when typing.
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-slate-400">
            No accounts match
          </p>
        ) : (
          (Object.keys(ACCOUNT_TYPE_META) as AccountType[])
            .filter((t) => grouped.has(t))
            .map((type) => {
              const meta = ACCOUNT_TYPE_META[type]
              const items = grouped.get(type)!
              return (
                <SelectGroup key={type}>
                  <SelectLabel className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                    {meta.label} ({items.length})
                  </SelectLabel>
                  {items.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span
                        className="font-mono text-[11px] text-slate-400"
                        style={{ paddingLeft: (a.depth ?? 0) * 10 }}
                      >
                        {a.accountCode}
                      </span>
                      <span className="truncate">{a.accountName}</span>
                      {renderMeta && (
                        <span className="ml-auto text-[11px] text-slate-400">
                          {renderMeta(a)}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )
            })
        )}
      </SelectContent>
    </Select>
  )
}
