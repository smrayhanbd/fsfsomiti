// Visual vocab for task statuses + priorities — shared across the dashboard
// list/kanban/calendar and the member portal.

export const TASK_STATUS_META: Record<
  string,
  { label: string; badge: string; dot: string; column?: boolean }
> = {
  TODO: { label: "To Do", badge: "bg-slate-500/10 text-slate-600 border-slate-500/20", dot: "bg-slate-400", column: true },
  IN_PROGRESS: { label: "In Progress", badge: "bg-blue-500/10 text-blue-600 border-blue-500/20", dot: "bg-blue-500", column: true },
  ON_HOLD: { label: "On Hold", badge: "bg-amber-500/10 text-amber-600 border-amber-500/20", dot: "bg-amber-500", column: true },
  IN_REVIEW: { label: "In Review", badge: "bg-violet-500/10 text-violet-600 border-violet-500/20", dot: "bg-violet-500", column: true },
  DONE: { label: "Done", badge: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", dot: "bg-emerald-500", column: true },
  APPROVED: { label: "Approved", badge: "bg-teal-500/10 text-teal-700 border-teal-500/20", dot: "bg-teal-600", column: true },
  CANCELLED: { label: "Cancelled", badge: "bg-rose-500/10 text-rose-600 border-rose-500/20", dot: "bg-rose-500" },
}

export const TASK_PRIORITY_META: Record<string, { label: string; badge: string }> = {
  LOW: { label: "Low", badge: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
  MEDIUM: { label: "Medium", badge: "bg-sky-500/10 text-sky-600 border-sky-500/20" },
  HIGH: { label: "High", badge: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
  URGENT: { label: "Urgent", badge: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
}

// Kanban column order — matches the typical left-to-right workflow.
export const KANBAN_COLUMNS = ["TODO", "IN_PROGRESS", "ON_HOLD", "IN_REVIEW", "DONE", "APPROVED"]

export function statusLabel(s: string): string {
  return TASK_STATUS_META[s]?.label ?? s
}
export function priorityLabel(p: string): string {
  return TASK_PRIORITY_META[p]?.label ?? p
}
