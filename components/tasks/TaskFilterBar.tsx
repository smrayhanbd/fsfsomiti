"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search, Filter } from "lucide-react"

interface FilterBarProps {
  basePath: string // e.g. "/dashboard/tasks"
}

const STATUSES = [
  { value: "ALL", label: "All statuses" },
  { value: "TODO", label: "To Do" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "DONE", label: "Done" },
  { value: "APPROVED", label: "Approved" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "CANCELLED", label: "Cancelled" },
]

const PRIORITIES = [
  { value: "ALL", label: "All priorities" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
]

export default function TaskFilterBar({ basePath }: FilterBarProps) {
  const router = useRouter()
  const params = useSearchParams()

  const update = useCallback(
    (key: string, value: string) => {
      const sp = new URLSearchParams(params.toString())
      if (!value || value === "ALL") sp.delete(key)
      else sp.set(key, value)
      const qs = sp.toString()
      router.push(qs ? `${basePath}?${qs}` : basePath)
    },
    [params, router, basePath]
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search tasks..."
          defaultValue={params.get("q") ?? ""}
          onChange={(e) => update("q", e.target.value)}
          className="pl-8"
        />
      </div>
      <div className="flex items-center gap-1.5 text-slate-500">
        <Filter className="h-4 w-4" />
      </div>
      <Select value={params.get("status") ?? "ALL"} onValueChange={(v) => update("status", v ?? "ALL")}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={params.get("priority") ?? "ALL"} onValueChange={(v) => update("priority", v ?? "ALL")}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          {PRIORITIES.map((p) => (
            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={params.get("overdue") ?? "ALL"} onValueChange={(v) => update("overdue", v === "true" ? "true" : "ALL")}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Due" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Any time</SelectItem>
          <SelectItem value="true">Overdue only</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
