import prisma from "@/lib/prisma"
import { notifyTaskAssignees } from "@/lib/tasks/notify"
import type { Task, TaskAssignee, TaskReminder, TaskRecurrence } from "@prisma/client"

// ──────────────────────────────────────────────────────────────────────────────
// Task dispatcher — the business logic invoked by /api/tasks/process on an
// hourly cron. Three jobs, each safe to re-run (idempotent):
//
//   1. Reminder dispatch     — fire due TaskReminder rows once.
//   2. Recurring spawn       — clone template tasks whose next occurrence is due.
//   3. Overdue escalation    — alert on tasks past dueDate that are still open.
//
// All three return counts so the cron route can report a summary.
// ──────────────────────────────────────────────────────────────────────────────

export interface DispatcherResult {
  remindersDispatched: number
  tasksSpawned: number
  overdueEscalated: number
  errors: string[]
}

type AssigneeTask = Task & { assignees: TaskAssignee[] }

// Resolve contact channels for a task's assignees — returns the three
// recipient buckets used by notifyTaskAssignees.
async function resolveAssigneeBuckets(task: { assignees: TaskAssignee[] }) {
  const staffUserIds: string[] = []
  const memberIds: string[] = []
  const committeeIds: string[] = []
  for (const a of task.assignees) {
    if (a.assigneeType === "STAFF" && a.userId) staffUserIds.push(a.userId)
    if (a.assigneeType === "MEMBER" && a.memberId) memberIds.push(a.memberId)
    if (a.assigneeType === "COMMITTEE" && a.committeeId) committeeIds.push(a.committeeId)
  }
  return { staffUserIds, memberIds, committeeIds }
}

// ── 1. Reminders ──────────────────────────────────────────────────────────────
async function dispatchReminders(): Promise<{ count: number; errors: string[] }> {
  const now = new Date()
  const errors: string[] = []
  let count = 0

  // Pending reminders whose target time has arrived. Target time = dueDate +
  // offsetMinutes (offset is negative for "before due").
  const reminders = await prisma.taskReminder.findMany({
    where: { dispatchedAt: null, task: { dueDate: { not: null } } },
    include: { task: { include: { assignees: true } } },
    take: 200,
  })

  for (const r of reminders as (TaskReminder & { task: AssigneeTask })[]) {
    if (!r.task.dueDate) continue
    const fireAt = new Date(r.task.dueDate.getTime() + r.offsetMinutes * 60 * 1000)
    if (fireAt > now) continue // not yet time

    const dueLabel = r.task.dueDate.toLocaleString()
    const title = r.task.dueDate > now ? `Reminder: ${r.task.title}` : `Overdue: ${r.task.title}`
    const body =
      r.task.dueDate > now
        ? `Task "${r.task.title}" is due ${dueLabel}.`
        : `Task "${r.task.title}" was due ${dueLabel}.`

    try {
      const buckets = await resolveAssigneeBuckets(r.task)
      await notifyTaskAssignees({
        title,
        body,
        staffUserIds: buckets.staffUserIds,
        memberIds: buckets.memberIds,
        committeeIds: buckets.committeeIds,
        channels: [r.channel === "IN_APP" ? "IN_APP" : r.channel],
        taskPath: `/dashboard/tasks/${r.task.id}`,
      })
    } catch (e) {
      errors.push(`reminder ${r.id}: ${e instanceof Error ? e.message : String(e)}`)
    }

    await prisma.taskReminder.update({
      where: { id: r.id },
      data: { dispatchedAt: now },
    })
    count++
  }

  return { count, errors }
}

// ── 2. Recurring spawn ────────────────────────────────────────────────────────
const MS_PER: Record<Exclude<TaskRecurrence, "NONE">, number> = {
  DAILY: 24 * 60 * 60 * 1000,
  WEEKLY: 7 * 24 * 60 * 60 * 1000,
  MONTHLY: 30 * 24 * 60 * 60 * 1000,
  QUARTERLY: 90 * 24 * 60 * 60 * 1000,
  YEARLY: 365 * 24 * 60 * 60 * 1000,
}

async function spawnRecurring(): Promise<{ count: number; errors: string[] }> {
  const now = new Date()
  const errors: string[] = []
  let count = 0

  // Template tasks: recurrence != NONE, not cancelled, no parent (this IS the
  // template), and not past recurrenceEndDate.
  const templates = await prisma.task.findMany({
    where: {
      recurrence: { not: "NONE" },
      recurrenceParentId: null,
      status: { not: "CANCELLED" },
    },
    include: { assignees: true, checklist: true, reminders: true },
  })

  for (const t of templates) {
    try {
      const interval = MS_PER[t.recurrence as Exclude<TaskRecurrence, "NONE">]
      if (!interval) continue

      // Find the most recent occurrence (template or child) to compute next.
      const latest = await prisma.task.findFirst({
        where: {
          OR: [{ id: t.id }, { recurrenceParentId: t.id }],
        },
        orderBy: { dueDate: "desc" },
        select: { dueDate: true },
      })

      const anchor = latest?.dueDate ?? t.dueDate ?? t.createdAt
      const next = new Date(anchor.getTime() + interval)
      if (next > now) continue // not due yet
      if (t.recurrenceEndDate && next > t.recurrenceEndDate) continue // series ended

      // Clone the template into a fresh TODO occurrence.
      const created = await prisma.task.create({
        data: {
          title: t.title,
          description: t.description,
          status: "TODO",
          priority: t.priority,
          dueDate: next,
          recurrence: "NONE", // occurrences are one-offs
          recurrenceParentId: t.id,
          requiresApproval: t.requiresApproval,
          isPrivate: t.isPrivate,
          location: t.location,
          meetingId: t.meetingId,
          loanId: t.loanId,
          memberRequestId: t.memberRequestId,
          transactionId: t.transactionId,
          relatedMemberId: t.relatedMemberId,
          createdBy: "RECURRENCE",
          createdById: t.createdById,
          assignees: {
            create: t.assignees.map((a) => ({
              assigneeType: a.assigneeType,
              userId: a.userId,
              memberId: a.memberId,
              committeeId: a.committeeId,
            })),
          },
          checklist: {
            create: t.checklist.map((c) => ({ title: c.title, order: c.order })),
          },
          // Fresh reminders carried from template (offsets preserved, ready to fire).
          reminders: {
            create: t.reminders.map((r) => ({
              channel: r.channel,
              offsetMinutes: r.offsetMinutes,
            })),
          },
        },
      })

      await prisma.taskAuditLog.create({
        data: {
          taskId: created.id,
          action: "RECURRENCE_SPAWN",
          summary: `Recurring occurrence spawned (due ${next.toDateString()})`,
        },
      })
      count++
    } catch (e) {
      errors.push(`spawn ${t.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { count, errors }
}

// ── 3. Overdue escalation ─────────────────────────────────────────────────────
async function escalateOverdue(): Promise<{ count: number; errors: string[] }> {
  const now = new Date()
  const errors: string[] = []
  let count = 0

  const overdueTasks = await prisma.task.findMany({
    where: {
      dueDate: { lt: now },
      status: { in: ["TODO", "IN_PROGRESS", "ON_HOLD"] },
    },
    include: { assignees: true },
    take: 200,
  })

  for (const t of overdueTasks as AssigneeTask[]) {
    // Only escalate once — check an audit log entry exists.
    const already = await prisma.taskAuditLog.findFirst({
      where: { taskId: t.id, action: "OVERDUE_ESCALATION" },
      select: { id: true },
    })
    if (already) continue

    try {
      const buckets = await resolveAssigneeBuckets(t)
      // Include the creator as a staff recipient when known.
      if (t.createdById) buckets.staffUserIds.push(t.createdById)

      await notifyTaskAssignees({
        title: `Task overdue: ${t.title}`,
        body: `"${t.title}" passed its due date (${t.dueDate?.toLocaleDateString()}) and is still open.`,
        staffUserIds: buckets.staffUserIds,
        memberIds: buckets.memberIds,
        committeeIds: buckets.committeeIds,
        channels: ["IN_APP"],
        taskPath: `/dashboard/tasks/${t.id}`,
      })

      await prisma.taskAuditLog.create({
        data: {
          taskId: t.id,
          action: "OVERDUE_ESCALATION",
          summary: `Overdue escalation sent (due ${t.dueDate?.toDateString()})`,
        },
      })
      count++
    } catch (e) {
      errors.push(`overdue ${t.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { count, errors }
}

// ── Orchestrator ──────────────────────────────────────────────────────────────
export async function runTaskDispatcher(): Promise<DispatcherResult> {
  const [r1, r2, r3] = await Promise.all([
    dispatchReminders(),
    spawnRecurring(),
    escalateOverdue(),
  ])
  return {
    remindersDispatched: r1.count,
    tasksSpawned: r2.count,
    overdueEscalated: r3.count,
    errors: [...r1.errors, ...r2.errors, ...r3.errors],
  }
}
