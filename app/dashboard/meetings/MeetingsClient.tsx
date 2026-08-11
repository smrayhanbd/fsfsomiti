"use client"

// Meeting Management UI (rules 1, 3, 4, 6).
//
// Tabs split meetings into Upcoming and Past (rule 3). The Past tab defaults
// to a List View with search + filters (rule 4) and per-row action buttons:
// View Details and Mark Attendance (rule 3). The Upcoming tab hosts the
// Declare New Meeting form, where Meeting Type (Online/Offline) toggles the
// Location / Meeting Link fields (rule 1). A Super-Admin-only Permissions
// panel authorizes normal admins to submit attendance / upload minutes.

import { useMemo, useState } from "react"
import {
  CalendarDays,
  Link2,
  MapPin,
  ClipboardList,
  Lock,
  FileText,
  Eye,
  CheckSquare,
  Search,
  Shield,
  Video,
} from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

import { createMeeting } from "@/app/actions/meeting"
import AttendancePanel from "./AttendancePanel"
import MinutesUploadButton from "./MinutesUploadButton"
import PermissionToggle from "./PermissionToggle"

import PageHeader from "@/components/somiti/PageHeader"
import SectionCard from "@/components/somiti/SectionCard"

interface Member {
  id: string
  fullName: string
  memberNo: string
}
interface Attendance {
  memberId: string
  status: "PRESENT" | "ABSENT" | "EXCUSED"
}
export interface MeetingSerialized {
  id: string
  title: string
  date: string
  type: string
  location: string | null
  link: string | null
  agenda: string
  createdAt: string
  attendanceLocked: boolean
  minutesUrl: string | null
  minutesFileName: string | null
  minutesLocked: boolean
  members: Member[]
  attendances: Attendance[]
}
interface AdminUser {
  id: string
  email: string
  role: string
  canMarkAttendance: boolean
  canUploadMinutes: boolean
}

export default function MeetingsClient({
  upcoming,
  past,
  isSuperAdmin,
  adminUsers,
}: {
  upcoming: MeetingSerialized[]
  past: MeetingSerialized[]
  isSuperAdmin: boolean
  adminUsers: AdminUser[]
}) {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Meeting Management"
        subtitle="Declare meetings, notify members, and record attendance."
      />

      {isSuperAdmin && <PermissionsPanel adminUsers={adminUsers} />}

      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-6">
          <UpcomingTab meetings={upcoming} />
        </TabsContent>

        <TabsContent value="past" className="mt-6">
          <PastTab meetings={past} isSuperAdmin={isSuperAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── 1. Declare New Meeting form (rule 1) + upcoming cards ────────────────────

function UpcomingTab({ meetings }: { meetings: MeetingSerialized[] }) {
  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <SectionCard title="Declare New Meeting" icon={<CalendarDays />}>
          <DeclareMeetingForm />
        </SectionCard>
      </div>

      <div className="space-y-4 lg:col-span-2">
        <h2 className="t-h2 text-primary-ink">Upcoming Meetings</h2>
        {meetings.length === 0 ? (
          <SectionCard bodyClassName="py-12 text-center">
            <p className="t-body text-muted-ink">No upcoming meetings.</p>
          </SectionCard>
        ) : (
          meetings.map((m) => <MeetingCard key={m.id} meeting={m} />)
        )}
      </div>
    </div>
  )
}

function DeclareMeetingForm() {
  const [type, setType] = useState<"OFFLINE" | "ONLINE">("OFFLINE")
  return (
    <form action={createMeeting} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Meeting Title *</Label>
        <Input id="title" name="title" required placeholder="Monthly General Meeting" className="bg-[var(--control-bg)]" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="date">Date &amp; Time *</Label>
        <Input id="date" name="date" type="datetime-local" required className="bg-[var(--control-bg)]" />
      </div>

      {/* Rule 1: Meeting Type radio selector */}
      <div className="space-y-2">
        <Label>Meeting Type *</Label>
        <div className="grid grid-cols-2 gap-2">
          <TypeRadio active={type === "OFFLINE"} onClick={() => setType("OFFLINE")} icon={<MapPin className="h-4 w-4" />} label="Offline" />
          <TypeRadio active={type === "ONLINE"} onClick={() => setType("ONLINE")} icon={<Video className="h-4 w-4" />} label="Online" />
        </div>
        <input type="hidden" name="type" value={type} />
      </div>

      {/* Rule 1: conditional Location / Meeting Link */}
      {type === "OFFLINE" ? (
        <div className="space-y-2">
          <Label htmlFor="location">Location *</Label>
          <Input id="location" name="location" required placeholder="Foundation Office, Room 101" className="bg-[var(--control-bg)]" />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="link">Meeting Link *</Label>
          <Input id="link" name="link" type="url" required placeholder="https://meet.example.com/abc-defg-hij" className="bg-[var(--control-bg)]" />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="agenda">Agenda</Label>
        <Textarea id="agenda" name="agenda" rows={4} placeholder="Discuss monthly savings and upcoming projects..." className="bg-[var(--control-bg)]" />
      </div>

      <Button type="submit" className="brand-gradient w-full shadow-brand-glow">Declare &amp; Notify Members</Button>
    </form>
  )
}

function TypeRadio({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 t-body font-medium transition-colors ${
        active
          ? "border-brand bg-brand-gradient-soft text-brand"
          : "border-[var(--border-base)] text-muted-ink hover:bg-subtle hover:text-primary-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

// ── Meeting card (shared summary) ────────────────────────────────────────────

function MeetingCard({ meeting: m }: { meeting: MeetingSerialized }) {
  const isOnline = m.type === "ONLINE"
  return (
    <SectionCard bodyClassName="p-6">
      <div className="flex items-start justify-between gap-3">
        <h3 className="t-h3 text-brand">{m.title}</h3>
        <TypeBadge type={m.type} />
      </div>
      <div className="mt-2 mb-3 flex flex-wrap gap-4 t-body text-secondary-ink">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 text-faint-ink" /> {new Date(m.date).toLocaleString()}
        </span>
        {isOnline ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <Link2 className="h-4 w-4 text-faint-ink" />
            <a href={m.link ?? "#"} target="_blank" rel="noreferrer" className="truncate text-brand hover:underline">
              {m.link}
            </a>
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-faint-ink" /> {m.location}
          </span>
        )}
      </div>
      <div className="rounded-lg bg-inset p-3 t-body text-secondary-ink">
        <span className="mb-1 flex items-center gap-1.5 font-bold"><ClipboardList className="h-4 w-4" /> Agenda:</span>
        {m.agenda || "—"}
      </div>
    </SectionCard>
  )
}

function TypeBadge({ type }: { type: string }) {
  const online = type === "ONLINE"
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-0.5 t-caption font-semibold ${
        online
          ? "border-info bg-info-soft text-info"
          : "border-success bg-success-soft text-success"
      }`}
    >
      {online ? "Online" : "Offline"}
    </span>
  )
}

// ── 3 & 4. Past Meetings — list view with search + filter ─────────────────────

function PastTab({ meetings, isSuperAdmin }: { meetings: MeetingSerialized[]; isSuperAdmin: boolean }) {
  const [q, setQ] = useState("")
  const [date, setDate] = useState("")
  const [type, setType] = useState<"ALL" | "ONLINE" | "OFFLINE">("ALL")

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return meetings.filter((m) => {
      if (needle && !m.title.toLowerCase().includes(needle)) return false
      if (type !== "ALL" && m.type !== type) return false
      if (date) {
        const md = new Date(m.date)
        const fd = new Date(date + "T00:00:00")
        const sameDay =
          md.getFullYear() === fd.getFullYear() &&
          md.getMonth() === fd.getMonth() &&
          md.getDate() === fd.getDate()
        if (!sameDay) return false
      }
      return true
    })
  }, [meetings, q, date, type])

  return (
    <div className="space-y-4">
      {/* Rule 4: search + filter row */}
      <SectionCard bodyClassName="p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint-ink" />
            <Input
              placeholder="Search by meeting title…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="bg-[var(--control-bg)] pl-9"
            />
          </div>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-[var(--control-bg)] md:w-44" />
          <Select value={type} onValueChange={(v) => setType(v as "ALL" | "ONLINE" | "OFFLINE")}>
            <SelectTrigger className="bg-[var(--control-bg)] md:w-44"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              <SelectItem value="ONLINE">Online</SelectItem>
              <SelectItem value="OFFLINE">Offline</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      {filtered.length === 0 ? (
        <SectionCard bodyClassName="py-12 text-center">
          <p className="t-body text-muted-ink">No past meetings match your filters.</p>
        </SectionCard>
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => (
            <PastMeetingRow key={m.id} meeting={m} isSuperAdmin={isSuperAdmin} />
          ))}
        </div>
      )}
    </div>
  )
}

function PastMeetingRow({ meeting: m, isSuperAdmin }: { meeting: MeetingSerialized; isSuperAdmin: boolean }) {
  // Rule 5: attendance editable unless locked (or always by Super Admin).
  const canEdit = isSuperAdmin || !m.attendanceLocked
  return (
    <SectionCard bodyClassName="p-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="t-subheading truncate text-primary-ink">{m.title}</h3>
            <TypeBadge type={m.type} />
            {m.attendanceLocked && (
              <span className="inline-flex items-center gap-1 t-caption font-medium text-warning">
                <Lock className="h-3 w-3" /> Attendance locked
              </span>
            )}
          </div>
          <p className="t-caption mt-1 flex flex-wrap gap-3 text-muted-ink">
            <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {new Date(m.date).toLocaleString()}</span>
            <span className="flex items-center gap-1">
              {m.type === "ONLINE" ? <Link2 className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
              {m.type === "ONLINE" ? "Online" : m.location ?? "—"}
            </span>
            {m.minutesUrl && (
              <span className="flex items-center gap-1 text-success">
                <FileText className="h-3.5 w-3.5" /> Minutes attached
              </span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Rule 3: View Details */}
          <Dialog>
            <DialogTrigger
              render={
                <Button variant="outline" size="sm">
                  <Eye className="mr-1.5 h-4 w-4" /> View Details
                </Button>
              }
            />
            <DetailsDialog meeting={m} isSuperAdmin={isSuperAdmin} />
          </Dialog>

          {/* Rule 3: Mark Attendance */}
          <Dialog>
            <DialogTrigger
              render={
                <Button size="sm" className="brand-gradient shadow-brand-glow">
                  <CheckSquare className="mr-1.5 h-4 w-4" /> Mark Attendance
                </Button>
              }
            />
            <DialogContent className="max-w-2xl rounded-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 t-h3">
                  Attendance — {m.title}
                  {m.attendanceLocked && (
                    <span className="inline-flex items-center gap-1 t-caption font-medium text-warning">
                      <Lock className="h-3 w-3" /> Locked
                    </span>
                  )}
                </DialogTitle>
              </DialogHeader>
              {canEdit ? (
                <AttendancePanel meetingId={m.id} members={m.members} existing={m.attendances} locked={false} canEdit={true} />
              ) : (
                <AttendancePanel meetingId={m.id} members={m.members} existing={m.attendances} locked={true} canEdit={false} />
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </SectionCard>
  )
}

function DetailsDialog({ meeting: m, isSuperAdmin }: { meeting: MeetingSerialized; isSuperAdmin: boolean }) {
  return (
    <DialogContent className="max-w-2xl rounded-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 t-h3">
          {m.title}
          <TypeBadge type={m.type} />
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4 t-body">
        <div className="flex flex-wrap gap-4 text-secondary-ink">
          <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-faint-ink" /> {new Date(m.date).toLocaleString()}</span>
          {m.type === "ONLINE" ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <Link2 className="h-4 w-4 text-faint-ink" />
              <a href={m.link ?? "#"} target="_blank" rel="noreferrer" className="truncate text-brand hover:underline">{m.link}</a>
            </span>
          ) : (
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-faint-ink" /> {m.location}</span>
          )}
        </div>

        <div className="rounded-lg bg-inset p-3 text-secondary-ink">
          <span className="mb-1 flex items-center gap-1.5 font-bold"><ClipboardList className="h-4 w-4" /> Agenda:</span>
          {m.agenda || "—"}
        </div>

        {/* Attendance summary */}
        <AttendanceSummary attendances={m.attendances} />

        {/* Rule 6: Meeting Minutes */}
        <div className="border-t border-[var(--border-base)] pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="t-subheading flex items-center gap-1.5"><FileText className="h-4 w-4" /> Meeting Minutes</span>
            {m.minutesLocked && !isSuperAdmin && (
              <span className="inline-flex items-center gap-1 t-caption text-warning"><Lock className="h-3 w-3" /> Locked</span>
            )}
          </div>
          {m.minutesUrl ? (
            <div className="flex items-center justify-between gap-2">
              <a href={m.minutesUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 truncate t-body text-brand hover:underline">
                <FileText className="h-4 w-4" /> {m.minutesFileName ?? "Download"}
              </a>
              {isSuperAdmin && <MinutesUploadButton meetingId={m.id} replace label="Replace" />}
            </div>
          ) : (
            <MinutesUploadButton meetingId={m.id} replace={false} label="Upload Minutes" />
          )}
        </div>
      </div>
    </DialogContent>
  )
}

function AttendanceSummary({ attendances }: { attendances: Attendance[] }) {
  const present = attendances.filter((a) => a.status === "PRESENT").length
  const excused = attendances.filter((a) => a.status === "EXCUSED").length
  const absent = attendances.filter((a) => a.status === "ABSENT").length
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <SummaryPill label="Present" value={present} tone="success" />
      <SummaryPill label="Excused" value={excused} tone="warning" />
      <SummaryPill label="Absent" value={absent} tone="debit" />
    </div>
  )
}

function SummaryPill({ label, value, tone }: { label: string; value: number; tone: "success" | "warning" | "debit" }) {
  const tones: Record<string, string> = {
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    debit: "bg-debit-soft text-debit",
  }
  return (
    <div className={`rounded-lg py-2 ${tones[tone]}`}>
      <p className="t-h3 t-num leading-none">{value}</p>
      <p className="t-caption mt-1">{label}</p>
    </div>
  )
}

// ── Super Admin: Permissions panel (rules 5 & 6) ──────────────────────────────

function PermissionsPanel({ adminUsers }: { adminUsers: AdminUser[] }) {
  return (
    <SectionCard title="Authorized Users" icon={<Shield />} accent="violet">
      <p className="t-caption mb-3 text-muted-ink">
        Grant these so normal admins can submit attendance or upload minutes once. After submission the record locks; only you can edit.
      </p>
      <div className="divide-y divide-[var(--border-base)]">
        {adminUsers.map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="truncate t-body font-medium text-primary-ink">{u.email}</p>
              <p className="t-caption text-muted-ink">
                {u.role === "SUPER_ADMIN" ? "Super Admin — full access" : "Admin"}
              </p>
            </div>
            {u.role === "SUPER_ADMIN" ? (
              <span className="t-caption italic text-faint-ink">No restrictions</span>
            ) : (
              <div className="flex items-center gap-4">
                <PermissionToggle userId={u.id} permission="MEETING_ATTENDANCE_MARK" label="Mark Attendance" granted={u.canMarkAttendance} />
                <PermissionToggle userId={u.id} permission="MEETING_MINUTES_UPLOAD" label="Upload Minutes" granted={u.canUploadMinutes} />
              </div>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
