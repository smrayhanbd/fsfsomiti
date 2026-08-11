"use client"

// Meeting Attendance panel (FRS §5.4, §8.3) — rules 5 & 6.
//
// Renders inside each meeting card. Members are listed with a three-way
// segmented control (PRESENT / ABSENT / EXCUSED). The whole set is saved in
// one call to markAttendance, which fires a Trust Score recalc per member.
//
// When `locked` is true (and canEdit false), the control becomes read-only:
// the member's status is shown as a colored badge and Save is disabled.
// Submission by an authorized normal user locks the record; only the Super
// Admin can edit it afterwards (enforced server-side in markAttendance).

import { useState, useTransition, useMemo } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { markAttendance } from "@/app/actions/meeting"
import { Check, X, Clock, Save, Loader2, Users, Lock } from "lucide-react"

interface Member {
  id: string
  fullName: string
  memberNo: string
}

interface Existing {
  memberId: string
  status: "PRESENT" | "ABSENT" | "EXCUSED"
}

type Att = "PRESENT" | "ABSENT" | "EXCUSED"

export default function AttendancePanel({
  meetingId,
  members,
  existing,
  locked = false,
  canEdit = true,
}: {
  meetingId: string
  members: Member[]
  existing: Existing[]
  locked?: boolean
  canEdit?: boolean
}) {
  // Seed local state from what's already recorded.
  const initial = useMemo(() => {
    const m = new Map<string, Att>()
    for (const e of existing) m.set(e.memberId, e.status)
    return m
  }, [existing])

  const [state, setState] = useState<Map<string, Att>>(initial)
  const [pending, startTransition] = useTransition()

  const set = (memberId: string, status: Att) => {
    setState((prev) => {
      const next = new Map(prev)
      next.set(memberId, status)
      return next
    })
  }

  const markAllPresent = () => {
    setState((prev) => {
      const next = new Map(prev)
      for (const m of members) next.set(m.id, "PRESENT")
      return next
    })
  }

  const save = () => {
    const rows = members.map((m) => ({
      memberId: m.id,
      status: state.get(m.id) ?? "ABSENT",
    }))
    startTransition(async () => {
      try {
        await markAttendance(meetingId, rows)
        toast.success(`Attendance saved for ${members.length} member(s). Trust scores updated.`)
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to save attendance.")
      }
    })
  }

  const presentCount = Array.from(state.values()).filter((s) => s === "PRESENT").length
  const excusedCount = Array.from(state.values()).filter((s) => s === "EXCUSED").length

  return (
    <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Users className="w-3.5 h-3.5" />
          <span>
            Attendance · <span className="text-emerald-600 font-semibold">{presentCount} present</span>
            <span className="mx-1">·</span>
            <span className="text-amber-600 font-semibold">{excusedCount} excused</span>
            <span className="mx-1">·</span>
            <span>{members.length} total</span>
          </span>
        </div>
        {canEdit ? (
          <button
            onClick={markAllPresent}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
          >
            Mark all present
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
            <Lock className="h-3 w-3" /> Locked — Super Admin only
          </span>
        )}
      </div>

      <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
        {members.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-3 text-center">No eligible members.</p>
        ) : (
          members.map((m) => {
            const current = state.get(m.id) ?? "ABSENT"
            return (
              <div
                key={m.id}
                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{m.fullName}</p>
                  <p className="text-[11px] font-mono text-slate-400">{m.memberNo}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canEdit ? (
                    <>
                      <SegBtn active={current === "PRESENT"} onClick={() => set(m.id, "PRESENT")} tone="emerald" icon={<Check className="w-3 h-3" />} label="P" />
                      <SegBtn active={current === "EXCUSED"} onClick={() => set(m.id, "EXCUSED")} tone="amber" icon={<Clock className="w-3 h-3" />} label="E" />
                      <SegBtn active={current === "ABSENT"} onClick={() => set(m.id, "ABSENT")} tone="red" icon={<X className="w-3 h-3" />} label="A" />
                    </>
                  ) : (
                    <StatusBadge status={current} />
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      <Button
        onClick={save}
        disabled={pending || members.length === 0 || !canEdit}
        size="sm"
        className="mt-3 w-full bg-indigo-600 hover:bg-indigo-700"
      >
        {pending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        {locked ? "Locked" : "Save Attendance"}
      </Button>
    </div>
  )
}

function SegBtn({
  active,
  onClick,
  tone,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  tone: "emerald" | "amber" | "red"
  icon: React.ReactNode
  label: string
}) {
  const tones: Record<string, string> = {
    emerald: active ? "bg-emerald-600 text-white" : "text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-950/40",
    amber: active ? "bg-amber-500 text-white" : "text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-950/40",
    red: active ? "bg-red-500 text-white" : "text-red-600 hover:bg-red-100 dark:hover:bg-red-950/40",
  }
  return (
    <button
      onClick={onClick}
      title={label === "P" ? "Present" : label === "E" ? "Excused" : "Absent"}
      className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${tones[tone]}`}
    >
      {icon}
    </button>
  )
}

// Read-only status badge shown when attendance is locked for this user.
function StatusBadge({ status }: { status: Att }) {
  const map: Record<Att, { text: string; cls: string; icon: React.ReactNode }> = {
    PRESENT: { text: "Present", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300", icon: <Check className="w-3 h-3" /> },
    EXCUSED: { text: "Excused", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300", icon: <Clock className="w-3 h-3" /> },
    ABSENT: { text: "Absent", cls: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300", icon: <X className="w-3 h-3" /> },
  }
  const s = map[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>
      {s.icon} {s.text}
    </span>
  )
}
