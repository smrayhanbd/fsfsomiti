"use server"

import prisma, { directPrisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import {
  getCurrentUser,
  hasPermission,
  isSuperAdmin,
  requirePermission,
  requireSuperAdmin,
  PERMISSIONS,
  ROLE,
  type CurrentUser,
} from "@/lib/permissions"
import { saveUploadedFile } from "@/lib/upload"
import { notifyTaskAssignees } from "@/lib/tasks/notify"
import {
  assigneeSchema,
  commentSchema,
  reminderSchema,
  taskCoreSchema,
  timeLogSchema,
  type AssigneeInput,
  type TaskCoreInput,
} from "@/lib/tasks/validation"
import type {
  Task,
  TaskAssignee,
  TaskAttachment,
  TaskAuditLog,
  TaskChecklistItem,
  TaskComment,
  TaskReminder,
  TaskStatus,
  TaskTimeLog,
  TaskDependency,
  TaskApprovalRequest,
  Member,
  User,
  Meeting,
  Loan,
  MemberRequest,
  Transaction,
  Prisma,
} from "@prisma/client"

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string }

const TASKS_PATH = "/dashboard/tasks"

// Full include shape reused across reads so pages get a consistent graph.
const TASK_INCLUDE = {
  assignees: true,
  checklist: { orderBy: { order: "asc" as const } },
  comments: {
    orderBy: { createdAt: "desc" as const },
    include: { authorUser: { select: { id: true, name: true, email: true } }, authorMember: { select: { id: true, fullName: true } } },
  },
  attachments: true,
  timeLogs: { orderBy: { loggedAt: "desc" as const } },
  reminders: { orderBy: { offsetMinutes: "asc" as const } },
  blockers: { include: { dependsOnTask: { select: { id: true, title: true, status: true } } } },
  dependents: { include: { task: { select: { id: true, title: true, status: true } } } },
  approvals: { orderBy: { requestedAt: "desc" as const }, take: 5 },
  approvedBy: { select: { id: true, name: true, email: true } },
  meeting: { select: { id: true, title: true } },
  loan: { select: { id: true, loanNo: true } },
  memberRequest: { select: { id: true, type: true } },
  transaction: { select: { id: true, voucherNo: true } },
  relatedMember: { select: { id: true, fullName: true, memberNo: true } },
} satisfies Prisma.TaskInclude

// Serialized Task row for client components (Date → ISO strings).
export interface TaskRow {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: string
  order: number
  dueDate: string | null
  reminderAt: string | null
  recurrence: string
  recurrenceEndDate: string | null
  recurrenceParentId: string | null
  completionNote: string | null
  requiresApproval: boolean
  approvalRequestedAt: string | null
  approvedAt: string | null
  rejectedAt: string | null
  returnReason: string | null
  progressPct: number
  progressDirty: boolean
  isPrivate: boolean
  location: string | null
  meetingId: string | null
  loanId: string | null
  memberRequestId: string | null
  transactionId: string | null
  relatedMemberId: string | null
  createdBy: string | null
  createdById: string | null
  updatedBy: string | null
  updatedById: string | null
  createdAt: string
  updatedAt: string
  assignees: (TaskAssignee & {
    user?: { id: string; name: string | null; email: string } | null
    member?: { id: string; fullName: string; memberNo: string } | null
    committee?: { id: string; name: string } | null
  })[]
  checklist: TaskChecklistItem[]
  comments: (TaskComment & {
    authorUser: { id: string; name: string | null; email: string } | null
    authorMember: { id: string; fullName: string } | null
  })[]
  attachments: TaskAttachment[]
  timeLogs: TaskTimeLog[]
  reminders: TaskReminder[]
  blockers: (TaskDependency & { dependsOnTask: { id: string; title: string; status: string } })[]
  dependents: (TaskDependency & { task: { id: string; title: string; status: string } })[]
  approvals: TaskApprovalRequest[]
  approvedBy: { id: string; name: string | null; email: string } | null
  meeting: { id: string; title: string } | null
  loan: { id: string; loanNo: string } | null
  memberRequest: { id: string; type: string } | null
  transaction: { id: string; voucherNo: string } | null
  relatedMember: { id: string; fullName: string; memberNo: string } | null
}

function serialize(t: Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>): TaskRow {
  return {
    ...t,
    dueDate: t.dueDate?.toISOString() ?? null,
    reminderAt: t.reminderAt?.toISOString() ?? null,
    recurrenceEndDate: t.recurrenceEndDate?.toISOString() ?? null,
    approvalRequestedAt: t.approvalRequestedAt?.toISOString() ?? null,
    approvedAt: t.approvedAt?.toISOString() ?? null,
    rejectedAt: t.rejectedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    comments: t.comments.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString() as unknown as Date as never,
      updatedAt: c.updatedAt.toISOString() as unknown as Date as never,
    })) as TaskRow["comments"],
  } as TaskRow
}

// ──────────────────────────────────────────────────────────────────────────────
// Authorization helpers
// ──────────────────────────────────────────────────────────────────────────────

async function canAccessTask(user: CurrentUser | null, task: { createdById: string | null; assignees: TaskAssignee[]; isPrivate: boolean }): Promise<boolean> {
  if (!user) return false
  if (isSuperAdmin(user)) return true
  if (await hasPermission(user.id, PERMISSIONS.TASK_VIEW_ALL, user)) return true
  // Creator
  if (task.createdById === user.id) return true
  // Assignee
  if (task.assignees.some((a) => a.userId === user.id)) return true
  // Private tasks are otherwise hidden.
  return false
}

async function canEditTask(user: CurrentUser | null, task: { createdById: string | null; assignees: TaskAssignee[] }): Promise<boolean> {
  if (!user) return false
  if (isSuperAdmin(user)) return true
  if (task.createdById === user.id) return true
  if (await hasPermission(user.id, PERMISSIONS.TASK_ASSIGN, user)) return true
  if (await hasPermission(user.id, PERMISSIONS.TASK_APPROVE, user)) return true
  return task.assignees.some((a) => a.userId === user.id)
}

/** Compute checklist-driven progress when not manually pinned. */
function computeProgress(done: number, total: number): number {
  if (total === 0) return 0
  return Math.round((done / total) * 100)
}

// ──────────────────────────────────────────────────────────────────────────────
// CREATE
// ──────────────────────────────────────────────────────────────────────────────

export async function createTask(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission(await getCurrentUser(), PERMISSIONS.TASK_CREATE)

    const parsed = taskCoreSchema.parse({
      title: formData.get("title"),
      description: formData.get("description") || undefined,
      status: formData.get("status") || "TODO",
      priority: formData.get("priority") || "MEDIUM",
      dueDate: formData.get("dueDate") || null,
      recurrence: formData.get("recurrence") || "NONE",
      recurrenceEndDate: formData.get("recurrenceEndDate") || null,
      requiresApproval: formData.get("requiresApproval") === "true" || formData.get("requiresApproval") === "on",
      isPrivate: formData.get("isPrivate") === "true" || formData.get("isPrivate") === "on",
      location: formData.get("location") || undefined,
      meetingId: formData.get("meetingId") || null,
      loanId: formData.get("loanId") || null,
      memberRequestId: formData.get("memberRequestId") || null,
      transactionId: formData.get("transactionId") || null,
      relatedMemberId: formData.get("relatedMemberId") || null,
    })

    // Parse assignees (JSON array) + checklist + reminders (JSON arrays).
    const assigneesRaw = safeParseJson<AssigneeInput[]>(formData.get("assignees"), [])
    const checklistRaw = safeParseJson<{ title: string }[]>(formData.get("checklist"), [])
    const remindersRaw = safeParseJson<{ channel: "IN_APP" | "SMS" | "EMAIL"; offsetMinutes: number }[]>(formData.get("reminders"), [])
    const dependencyIds = safeParseJson<string[]>(formData.get("dependencyIds"), [])

    const assignees = assigneesRaw.map((a) => assigneeSchema.parse(a))
    const reminders = remindersRaw.map((r) => reminderSchema.parse(r))

    // Verify integration FKs exist.
    await verifyLinks(parsed)

    const created = await prisma.task.create({
      data: {
        title: parsed.title,
        description: parsed.description ?? null,
        status: parsed.status,
        priority: parsed.priority,
        dueDate: parsed.dueDate ?? null,
        recurrence: parsed.recurrence,
        recurrenceEndDate: parsed.recurrenceEndDate ?? null,
        requiresApproval: parsed.requiresApproval,
        isPrivate: parsed.isPrivate,
        location: parsed.location ?? null,
        meetingId: parsed.meetingId || null,
        loanId: parsed.loanId || null,
        memberRequestId: parsed.memberRequestId || null,
        transactionId: parsed.transactionId || null,
        relatedMemberId: parsed.relatedMemberId || null,
        createdBy: user.email,
        createdById: user.id,
        updatedBy: user.email,
        updatedById: user.id,
        assignees: {
          create: assignees.map((a) => ({
            assigneeType: a.assigneeType,
            userId: a.userId ?? null,
            memberId: a.memberId ?? null,
            committeeId: a.committeeId ?? null,
          })),
        },
        checklist: {
          create: checklistRaw.map((c, i) => ({ title: c.title, order: i })),
        },
        reminders: {
          create: reminders.map((r) => ({ channel: r.channel, offsetMinutes: r.offsetMinutes })),
        },
        // Dependencies
        blockers: dependencyIds.length
          ? { create: dependencyIds.map((id) => ({ dependsOnTaskId: id })) }
          : undefined,
      },
      include: { assignees: true, blockers: true },
    })

    // Cycle check (after insert; remove if cyclic).
    if (dependencyIds.length && (await createsCycle(created.id))) {
      await prisma.taskDependency.deleteMany({ where: { taskId: created.id } })
      throw new Error("Adding these dependencies would create a cycle.")
    }

    await prisma.taskAuditLog.create({
      data: {
        taskId: created.id,
        actorUserId: user.id,
        action: "CREATE",
        summary: `Task created by ${user.email}`,
        changes: { priority: parsed.priority, recurrence: parsed.recurrence, assigneeCount: assignees.length },
      },
    })

    // Notify assignees (non-blocking).
    const staffUserIds = assignees.filter((a) => a.assigneeType === "STAFF").map((a) => a.userId!).filter(Boolean)
    const memberIds = assignees.filter((a) => a.assigneeType === "MEMBER").map((a) => a.memberId!).filter(Boolean)
    const committeeIds = assignees.filter((a) => a.assigneeType === "COMMITTEE").map((a) => a.committeeId!).filter(Boolean)
    await notifyTaskAssignees({
      title: `New task assigned: ${parsed.title}`,
      body: parsed.description
        ? parsed.description.slice(0, 280)
        : `You have been assigned a new task.${parsed.dueDate ? ` Due ${parsed.dueDate.toDateString()}.` : ""}`,
      staffUserIds,
      memberIds,
      committeeIds,
      channels: ["IN_APP"],
      taskPath: `/dashboard/tasks/${created.id}`,
    }).catch(() => undefined)

    revalidatePath(TASKS_PATH)
    return { ok: true, id: created.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create task." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// UPDATE
// ──────────────────────────────────────────────────────────────────────────────

export async function updateTask(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error("You must be signed in.")

    const existing = await prisma.task.findUnique({
      where: { id },
      include: { assignees: true, checklist: true },
    })
    if (!existing) throw new Error("Task not found.")
    if (!(await canEditTask(user, existing))) throw new Error("You are not allowed to edit this task.")

    const parsed = taskCoreSchema.parse({
      title: formData.get("title"),
      description: formData.get("description") || undefined,
      status: formData.get("status") || existing.status,
      priority: formData.get("priority") || existing.priority,
      dueDate: formData.get("dueDate") || null,
      recurrence: formData.get("recurrence") || existing.recurrence,
      recurrenceEndDate: formData.get("recurrenceEndDate") || null,
      requiresApproval: formData.get("requiresApproval") === "true" || formData.get("requiresApproval") === "on",
      isPrivate: formData.get("isPrivate") === "true" || formData.get("isPrivate") === "on",
      location: formData.get("location") || undefined,
      meetingId: formData.get("meetingId") || null,
      loanId: formData.get("loanId") || null,
      memberRequestId: formData.get("memberRequestId") || null,
      transactionId: formData.get("transactionId") || null,
      relatedMemberId: formData.get("relatedMemberId") || null,
    })
    await verifyLinks(parsed)

    // Recurring change requires the dedicated permission.
    if (parsed.recurrence !== existing.recurrence) {
      if (!(isSuperAdmin(user) || (await hasPermission(user.id, PERMISSIONS.TASK_MANAGE_RECURRING, user)))) {
        throw new Error("You do not have permission to change task recurrence.")
      }
    }

    await prisma.task.update({
      where: { id },
      data: {
        title: parsed.title,
        description: parsed.description ?? null,
        status: parsed.status,
        priority: parsed.priority,
        dueDate: parsed.dueDate ?? null,
        recurrence: parsed.recurrence,
        recurrenceEndDate: parsed.recurrenceEndDate ?? null,
        requiresApproval: parsed.requiresApproval,
        isPrivate: parsed.isPrivate,
        location: parsed.location ?? null,
        meetingId: parsed.meetingId || null,
        loanId: parsed.loanId || null,
        memberRequestId: parsed.memberRequestId || null,
        transactionId: parsed.transactionId || null,
        relatedMemberId: parsed.relatedMemberId || null,
        updatedBy: user.email,
        updatedById: user.id,
      },
    })

    await prisma.taskAuditLog.create({
      data: {
        taskId: id,
        actorUserId: user.id,
        action: "UPDATE",
        summary: `Task updated by ${user.email}`,
        changes: { title: parsed.title, priority: parsed.priority, dueDate: parsed.dueDate?.toISOString() ?? null },
      },
    })

    revalidatePath(`${TASKS_PATH}/${id}`)
    revalidatePath(TASKS_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update task." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// STATUS + APPROVAL WORKFLOW
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Move a task's status. Members (via portal) are restricted to the subset in
 * MEMBER_ALLOWED_STATUSES; staff have fuller control. When a task requires
 * approval and is moved to DONE, it is auto-routed to IN_REVIEW instead.
 */
export async function updateTaskStatus(id: string, status: string, note?: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error("You must be signed in.")

    const existing = await prisma.task.findUnique({ where: { id }, include: { assignees: true } })
    if (!existing) throw new Error("Task not found.")
    if (!(await canAccessTask(user, existing))) throw new Error("You are not allowed to modify this task.")

    const validStatuses = ["TODO", "IN_PROGRESS", "ON_HOLD", "IN_REVIEW", "DONE", "APPROVED", "CANCELLED"]
    if (!validStatuses.includes(status)) throw new Error("Invalid status.")

    const isMember = user.role === ROLE.MEMBER
    const memberAllowed = ["TODO", "IN_PROGRESS", "ON_HOLD", "IN_REVIEW", "DONE"]
    if (isMember && !memberAllowed.includes(status)) {
      throw new Error("Members cannot set this status.")
    }

    let nextStatus = status as TaskStatus
    let approvalRequested = false

    // Approval gate: DONE on a requiresApproval task → IN_REVIEW + open approval.
    if (status === "DONE" && existing.requiresApproval && existing.status !== "APPROVED") {
      nextStatus = "IN_REVIEW"
      approvalRequested = true
    }
    // APPROVED requires the approve permission.
    if (status === "APPROVED") {
      if (!(isSuperAdmin(user) || (await hasPermission(user.id, PERMISSIONS.TASK_APPROVE, user)))) {
        throw new Error("You do not have permission to approve tasks.")
      }
    }

    await directPrisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id },
        data: {
          status: nextStatus,
          completionNote: note ?? existing.completionNote,
          updatedBy: user.email,
          updatedById: user.id,
          approvedAt: nextStatus === "APPROVED" ? new Date() : existing.approvedAt,
          approvedById: nextStatus === "APPROVED" ? user.id : existing.approvedById,
        },
      })
      if (approvalRequested) {
        await tx.taskApprovalRequest.create({
          data: { taskId: id, requestedById: user.id, requestedAt: new Date() },
        })
        await tx.task.update({ where: { id }, data: { approvalRequestedAt: new Date() } })
      }
      await tx.taskAuditLog.create({
        data: {
          taskId: id,
          actorUserId: user.id,
          action: "STATUS_CHANGE",
          summary: `Status → ${nextStatus}${note ? ` (${note})` : ""}`,
          changes: { from: existing.status, to: nextStatus, approvalRequested },
        },
      })
    })

    // Notify approvers when approval is requested.
    if (approvalRequested) {
      const approvers = await prisma.user.findMany({
        where: {
          role: { in: ["SUPER_ADMIN", "ADMIN"] },
          isActive: true,
          OR: [
            { permissions: { some: { permission: PERMISSIONS.TASK_APPROVE } } },
            { role: "SUPER_ADMIN" },
          ],
        },
        select: { id: true },
      })
      await notifyTaskAssignees({
        title: `Task awaiting approval: ${existing.title}`,
        body: `"${existing.title}" was marked done and is awaiting your approval.`,
        staffUserIds: approvers.map((a) => a.id),
        channels: ["IN_APP"],
        taskPath: `${TASKS_PATH}/${id}`,
      }).catch(() => undefined)
    }

    revalidatePath(`${TASKS_PATH}/${id}`)
    revalidatePath(TASKS_PATH)
    revalidatePath("/portal/tasks")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update status." }
  }
}

export async function approveTask(
  id: string,
  comment?: string,
  opts?: { overrideReason?: string }
): Promise<ActionResult> {
  try {
    const user = await requirePermission(await getCurrentUser(), PERMISSIONS.TASK_APPROVE)

    const existing = await prisma.task.findUnique({ where: { id }, include: { assignees: true } })
    if (!existing) throw new Error("Task not found.")

    await directPrisma.$transaction(async (tx) => {
      // Resolve the latest PENDING approval row BEFORE marking the task approved
      // so the Maker-Checker check below can compare the requester against the
      // approver. (Mirrors the approveTransaction flow in
      // app/actions/transactions.ts:200-222 — the same user who requested the
      // approval must not be the one who approves it, with a Super Admin
      // override path that records the reason in the audit trail.)
      const pending = await tx.taskApprovalRequest.findFirst({
        where: { taskId: id, decision: "PENDING" },
        orderBy: { requestedAt: "desc" },
      })

      const isMaker = !!pending && pending.requestedById === user.id
      if (isMaker) {
        if (isSuperAdmin(user) && opts?.overrideReason?.trim()) {
          // Super Admin override — fold the reason into the audit comment so
          // the override is visible in the task audit trail.
          const overrideNote = `[SUPER_ADMIN OVERRIDE by ${user.email}: ${opts.overrideReason.trim()}]`
          comment = [comment?.trim(), overrideNote].filter(Boolean).join("\n")
        } else {
          throw new Error(
            "Maker-Checker rule: you cannot approve a task you requested approval for. " +
              "Ask another authorised user to approve it."
          )
        }
      }

      await tx.task.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedAt: new Date(),
          approvedById: user.id,
          updatedBy: user.email,
          updatedById: user.id,
        },
      })
      if (pending) {
        await tx.taskApprovalRequest.update({
          where: { id: pending.id },
          data: { decision: "APPROVED", decidedById: user.id, decidedAt: new Date(), comment: comment ?? null },
        })
      }
      await tx.taskAuditLog.create({
        data: {
          taskId: id,
          actorUserId: user.id,
          action: "APPROVE",
          summary: `Task approved by ${user.email}${comment ? ` — ${comment}` : ""}`,
        },
      })
    })

    // Notify assignees + creator.
    const staffUserIds = [existing.createdById, ...existing.assignees.map((a) => a.userId)].filter(Boolean) as string[]
    const memberIds = existing.assignees.map((a) => a.memberId).filter(Boolean) as string[]
    await notifyTaskAssignees({
      title: `Task approved: ${existing.title}`,
      body: `Your task "${existing.title}" has been approved.`,
      staffUserIds,
      memberIds,
      channels: ["IN_APP"],
      taskPath: `${TASKS_PATH}/${id}`,
    }).catch(() => undefined)

    revalidatePath(`${TASKS_PATH}/${id}`)
    revalidatePath(TASKS_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to approve task." }
  }
}

export async function rejectTask(id: string, reason: string): Promise<ActionResult> {
  try {
    const user = await requirePermission(await getCurrentUser(), PERMISSIONS.TASK_APPROVE)
    const existing = await prisma.task.findUnique({ where: { id }, include: { assignees: true } })
    if (!existing) throw new Error("Task not found.")

    await directPrisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id },
        data: { status: "IN_PROGRESS", rejectedAt: new Date(), updatedBy: user.email, updatedById: user.id },
      })
      const pending = await tx.taskApprovalRequest.findFirst({ where: { taskId: id, decision: "PENDING" }, orderBy: { requestedAt: "desc" } })
      if (pending) {
        await tx.taskApprovalRequest.update({
          where: { id: pending.id },
          data: { decision: "REJECTED", decidedById: user.id, decidedAt: new Date(), comment: reason },
        })
      }
      await tx.taskAuditLog.create({
        data: { taskId: id, actorUserId: user.id, action: "REJECT", summary: `Completion rejected by ${user.email}: ${reason}` },
      })
    })

    const staffUserIds = [existing.createdById, ...existing.assignees.map((a) => a.userId)].filter(Boolean) as string[]
    const memberIds = existing.assignees.map((a) => a.memberId).filter(Boolean) as string[]
    await notifyTaskAssignees({
      title: `Task needs rework: ${existing.title}`,
      body: `Approval was rejected: ${reason}`,
      staffUserIds,
      memberIds,
      channels: ["IN_APP"],
      taskPath: `${TASKS_PATH}/${id}`,
    }).catch(() => undefined)

    revalidatePath(`${TASKS_PATH}/${id}`)
    revalidatePath(TASKS_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to reject task." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// ASSIGNMENTS (replace all assignees at once)
// ──────────────────────────────────────────────────────────────────────────────

export async function replaceAssignees(taskId: string, assigneesJson: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error("You must be signed in.")
    if (!(isSuperAdmin(user) || (await hasPermission(user.id, PERMISSIONS.TASK_ASSIGN, user)))) {
      throw new Error("You do not have permission to reassign tasks.")
    }
    const raw = safeParseJson<AssigneeInput[]>(assigneesJson, [])
    const parsed = raw.map((a) => assigneeSchema.parse(a))

    await directPrisma.$transaction([
      prisma.taskAssignee.deleteMany({ where: { taskId } }),
      prisma.taskAssignee.createMany({
        data: parsed.map((a) => ({
          taskId,
          assigneeType: a.assigneeType,
          userId: a.userId ?? null,
          memberId: a.memberId ?? null,
          committeeId: a.committeeId ?? null,
        })),
      }),
    ])

    await prisma.taskAuditLog.create({
      data: { taskId, actorUserId: user.id, action: "ASSIGN", summary: `Assignees updated (${parsed.length}) by ${user.email}` },
    })

    revalidatePath(`${TASKS_PATH}/${taskId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update assignees." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// CHECKLIST
// ──────────────────────────────────────────────────────────────────────────────

export async function addChecklistItem(taskId: string, title: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error("You must be signed in.")
    const task = await prisma.task.findUnique({ where: { id: taskId }, include: { assignees: true, checklist: true } })
    if (!task) throw new Error("Task not found.")
    if (!(await canAccessTask(user, task))) throw new Error("Not allowed.")

    const item = await prisma.taskChecklistItem.create({
      data: { taskId, title: title.trim(), order: task.checklist.length },
    })
    await recomputeProgress(taskId)
    await audit(taskId, user, "CHECKLIST_ADD", `Added checklist item "${title.trim()}"`)
    revalidatePath(`${TASKS_PATH}/${taskId}`)
    return { ok: true, id: item.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to add checklist item." }
  }
}

export async function toggleChecklistItem(itemId: string, isDone: boolean): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error("You must be signed in.")
    const item = await prisma.taskChecklistItem.findUnique({ where: { id: itemId }, include: { task: { include: { assignees: true } } } })
    if (!item) throw new Error("Checklist item not found.")
    if (!(await canAccessTask(user, item.task))) throw new Error("Not allowed.")

    await prisma.taskChecklistItem.update({
      where: { id: itemId },
      data: { isDone, completedById: user.id, completedAt: isDone ? new Date() : null },
    })
    await recomputeProgress(item.taskId)
    await audit(item.taskId, user, "CHECKLIST_TOGGLE", `"${item.title}" marked ${isDone ? "done" : "open"}`)
    revalidatePath(`${TASKS_PATH}/${item.taskId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to toggle item." }
  }
}

export async function deleteChecklistItem(itemId: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error("You must be signed in.")
    const item = await prisma.taskChecklistItem.findUnique({ where: { id: itemId }, include: { task: { include: { assignees: true } } } })
    if (!item) throw new Error("Item not found.")
    if (!(await canAccessTask(user, item.task))) throw new Error("Not allowed.")
    const taskId = item.taskId
    const title = item.title
    await prisma.taskChecklistItem.delete({ where: { id: itemId } })
    await recomputeProgress(taskId)
    await audit(taskId, user, "CHECKLIST_DELETE", `Removed checklist item "${title}"`)
    revalidatePath(`${TASKS_PATH}/${taskId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete item." }
  }
}

async function recomputeProgress(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { checklist: true } })
  if (!task || task.progressDirty) return
  const done = task.checklist.filter((c) => c.isDone).length
  await prisma.task.update({ where: { id: taskId }, data: { progressPct: computeProgress(done, task.checklist.length) } })
}

// ──────────────────────────────────────────────────────────────────────────────
// COMMENTS
// ──────────────────────────────────────────────────────────────────────────────

export async function addComment(taskId: string, body: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error("You must be signed in.")
    commentSchema.parse({ body })

    const task = await prisma.task.findUnique({ where: { id: taskId }, include: { assignees: true } })
    if (!task) throw new Error("Task not found.")
    if (!(await canAccessTask(user, task))) throw new Error("Not allowed.")

    const isMember = user.role === ROLE.MEMBER
    await prisma.taskComment.create({
      data: {
        taskId,
        body,
        authorUserId: isMember ? null : user.id,
        authorMemberId: isMember ? user.id : null,
      },
    })
    await audit(taskId, user, "COMMENT", `Comment added by ${user.email}`)
    revalidatePath(`${TASKS_PATH}/${taskId}`)
    revalidatePath(`/portal/tasks/${taskId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to add comment." }
  }
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error("You must be signed in.")
    const comment = await prisma.taskComment.findUnique({ where: { id: commentId } })
    if (!comment) throw new Error("Comment not found.")
    const isAuthor = comment.authorUserId === user.id || comment.authorMemberId === user.id
    if (!(isSuperAdmin(user) || isAuthor)) throw new Error("You can only delete your own comments.")
    const taskId = comment.taskId
    await prisma.taskComment.delete({ where: { id: commentId } })
    await audit(taskId, user, "COMMENT_DELETE", `Comment removed by ${user.email}`)
    revalidatePath(`${TASKS_PATH}/${taskId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete comment." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// ATTACHMENTS
// ──────────────────────────────────────────────────────────────────────────────

export async function addAttachment(taskId: string, formData: FormData): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error("You must be signed in.")
    const task = await prisma.task.findUnique({ where: { id: taskId }, include: { assignees: true } })
    if (!task) throw new Error("Task not found.")
    if (!(await canAccessTask(user, task))) throw new Error("Not allowed.")

    const file = formData.get("file") as File | null
    if (!file || file.size === 0) throw new Error("Please choose a file.")
    const saved = await saveUploadedFile(file, "tasks")

    await prisma.taskAttachment.create({
      data: {
        taskId,
        url: saved.url,
        fileName: saved.fileName,
        fileType: file.type || null,
        fileSize: file.size,
        uploadedById: user.role === ROLE.MEMBER ? null : user.id,
      },
    })
    await audit(taskId, user, "ATTACH_ADD", `Attachment "${saved.fileName}" uploaded`)
    revalidatePath(`${TASKS_PATH}/${taskId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to upload file." }
  }
}

export async function deleteAttachment(attachmentId: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error("You must be signed in.")
    const att = await prisma.taskAttachment.findUnique({ where: { id: attachmentId } })
    if (!att) throw new Error("Attachment not found.")
    const isUploader = att.uploadedById === user.id
    if (!(isSuperAdmin(user) || isUploader)) throw new Error("Not allowed.")
    const taskId = att.taskId
    const name = att.fileName
    await prisma.taskAttachment.delete({ where: { id: attachmentId } })
    await audit(taskId, user, "ATTACH_DELETE", `Attachment "${name}" removed`)
    revalidatePath(`${TASKS_PATH}/${taskId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete attachment." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// TIME LOGS
// ──────────────────────────────────────────────────────────────────────────────

export async function logTime(taskId: string, minutes: number, note?: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error("You must be signed in.")
    const parsed = timeLogSchema.parse({ minutes, note })

    const task = await prisma.task.findUnique({ where: { id: taskId }, include: { assignees: true } })
    if (!task) throw new Error("Task not found.")
    if (!(await canAccessTask(user, task))) throw new Error("Not allowed.")

    const isMember = user.role === ROLE.MEMBER
    await prisma.taskTimeLog.create({
      data: {
        taskId,
        userId: isMember ? null : user.id,
        memberId: isMember ? user.id : null,
        minutes: parsed.minutes,
        note: parsed.note ?? null,
      },
    })
    await audit(taskId, user, "TIME_LOG", `Logged ${parsed.minutes} min${parsed.note ? ` — ${parsed.note}` : ""}`)
    revalidatePath(`${TASKS_PATH}/${taskId}`)
    revalidatePath(`/portal/tasks/${taskId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to log time." }
  }
}

export async function deleteTimeLog(timeLogId: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error("You must be signed in.")
    const log = await prisma.taskTimeLog.findUnique({ where: { id: timeLogId } })
    if (!log) throw new Error("Time log not found.")
    const isOwner = log.userId === user.id || log.memberId === user.id
    if (!(isSuperAdmin(user) || isOwner)) throw new Error("Not allowed.")
    const taskId = log.taskId
    await prisma.taskTimeLog.delete({ where: { id: timeLogId } })
    await audit(taskId, user, "TIME_LOG_DELETE", `Removed time entry (${log.minutes} min)`)
    revalidatePath(`${TASKS_PATH}/${taskId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete time log." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// REMINDERS
// ──────────────────────────────────────────────────────────────────────────────

export async function setReminder(taskId: string, channel: "IN_APP" | "SMS" | "EMAIL", offsetMinutes: number): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error("You must be signed in.")
    reminderSchema.parse({ channel, offsetMinutes })
    const task = await prisma.task.findUnique({ where: { id: taskId }, include: { assignees: true } })
    if (!task) throw new Error("Task not found.")
    if (!(await canEditTask(user, task))) throw new Error("Not allowed.")

    await prisma.taskReminder.upsert({
      where: { taskId_channel_offsetMinutes: { taskId, channel, offsetMinutes } },
      create: { taskId, channel, offsetMinutes },
      update: { dispatchedAt: null }, // re-arm
    })
    await audit(taskId, user, "REMINDER_ADD", `Reminder added (${channel}, ${offsetMinutes} min)`)
    revalidatePath(`${TASKS_PATH}/${taskId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to set reminder." }
  }
}

export async function removeReminder(reminderId: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error("You must be signed in.")
    const r = await prisma.taskReminder.findUnique({ where: { id: reminderId } })
    if (!r) throw new Error("Reminder not found.")
    const task = await prisma.task.findUnique({ where: { id: r.taskId }, include: { assignees: true } })
    if (!task) throw new Error("Task not found.")
    if (!(await canEditTask(user, task))) throw new Error("Not allowed.")
    const taskId = r.taskId
    await prisma.taskReminder.delete({ where: { id: reminderId } })
    await audit(taskId, user, "REMINDER_REMOVE", `Reminder removed`)
    revalidatePath(`${TASKS_PATH}/${taskId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to remove reminder." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// DEPENDENCIES (with cycle detection)
// ──────────────────────────────────────────────────────────────────────────────

export async function addDependency(taskId: string, dependsOnTaskId: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error("You must be signed in.")
    if (taskId === dependsOnTaskId) throw new Error("A task cannot depend on itself.")
    const task = await prisma.task.findUnique({ where: { id: taskId }, include: { assignees: true } })
    if (!task) throw new Error("Task not found.")
    if (!(await canEditTask(user, task))) throw new Error("Not allowed.")
    const target = await prisma.task.findUnique({ where: { id: dependsOnTaskId } })
    if (!target) throw new Error("Target task not found.")

    await prisma.taskDependency.create({ data: { taskId, dependsOnTaskId } })
    if (await createsCycle(taskId)) {
      await prisma.taskDependency.delete({ where: { taskId_dependsOnTaskId: { taskId, dependsOnTaskId } } })
      throw new Error("Adding this dependency would create a cycle.")
    }
    await audit(taskId, user, "DEPENDENCY_ADD", `Now blocked by "${target.title}"`)
    revalidatePath(`${TASKS_PATH}/${taskId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to add dependency." }
  }
}

export async function removeDependency(taskId: string, dependsOnTaskId: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error("You must be signed in.")
    await prisma.taskDependency
      .delete({ where: { taskId_dependsOnTaskId: { taskId, dependsOnTaskId } } })
      .catch(() => undefined)
    await audit(taskId, user, "DEPENDENCY_REMOVE", `Dependency on ${dependsOnTaskId} removed`)
    revalidatePath(`${TASKS_PATH}/${taskId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to remove dependency." }
  }
}

/** DFS cycle check starting from taskId through dependsOnTaskId edges. */
async function createsCycle(taskId: string): Promise<boolean> {
  const visited = new Set<string>()
  const stack: string[] = [taskId]
  while (stack.length) {
    const current = stack.pop()!
    if (visited.has(current)) continue
    visited.add(current)
    const deps = await prisma.taskDependency.findMany({ where: { taskId: current }, select: { dependsOnTaskId: true } })
    for (const d of deps) {
      if (d.dependsOnTaskId === taskId) return true
      stack.push(d.dependsOnTaskId)
    }
  }
  return false
}

// ──────────────────────────────────────────────────────────────────────────────
// DELETE + BULK
// ──────────────────────────────────────────────────────────────────────────────

export async function deleteTask(id: string): Promise<ActionResult> {
  try {
    const user = await requirePermission(await getCurrentUser(), PERMISSIONS.TASK_DELETE)
    // Prevent deleting a template that still has spawned children.
    const children = await prisma.task.count({ where: { recurrenceParentId: id } })
    if (children > 0) {
      throw new Error("This recurring template still has occurrences. Cancel it instead of deleting.")
    }
    await prisma.task.delete({ where: { id } })
    revalidatePath(TASKS_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete task." }
  }
}

export async function bulkUpdateStatus(ids: string[], status: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error("You must be signed in.")
    const validStatuses = ["TODO", "IN_PROGRESS", "ON_HOLD", "IN_REVIEW", "DONE", "APPROVED", "CANCELLED"]
    if (!validStatuses.includes(status)) throw new Error("Invalid status.")
    if (status === "APPROVED" && !(isSuperAdmin(user) || (await hasPermission(user.id, PERMISSIONS.TASK_APPROVE, user)))) {
      throw new Error("You do not have permission to approve tasks.")
    }
    await prisma.task.updateMany({ where: { id: { in: ids } }, data: { status: status as TaskStatus, updatedById: user.id, updatedBy: user.email } })
    revalidatePath(TASKS_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bulk update failed." }
  }
}

export async function bulkDelete(ids: string[]): Promise<ActionResult> {
  try {
    const user = await requirePermission(await getCurrentUser(), PERMISSIONS.TASK_DELETE)
    await prisma.task.deleteMany({ where: { id: { in: ids } } })
    revalidatePath(TASKS_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bulk delete failed." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// READ HELPERS (used by pages)
// ──────────────────────────────────────────────────────────────────────────────

export async function getTaskById(id: string): Promise<TaskRow | null> {
  const user = await getCurrentUser()
  if (!user) return null
  const task = await prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE })
  if (!task) return null
  if (!(await canAccessTask(user, task))) return null
  return serialize(task)
}

export interface ListFilters {
  status?: string
  priority?: string
  assigneeUserId?: string
  assigneeMemberId?: string
  assigneeCommitteeId?: string
  q?: string
  meetingId?: string
  loanId?: string
  memberRequestId?: string
  transactionId?: string
  relatedMemberId?: string
  overdueOnly?: boolean
  limit?: number
}

export async function listTasks(filters: ListFilters = {}): Promise<TaskRow[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const where: Prisma.TaskWhereInput = {}
  if (filters.status) where.status = filters.status as TaskStatus
  if (filters.priority) where.priority = filters.priority as never
  if (filters.q) where.title = { contains: filters.q, mode: "insensitive" }
  if (filters.meetingId) where.meetingId = filters.meetingId
  if (filters.loanId) where.loanId = filters.loanId
  if (filters.memberRequestId) where.memberRequestId = filters.memberRequestId
  if (filters.transactionId) where.transactionId = filters.transactionId
  if (filters.relatedMemberId) where.relatedMemberId = filters.relatedMemberId
  if (filters.overdueOnly) where.dueDate = { lt: new Date() }
  if (filters.assigneeUserId || filters.assigneeMemberId || filters.assigneeCommitteeId) {
    where.assignees = {
      some: {
        OR: [
          filters.assigneeUserId ? { userId: filters.assigneeUserId } : {},
          filters.assigneeMemberId ? { memberId: filters.assigneeMemberId } : {},
          filters.assigneeCommitteeId ? { committeeId: filters.assigneeCommitteeId } : {},
        ].filter((c) => Object.keys(c).length > 0),
      },
    }
  }

  // Visibility scoping for non-privileged users.
  if (!(isSuperAdmin(user) || (await hasPermission(user.id, PERMISSIONS.TASK_VIEW_ALL, user)))) {
    where.OR = [
      { createdById: user.id },
      { assignees: { some: { userId: user.id } } },
    ]
  }

  const tasks = await prisma.task.findMany({
    where,
    include: TASK_INCLUDE,
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    take: filters.limit ?? 200,
  })
  return tasks.map(serialize)
}

export async function getTaskActivity(id: string) {
  const logs = await prisma.taskAuditLog.findMany({
    where: { taskId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      actorUser: { select: { id: true, name: true, email: true } },
      actorMember: { select: { id: true, fullName: true } },
    },
  })
  return JSON.parse(
    JSON.stringify(
      logs.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      }))
    )
  )
}

export async function getTaskStats() {
  const now = new Date()
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [byStatus, dueSoon, overdue, pendingApproval, total] = await Promise.all([
    prisma.task.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.task.count({ where: { dueDate: { gte: now, lte: in7 }, status: { in: ["TODO", "IN_PROGRESS", "ON_HOLD"] } } }),
    prisma.task.count({ where: { dueDate: { lt: now }, status: { in: ["TODO", "IN_PROGRESS", "ON_HOLD"] } } }),
    prisma.taskApprovalRequest.count({ where: { decision: "PENDING" } }),
    prisma.task.count(),
  ])

  const statusCounts: Record<string, number> = {}
  for (const s of byStatus) statusCounts[s.status] = s._count._all

  return {
    total,
    open: (statusCounts.TODO ?? 0) + (statusCounts.IN_PROGRESS ?? 0),
    inProgress: statusCounts.IN_PROGRESS ?? 0,
    dueSoon,
    overdue,
    pendingApproval,
    approved: statusCounts.APPROVED ?? 0,
    cancelled: statusCounts.CANCELLED ?? 0,
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// MEMBER PORTAL reads — strictly scoped to the signed-in member.
// ──────────────────────────────────────────────────────────────────────────────

// IDOR guard (S4 / H14): derive memberId from the authenticated session,
// never from the request body. Mirrors the proven pattern in
// app/actions/elections.ts (getCurrentMemberId at lines 88-98).
async function getPortalMemberIdFromSession(): Promise<string> {
  const { getServerSession } = await import("next-auth")
  const { authOptions } = await import("@/lib/auth")
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") {
    throw new Error("You must be signed in as a member to perform this action.")
  }
  return session.user.id
}

export async function getPortalMemberTasks(memberId: string): Promise<TaskRow[]> {
  // IDOR guard (S4 / H14): use the session-derived memberId; ignore the
  // client-supplied one. The client only passes it for legacy compat.
  try {
    const sessionMemberId = await getPortalMemberIdFromSession()
    if (memberId && memberId !== sessionMemberId) {
      // Tamper attempt — return an empty list rather than leak data.
      return []
    }
    memberId = sessionMemberId
  } catch {
    return []
  }

  // Resolve committees this member belongs to.
  const memberships = await prisma.committeeMember.findMany({
    where: { memberId },
    select: { committeeId: true },
  })
  const committeeIds = memberships.map((m) => m.committeeId)

  const tasks = await prisma.task.findMany({
    where: {
      assignees: {
        some: {
          OR: [
            { memberId },
            ...(committeeIds.length ? [{ committeeId: { in: committeeIds } }] : []),
          ],
        },
      },
      status: { not: "CANCELLED" },
    },
    include: TASK_INCLUDE,
    orderBy: [{ dueDate: { nulls: "last", sort: "asc" as const } }, { createdAt: "desc" as const }],
    take: 200,
  })
  return tasks.map(serialize)
}

export async function getPortalMemberTask(memberId: string, taskId: string): Promise<TaskRow | null> {
  // IDOR guard (S4): use the session-derived memberId; ignore the
  // client-supplied one. The client only passes it for legacy compat.
  try {
    const sessionMemberId = await getPortalMemberIdFromSession()
    if (memberId && memberId !== sessionMemberId) {
      // Tamper attempt — return null rather than leak data.
      return null
    }
    memberId = sessionMemberId
  } catch {
    return null
  }

  const memberships = await prisma.committeeMember.findMany({ where: { memberId }, select: { committeeId: true } })
  const committeeIds = memberships.map((m) => m.committeeId)
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: TASK_INCLUDE })
  if (!task) return null
  const assigned = task.assignees.some(
    (a) => a.memberId === memberId || (a.committeeId && committeeIds.includes(a.committeeId))
  )
  if (!assigned) return null
  return serialize(task)
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

function safeParseJson<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (!value || typeof value !== "string") return fallback
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as T) : fallback
  } catch {
    return fallback
  }
}

async function verifyLinks(parsed: TaskCoreInput): Promise<void> {
  const checks: Promise<unknown>[] = []
  if (parsed.meetingId) checks.push(prisma.meeting.findUniqueOrThrow({ where: { id: parsed.meetingId }, select: { id: true } }))
  if (parsed.loanId) checks.push(prisma.loan.findUniqueOrThrow({ where: { id: parsed.loanId }, select: { id: true } }))
  if (parsed.memberRequestId) checks.push(prisma.memberRequest.findUniqueOrThrow({ where: { id: parsed.memberRequestId }, select: { id: true } }))
  if (parsed.transactionId) checks.push(prisma.transaction.findUniqueOrThrow({ where: { id: parsed.transactionId }, select: { id: true } }))
  if (parsed.relatedMemberId) checks.push(prisma.member.findUniqueOrThrow({ where: { id: parsed.relatedMemberId }, select: { id: true } }))
  await Promise.all(checks)
}

async function audit(taskId: string, user: CurrentUser, action: string, summary: string, changes?: Record<string, unknown>): Promise<void> {
  const isMember = user.role === ROLE.MEMBER
  await prisma.taskAuditLog.create({
    data: {
      taskId,
      actorUserId: isMember ? null : user.id,
      actorMemberId: isMember ? user.id : null,
      action,
      summary,
      changes: (changes as Prisma.InputJsonValue | undefined) ?? undefined,
    },
  })
}
