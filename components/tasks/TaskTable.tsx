"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TASK_STATUS_META, TASK_PRIORITY_META } from "@/components/tasks/badges"
import type { TaskRow } from "@/app/actions/tasks"
import { format, isPast, isToday } from "date-fns"
import { AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react"

interface TaskTableProps {
  tasks: TaskRow[]
  basePath: string // "/dashboard/tasks" or "/portal/tasks"
  emptyLabel?: string
}

function assigneeSummary(t: TaskRow): string {
  const parts: string[] = []
  const staff = t.assignees.filter((a) => a.assigneeType === "STAFF")
  const members = t.assignees.filter((a) => a.assigneeType === "MEMBER")
  const committees = t.assignees.filter((a) => a.assigneeType === "COMMITTEE")
  if (staff.length) parts.push(staff.map((a) => a.user?.name ?? a.user?.email ?? "Staff").join(", "))
  if (members.length) parts.push(members.map((a) => a.member?.fullName ?? "Member").join(", "))
  if (committees.length) parts.push(committees.map((a) => a.committee?.name ?? "Committee").join(", "))
  return parts.join(" · ") || "Unassigned"
}

export default function TaskTable({ tasks, basePath, emptyLabel = "No tasks found." }: TaskTableProps) {
  if (!tasks.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-sm text-slate-500">
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 dark:bg-slate-800/50">
            <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500">Task</TableHead>
            <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500">Status</TableHead>
            <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500">Priority</TableHead>
            <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500">Assignees</TableHead>
            <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500">Due</TableHead>
            <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500 text-right">Progress</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((t) => {
            const due = t.dueDate ? new Date(t.dueDate) : null
            const overdue = due && isPast(due) && !["DONE", "APPROVED", "CANCELLED"].includes(t.status)
            return (
              <TableRow key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <TableCell className="px-4 py-3 align-top">
                  <Link href={`${basePath}/${t.id}`} className="font-medium text-slate-900 dark:text-white hover:text-indigo-600 line-clamp-1">
                    {t.title}
                  </Link>
                  {t.checklist.length > 0 && (
                    <div className="text-xs text-slate-400 mt-0.5">
                      {t.checklist.filter((c) => c.isDone).length}/{t.checklist.length} checklist
                    </div>
                  )}
                  {(t.meeting || t.loan || t.memberRequest || t.transaction || t.relatedMember) && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {t.meeting && <Badge variant="outline" className="text-[10px]">Meeting: {t.meeting.title}</Badge>}
                      {t.loan && <Badge variant="outline" className="text-[10px]">Loan: {t.loan.loanNo}</Badge>}
                      {t.memberRequest && <Badge variant="outline" className="text-[10px]">Request: {t.memberRequest.type}</Badge>}
                      {t.transaction && <Badge variant="outline" className="text-[10px]">Txn: {t.transaction.voucherNo}</Badge>}
                      {t.relatedMember && <Badge variant="outline" className="text-[10px]">Member: {t.relatedMember.fullName}</Badge>}
                    </div>
                  )}
                </TableCell>
                <TableCell className="px-4 py-3 align-top">
                  <Badge variant="outline" className={TASK_STATUS_META[t.status]?.badge}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${TASK_STATUS_META[t.status]?.dot}`} />
                    {TASK_STATUS_META[t.status]?.label ?? t.status}
                  </Badge>
                </TableCell>
                <TableCell className="px-4 py-3 align-top">
                  <Badge variant="outline" className={TASK_PRIORITY_META[t.priority]?.badge}>
                    {TASK_PRIORITY_META[t.priority]?.label ?? t.priority}
                  </Badge>
                </TableCell>
                <TableCell className="px-4 py-3 align-top text-sm text-slate-600 dark:text-slate-300 max-w-[220px] truncate">
                  {assigneeSummary(t)}
                </TableCell>
                <TableCell className="px-4 py-3 align-top text-sm">
                  {due ? (
                    <span className={`inline-flex items-center gap-1 ${overdue ? "text-rose-600 font-medium" : isToday(due) ? "text-amber-600 font-medium" : "text-slate-600 dark:text-slate-300"}`}>
                      {overdue ? <AlertTriangle className="h-3.5 w-3.5" /> : isToday(due) ? <CalendarClock className="h-3.5 w-3.5" /> : <CalendarClock className="h-3.5 w-3.5 text-slate-400" />}
                      {format(due, "MMM d, yyyy")}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </TableCell>
                <TableCell className="px-4 py-3 align-top text-right">
                  {t.progressPct > 0 ? (
                    <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t.progressPct}%
                    </span>
                  ) : (
                    <span className="text-slate-400 text-sm">—</span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
