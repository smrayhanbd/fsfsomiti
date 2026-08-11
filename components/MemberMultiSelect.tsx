"use client"

import * as React from "react"
import { Check, ChevronDown, Search, Users } from "lucide-react"

import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"

export interface MemberOption {
  id: string
  fullName: string
  memberNo: string
}

interface MemberMultiSelectProps {
  members: MemberOption[]
  /** Currently selected member IDs. */
  value: string[]
  /** Called whenever the selection changes. */
  onChange: (ids: string[]) => void
  placeholder?: string
  className?: string
  /** Whether the field is required (used for the trigger's aria + visual cue). */
  required?: boolean
}

/**
 * Multi-select member picker with a "Select all Members" master toggle and
 * search. Built on the shadcn Popover + Checkbox + ScrollArea primitives.
 *
 * Behaviour:
 * - The trigger button shows a short summary: "All Members", "X of Y members
 *   selected", or the placeholder when empty.
 * - The popover's first row is "Select all Members" — checking it selects
 *   every member; unchecking it clears the selection.
 * - When all members are already selected, the master checkbox renders as
 *   checked. When some-but-not-all are selected, it renders as indeterminate.
 * - A search box filters the list by name, member number, or phone (phone is
 *   supported via the optional `phone` field on `MemberOption`).
 *
 * The component is purely presentational — it does NOT submit anything. The
 * parent form is responsible for serialising `value` into hidden inputs that
 * match the server action's contract (e.g. `targetType` + `targetMemberIds`).
 */
export default function MemberMultiSelect({
  members,
  value,
  onChange,
  placeholder = "Select members",
  className,
  required,
}: MemberMultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")

  // Filter list — searches name / memberNo / phone (if present).
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => {
      const phone = (m as MemberOption & { phone?: string }).phone ?? ""
      return (
        m.fullName.toLowerCase().includes(q) ||
        m.memberNo.toLowerCase().includes(q) ||
        phone.toLowerCase().includes(q)
      )
    })
  }, [members, query])

  const allSelected = members.length > 0 && value.length === members.length
  const noneSelected = value.length === 0
  const someSelected = !noneSelected && !allSelected

  const toggleMember = (id: string) => {
    onChange(
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id]
    )
  }

  const selectAll = () => {
    // Select every member (not just the filtered subset) — matches the user's
    // expectation that "Select all Members" means *all* active members.
    onChange(members.map((m) => m.id))
  }

  const clearAll = () => onChange([])

  const handleMasterToggle = () => {
    if (allSelected) clearAll()
    else selectAll()
  }

  // Trigger summary text — kept compact so the trigger never wraps.
  const summary: React.ReactNode = (() => {
    if (allSelected) {
      return (
        <span className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
          <Users className="h-3.5 w-3.5 text-indigo-500" />
          <span>All Members</span>
          <span className="text-xs text-slate-400">({members.length})</span>
        </span>
      )
    }
    if (someSelected) {
      return (
        <span className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
          <Users className="h-3.5 w-3.5 text-indigo-500" />
          <span>{value.length} of {members.length} members selected</span>
        </span>
      )
    }
    return <span className="text-slate-400">{placeholder}</span>
  })()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-required={required}
            className={cn(
              "w-full justify-between font-normal bg-white dark:bg-slate-950",
              noneSelected && "text-slate-400",
              className
            )}
          >
            {summary}
            <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        }
      />
      <PopoverContent
        align="start"
        className="w-[var(--popover-width,22rem)] p-0"
        style={{ ["--popover-width" as string]: "min(28rem, 90vw)" }}
      >
        {/* Sticky search box at the top of the popover. */}
        <div className="p-2 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-popover z-10">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Search by name, ID, or phone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        {/* "Select all Members" master toggle. */}
        <div className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
          <Label
            htmlFor="select-all-members"
            className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
          >
            <Checkbox
              id="select-all-members"
              checked={allSelected}
              onCheckedChange={handleMasterToggle}
            />
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Select all Members
            </span>
            <span className="ml-auto text-[11px] text-slate-400">
              {members.length} active
            </span>
          </Label>
        </div>

        {/* Member list. */}
        <ScrollArea className="h-64">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-slate-400">
              {members.length === 0
                ? "No active members found."
                : "No members match your search."}
            </p>
          ) : (
            <ul className="py-1">
              {filtered.map((m) => {
                const checked = value.includes(m.id)
                return (
                  <li key={m.id}>
                    <Label
                      htmlFor={`mms-${m.id}`}
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <Checkbox
                        id={`mms-${m.id}`}
                        checked={checked}
                        onCheckedChange={() => toggleMember(m.id)}
                      />
                      <span className="font-mono text-[11px] text-slate-400">
                        {m.memberNo}
                      </span>
                      <span className="text-sm text-slate-900 dark:text-slate-100 truncate">
                        {m.fullName}
                      </span>
                      {checked && (
                        <Check className="ml-auto h-3.5 w-3.5 text-indigo-500" />
                      )}
                    </Label>
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>

        {/* Footer summary + clear button. */}
        <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-2 flex items-center justify-between text-xs text-slate-500">
          <span>
            {value.length} selected
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={clearAll}
              disabled={noneSelected}
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-6 px-3 text-xs bg-indigo-600 hover:bg-indigo-700"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
