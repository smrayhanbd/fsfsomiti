"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { logTime, deleteTimeLog } from "@/app/actions/tasks"
import { toast } from "sonner"
import { Clock, Plus, Trash2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { TaskRow } from "@/app/actions/tasks"

export default function TimeLogPanel({ task }: { task: TaskRow }) {
  const [minutes, setMinutes] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  const totalMin = task.timeLogs.reduce((sum, l) => sum + l.minutes, 0)
  const hours = Math.floor(totalMin / 60)
  const mins = totalMin % 60

  const submit = async () => {
    const m = parseInt(minutes, 10)
    if (!m || m <= 0) {
      toast.error("Enter minutes")
      return
    }
    setBusy(true)
    const res = await logTime(task.id, m, note.trim() || undefined)
    setBusy(false)
    if (res.ok) {
      setMinutes("")
      setNote("")
      toast.success("Time logged")
    } else {
      toast.error("Failed", { description: res.error })
    }
  }

  const remove = async (id: string) => {
    const res = await deleteTimeLog(id)
    if (res.ok) toast.success("Entry removed")
    else toast.error("Failed", { description: res.error })
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Clock className="h-4 w-4 text-indigo-600" />
          Time Tracking
        </h3>
        <span className="text-xs text-slate-500">Total: {hours}h {mins}m</span>
      </div>
      <div className="space-y-1.5 mb-3 max-h-[200px] overflow-y-auto">
        {task.timeLogs.map((l) => (
          <div key={l.id} className="flex items-center gap-2 text-sm group">
            <span className="font-medium text-indigo-600 dark:text-indigo-400 w-14">{l.minutes}m</span>
            <span className="flex-1 text-slate-600 dark:text-slate-300 truncate">{l.note || "—"}</span>
            <span className="text-[11px] text-slate-400">{formatDistanceToNow(new Date(l.loggedAt), { addSuffix: true })}</span>
            <Button variant="ghost" size="icon-xs" onClick={() => remove(l.id)} className="opacity-0 group-hover:opacity-100">
              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
            </Button>
          </div>
        ))}
        {task.timeLogs.length === 0 && <p className="text-xs text-slate-400 py-2">No time logged yet.</p>}
      </div>
      <div className="grid grid-cols-[80px_1fr_auto] gap-2">
        <Input type="number" placeholder="Min" value={minutes} onChange={(e) => setMinutes(e.target.value)} disabled={busy} />
        <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
        <Button size="sm" onClick={submit} disabled={busy}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
