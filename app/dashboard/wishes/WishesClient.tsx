"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import {
  Heart, Cake, HeartHandshake, CalendarPlus, Sparkles, Send,
  Plus, Pencil, Trash2, CalendarClock, CheckCircle2, XCircle,
  Mail, MessageSquare, Loader2, PartyPopper, type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"

import {
  addFestival, updateFestival, deleteFestival, toggleFestivalStatus, sendWishesNow,
} from "@/app/actions/wishes"
import type { WishLogWithDetails } from "@/app/actions/wishes"

import PageHeader from "@/components/somiti/PageHeader"
import StatCard from "@/components/somiti/StatCard"
import SectionCard from "@/components/somiti/SectionCard"

// =============== Types ===============

type Festival = {
  id: string
  name: string
  month: number
  day: number
  message: string | null
  isActive: boolean
}

type UpcomingWish = {
  type: "BIRTHDAY" | "MARRIAGE" | "JOINING" | "FESTIVAL"
  date: string
  title: string
  daysUntil: number
  recipient?: { id: string; fullName: string; phone: string; email?: string | null }
  festival?: { id: string; name: string; message?: string | null }
}

interface WishesClientProps {
  initialFestivals: Festival[]
  upcomingWishes: UpcomingWish[]
  initialStats: {
    totalSent: number
    todaySent: number
    todayFailed: number
    memberCount: number
    festivalCount: number
  }
  initialLogs: WishLogWithDetails[]
  totalLogs: number
}

// =============== Constants ===============

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
]

function getDaysInMonth(month: number): number {
  return new Date(2024, month, 0).getDate()
}

// tone → token utility classes (color-independent)
const WISH_TYPE_META = {
  BIRTHDAY: { label: "Birthday", icon: Cake as LucideIcon, color: "text-violet-brand", bg: "bg-brand-gradient-soft", badge: "bg-brand-gradient-soft text-brand border-brand" },
  MARRIAGE: { label: "Anniversary", icon: HeartHandshake as LucideIcon, color: "text-debit", bg: "bg-debit-soft", badge: "bg-debit-soft text-debit border-debit" },
  JOINING: { label: "Joining Day", icon: CalendarPlus as LucideIcon, color: "text-brand", bg: "bg-info-soft", badge: "bg-info-soft text-info border-info" },
  FESTIVAL: { label: "Festival", icon: PartyPopper as LucideIcon, color: "text-gold", bg: "bg-warning-soft", badge: "bg-warning-soft text-warning border-warning" },
} as const

// =============== Main Component ===============

export default function WishesClient({
  initialFestivals, upcomingWishes, initialStats, initialLogs, totalLogs,
}: WishesClientProps) {
  const [festivals, setFestivals] = useState<Festival[]>(initialFestivals)
  const stats = initialStats
  const logs = initialLogs
  const [isSending, startSend] = useTransition()

  const [festivalDialogOpen, setFestivalDialogOpen] = useState(false)
  const [editingFestival, setEditingFestival] = useState<Festival | null>(null)

  async function handleSendNow() {
    startSend(async () => {
      try {
        const result = await sendWishesNow()
        toast.success(`Wishes dispatched! ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped.`)
        window.location.reload()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        toast.error(`Failed to send wishes: ${message}`)
      }
    })
  }

  function openAddFestival() {
    setEditingFestival(null)
    setFestivalDialogOpen(true)
  }

  function openEditFestival(f: Festival) {
    setEditingFestival(f)
    setFestivalDialogOpen(true)
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Special Wishes"
        subtitle="Automatically send birthday, anniversary, joining day & festival wishes to members every year."
        actions={
          <Button onClick={handleSendNow} disabled={isSending} className="brand-gradient shadow-brand-glow">
            {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send Today&apos;s Wishes Now
          </Button>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Wishes Sent" value={stats.totalSent.toLocaleString()} icon={Sparkles} accent="blue" />
        <StatCard label="Sent Today" value={stats.todaySent.toLocaleString()} icon={CheckCircle2} accent="emerald" />
        <StatCard label="Failed Today" value={stats.todayFailed.toLocaleString()} icon={XCircle} accent="crimson" />
        <StatCard label="Active Festivals" value={stats.festivalCount.toLocaleString()} icon={PartyPopper} accent="gold" />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="festivals">Festivals</TabsTrigger>
          <TabsTrigger value="logs">Send Logs</TabsTrigger>
        </TabsList>

        {/* ===== OVERVIEW ===== */}
        <TabsContent value="overview" className="space-y-6">
          {/* Automation Info Card */}
          <SectionCard>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl brand-gradient text-white shadow-brand-glow">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h3 className="t-h3 text-primary-ink">How Automation Works</h3>
                <p className="t-body leading-relaxed text-secondary-ink">
                  The system checks daily for members whose <strong>Birthday</strong>, <strong>Marriage Anniversary</strong>,
                  or <strong>Joining Anniversary</strong> falls on that date, and sends personalized wishes via SMS and Email.
                  Festivals are also sent automatically to all active members on their scheduled date.
                </p>
                <div className="mt-3 rounded-lg bg-inset p-3">
                  <p className="t-num t-caption break-all text-secondary-ink">
                    📅 Cron Endpoint: <code className="text-brand">/api/wishes/send</code>
                  </p>
                  <p className="mt-1 t-caption text-muted-ink">
                    Call this endpoint daily at 9:00 AM (or your preferred time) using Vercel Cron, GitHub Actions, or any external scheduler.
                    Add <code className="text-brand">CRON_SECRET</code> env var to secure it.
                  </p>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Upcoming Wishes */}
          <div>
            <h2 className="t-h2 mb-4 flex items-center gap-2 text-primary-ink">
              <CalendarClock className="h-5 w-5 text-faint-ink" />
              Upcoming Wishes (Next 30 Days)
            </h2>
            {upcomingWishes.length === 0 ? (
              <SectionCard bodyClassName="py-12 text-center"><p className="t-body text-muted-ink">No upcoming wishes in the next 30 days.</p></SectionCard>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {upcomingWishes.slice(0, 12).map((wish, i) => {
                  const meta = WISH_TYPE_META[wish.type]
                  const Icon = meta.icon
                  return (
                    <div key={i} className="card-premium card-premium-hover p-4">
                      <div className="flex items-start gap-3">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${meta.bg}`}>
                          <Icon className={`h-5 w-5 ${meta.color}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <Badge variant="secondary" className={`t-caption border-0 ${meta.badge}`}>{meta.label}</Badge>
                            <span className="t-caption text-faint-ink">
                              {wish.daysUntil === 0 ? "Today" : wish.daysUntil === 1 ? "Tomorrow" : `in ${wish.daysUntil} days`}
                            </span>
                          </div>
                          <p className="t-subheading truncate text-primary-ink">{wish.title}</p>
                          <p className="t-num t-caption mt-0.5 text-muted-ink">
                            {new Date(wish.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Event Source Breakdown */}
          <div className="grid gap-4 sm:grid-cols-3">
            <EventSourceCard icon={Cake} title="Birthdays" count={upcomingWishes.filter(w => w.type === "BIRTHDAY").length} description="From member date of birth" tone="violet" />
            <EventSourceCard icon={HeartHandshake} title="Anniversaries" count={upcomingWishes.filter(w => w.type === "MARRIAGE").length} description="From member marriage date" tone="crimson" />
            <EventSourceCard icon={CalendarPlus} title="Joining Days" count={upcomingWishes.filter(w => w.type === "JOINING").length} description="From member joining date" tone="blue" />
          </div>
        </TabsContent>

        {/* ===== FESTIVALS ===== */}
        <TabsContent value="festivals" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="t-h2 text-primary-ink">Festival Calendar</h2>
              <p className="t-body mt-0.5 text-muted-ink">Manage festivals. Wishes are sent to all active members automatically on the scheduled date.</p>
            </div>
            <Button onClick={openAddFestival} className="brand-gradient shadow-brand-glow">
              <Plus className="mr-2 h-4 w-4" /> Add Festival
            </Button>
          </div>

          {festivals.length === 0 ? (
            <SectionCard bodyClassName="py-12 text-center">
              <PartyPopper className="mx-auto mb-3 h-10 w-10 text-faint-ink" />
              <p className="t-body mb-4 text-muted-ink">No festivals configured yet.</p>
              <Button onClick={openAddFestival} className="brand-gradient shadow-brand-glow">
                <Plus className="mr-2 h-4 w-4" /> Add Your First Festival
              </Button>
            </SectionCard>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {festivals.map((f) => (
                <FestivalCard
                  key={f.id}
                  festival={f}
                  onEdit={() => openEditFestival(f)}
                  onDelete={async () => {
                    if (!confirm(`Delete "${f.name}"?`)) return
                    try {
                      await deleteFestival(f.id)
                      setFestivals(prev => prev.filter(x => x.id !== f.id))
                      toast.success("Festival deleted")
                    } catch (err) { toast.error(err instanceof Error ? err.message : String(err)) }
                  }}
                  onToggle={async () => {
                    try {
                      await toggleFestivalStatus(f.id)
                      setFestivals(prev => prev.map(x => x.id === f.id ? { ...x, isActive: !x.isActive } : x))
                      toast.success(`${f.name} ${f.isActive ? "disabled" : "enabled"}`)
                    } catch (err) { toast.error(err instanceof Error ? err.message : String(err)) }
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===== LOGS ===== */}
        <TabsContent value="logs" className="space-y-6">
          <div>
            <h2 className="t-h2 text-primary-ink">Send History</h2>
            <p className="t-body mt-0.5 text-muted-ink">Log of all wishes sent via SMS and Email. Showing {logs.length} of {totalLogs} records.</p>
          </div>

          {logs.length === 0 ? (
            <SectionCard bodyClassName="py-12 text-center">
              <p className="t-body text-muted-ink">No wishes have been sent yet. Click &quot;Send Today&apos;s Wishes Now&quot; to dispatch.</p>
            </SectionCard>
          ) : (
            <SectionCard bodyClassName="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-[var(--border-base)] bg-subtle/40 hover:bg-transparent">
                    <TableHead className="t-overline text-muted-ink">Type</TableHead>
                    <TableHead className="t-overline text-muted-ink">Recipient</TableHead>
                    <TableHead className="t-overline text-muted-ink">Channel</TableHead>
                    <TableHead className="t-overline text-muted-ink">Status</TableHead>
                    <TableHead className="t-overline min-w-[200px] text-muted-ink">Message</TableHead>
                    <TableHead className="t-overline text-muted-ink">Sent At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const meta = WISH_TYPE_META[log.type as keyof typeof WISH_TYPE_META] || WISH_TYPE_META.FESTIVAL
                    const Icon = meta.icon
                    return (
                      <TableRow key={log.id} className="border-[var(--border-base)] transition-colors hover:bg-subtle">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 ${meta.color}`} />
                            <span className="t-body font-medium">{meta.label}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {log.member ? (
                            <div>
                              <p className="t-body font-medium text-primary-ink">{log.member.fullName}</p>
                              <p className="t-num t-caption text-muted-ink">{log.member.memberNo}</p>
                            </div>
                          ) : log.festival ? (
                            <span className="t-body font-medium text-gold">{log.festival.name}</span>
                          ) : (
                            <span className="t-caption text-muted-ink">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {log.channel === "SMS" ? (
                            <Badge variant="outline" className="border-info text-info"><MessageSquare className="mr-1 h-3 w-3" /> SMS</Badge>
                          ) : (
                            <Badge variant="outline" className="border-violet-brand text-violet-brand"><Mail className="mr-1 h-3 w-3" /> Email</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {log.status === "SENT" ? (
                            <Badge className="border-0 bg-success-soft text-success"><CheckCircle2 className="mr-1 h-3 w-3" /> Sent</Badge>
                          ) : (
                            <Badge className="border-0 bg-debit-soft text-debit"><XCircle className="mr-1 h-3 w-3" /> Failed</Badge>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[280px]">
                          <p className="t-caption truncate text-secondary-ink" title={log.message}>{log.message}</p>
                          {log.error && <p className="mt-0.5 truncate t-caption text-debit" title={log.error}>{log.error}</p>}
                        </TableCell>
                        <TableCell className="t-num t-caption whitespace-nowrap text-muted-ink">
                          {new Date(log.sentAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </SectionCard>
          )}
        </TabsContent>
      </Tabs>

      {/* Festival Dialog */}
      <FestivalDialog
        open={festivalDialogOpen}
        onOpenChange={setFestivalDialogOpen}
        festival={editingFestival}
        onSaved={(updated) => {
          setFestivals(prev => {
            const exists = prev.find(f => f.id === updated.id)
            if (exists) return prev.map(f => f.id === updated.id ? updated : f)
            return [...prev, updated].sort((a, b) => a.month - b.month || a.day - b.day)
          })
          setFestivalDialogOpen(false)
        }}
      />
    </div>
  )
}

// =============== Sub-Components ===============

function EventSourceCard({ icon: Icon, title, count, description, tone }: {
  icon: LucideIcon
  title: string
  count: number
  description: string
  tone: "violet" | "crimson" | "blue"
}) {
  const tones: Record<string, { bg: string; color: string }> = {
    violet: { bg: "bg-brand-gradient-soft", color: "text-violet-brand" },
    crimson: { bg: "bg-debit-soft", color: "text-debit" },
    blue: { bg: "bg-info-soft", color: "text-brand" },
  }
  const t = tones[tone]
  return (
    <div className="card-premium p-4">
      <div className="mb-2 flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${t.bg}`}>
          <Icon className={`h-5 w-5 ${t.color}`} />
        </div>
        <div>
          <p className="t-body font-semibold text-primary-ink">{title}</p>
          <p className="t-caption text-muted-ink">{description}</p>
        </div>
      </div>
      <p className="t-caption text-muted-ink">
        <span className="t-num font-bold text-primary-ink">{count}</span> upcoming
      </p>
    </div>
  )
}

function FestivalCard({ festival, onEdit, onDelete, onToggle }: {
  festival: Festival
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  return (
    <div className={`card-premium card-premium-hover p-4 ${!festival.isActive ? "opacity-60" : ""}`}>
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-warning-soft text-gold">
            <PartyPopper className="h-5 w-5" />
          </div>
          <div>
            <p className="t-subheading text-primary-ink">{festival.name}</p>
            <p className="t-num t-caption text-muted-ink">{MONTHS[festival.month - 1]} {festival.day}</p>
          </div>
        </div>
        <Switch checked={festival.isActive} onCheckedChange={onToggle} />
      </div>

      {festival.message && (
        <p className="mb-3 line-clamp-2 rounded-md bg-inset p-2 t-caption text-secondary-ink">
          &ldquo;{festival.message}&rdquo;
        </p>
      )}

      <div className="flex items-center justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" onClick={onDelete} className="text-debit hover:bg-debit-soft hover:text-debit">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

function FestivalDialog({ open, onOpenChange, festival, onSaved }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  festival: Festival | null
  onSaved: (festival: Festival) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(festival?.name || "")
  const [month, setMonth] = useState(festival?.month?.toString() || "1")
  const [day, setDay] = useState(festival?.day?.toString() || "1")
  const [message, setMessage] = useState(festival?.message || "")

  // Reset the form fields when the dialog opens or the festival being edited
  // changes. Uses the React "track previous value during render" pattern (see
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders)
  // rather than setState-in-effect, which is flagged by react-hooks/set-state-in-effect.
  // Calling setState during render is safe here because it's guarded by a
  // condition that becomes false on the next render.
  const [resetKey, setResetKey] = useState<string>("")
  const currentKey = open ? `open:${festival?.id ?? "new"}` : "closed"
  if (resetKey !== currentKey) {
    setResetKey(currentKey)
    if (open) {
      setName(festival?.name || "")
      setMonth(festival?.month?.toString() || "1")
      setDay(festival?.day?.toString() || "1")
      setMessage(festival?.message || "")
    }
  }

  const monthNum = parseInt(month)
  const daysInMonth = getDaysInMonth(monthNum)
  const dayNum = parseInt(day)
  const validDay = dayNum > daysInMonth ? daysInMonth.toString() : day

  function handleSubmit(formData: FormData) {
    formData.set("day", validDay)
    startTransition(async () => {
      try {
        if (festival) {
          await updateFestival(festival.id, formData)
          toast.success("Festival updated")
          onSaved({ id: festival.id, name, month: monthNum, day: parseInt(validDay), message: message || null, isActive: festival.isActive })
        } else {
          await addFestival(formData)
          toast.success("Festival added")
          onSaved({ id: "temp-" + Date.now(), name, month: monthNum, day: parseInt(validDay), message: message || null, isActive: true })
        }
      } catch (err) { toast.error(err instanceof Error ? err.message : String(err)) }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{festival ? "Edit Festival" : "Add Festival"}</DialogTitle>
          <DialogDescription>
            Wishes will be sent to all active members on this date every year.
            Use <code className="t-caption">{"${name}"}</code> for festival name and <code className="t-caption">{"${org}"}</code> for org name in the message.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="f-name">Festival Name *</Label>
            <Input id="f-name" name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Eid Ul Fitr, Durga Puja, Pohela Boishakh" className="bg-[var(--control-bg)]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Month *</Label>
              <Select value={month} onValueChange={(v) => { const sv = v || "1"; setMonth(sv); if (parseInt(day) > getDaysInMonth(parseInt(sv))) setDay("1") }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (<SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>))}
                </SelectContent>
              </Select>
              <input type="hidden" name="month" value={month} />
            </div>
            <div className="space-y-2">
              <Label>Day *</Label>
              <Select value={validDay} onValueChange={(v) => setDay(v || "1")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: daysInMonth }, (_, i) => (<SelectItem key={i} value={(i + 1).toString()}>{i + 1}</SelectItem>))}
                </SelectContent>
              </Select>
              <input type="hidden" name="day" value={validDay} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="f-message">Custom Message (optional)</Label>
            <Textarea id="f-message" name="message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Eid Mubarak ${name}! Wishing you joy and prosperity from ${org}. (Leave empty for default)" className="bg-[var(--control-bg)]" />
            <p className="t-caption text-muted-ink">Leave empty to use the default greeting.</p>
          </div>

          {festival && (
            <div className="flex items-center gap-2">
              <Label htmlFor="f-active" className="t-body">Active</Label>
              <Switch id="f-active" name="isActive" defaultChecked={festival.isActive} />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending} className="brand-gradient shadow-brand-glow">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {festival ? "Update" : "Add"} Festival
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
