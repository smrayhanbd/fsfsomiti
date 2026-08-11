import { formatDate } from "@/lib/accounting"

interface AuditEvent {
  label: string
  by?: string | null
  at?: string | Date | null
  reason?: string | null
}

/**
 * Vertical timeline of a transaction's lifecycle (spec §18). Renders one node
 * per filled audit field, in chronological order. Unused events are skipped.
 */
export function AuditTrail({ events }: { events: AuditEvent[] }) {
  const filled = events.filter((e) => e.at)
  if (filled.length === 0) {
    return <p className="text-sm text-slate-400">No activity recorded yet.</p>
  }
  return (
    <ol className="relative border-l border-slate-200 dark:border-slate-700 ml-2 space-y-5">
      {filled.map((e, i) => (
        <li key={i} className="ml-4">
          <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-slate-900" />
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{e.label}</p>
          {e.by && (
            <p className="text-xs text-slate-500 dark:text-slate-400">by {e.by}</p>
          )}
          <p className="text-xs text-slate-400">{formatDate(e.at)}</p>
          {e.reason && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 italic">
              “{e.reason}”
            </p>
          )}
        </li>
      ))}
    </ol>
  )
}
