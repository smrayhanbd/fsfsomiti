"use client"

import { formatDistanceToNow } from "date-fns"
import { History } from "lucide-react"

export interface ActivityEntry {
  id: string
  action: string
  summary: string
  createdAt: string
  actorUser?: { name: string | null; email: string } | null
  actorMember?: { fullName: string } | null
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-indigo-500",
  UPDATE: "bg-blue-500",
  STATUS_CHANGE: "bg-sky-500",
  APPROVE: "bg-emerald-500",
  REJECT: "bg-rose-500",
  COMMENT: "bg-violet-500",
  RECURRENCE_SPAWN: "bg-amber-500",
  OVERDUE_ESCALATION: "bg-orange-500",
}

export default function ActivityTimeline({ entries }: { entries: ActivityEntry[] }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
        <History className="h-4 w-4 text-indigo-600" /> Activity History
      </h3>
      <div className="space-y-3 max-h-[320px] overflow-y-auto">
        {entries.map((e) => {
          const actor = e.actorUser?.name ?? e.actorUser?.email ?? e.actorMember?.fullName ?? "System"
          return (
            <div key={e.id} className="flex gap-2.5">
              <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${ACTION_COLORS[e.action] ?? "bg-slate-400"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700 dark:text-slate-200">{e.summary}</p>
                <p className="text-[11px] text-slate-400">
                  {actor} · {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          )
        })}
        {entries.length === 0 && <p className="text-sm text-slate-400 py-2">No activity yet.</p>}
      </div>
    </div>
  )
}
