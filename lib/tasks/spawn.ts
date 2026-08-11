import prisma from "@/lib/prisma"
import type { TaskPriority, TaskStatus } from "@prisma/client"
import { notifyTaskAssignees } from "@/lib/tasks/notify"

// ──────────────────────────────────────────────────────────────────────────────
// Auto-spawn helper for cross-module task integration.
//
// Other modules (loans, meetings, member requests, transactions, member
// approvals) call `spawnTask()` to create a follow-up task automatically when
// a business event happens. Each spawn is IDEMPOTENT: if an open task with
// the same title + linkage already exists, it is skipped — so calling this
// from a re-trigger or retry never floods the system with duplicates.
//
// Spawn is non-blocking on the caller: failures are logged but never throw.
// ──────────────────────────────────────────────────────────────────────────────

export interface SpawnTaskInput {
  title: string
  description?: string
  priority?: TaskPriority
  dueInDays?: number // computed from now
  // Integration link — pass the relevant id (all optional).
  meetingId?: string
  loanId?: string
  memberRequestId?: string
  transactionId?: string
  relatedMemberId?: string
  // Assignment — resolved to assignee rows. Pass any combination.
  staffUserIds?: string[]
  memberIds?: string[]
  committeeIds?: string[]
  // Audit context — who/what triggered the spawn.
  createdById?: string
  createdByLabel?: string // e.g. "LOAN_SYSTEM", "MEETING_SYSTEM"
  // Default checklist carried into the spawned task.
  checklist?: string[]
}

/**
 * Idempotently spawn a follow-up task. Returns the created task id, or null
 * when skipped (duplicate open task) or on failure.
 */
export async function spawnTask(input: SpawnTaskInput): Promise<string | null> {
  try {
    // Idempotency: skip if there's already an open task (not CANCELLED /
    // APPROVED / DONE) with the same title and the same primary linkage.
    const linkFilter: Record<string, string> = {}
    if (input.meetingId) linkFilter.meetingId = input.meetingId
    if (input.loanId) linkFilter.loanId = input.loanId
    if (input.memberRequestId) linkFilter.memberRequestId = input.memberRequestId
    if (input.transactionId) linkFilter.transactionId = input.transactionId
    if (input.relatedMemberId) linkFilter.relatedMemberId = input.relatedMemberId

    const existing = await prisma.task.findFirst({
      where: {
        title: input.title,
        status: { notIn: ["CANCELLED", "APPROVED", "DONE"] },
        ...linkFilter,
      },
      select: { id: true },
    })
    if (existing) return existing.id

    const dueDate = input.dueInDays
      ? new Date(Date.now() + input.dueInDays * 24 * 60 * 60 * 1000)
      : null

    // Build assignee rows.
    const assignees: {
      assigneeType: "STAFF" | "MEMBER" | "COMMITTEE"
      userId?: string
      memberId?: string
      committeeId?: string
    }[] = []
    for (const id of input.staffUserIds ?? []) {
      assignees.push({ assigneeType: "STAFF", userId: id })
    }
    for (const id of input.memberIds ?? []) {
      assignees.push({ assigneeType: "MEMBER", memberId: id })
    }
    for (const id of input.committeeIds ?? []) {
      assignees.push({ assigneeType: "COMMITTEE", committeeId: id })
    }

    const checklistItems = (input.checklist ?? []).map((title, i) => ({
      title,
      order: i,
    }))

    const task = await prisma.task.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? "MEDIUM",
        status: "TODO" as TaskStatus,
        dueDate,
        recurrence: "NONE",
        meetingId: input.meetingId ?? null,
        loanId: input.loanId ?? null,
        memberRequestId: input.memberRequestId ?? null,
        transactionId: input.transactionId ?? null,
        relatedMemberId: input.relatedMemberId ?? null,
        createdBy: input.createdByLabel ?? "SYSTEM",
        createdById: input.createdById ?? null,
        assignees: { create: assignees },
        checklist: { create: checklistItems },
      },
      include: { assignees: true },
    })

    // Audit
    await prisma.taskAuditLog.create({
      data: {
        taskId: task.id,
        actorUserId: input.createdById ?? null,
        action: "CREATE",
        summary: `Auto-spawned by ${input.createdByLabel ?? "system"}`,
      },
    })

    // Notify assignees (non-blocking).
    await notifyTaskAssignees({
      title: `New task assigned: ${input.title}`,
      body: input.description
        ? input.description.slice(0, 280)
        : `A follow-up task has been created and assigned to you.${dueDate ? ` Due ${dueDate.toDateString()}.` : ""}`,
      staffUserIds: input.staffUserIds,
      memberIds: input.memberIds,
      committeeIds: input.committeeIds,
      channels: ["IN_APP"],
      taskPath: `/dashboard/tasks/${task.id}`,
    }).catch(() => undefined)

    return task.id
  } catch (e) {
    console.error("[tasks.spawn] failed:", input.title, e)
    return null
  }
}
