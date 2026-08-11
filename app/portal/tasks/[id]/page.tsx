import Link from "next/link"
import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getPortalMemberTask, getTaskActivity } from "@/app/actions/tasks"
import { TASK_STATUS_META, TASK_PRIORITY_META } from "@/components/tasks/badges"
import ChecklistPanel from "@/components/tasks/ChecklistPanel"
import CommentThread from "@/components/tasks/CommentThread"
import TimeLogPanel from "@/components/tasks/TimeLogPanel"
import StatusControls from "@/components/tasks/StatusControls"
import ActivityTimeline, { type ActivityEntry } from "@/components/tasks/ActivityTimeline"
import { format, isPast } from "date-fns"
import { ArrowLeft, AlertTriangle, CalendarClock, Lock, Building2, HandCoins, User } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function PortalTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const memberId = session?.user?.id
  if (!memberId) return null

  const [task, activity] = await Promise.all([getPortalMemberTask(memberId, id), getTaskActivity(id)])
  if (!task) notFound()

  const due = task.dueDate ? new Date(task.dueDate) : null
  const overdue = due && isPast(due) && !["DONE", "APPROVED", "CANCELLED"].includes(task.status)

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <Link href="/portal/tasks" className="inline-block mb-4">
        <Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4" /> My Tasks</Button>
      </Link>

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Badge variant="outline" className={TASK_STATUS_META[task.status]?.badge}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${TASK_STATUS_META[task.status]?.dot}`} />
            {TASK_STATUS_META[task.status]?.label ?? task.status}
          </Badge>
          <Badge variant="outline" className={TASK_PRIORITY_META[task.priority]?.badge}>{TASK_PRIORITY_META[task.priority]?.label ?? task.priority}</Badge>
          {task.requiresApproval && <Badge variant="outline" className="bg-violet-500/10 text-violet-600 border-violet-500/20">Approval required</Badge>}
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{task.title}</h1>
        {due && (
          <div className={`flex items-center gap-1.5 mt-2 text-sm ${overdue ? "text-rose-600 font-medium" : "text-slate-500"}`}>
            {overdue ? <AlertTriangle className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
            Due {format(due, "MMM d, yyyy 'at' p")}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <div className="space-y-4">
          {task.description && (
            <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Description</h3>
                <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{task.description}</div>
              </CardContent>
            </Card>
          )}

          {/* Linked record context */}
          {(task.meeting || task.loan || task.relatedMember || task.memberRequest || task.transaction) && (
            <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Related To</h3>
                <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                  {task.meeting && <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-slate-400" /> {task.meeting.title}</div>}
                  {task.loan && <div className="flex items-center gap-2"><HandCoins className="h-4 w-4 text-slate-400" /> Loan {task.loan.loanNo}</div>}
                  {task.relatedMember && <div className="flex items-center gap-2"><User className="h-4 w-4 text-slate-400" /> {task.relatedMember.fullName}</div>}
                </div>
              </CardContent>
            </Card>
          )}

          {task.progressPct > 0 && (
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Progress</span><span>{task.progressPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${task.progressPct}%` }} />
              </div>
            </div>
          )}

          <ChecklistPanel task={task} basePath="/portal/tasks" />
          <CommentThread task={task} />
          <TimeLogPanel task={task} />
          <ActivityTimeline entries={activity as ActivityEntry[]} />
        </div>

        <div className="space-y-4">
          {/* Members can update status (restricted server-side) but cannot approve. */}
          <StatusControls task={task} canApprove={false} isMember={true} />
          <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500 space-y-1">
            <div className="flex items-center gap-1"><Lock className="h-3 w-3" /> You can update status, complete checklists, comment, and log time.</div>
            <div>Approval and editing of task details are restricted to management.</div>
          </Card>
        </div>
      </div>
    </div>
  )
}
