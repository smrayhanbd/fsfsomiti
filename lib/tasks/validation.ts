import { z } from "zod"

// ── Status / priority vocabulary ──────────────────────────────────────────────
// Mirrors the Prisma enums so server actions can validate without importing
// @prisma/client into client bundles.

export const TASK_STATUSES = [
  "TODO",
  "IN_PROGRESS",
  "ON_HOLD",
  "IN_REVIEW",
  "DONE",
  "APPROVED",
  "CANCELLED",
] as const
export type TaskStatusValue = (typeof TASK_STATUSES)[number]

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const
export type TaskPriorityValue = (typeof TASK_PRIORITIES)[number]

export const TASK_RECURRENCES = [
  "NONE",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
] as const
export type TaskRecurrenceValue = (typeof TASK_RECURRENCES)[number]

export const REMINDER_CHANNELS = ["IN_APP", "SMS", "EMAIL"] as const
export type TaskReminderChannelValue = (typeof REMINDER_CHANNELS)[number]

// Statuses a member is allowed to move a task into from the portal. Members
// cannot APPROVE or CANCEL — those are manager actions.
export const MEMBER_ALLOWED_STATUSES: TaskStatusValue[] = [
  "TODO",
  "IN_PROGRESS",
  "ON_HOLD",
  "IN_REVIEW",
  "DONE",
]

// ── Assignee payload (from the form) ──────────────────────────────────────────
export const assigneeSchema = z
  .object({
    assigneeType: z.enum(["STAFF", "MEMBER", "COMMITTEE"]),
    userId: z.string().nullable().optional(),
    memberId: z.string().nullable().optional(),
    committeeId: z.string().nullable().optional(),
  })
  .refine((v) => {
    if (v.assigneeType === "STAFF") return !!v.userId
    if (v.assigneeType === "MEMBER") return !!v.memberId
    if (v.assigneeType === "COMMITTEE") return !!v.committeeId
    return false
  }, "Each assignee must reference its target id")

export type AssigneeInput = z.infer<typeof assigneeSchema>

// ── Create / update task ──────────────────────────────────────────────────────
export const taskCoreSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters.").max(200),
  description: z.string().max(20000).optional().nullable(),
  status: z.enum(TASK_STATUSES).default("TODO"),
  priority: z.enum(TASK_PRIORITIES).default("MEDIUM"),
  dueDate: z.coerce.date().nullable().optional(),
  recurrence: z.enum(TASK_RECURRENCES).default("NONE"),
  recurrenceEndDate: z.coerce.date().nullable().optional(),
  requiresApproval: z.coerce.boolean().default(false),
  isPrivate: z.coerce.boolean().default(false),
  location: z.string().max(300).optional().nullable(),
  progressPct: z.number().int().min(0).max(100).optional(),
  // Integration links
  meetingId: z.string().optional().nullable(),
  loanId: z.string().optional().nullable(),
  memberRequestId: z.string().optional().nullable(),
  transactionId: z.string().optional().nullable(),
  relatedMemberId: z.string().optional().nullable(),
})

export type TaskCoreInput = z.infer<typeof taskCoreSchema>

// ── Reminder ──────────────────────────────────────────────────────────────────
export const reminderSchema = z.object({
  channel: z.enum(REMINDER_CHANNELS),
  offsetMinutes: z.number().int().min(-43200).max(0), // up to 30 days before
})
export type ReminderInput = z.infer<typeof reminderSchema>

// ── Checklist ─────────────────────────────────────────────────────────────────
export const checklistItemSchema = z.object({
  title: z.string().trim().min(1).max(300),
  order: z.number().int().default(0),
})

// ── Time log ──────────────────────────────────────────────────────────────────
export const timeLogSchema = z.object({
  minutes: z.number().int().min(1).max(10080), // max 1 week per entry
  note: z.string().max(2000).optional().nullable(),
})

// ── Comment ───────────────────────────────────────────────────────────────────
export const commentSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty.").max(10000),
})
