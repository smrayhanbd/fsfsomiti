"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { sendEmail } from "@/lib/email"
import { sendSMS } from "@/lib/sms"
import { recalculateTrustScore } from "@/lib/trustScore"
import { saveUploadedFile } from "@/lib/upload"
import {
  getCurrentUser,
  isSuperAdmin,
  hasPermission,
  requirePermission,
  requireSuperAdmin,
  PERMISSIONS,
  type CurrentUser,
} from "@/lib/permissions"
import { spawnTask } from "@/lib/tasks/spawn"

// =====================================================================
// MEETING CREATION (FRS §5.4) + notifications (rule 2)
//
// SMS is kept short — NO agenda (rule 2). Email carries the full agenda.
// Meeting Type (Online / Offline) selects whether location or link is stored.
// =====================================================================

export async function createMeeting(formData: FormData) {
  // PERMISSIONS has no dedicated MEETING_CREATE key yet, so USER_MANAGE
  // (held by admins + super admin) gates meeting creation until one is added.
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  const title = (formData.get("title") as string) ?? ""
  const dateStr = (formData.get("date") as string) ?? ""
  const agenda = (formData.get("agenda") as string) ?? ""
  const type = (formData.get("type") as string) === "ONLINE" ? "ONLINE" : "OFFLINE"
  const location = ((formData.get("location") as string) ?? "").trim()
  const link = ((formData.get("link") as string) ?? "").trim()

  if (!title || !dateStr) {
    throw new Error("Title and Date are required.")
  }
  if (type === "OFFLINE" && !location) {
    throw new Error("Location is required for an Offline meeting.")
  }
  if (type === "ONLINE" && !link) {
    throw new Error("Meeting Link is required for an Online meeting.")
  }

  const date = new Date(dateStr)

  // 1. Save meeting. ONLINE stores link; OFFLINE stores location.
  const meeting = await prisma.meeting.create({
    data: {
      title,
      date,
      type,
      location: type === "OFFLINE" ? location : null,
      link: type === "ONLINE" ? link : null,
      agenda,
    },
  })

  // 2. Notify every ACTIVE member.
  const members = await prisma.member.findMany({
    where: { status: "ACTIVE" },
    select: { phone: true, email: true, fullName: true },
  })

  const where = type === "OFFLINE" ? `Location: ${location}` : `Join: ${link}`
  // SMS: deliberately excludes the agenda to stay short (rule 2).
  const sms = `Notice: ${title} on ${date.toLocaleString()}. ${where}. Please attend. - Future Savings Foundation`

  for (const member of members) {
    if (member.phone) {
      try {
        await sendSMS(member.phone, sms)
      } catch {
        console.error(`SMS failed for ${member.phone}`)
      }
    }
    if (member.email) {
      try {
        // Email: includes the COMPLETE agenda (rule 2).
        await sendEmail(
          member.email,
          `Meeting Notice: ${title}`,
          `<p>Dear ${member.fullName},</p>` +
            `<p>A meeting has been scheduled:</p>` +
            `<p><strong>Title:</strong> ${title}<br/>` +
            `<strong>Date:</strong> ${date.toLocaleString()}<br/>` +
            `<strong>Type:</strong> ${type === "ONLINE" ? "Online" : "Offline"}<br/>` +
            (type === "ONLINE"
              ? `<strong>Link:</strong> <a href="${link}">${link}</a></p>`
              : `<strong>Location:</strong> ${location}</p>`) +
            `<p><strong>Agenda:</strong><br/>${agenda || "—"}</p>`
        )
      } catch {
        console.error(`Email failed for ${member.email}`)
      }
    }
  }

  // Task auto-spawn: meeting prep follow-up (idempotent). Non-blocking.
  await spawnTask({
    title: `Prepare for meeting: ${title}`,
    description: `Meeting scheduled for ${date.toLocaleString()} (${type}). ${type === "ONLINE" ? `Link: ${link}` : `Location: ${location}`}. Finalize agenda, arrange logistics, and notify attendees.`,
    priority: "MEDIUM",
    meetingId: meeting.id,
    createdByLabel: "MEETING_SYSTEM",
    checklist: ["Finalize agenda", "Arrange logistics", "Notify attendees", "Prepare minutes template"],
  }).catch(() => undefined)

  revalidatePath("/dashboard/meetings")
  redirect("/dashboard/meetings")
}

// =====================================================================
// MEETING ATTENDANCE (FRS §5.4, §8.3) — rules 5 & 6
//
// Authorized normal users (those holding MEETING_ATTENDANCE_MARK) may submit
// attendance exactly once. The first submission locks the record. After that,
// only the Super Admin can edit it. The Super Admin can also edit at any time
// without locking.
// =====================================================================

export interface AttendanceRow {
  memberId: string
  status: "PRESENT" | "ABSENT" | "EXCUSED"
}

export async function markAttendance(meetingId: string, rows: AttendanceRow[]) {
  if (!meetingId || !rows.length) return

  const user = await getCurrentUser()
  if (!user) throw new Error("Not authenticated.")

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { attendanceLocked: true },
  })
  if (!meeting) throw new Error("Meeting not found.")

  // Locked → Super Admin only (rule 5).
  if (meeting.attendanceLocked && !isSuperAdmin(user)) {
    throw new Error("Attendance is locked. Only the Super Admin can edit it.")
  }

  // Authorized normal users must hold the permission (rule 5).
  const allowed = isSuperAdmin(user) || (await hasPermission(user.id, PERMISSIONS.MEETING_ATTENDANCE_MARK, user))
  if (!allowed) {
    throw new Error("You are not authorized to mark attendance.")
  }

  // Upsert each attendance row (compound unique [meetingId, memberId]).
  await Promise.all(
    rows.map((row) =>
      prisma.meetingAttendance.upsert({
        where: { meetingId_memberId: { meetingId, memberId: row.memberId } },
        create: { meetingId, memberId: row.memberId, status: row.status, markedBy: user.id },
        update: { status: row.status, markedBy: user.id, markedAt: new Date() },
      })
    )
  )

  // Lock on first submission by an authorized normal user (rule 5).
  // Super Admin edits never toggle the lock.
  if (!meeting.attendanceLocked && !isSuperAdmin(user)) {
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        attendanceLocked: true,
        attendanceSubmittedAt: new Date(),
        attendanceSubmittedBy: user.id,
      },
    })
  }

  // Recalculate the ATTEND KPI for every affected member (non-blocking).
  const memberIds = Array.from(new Set(rows.map((r) => r.memberId)))
  for (const memberId of memberIds) {
    try {
      await recalculateTrustScore(memberId, "MEETING_ATTENDANCE_MARKED", {
        referenceId: meetingId,
        referenceType: "meeting",
      })
    } catch (e) {
      console.error(`[trustScore] attendance recalc failed for ${memberId}:`, e)
    }
  }

  revalidatePath("/dashboard/meetings")
}

// =====================================================================
// MEETING MINUTES (rule 6)
// =====================================================================

/** First upload — Super Admin always; otherwise requires the upload
 *  permission AND the meeting must not already be locked. Locks on save. */
export async function uploadMeetingMinutes(meetingId: string, formData: FormData) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Not authenticated.")

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { minutesLocked: true },
  })
  if (!meeting) throw new Error("Meeting not found.")

  if (meeting.minutesLocked && !isSuperAdmin(user)) {
    throw new Error("Minutes already uploaded. Only the Super Admin can replace them.")
  }

  const allowed = isSuperAdmin(user) || (await hasPermission(user.id, PERMISSIONS.MEETING_MINUTES_UPLOAD, user))
  if (!allowed) {
    throw new Error("You are not authorized to upload meeting minutes.")
  }

  const file = formData.get("minutes") as File | null
  if (!file || file.size === 0) {
    throw new Error("Please choose a file.")
  }

  const saved = await saveUploadedFile(file, "minutes")

  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      minutesUrl: saved.url,
      minutesFileName: saved.fileName,
      minutesUploadedAt: new Date(),
      minutesUploadedBy: user.id,
      minutesLocked: true,
    },
  })

  revalidatePath("/dashboard/meetings")
}

/** Replace an existing minutes file — Super Admin only (rule 6). */
export async function replaceMeetingMinutes(meetingId: string, formData: FormData) {
  const user = await getCurrentUser()
  requireSuperAdmin(user)

  const file = formData.get("minutes") as File | null
  if (!file || file.size === 0) {
    throw new Error("Please choose a file.")
  }

  const saved = await saveUploadedFile(file, "minutes")
  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      minutesUrl: saved.url,
      minutesFileName: saved.fileName,
      minutesUploadedAt: new Date(),
      minutesUploadedBy: user!.id,
    },
  })

  revalidatePath("/dashboard/meetings")
}

// =====================================================================
// PERMISSION MANAGEMENT — Super Admin only (rules 5 & 6)
// =====================================================================

export async function grantMeetingPermission(userId: string, permission: string) {
  const user = await getCurrentUser()
  requireSuperAdmin(user)
  if (!Object.values(PERMISSIONS).includes(permission as never)) {
    throw new Error("Unknown permission.")
  }
  await prisma.userPermission.upsert({
    where: { userId_permission: { userId, permission } },
    create: { userId, permission },
    update: { userId, permission },
  })
  revalidatePath("/dashboard/meetings")
}

export async function revokeMeetingPermission(userId: string, permission: string) {
  const user = await getCurrentUser()
  requireSuperAdmin(user)
  await prisma.userPermission
    .delete({ where: { userId_permission: { userId, permission } } })
    .catch(() => undefined) // idempotent
  revalidatePath("/dashboard/meetings")
}

// Exposed for the page to resolve the current caller without importing the
// next-auth plumbing directly.
export async function resolveCurrentUser(): Promise<CurrentUser | null> {
  return getCurrentUser()
}
