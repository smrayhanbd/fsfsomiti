"use client"

import { useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { addChecklistItem, toggleChecklistItem, deleteChecklistItem } from "@/app/actions/tasks"
import { toast } from "sonner"
import { Trash2, Plus, ListChecks } from "lucide-react"
import type { TaskRow } from "@/app/actions/tasks"

export default function ChecklistPanel({ task, basePath }: { task: TaskRow; basePath: string }) {
  const [title, setTitle] = useState("")
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (!title.trim()) return
    setBusy(true)
    const res = await addChecklistItem(task.id, title.trim())
    setBusy(false)
    if (res.ok) {
      setTitle("")
      toast.success("Checklist item added")
    } else {
      toast.error("Failed", { description: res.error })
    }
  }

  const toggle = async (itemId: string, checked: boolean) => {
    const res = await toggleChecklistItem(itemId, checked)
    if (!res.ok) toast.error("Failed", { description: res.error })
  }

  const remove = async (itemId: string) => {
    const res = await deleteChecklistItem(itemId)
    if (res.ok) toast.success("Item removed")
    else toast.error("Failed", { description: res.error })
  }

  const done = task.checklist.filter((c) => c.isDone).length
  const total = task.checklist.length
  const pct = total ? Math.round((done / total) * 100) : task.progressPct

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-indigo-600" />
          Checklist
        </h3>
        <span className="text-xs text-slate-500">{done}/{total} ({pct}%)</span>
      </div>
      {total > 0 && (
        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mb-3">
          <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="space-y-1.5 mb-3">
        {task.checklist.map((c) => (
          <div key={c.id} className="flex items-center gap-2 group">
            <Checkbox checked={c.isDone} onCheckedChange={(v) => toggle(c.id, !!v)} />
            <span className={`text-sm flex-1 ${c.isDone ? "line-through text-slate-400" : "text-slate-700 dark:text-slate-200"}`}>
              {c.title}
            </span>
            <Button variant="ghost" size="icon-xs" onClick={() => remove(c.id)} className="opacity-0 group-hover:opacity-100">
              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
            </Button>
          </div>
        ))}
        {total === 0 && (
          <p className="text-xs text-slate-400 py-2">No checklist items yet.</p>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Add a checklist item..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          disabled={busy}
        />
        <Button size="sm" onClick={add} disabled={busy || !title.trim()}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
    </div>
  )
}
