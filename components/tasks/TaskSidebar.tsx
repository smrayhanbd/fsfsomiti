"use client"

import { useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { setReminder, removeReminder, addDependency, removeDependency } from "@/app/actions/tasks"
import { toast } from "sonner"
import {
  Bell,
  CalendarClock,
  GitBranch,
  Link2,
  Users,
  X,
  Plus,
  Building2,
  HandCoins,
  ArrowLeftRight,
  Receipt,
  User,
} from "lucide-react"
import { format } from "date-fns"
import type { TaskRow } from "@/app/actions/tasks"

interface SidebarProps {
  task: TaskRow
  allTasks: { id: string; title: string; status: string }[]
}

const REMINDER_PRESETS = [
  { label: "1 day before", value: -1440 },
  { label: "2 hours before", value: -120 },
  { label: "1 hour before", value: -60 },
  { label: "30 min before", value: -30 },
]

export default function TaskSidebar({ task, allTasks }: SidebarProps) {
  const [channel, setChannel] = useState<"IN_APP" | "SMS" | "EMAIL">("IN_APP")
  const [offset, setOffset] = useState(-1440)
  const [depTarget, setDepTarget] = useState("")
  const [busy, setBusy] = useState(false)

  const addReminder = async () => {
    setBusy(true)
    const res = await setReminder(task.id, channel, offset)
    setBusy(false)
    if (res.ok) toast.success("Reminder added")
    else toast.error("Failed", { description: res.error })
  }

  const deleteReminder = async (id: string) => {
    const res = await removeReminder(id)
    if (!res.ok) toast.error("Failed", { description: res.error })
  }

  const addDep = async () => {
    if (!depTarget) return
    setBusy(true)
    const res = await addDependency(task.id, depTarget)
    setBusy(false)
    if (res.ok) {
      setDepTarget("")
      toast.success("Dependency added")
    } else {
      toast.error("Failed", { description: res.error })
    }
  }

  const removeDep = async (dependsOnId: string) => {
    const res = await removeDependency(task.id, dependsOnId)
    if (!res.ok) toast.error("Failed", { description: res.error })
  }

  const availableDeps = allTasks.filter(
    (t) => t.id !== task.id && !task.blockers.some((b) => b.dependsOnTaskId === t.id)
  )

  return (
    <div className="space-y-3">
      {/* Assignees */}
      <Card className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
          <Users className="h-4 w-4 text-indigo-600" /> Assignees
        </h3>
        <div className="space-y-1.5">
          {task.assignees.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className="text-[10px]">{a.assigneeType}</Badge>
              <span className="text-slate-700 dark:text-slate-200 truncate">
                {a.user?.name ?? a.user?.email ?? a.member?.fullName ?? a.committee?.name ?? "—"}
              </span>
            </div>
          ))}
          {task.assignees.length === 0 && <p className="text-xs text-slate-400">Unassigned</p>}
        </div>
      </Card>

      {/* Integration chips */}
      {(task.meeting || task.loan || task.memberRequest || task.transaction || task.relatedMember) && (
        <Card className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
            <Link2 className="h-4 w-4 text-indigo-600" /> Linked Records
          </h3>
          <div className="space-y-1.5">
            {task.meeting && (
              <Link href={`/dashboard/meetings`} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 hover:text-indigo-600">
                <Building2 className="h-4 w-4 text-slate-400" /> Meeting: {task.meeting.title}
              </Link>
            )}
            {task.loan && (
              <Link href={`/dashboard/loans`} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 hover:text-indigo-600">
                <HandCoins className="h-4 w-4 text-slate-400" /> Loan: {task.loan.loanNo}
              </Link>
            )}
            {task.memberRequest && (
              <Link href={`/dashboard/transaction-approvals?tab=member`} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 hover:text-indigo-600">
                <ArrowLeftRight className="h-4 w-4 text-slate-400" /> Request: {task.memberRequest.type}
              </Link>
            )}
            {task.transaction && (
              <Link href={`/dashboard/transactions`} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 hover:text-indigo-600">
                <Receipt className="h-4 w-4 text-slate-400" /> Txn: {task.transaction.voucherNo}
              </Link>
            )}
            {task.relatedMember && (
              <Link href={`/dashboard/members`} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 hover:text-indigo-600">
                <User className="h-4 w-4 text-slate-400" /> Member: {task.relatedMember.fullName} ({task.relatedMember.memberNo})
              </Link>
            )}
          </div>
        </Card>
      )}

      {/* Reminders */}
      <Card className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
          <Bell className="h-4 w-4 text-indigo-600" /> Reminders
        </h3>
        <div className="space-y-1.5 mb-3">
          {task.reminders.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-sm group">
              <Badge variant="outline" className="text-[10px]">{r.channel}</Badge>
              <span className="text-slate-600 dark:text-slate-300 flex-1">
                {r.offsetMinutes} min {r.offsetMinutes < 0 ? "before" : "after"} due
              </span>
              {r.dispatchedAt && <span className="text-[10px] text-emerald-600">sent</span>}
              <Button variant="ghost" size="icon-xs" onClick={() => deleteReminder(r.id)} className="opacity-0 group-hover:opacity-100">
                <X className="h-3.5 w-3.5 text-rose-500" />
              </Button>
            </div>
          ))}
          {task.reminders.length === 0 && <p className="text-xs text-slate-400">No reminders set.</p>}
        </div>
        {task.dueDate && (
          <div className="grid grid-cols-2 gap-2">
            <Select value={channel} onValueChange={(v) => setChannel((v ?? "IN_APP") as typeof channel)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="IN_APP">In-App</SelectItem>
                <SelectItem value="SMS">SMS</SelectItem>
                <SelectItem value="EMAIL">Email</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(offset)} onValueChange={(v) => setOffset(parseInt(v ?? "-1440", 10))}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REMINDER_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={addReminder} disabled={busy} className="col-span-2">
              <Plus className="h-4 w-4" /> Add Reminder
            </Button>
          </div>
        )}
        {!task.dueDate && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" /> Set a due date to enable reminders.
          </p>
        )}
      </Card>

      {/* Dependencies */}
      <Card className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
          <GitBranch className="h-4 w-4 text-indigo-600" /> Dependencies
        </h3>
        <div className="space-y-1.5 mb-3">
          {task.blockers.map((b) => (
            <div key={b.id} className="flex items-center gap-2 text-sm group">
              <span className="text-[10px] text-slate-400">blocked by</span>
              <Link href={`/dashboard/tasks/${b.dependsOnTask.id}`} className="text-slate-700 dark:text-slate-200 hover:text-indigo-600 flex-1 truncate">
                {b.dependsOnTask.title}
              </Link>
              <Badge variant="outline" className="text-[10px]">{b.dependsOnTask.status}</Badge>
              <Button variant="ghost" size="icon-xs" onClick={() => removeDep(b.dependsOnTaskId)} className="opacity-0 group-hover:opacity-100">
                <X className="h-3.5 w-3.5 text-rose-500" />
              </Button>
            </div>
          ))}
          {task.dependents.map((d) => (
            <div key={d.id} className="flex items-center gap-2 text-sm">
              <span className="text-[10px] text-slate-400">blocks</span>
              <Link href={`/dashboard/tasks/${d.task.id}`} className="text-slate-700 dark:text-slate-200 hover:text-indigo-600 flex-1 truncate">
                {d.task.title}
              </Link>
              <Badge variant="outline" className="text-[10px]">{d.task.status}</Badge>
            </div>
          ))}
          {task.blockers.length === 0 && task.dependents.length === 0 && (
            <p className="text-xs text-slate-400">No dependencies.</p>
          )}
        </div>
        {availableDeps.length > 0 && (
          <div className="flex gap-2">
            <Select value={depTarget} onValueChange={(v) => setDepTarget(v ?? "")}>
              <SelectTrigger className="h-8 flex-1"><SelectValue placeholder="Blocked by..." /></SelectTrigger>
              <SelectContent>
                {availableDeps.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={addDep} disabled={busy || !depTarget}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </Card>

      {/* Meta */}
      <Card className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 space-y-1">
        <div>Created: {format(new Date(task.createdAt), "MMM d, yyyy p")}</div>
        {task.createdBy && <div>By: {task.createdBy}</div>}
        <div>Updated: {format(new Date(task.updatedAt), "MMM d, yyyy p")}</div>
        {task.approvedAt && <div className="text-emerald-600">Approved: {format(new Date(task.approvedAt), "MMM d, yyyy p")}</div>}
      </Card>
    </div>
  )
}
