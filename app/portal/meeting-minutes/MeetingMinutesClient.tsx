"use client"

/**
 * Meeting Minutes — member-portal client (read-only archive).
 *
 * Lightweight filter (search by title + type filter) over the past meetings
 * that have minutes attached. Each row links to the minutes file (opens in a
 * new tab). Mirrors the Past tab styling of the dashboard MeetingsClient.
 */

import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  CalendarDays, Link2, MapPin, FileText, Download, Search, Video,
} from "lucide-react"

import SectionCard from "@/components/somiti/SectionCard"

interface Row {
  id: string
  title: string
  date: string
  type: string
  location: string | null
  link: string | null
  minutesUrl: string
  minutesFileName: string | null
}

export default function MeetingMinutesClient({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("")
  const [type, setType] = useState<"ALL" | "ONLINE" | "OFFLINE">("ALL")

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((m) => {
      if (needle && !m.title.toLowerCase().includes(needle)) return false
      if (type !== "ALL" && m.type !== type) return false
      return true
    })
  }, [rows, q, type])

  return (
    <div className="space-y-4">
      {/* Filters */}
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
          <FileText className="mx-auto mb-2 h-8 w-8 text-faint-ink" />
          <p className="t-body text-muted-ink">
            {rows.length === 0 ? "No meeting minutes have been published yet." : "No meetings match your filters."}
          </p>
        </SectionCard>
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => (
            <SectionCard key={m.id} bodyClassName="p-4">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="t-subheading truncate text-primary-ink">{m.title}</h3>
                    <TypeBadge type={m.type} />
                  </div>
                  <p className="t-caption mt-1 flex flex-wrap gap-3 text-muted-ink">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" /> {new Date(m.date).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                      {m.type === "ONLINE" ? <Link2 className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                      {m.type === "ONLINE" ? "Online" : m.location ?? "—"}
                    </span>
                  </p>
                </div>

                <a
                  href={m.minutesUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg brand-gradient px-4 py-2 t-body font-medium text-white shadow-brand-glow hover:opacity-95"
                >
                  <Download className="h-4 w-4" />
                  {m.minutesFileName ? "View Minutes" : "Download"}
                </a>
              </div>
              {m.minutesFileName && (
                <p className="mt-2 flex items-center gap-1.5 t-caption text-success">
                  <FileText className="h-3.5 w-3.5" /> {m.minutesFileName}
                </p>
              )}
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const online = type === "ONLINE"
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 t-caption font-semibold ${
        online
          ? "border-info bg-info-soft text-info"
          : "border-success bg-success-soft text-success"
      }`}
    >
      {online ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
      {online ? "Online" : "Offline"}
    </span>
  )
}
