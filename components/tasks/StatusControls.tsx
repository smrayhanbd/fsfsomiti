"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateTaskStatus, approveTask, rejectTask } from "@/app/actions/tasks"
import { toast } from "sonner"
import { TASK_STATUS_META } from "@/components/tasks/badges"
import { CheckCircle2, XCircle, ArrowRightCircle } from "lucide-react"
import type { TaskRow } from "@/app/actions/tasks"

interface StatusControlsProps {
  task: TaskRow
  canApprove: boolean
  isMember: boolean
}

const STAFF_STATUSES = ["TODO", "IN_PROGRESS", "ON_HOLD", "IN_REVIEW", "DONE", "APPROVED", "CANCELLED"]
const MEMBER_STATUSES = ["TODO", "IN_PROGRESS", "ON_HOLD", "IN_REVIEW", "DONE"]

export default function StatusControls({ task, canApprove, isMember }: StatusControlsProps) {
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const statuses = isMember ? MEMBER_STATUSES : STAFF_STATUSES

  const changeStatus = async (status: string) => {
    setBusy(true)
    const res = await updateTaskStatus(task.id, status, note.trim() || undefined)
    setBusy(false)
    if (res.ok) {
      setNote("")
      toast.success(`Status updated to ${TASK_STATUS_META[status]?.label ?? status}`)
    } else {
      toast.error("Failed", { description: res.error })
    }
  }

  const approve = async () => {
    setBusy(true)
    const res = await approveTask(task.id, note.trim() || undefined)
    setBusy(false)
    if (res.ok) {
      setNote("")
      toast.success("Task approved")
    } else {
      toast.error("Failed", { description: res.error })
    }
  }

  const reject = async () => {
    if (!note.trim()) {
      toast.error("Please add a reason in the note field before rejecting.")
      return
    }
    setBusy(true)
    const res = await rejectTask(task.id, note.trim())
    setBusy(false)
    if (res.ok) {
      setNote("")
      toast.success("Completion rejected for rework")
    } else {
      toast.error("Failed", { description: res.error })
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Status & Approval</h3>

      {/* Quick-action buttons */}
      <div className="flex flex-wrap gap-2">
        {task.status !== "APPROVED" && task.status !== "CANCELLED" && (
          <>
            {!isMember && (
              <Button size="sm" variant="outline" onClick={() => changeStatus("IN_PROGRESS")} disabled={busy}>
                <ArrowRightCircle className="h-4 w-4" /> Start
              </Button>
            )}
            {task.requiresApproval && task.status !== "IN_REVIEW" ? (
              <Button size="sm" onClick={() => changeStatus("DONE")} disabled={busy}>
                <CheckCircle2 className="h-4 w-4" /> Mark Done (Request Approval)
              </Button>
            ) : (
              <Button size="sm" variant="default" onClick={() => changeStatus("DONE")} disabled={busy}>
                <CheckCircle2 className="h-4 w-4" /> Mark Done
              </Button>
            )}
          </>
        )}
        {canApprove && task.status === "IN_REVIEW" && (
          <>
            <Button size="sm" variant="default" onClick={approve} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <CheckCircle2 className="h-4 w-4" /> Approve
            </Button>
            <Button size="sm" variant="destructive" onClick={reject} disabled={busy}>
              <XCircle className="h-4 w-4" /> Reject
            </Button>
          </>
        )}
      </div>

      {/* Manual status select */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Set status:</span>
        <Select defaultValue={task.status} onValueChange={(v) => changeStatus(v ?? "TODO")} disabled={busy}>
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>{TASK_STATUS_META[s]?.label ?? s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Note / reason */}
      <Textarea
        placeholder={task.status === "IN_REVIEW" && canApprove ? "Approval note or rejection reason..." : "Optional note for this status change..."}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        disabled={busy}
      />
    </div>
  )
}
