"use client"

import { useMemo, useState } from "react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"

export type MemberStatusLite =
  | "PENDING"
  | "ACTIVE"
  | "INACTIVE"
  | "SUSPENDED"
  | "DECEASED"
  | "CLOSED"
  | "REJECTED"

export interface FlatMember {
  id: string
  memberNo: string
  fullName: string
  phone: string
  status: MemberStatusLite
}

interface MemberSelectProps {
  members: FlatMember[]
  value?: string
  onValueChange: (id: string) => void
  placeholder?: string
  /** Restrict the dropdown to members in these statuses (default: all). */
  restrictToStatuses?: MemberStatusLite[]
  className?: string
  /** Optional trailing content per item (e.g. a due badge). */
  renderMeta?: (m: FlatMember) => React.ReactNode
}

/**
 * Searchable member picker built on the base-ui Select, mirroring the
 * AccountSelect UX so member selection stays consistent across the app.
 * Searches across memberNo / fullName / phone.
 */
export default function MemberSelect({
  members,
  value,
  onValueChange,
  placeholder = "Select member",
  restrictToStatuses,
  className,
  renderMeta,
}: MemberSelectProps) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    let list = members
    if (restrictToStatuses?.length) {
      list = list.filter((m) => restrictToStatuses.includes(m.status))
    }
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (m) =>
          m.fullName.toLowerCase().includes(q) ||
          m.memberNo.toLowerCase().includes(q) ||
          m.phone?.toLowerCase().includes(q)
      )
    }
    return list
  }, [members, restrictToStatuses, query])

  const selected = members.find((m) => m.id === value)

  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(v ?? "")}
      items={filtered.map((m) => ({ label: m.fullName, value: m.id }))}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder}>
          {selected ? (
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs text-slate-400">
                {selected.memberNo}
              </span>
              <span className="truncate">{selected.fullName}</span>
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
              placeholder="Search by name, ID, or phone…"
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
            No members match
          </p>
        ) : (
          <SelectGroup>
            {filtered.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <span className="font-mono text-[11px] text-slate-400">
                  {m.memberNo}
                </span>
                <span className="truncate">{m.fullName}</span>
                {m.phone && (
                  <span className="text-[11px] text-slate-400">{m.phone}</span>
                )}
                {renderMeta && (
                  <span className="ml-auto text-[11px] text-slate-400">
                    {renderMeta(m)}
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  )
}
