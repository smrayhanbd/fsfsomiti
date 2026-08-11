import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { TASK_STATUS_META, TASK_PRIORITY_META } from "@/components/tasks/badges"
import type { TaskRow } from "@/app/actions/tasks"
import { format, isPast } from "date-fns"
import { AlertTriangle, CalendarClock, Plus, CheckSquare } from "lucide-react"

interface LinkedTasksPanelProps {
  tasks: TaskRow[]
  /** URL to create a task pre-linked to this record. */
  createHref: string
  title?: string
}

/**
 * Bi-directional task display for record detail pages (loan, meeting, request,
 * transaction). Shows tasks linked to the record and a "create follow-up"
 * button that opens the task form with the record pre-selected.
 */
export default function LinkedTasksPanel({ tasks, createHref, title = "Linked Tasks" }: LinkedTasksPanelProps) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-indigo-600" /> {title}
          <Badge variant="outline" className="text-[10px]">{tasks.length}</Badge>
        </h3>
        <Link href={createHref} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">
          <Plus className="h-3.5 w-3.5" /> Follow-up
        </Link>
      </div>
      <div className="space-y-2">
        {tasks.length === 0 && (
          <p className="text-xs text-slate-400 py-2">No tasks linked to this record yet.</p>
        )}
        {tasks.map((t) => {
          const due = t.dueDate ? new Date(t.dueDate) : null
          const overdue = due && isPast(due) && !["DONE", "APPROVED", "CANCELLED"].includes(t.status)
          return (
            <Link
              key={t.id}
              href={`/dashboard/tasks/${t.id}`}
              className="block rounded-lg border border-slate-100 dark:border-slate-800 p-2.5 hover:border-indigo-200 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-slate-900 dark:text-white line-clamp-1">{t.title}</span>
                <Badge variant="outline" className={`text-[10px] shrink-0 ${TASK_STATUS_META[t.status]?.badge}`}>
                  {TASK_STATUS_META[t.status]?.label ?? t.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={`text-[10px] ${TASK_PRIORITY_META[t.priority]?.badge}`}>
                  {TASK_PRIORITY_META[t.priority]?.label ?? t.priority}
                </Badge>
                {due && (
                  <span className={`text-[11px] inline-flex items-center gap-0.5 ${overdue ? "text-rose-600 font-medium" : "text-slate-400"}`}>
                    {overdue ? <AlertTriangle className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
                    {format(due, "MMM d")}
                  </span>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
