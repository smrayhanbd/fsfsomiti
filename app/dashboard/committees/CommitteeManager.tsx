"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createCommittee,
  updateCommittee,
  toggleCommitteeActive,
  deleteCommittee,
  addCommitteeMember,
  removeCommitteeMember,
} from "@/app/actions/committee"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, UserPlus, X, Power, Users } from "lucide-react"

export interface CommitteeMemberRow {
  id: string
  role: string | null
  member: { id: string; fullName: string; memberNo: string; phone: string | null } | null
  user: { id: string; name: string | null; email: string } | null
}
export interface CommitteeRow {
  id: string
  name: string
  description: string | null
  isActive: boolean
  chairUser: { id: string; name: string | null; email: string } | null
  members: CommitteeMemberRow[]
  _count: { taskAssignees: number }
}
export interface StaffOption {
  id: string
  name: string | null
  email: string
  role: string
}

export default function CommitteeManager({ committees, staff }: { committees: CommitteeRow[]; staff: StaffOption[] }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<CommitteeRow | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [chairId, setChairId] = useState("")

  const openNew = () => {
    setEditing(null)
    setName("")
    setDescription("")
    setChairId("")
    setOpen(true)
  }

  const openEdit = (c: CommitteeRow) => {
    setEditing(c)
    setName(c.name)
    setDescription(c.description ?? "")
    setChairId(c.chairUser?.id ?? "")
    setOpen(true)
  }

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Name is required")
      return
    }
    const fd = new FormData()
    fd.append("name", name.trim())
    fd.append("description", description)
    fd.append("chairUserId", chairId)
    const res = editing ? await updateCommittee(editing.id, fd) : await createCommittee(fd)
    if (res.ok) {
      toast.success(editing ? "Committee updated" : "Committee created")
      setOpen(false)
    } else {
      toast.error("Failed", { description: res.error })
    }
  }

  const toggle = async (c: CommitteeRow) => {
    const res = await toggleCommitteeActive(c.id)
    if (res.ok) toast.success(`Committee ${c.isActive ? "deactivated" : "activated"}`)
    else toast.error("Failed", { description: res.error })
  }

  const remove = async (c: CommitteeRow) => {
    if (!confirm(`Delete committee "${c.name}"?`)) return
    const res = await deleteCommittee(c.id)
    if (res.ok) toast.success("Committee deleted")
    else toast.error("Failed", { description: res.error })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />} onClick={openNew}>
            <Plus className="h-4 w-4" /> New Committee
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Committee" : "New Committee"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Executive Committee" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </div>
              <div>
                <Label>Chairperson (staff)</Label>
                <Select value={chairId} onValueChange={(v) => setChairId(v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="Select staff..." /></SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name ?? s.email} ({s.role})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={submit}>{editing ? "Save" : "Create"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {committees.length === 0 ? (
        <Card className="bg-white dark:bg-slate-900 border-dashed border-slate-300 dark:border-slate-700">
          <CardContent className="p-10 text-center text-slate-500">
            <Users className="h-10 w-10 mx-auto mb-2 text-slate-300" />
            No committees yet. Create one to group staff and members for task assignment.
          </CardContent>
        </Card>
      ) : (
        committees.map((c) => (
          <Card key={c.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {c.name}
                    {!c.isActive && <Badge variant="outline" className="text-[10px] bg-slate-500/10 text-slate-600">Inactive</Badge>}
                  </CardTitle>
                  {c.description && <p className="text-sm text-slate-500 mt-1">{c.description}</p>}
                  <div className="flex flex-wrap gap-3 text-xs text-slate-400 mt-2">
                    {c.chairUser && <span>Chair: <span className="text-slate-600 dark:text-slate-300">{c.chairUser.name ?? c.chairUser.email}</span></span>}
                    <span>{c.members.length} members</span>
                    <span>{c._count.taskAssignees} task assignment{c._count.taskAssignees !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => toggle(c)}><Power className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => remove(c)}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <MembersTable committee={c} staff={staff} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

function MembersTable({ committee, staff }: { committee: CommitteeRow; staff: StaffOption[] }) {
  const [userId, setUserId] = useState("")
  const [busy, setBusy] = useState(false)

  const addStaff = async () => {
    if (!userId) return
    setBusy(true)
    const res = await addCommitteeMember(committee.id, { userId })
    setBusy(false)
    if (res.ok) {
      setUserId("")
      toast.success("Member added")
    } else {
      toast.error("Failed", { description: res.error })
    }
  }

  const removeMember = async (id: string) => {
    const res = await removeCommitteeMember(id)
    if (!res.ok) toast.error("Failed", { description: res.error })
  }

  const availableStaff = staff.filter((s) => !committee.members.some((m) => m.user?.id === s.id))

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 dark:bg-slate-800/50">
            <TableHead className="px-3 py-2 text-xs uppercase font-bold text-slate-500">Name</TableHead>
            <TableHead className="px-3 py-2 text-xs uppercase font-bold text-slate-500">Type</TableHead>
            <TableHead className="px-3 py-2 text-xs uppercase font-bold text-slate-500">Contact</TableHead>
            <TableHead className="px-3 py-2 text-xs uppercase font-bold text-slate-500 text-right">Remove</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {committee.members.length === 0 && (
            <TableRow><TableCell colSpan={4} className="text-center py-4 text-slate-400 text-sm">No members yet.</TableCell></TableRow>
          )}
          {committee.members.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="px-3 py-2 text-sm">{m.member?.fullName ?? m.user?.name ?? m.user?.email ?? "—"}</TableCell>
              <TableCell className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{m.member ? "Member" : "Staff"}{m.role ? ` · ${m.role}` : ""}</Badge></TableCell>
              <TableCell className="px-3 py-2 text-sm text-slate-500">{m.member?.phone ?? m.user?.email ?? "—"}</TableCell>
              <TableCell className="px-3 py-2 text-right">
                <Button variant="ghost" size="icon-xs" onClick={() => removeMember(m.id)}><X className="h-3.5 w-3.5 text-rose-500" /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {availableStaff.length > 0 && (
        <div className="flex gap-2 items-end pt-1">
          <div className="flex-1">
            <Label className="text-xs">Add staff</Label>
            <Select value={userId} onValueChange={(v) => setUserId(v ?? "")}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Select staff..." /></SelectTrigger>
              <SelectContent>
                {availableStaff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name ?? s.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={addStaff} disabled={busy || !userId}><UserPlus className="h-4 w-4" /> Add</Button>
        </div>
      )}
      <p className="text-xs text-slate-400 pt-1">Member-to-committee linking for existing members is available from the member profile.</p>
    </div>
  )
}
