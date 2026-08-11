"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createTask } from "@/app/actions/tasks"
import { toast } from "sonner"
import { Plus, Trash2, X, Save } from "lucide-react"

export interface SelectOption {
  id: string
  label: string
}

interface TaskFormProps {
  staff: SelectOption[]
  members: SelectOption[]
  committees: SelectOption[]
  tasks: SelectOption[] // for dependency picker
  meetings?: SelectOption[]
  loans?: SelectOption[]
  memberRequests?: SelectOption[]
  transactions?: SelectOption[]
  // Pre-selected integration link (e.g. when spawned from a record detail page)
  defaultLink?: {
    field: "meetingId" | "loanId" | "memberRequestId" | "transactionId" | "relatedMemberId"
    id: string
    label: string
  }
}

type AssigneeDraft = { type: "STAFF" | "MEMBER" | "COMMITTEE"; id: string; label: string }

export default function TaskForm({
  staff, members, committees, tasks,
  meetings = [], loans = [], memberRequests = [], transactions = [],
  defaultLink,
}: TaskFormProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  // Core fields
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState("MEDIUM")
  const [dueDate, setDueDate] = useState("")
  const [recurrence, setRecurrence] = useState("NONE")
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("")
  const [requiresApproval, setRequiresApproval] = useState(false)
  const [isPrivate, setIsPrivate] = useState(false)
  const [location, setLocation] = useState("")

  // Assignees
  const [assignees, setAssignees] = useState<AssigneeDraft[]>([])
  const [staffSel, setStaffSel] = useState("")
  const [memberSel, setMemberSel] = useState("")
  const [committeeSel, setCommitteeSel] = useState("")

  // Checklist
  const [checklist, setChecklist] = useState<string[]>([])
  const [checklistInput, setChecklistInput] = useState("")

  // Reminders
  const [reminders, setReminders] = useState<{ channel: "IN_APP" | "SMS" | "EMAIL"; offsetMinutes: number }[]>([])
  const [reminderChannel, setReminderChannel] = useState<"IN_APP" | "SMS" | "EMAIL">("IN_APP")
  const [reminderOffset, setReminderOffset] = useState(-1440)

  // Dependencies
  const [dependencies, setDependencies] = useState<string[]>([])
  const [depSel, setDepSel] = useState("")

  // Integration link
  const [linkField, setLinkField] = useState<string>(defaultLink?.field ?? "")
  const [linkId, setLinkId] = useState<string>(defaultLink?.id ?? "")

  const addAssignee = (type: AssigneeDraft["type"], id: string, label: string) => {
    if (!id) return
    if (assignees.some((a) => a.type === type && a.id === id)) return
    setAssignees([...assignees, { type, id, label }])
  }
  const removeAssignee = (i: number) => setAssignees(assignees.filter((_, idx) => idx !== i))

  const addChecklist = () => {
    if (!checklistInput.trim()) return
    setChecklist([...checklist, checklistInput.trim()])
    setChecklistInput("")
  }

  const addReminder = () => {
    if (reminders.some((r) => r.channel === reminderChannel && r.offsetMinutes === reminderOffset)) return
    setReminders([...reminders, { channel: reminderChannel, offsetMinutes: reminderOffset }])
  }
  const removeReminder = (i: number) => setReminders(reminders.filter((_, idx) => idx !== i))

  const addDependency = () => {
    if (!depSel) return
    if (!dependencies.includes(depSel)) setDependencies([...dependencies, depSel])
    setDepSel("")
  }

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Title is required")
      return
    }
    setBusy(true)
    const fd = new FormData()
    fd.append("title", title.trim())
    fd.append("description", description)
    fd.append("priority", priority)
    fd.append("dueDate", dueDate || "")
    fd.append("recurrence", recurrence)
    fd.append("recurrenceEndDate", recurrenceEndDate || "")
    fd.append("requiresApproval", requiresApproval ? "true" : "false")
    fd.append("isPrivate", isPrivate ? "true" : "false")
    fd.append("location", location)
    fd.append(
      "assignees",
      JSON.stringify(
        assignees.map((a) => ({
          assigneeType: a.type,
          userId: a.type === "STAFF" ? a.id : null,
          memberId: a.type === "MEMBER" ? a.id : null,
          committeeId: a.type === "COMMITTEE" ? a.id : null,
        }))
      )
    )
    fd.append("checklist", JSON.stringify(checklist.map((title) => ({ title }))))
    fd.append("reminders", JSON.stringify(reminders))
    fd.append("dependencyIds", JSON.stringify(dependencies))
    // Integration link (only one at a time via this form)
    if (linkField && linkId) fd.append(linkField, linkId)

    const res = await createTask(fd)
    setBusy(false)
    if (res.ok) {
      toast.success("Task created")
      router.push("/dashboard/tasks")
      router.refresh()
    } else {
      toast.error("Failed", { description: res.error })
    }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Basics */}
      <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <CardHeader><CardTitle>Task Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Add more detail..." />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v ?? "MEDIUM")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label>Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Recurrence</Label>
              <Select value={recurrence} onValueChange={(v) => setRecurrence(v ?? "NONE")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">One-time</SelectItem>
                  <SelectItem value="DAILY">Daily</SelectItem>
                  <SelectItem value="WEEKLY">Weekly</SelectItem>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                  <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                  <SelectItem value="YEARLY">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {recurrence !== "NONE" && (
              <div>
                <Label>Recurrence Ends On</Label>
                <Input type="date" value={recurrenceEndDate} onChange={(e) => setRecurrenceEndDate(e.target.value)} />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-6 pt-2">
            <div className="flex items-center gap-2">
              <Switch checked={requiresApproval} onCheckedChange={setRequiresApproval} id="approval" />
              <Label htmlFor="approval" className="cursor-pointer">Requires approval on completion</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isPrivate} onCheckedChange={setIsPrivate} id="private" />
              <Label htmlFor="private" className="cursor-pointer">Private (only assignees & admins)</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assignees */}
      <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <CardHeader><CardTitle>Assign To</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Select value={staffSel} onValueChange={(v) => { const id = v ?? ""; setStaffSel(id); const s = staff.find((x) => x.id === id); if (s && id) { addAssignee("STAFF", id, s.label); setStaffSel("") } }}>
              <SelectTrigger><SelectValue placeholder="+ Staff" /></SelectTrigger>
              <SelectContent>
                {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={memberSel} onValueChange={(v) => { const id = v ?? ""; setMemberSel(id); const m = members.find((x) => x.id === id); if (m && id) { addAssignee("MEMBER", id, m.label); setMemberSel("") } }}>
              <SelectTrigger><SelectValue placeholder="+ Member" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={committeeSel} onValueChange={(v) => { const id = v ?? ""; setCommitteeSel(id); const c = committees.find((x) => x.id === id); if (c && id) { addAssignee("COMMITTEE", id, c.label); setCommitteeSel("") } }}>
              <SelectTrigger><SelectValue placeholder="+ Committee" /></SelectTrigger>
              <SelectContent>
                {committees.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {assignees.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {assignees.map((a, i) => (
                <Badge key={`${a.type}-${a.id}`} variant="secondary" className="gap-1">
                  <span className="text-[10px] opacity-70">{a.type}</span> {a.label}
                  <button onClick={() => removeAssignee(i)}><X className="h-3 w-3" /></button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Checklist + Reminders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <CardHeader><CardTitle>Checklist</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {checklist.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-sm group">
                <span className="flex-1 text-slate-700 dark:text-slate-200">{c}</span>
                <Button variant="ghost" size="icon-xs" onClick={() => setChecklist(checklist.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input placeholder="Add checklist item" value={checklistInput} onChange={(e) => setChecklistInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addChecklist()} />
              <Button size="sm" variant="outline" onClick={addChecklist}><Plus className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <CardHeader><CardTitle>Reminders</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {!dueDate && <p className="text-xs text-amber-600">Set a due date first to enable reminders.</p>}
            {reminders.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Badge variant="outline" className="text-[10px]">{r.channel}</Badge>
                <span className="flex-1">{r.offsetMinutes} min before due</span>
                <Button variant="ghost" size="icon-xs" onClick={() => removeReminder(i)}><X className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
            {dueDate && (
              <div className="grid grid-cols-2 gap-2">
                <Select value={reminderChannel} onValueChange={(v) => setReminderChannel((v ?? "IN_APP") as typeof reminderChannel)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN_APP">In-App</SelectItem>
                    <SelectItem value="SMS">SMS</SelectItem>
                    <SelectItem value="EMAIL">Email</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={String(reminderOffset)} onValueChange={(v) => setReminderOffset(parseInt(v ?? "-1440", 10))}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-1440">1 day before</SelectItem>
                    <SelectItem value="-120">2 hrs before</SelectItem>
                    <SelectItem value="-60">1 hr before</SelectItem>
                    <SelectItem value="-30">30 min before</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={addReminder} className="col-span-2"><Plus className="h-4 w-4" /> Add Reminder</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dependencies + Integration link */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <CardHeader><CardTitle>Dependencies</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {dependencies.map((d) => {
              const t = tasks.find((x) => x.id === d)
              return (
                <div key={d} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{t?.label ?? d}</span>
                  <Button variant="ghost" size="icon-xs" onClick={() => setDependencies(dependencies.filter((x) => x !== d))}><X className="h-3.5 w-3.5" /></Button>
                </div>
              )
            })}
            <div className="flex gap-2">
              <Select value={depSel} onValueChange={(v) => setDepSel(v ?? "")}>
                <SelectTrigger className="h-8 flex-1"><SelectValue placeholder="This task is blocked by..." /></SelectTrigger>
                <SelectContent>
                  {tasks.filter((t) => !dependencies.includes(t.id)).map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={addDependency}><Plus className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <CardHeader><CardTitle>Link to Record (optional)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={linkField}
                onValueChange={(v) => { setLinkField(v ?? ""); setLinkId("") }}
                disabled={!!defaultLink}
              >
                <SelectTrigger className="h-8"><SelectValue placeholder="Record type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="meetingId">Meeting</SelectItem>
                  <SelectItem value="loanId">Loan</SelectItem>
                  <SelectItem value="memberRequestId">Member Request</SelectItem>
                  <SelectItem value="transactionId">Transaction</SelectItem>
                  <SelectItem value="relatedMemberId">Member</SelectItem>
                </SelectContent>
              </Select>
              <Select value={linkId} onValueChange={(v) => setLinkId(v ?? "")} disabled={!linkField}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {linkField === "meetingId" && meetings.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                  {linkField === "loanId" && loans.map((l) => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
                  {linkField === "memberRequestId" && memberRequests.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                  {linkField === "transactionId" && transactions.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                  {linkField === "relatedMemberId" && members.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {defaultLink && <p className="text-xs text-slate-500">Pre-linked: {defaultLink.label}</p>}
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 sticky bottom-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur py-3 border-t border-slate-200 dark:border-slate-800">
        <Button variant="outline" onClick={() => router.back()} disabled={busy}>Cancel</Button>
        <Button onClick={submit} disabled={busy}>
          <Save className="h-4 w-4" /> {busy ? "Saving..." : "Create Task"}
        </Button>
      </div>
    </div>
  )
}
