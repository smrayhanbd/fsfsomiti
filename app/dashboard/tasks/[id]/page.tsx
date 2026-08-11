import Link from "next/link"
import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getTaskById, getTaskActivity, listTasks } from "@/app/actions/tasks"
import { getCurrentUser, hasPermission, isSuperAdmin, PERMISSIONS } from "@/lib/permissions"
import { TASK_STATUS_META, TASK_PRIORITY_META } from "@/components/tasks/badges"
import ChecklistPanel from "@/components/tasks/ChecklistPanel"
import CommentThread from "@/components/tasks/CommentThread"
import TimeLogPanel from "@/components/tasks/TimeLogPanel"
import AttachmentsPanel from "@/components/tasks/AttachmentsPanel"
import StatusControls from "@/components/tasks/StatusControls"
import TaskSidebar from "@/components/tasks/TaskSidebar"
import ActivityTimeline, { type ActivityEntry } from "@/components/tasks/ActivityTimeline"
import { format, isPast } from "date-fns"
import prisma from "@/lib/prisma"
import { ArrowLeft, Trash2, AlertTriangle, CalendarClock, Lock } from "lucide-react"
import { DeleteTaskButton } from "@/components/tasks/DeleteTaskButton"

export const dynamic = "force-dynamic"

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [task, activity, user] = await Promise.all([
    getTaskById(id),
    getTaskActivity(id),
    getCurrentUser(),
  ])
  if (!task) notFound()

  const canApprove = !!user && (isSuperAdmin(user) || (await hasPermission(user.id, PERMISSIONS.TASK_APPROVE, user)))
  const isMember = user?.role === "MEMBER"
  const due = task.dueDate ? new Date(task.dueDate) : null
  const overdue = due && isPast(due) && !["DONE", "APPROVED", "CANCELLED"].includes(task.status)

  // For the dependency picker — load a small set of other tasks.
  const allTasks = await prisma.task.findMany({
    select: { id: true, title: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Back + actions */}
      <div className="flex items-center justify-between mb-4">
        <Link href="/dashboard/tasks">
          <Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4" /> All Tasks</Button>
        </Link>
        {!isMember && (
          <DeleteTaskButton taskId={task.id} title={task.title} canDelete={!!user && (isSuperAdmin(user) || (await hasPermission(user.id, PERMISSIONS.TASK_DELETE, user)))} />
        )}
      </div>

      {/* Title block */}
      <div className="flex flex-col md:flex-row md:items-start gap-3 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge variant="outline" className={TASK_STATUS_META[task.status]?.badge}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${TASK_STATUS_META[task.status]?.dot}`} />
              {TASK_STATUS_META[task.status]?.label ?? task.status}
            </Badge>
            <Badge variant="outline" className={TASK_PRIORITY_META[task.priority]?.badge}>{TASK_PRIORITY_META[task.priority]?.label ?? task.priority}</Badge>
            {task.requiresApproval && <Badge variant="outline" className="bg-violet-500/10 text-violet-600 border-violet-500/20">Approval required</Badge>}
            {task.isPrivate && <Badge variant="outline" className="bg-slate-500/10 text-slate-600 border-slate-500/20"><Lock className="h-3 w-3 mr-1" />Private</Badge>}
            {task.recurrence !== "NONE" && task.recurrenceParentId === null && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">Recurring · {task.recurrence.toLowerCase()}</Badge>
            )}
            {task.recurrenceParentId && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                Occurrence of <Link href={`/dashboard/tasks/${task.recurrenceParentId}`} className="underline">template</Link>
              </Badge>
            )}
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{task.title}</h1>
          {due && (
            <div className={`flex items-center gap-1.5 mt-2 text-sm ${overdue ? "text-rose-600 font-medium" : "text-slate-500"}`}>
              {overdue ? <AlertTriangle className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
              Due {format(due, "MMM d, yyyy 'at' p")}
            </div>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left column — main content */}
        <div className="space-y-4">
          {task.description && (
            <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Description</h3>
                <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{task.description}</div>
              </CardContent>
            </Card>
          )}

          {/* Progress bar */}
          {task.progressPct > 0 && (
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Progress</span>
                <span>{task.progressPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${task.progressPct}%` }} />
              </div>
            </div>
          )}

          <ChecklistPanel task={task} basePath="/dashboard/tasks" />
          <CommentThread task={task} />
          <AttachmentsPanel task={task} />
          <TimeLogPanel task={task} />
          <ActivityTimeline entries={activity as ActivityEntry[]} />
        </div>

        {/* Right column — controls + meta */}
        <div className="space-y-4">
          <StatusControls task={task} canApprove={canApprove} isMember={isMember} />
          <TaskSidebar task={task} allTasks={allTasks} />
        </div>
      </div>
    </div>
  )
}
