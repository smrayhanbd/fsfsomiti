"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { TASK_STATUS_META, TASK_PRIORITY_META, KANBAN_COLUMNS } from "@/components/tasks/badges"
import { updateTaskStatus } from "@/app/actions/tasks"
import { toast } from "sonner"
import type { TaskRow } from "@/app/actions/tasks"
import { format, isPast } from "date-fns"
import { AlertTriangle, CalendarClock, GripVertical, Paperclip, MessageSquare } from "lucide-react"

interface KanbanProps {
  tasks: TaskRow[]
  basePath: string
}

export default function TaskKanban({ tasks, basePath }: KanbanProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [localTasks, setLocalTasks] = useState<TaskRow[]>(tasks)

  // Keep local state in sync when the parent refetches (e.g. filter change).
  if (localTasks !== tasks && JSON.stringify(localTasks.map((t) => t.id + t.status)) !== JSON.stringify(tasks.map((t) => t.id + t.status))) {
    setLocalTasks(tasks)
  }

  const onDrop = async (status: string) => {
    if (!draggedId) return
    const task = localTasks.find((t) => t.id === draggedId)
    if (!task || task.status === status) {
      setDraggedId(null)
      return
    }
    // Optimistic update
    setLocalTasks((prev) => prev.map((t) => (t.id === draggedId ? { ...t, status: status as TaskRow["status"] } : t)))
    setDraggedId(null)
    const res = await updateTaskStatus(draggedId, status)
    if (!res.ok) {
      toast.error("Move failed", { description: res.error })
      setLocalTasks(tasks) // revert
    } else {
      toast.success(`Moved to ${TASK_STATUS_META[status]?.label ?? status}`)
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3 overflow-x-auto pb-2">
      {KANBAN_COLUMNS.map((col) => {
        const colTasks = localTasks.filter((t) => t.status === col)
        const meta = TASK_STATUS_META[col]
        return (
          <div
            key={col}
            className="flex flex-col min-w-[240px] rounded-xl bg-slate-100/70 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(col)}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className={`inline-block h-2 w-2 rounded-full ${meta?.dot}`} />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{meta?.label ?? col}</span>
              </div>
              <Badge variant="outline" className="text-[10px]">{colTasks.length}</Badge>
            </div>
            <div className="flex-1 p-2 space-y-2 min-h-[120px]">
              {colTasks.map((t) => {
                const due = t.dueDate ? new Date(t.dueDate) : null
                const overdue = due && isPast(due) && !["DONE", "APPROVED", "CANCELLED"].includes(t.status)
                return (
                  <motion.div
                    key={t.id}
                    layout
                    draggable
                    onDragStart={() => setDraggedId(t.id)}
                    onDragEnd={() => setDraggedId(null)}
                    whileHover={{ y: -1 }}
                    className={`cursor-grab active:cursor-grabbing ${draggedId === t.id ? "opacity-50" : ""}`}
                  >
                    <Card className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                      <div className="flex items-start gap-1.5">
                        <GripVertical className="h-3.5 w-3.5 text-slate-300 mt-0.5 shrink-0" />
                        <Link href={`${basePath}/${t.id}`} className="text-sm font-medium text-slate-900 dark:text-white hover:text-indigo-600 line-clamp-2 flex-1">
                          {t.title}
                        </Link>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 mt-2">
                        <Badge variant="outline" className={`text-[10px] ${TASK_PRIORITY_META[t.priority]?.badge}`}>
                          {TASK_PRIORITY_META[t.priority]?.label ?? t.priority}
                        </Badge>
                        {t.requiresApproval && t.status !== "APPROVED" && (
                          <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-600 border-violet-500/20">Needs approval</Badge>
                        )}
                      </div>
                      {due && (
                        <div className={`flex items-center gap-1 mt-2 text-xs ${overdue ? "text-rose-600 font-medium" : "text-slate-500"}`}>
                          {overdue ? <AlertTriangle className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
                          {format(due, "MMM d")}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400">
                        <span className="truncate max-w-[120px]">
                          {t.assignees
                            .map((a) => a.user?.name ?? a.member?.fullName ?? a.committee?.name ?? "—")
                            .slice(0, 2)
                            .join(", ") || "Unassigned"}
                        </span>
                        <div className="flex items-center gap-2">
                          {t.attachments.length > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip className="h-3 w-3" />{t.attachments.length}</span>}
                          {t.comments.length > 0 && <span className="inline-flex items-center gap-0.5"><MessageSquare className="h-3 w-3" />{t.comments.length}</span>}
                        </div>
                      </div>
                      {t.checklist.length > 0 && (
                        <div className="mt-2">
                          <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${t.progressPct}%` }} />
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {t.checklist.filter((c) => c.isDone).length}/{t.checklist.length} done
                          </div>
                        </div>
                      )}
                    </Card>
                  </motion.div>
                )
              })}
              {colTasks.length === 0 && (
                <div className="text-center text-xs text-slate-400 py-6 border border-dashed rounded-lg">Drop here</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
