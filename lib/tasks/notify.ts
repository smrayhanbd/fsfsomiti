import prisma from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import { sendSMS } from "@/lib/sms"

// ──────────────────────────────────────────────────────────────────────────────
// Task notification helpers.
//
// Three channels (In-App / SMS / Email) are fanned out to every resolved
// recipient (staff users + members + committee members). Failures are logged
// to the central Notification table (the admin topbar feed) but never block
// the calling action — mirroring the meeting/approval modules.
// ──────────────────────────────────────────────────────────────────────────────

export interface NotifyOptions {
  title: string
  body: string // plain text (SMS / in-app). HTML is derived for email.
  // Recipients — pass any combination; duplicates are de-duped by contact.
  staffUserIds?: string[]
  memberIds?: string[]
  committeeIds?: string[]
  channels?: ("IN_APP" | "SMS" | "EMAIL")[]
  // Optional task link for in-app notifications.
  taskPath?: string // e.g. "/portal/tasks/<id>" or "/dashboard/tasks/<id>"
}

const DEFAULT_CHANNELS: ("IN_APP" | "SMS" | "EMAIL")[] = ["IN_APP"]

/** Escape minimal HTML special characters for safe inline rendering. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

interface ResolvedRecipient {
  userId?: string
  memberId?: string
  email?: string | null
  phone?: string | null
  name?: string | null
}

/**
 * Resolve every distinct recipient for a task notification. Committee members
 * are expanded to their constituent staff + members. Returns de-duped list.
 */
export async function resolveRecipients(opts: NotifyOptions): Promise<ResolvedRecipient[]> {
  const userIds = new Set(opts.staffUserIds ?? [])
  const memberIds = new Set(opts.memberIds ?? [])

  if (opts.committeeIds?.length) {
    const memberships = await prisma.committeeMember.findMany({
      where: { committeeId: { in: opts.committeeIds } },
      select: { userId: true, memberId: true },
    })
    for (const m of memberships) {
      if (m.userId) userIds.add(m.userId)
      if (m.memberId) memberIds.add(m.memberId)
    }
  }

  const [users, members] = await Promise.all([
    userIds.size
      ? prisma.user.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, email: true, phone: true, name: true },
        })
      : Promise.resolve([]),
    memberIds.size
      ? prisma.member.findMany({
          where: { id: { in: [...memberIds] } },
          select: { id: true, email: true, phone: true, fullName: true },
        })
      : Promise.resolve([]),
  ])

  const recipients: ResolvedRecipient[] = []
  for (const u of users) {
    recipients.push({ userId: u.id, email: u.email, phone: u.phone, name: u.name })
  }
  for (const m of members) {
    recipients.push({ memberId: m.id, email: m.email, phone: m.phone, name: m.fullName })
  }
  return recipients
}

/**
 * Fan a notification out to all recipients across the chosen channels.
 * Non-blocking on the caller: every failure is captured centrally.
 */
export async function notifyTaskAssignees(opts: NotifyOptions): Promise<void> {
  const channels = opts.channels?.length ? opts.channels : DEFAULT_CHANNELS
  const recipients = await resolveRecipients(opts)

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#0f172a">
    <h3 style="margin:0 0 8px">${escapeHtml(opts.title)}</h3>
    <p style="margin:0;white-space:pre-wrap">${escapeHtml(opts.body)}</p>
    ${opts.taskPath ? `<p style="margin:12px 0 0"><a href="${escapeHtml(opts.taskPath)}">Open task</a></p>` : ""}
  </div>`

  for (const r of recipients) {
    // In-App — always recorded for the relevant user/member.
    if (channels.includes("IN_APP")) {
      try {
        if (r.memberId) {
          await prisma.memberNotification.create({
            data: {
              memberId: r.memberId,
              type: "TASK",
              title: opts.title,
              message: opts.body,
            },
          })
        } else if (r.userId) {
          // Staff/admin in-app feed (admin topbar Notification table).
          await prisma.notification.create({
            data: {
              type: "TASK",
              title: opts.title,
              message: opts.body,
            },
          })
        }
      } catch (e) {
        console.error("[tasks.notify] in-app failed:", e)
      }
    }

    if (channels.includes("SMS") && r.phone) {
      try {
        await sendSMS(r.phone, `${opts.title}: ${opts.body}`.slice(0, 480))
      } catch (e) {
        console.error(`[tasks.notify] SMS failed for ${r.phone}:`, e)
      }
    }

    if (channels.includes("EMAIL") && r.email) {
      try {
        await sendEmail(r.email, opts.title, html)
      } catch (e) {
        console.error(`[tasks.notify] email failed for ${r.email}:`, e)
      }
    }
  }
}
