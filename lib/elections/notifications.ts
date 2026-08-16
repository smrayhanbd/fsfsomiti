 
// ============================================================================
// Election notifications — bridges to the existing notification system.
// ============================================================================
// Per spec §31.3, §78, §79: election events trigger notifications via IN_APP,
// SMS, and EMAIL channels. ElectionNotification + ElectionNotificationRecipient
// store the per-election record; IN_APP delivery ALSO bridges to the existing
// MemberNotification table so members see notices in their portal bell without
// a separate UI.

import prisma from "@/lib/prisma"
import type { ElectionNotificationType } from "@prisma/client"
import { sendEmail } from "@/lib/email"
import { sendSMS } from "@/lib/sms"

export interface ElectionNotificationInput {
  electionId: string
  type: ElectionNotificationType
  channel: "IN_APP" | "SMS" | "EMAIL"
  title: string
  message: string
  // Member IDs to deliver to. If null/empty, delivered to all eligible voters.
  recipientMemberIds?: string[] | null
  scheduledAt?: Date | null
}

const TYPE_TO_TEMPLATE: Partial<Record<ElectionNotificationType, { defaultTitle: string; defaultBody: (ctx: { electionName: string; extra?: string }) => string }>> = {
  NOMINATION_OPENED: {
    defaultTitle: "Nominations Open",
    defaultBody: (c) => `Nominations are now open for ${c.electionName}. Submit your nomination from your member portal.`,
  },
  VOTING_OPENED: {
    defaultTitle: "Voting Open",
    defaultBody: (c) => `Voting is now open for ${c.electionName}. Cast your vote from your member portal.`,
  },
  VOTING_CLOSING_SOON: {
    defaultTitle: "Voting Closing Soon",
    defaultBody: (c) => `Voting for ${c.electionName} closes soon. Cast your vote now if you haven't already.`,
  },
  RESULTS_PUBLISHED: {
    defaultTitle: "Results Published",
    defaultBody: (c) => `The results of ${c.electionName} have been published. View them in your member portal.`,
  },
  ELECTION_CANCELLED: {
    defaultTitle: "Election Cancelled",
    defaultBody: (c) => `${c.electionName} has been cancelled.${c.extra ? " Reason: " + c.extra : ""}`,
  },
  ELECTION_FROZEN: {
    defaultTitle: "Election Suspended",
    defaultBody: (c) => `Voting for ${c.electionName} has been temporarily suspended while the system is being reviewed.`,
  },
  QUORUM_NOT_MET: {
    defaultTitle: "Quorum Not Met",
    defaultBody: (c) => `${c.electionName} did not meet the required quorum. Further action will be communicated.`,
  },
}

/**
 * Dispatch an election notification. Creates the ElectionNotification row,
 * creates ElectionNotificationRecipient rows, and for IN_APP channel also
 * bridges into MemberNotification so members see it in their existing bell.
 *
 * Best-effort: never throws. Email/SMS failures are logged.
 */
export async function dispatchElectionNotification(input: ElectionNotificationInput): Promise<void> {
  try {
    const election = await prisma.election.findUnique({
      where: { id: input.electionId },
      select: { name: true, isTestElection: true },
    })
    if (!election) return
    // Per spec §79: no notifications for test elections.
    if (election.isTestElection) return

    // Resolve recipients.
    let recipientIds = input.recipientMemberIds
    if (!recipientIds || recipientIds.length === 0) {
      const eligible = await prisma.electionEligibility.findMany({
        where: { electionId: input.electionId, eligible: true },
        select: { memberId: true },
      })
      recipientIds = eligible.map((e) => e.memberId)
    }
    if (recipientIds.length === 0) return

    const template = TYPE_TO_TEMPLATE[input.type]
    const title = input.title || template?.defaultTitle || input.type
    const message = input.message || template?.defaultBody({ electionName: election.name }) || ""

    // Create the notification + recipients.
    const notification = await prisma.electionNotification.create({
      data: {
        electionId: input.electionId,
        type: input.type,
        channel: input.channel,
        title,
        message,
        scheduledAt: input.scheduledAt ?? null,
        recipients: {
          create: recipientIds.map((memberId) => ({ memberId })),
        },
      },
    })

    if (input.channel === "IN_APP") {
      // Bridge to the existing MemberNotification table.
      await prisma.memberNotification.createMany({
        data: recipientIds.map((memberId) => ({
          memberId,
          type: "ELECTION_NOTICE",
          title,
          message,
        })),
      }).catch(() => undefined)
      // Mark recipients as delivered.
      await prisma.electionNotificationRecipient.updateMany({
        where: { notificationId: notification.id },
        data: { deliveredAt: new Date() },
      })
    } else if (input.channel === "EMAIL") {
      // Resolve emails + send.
      const members = await prisma.member.findMany({
        where: { id: { in: recipientIds }, email: { not: null } },
        select: { email: true },
      })
      for (const m of members) {
        if (m.email) {
          await sendEmail(m.email, title, `<p>${message}</p>`).catch(() => undefined)
        }
      }
      await prisma.electionNotificationRecipient.updateMany({
        where: { notificationId: notification.id },
        data: { deliveredAt: new Date() },
      })
    } else if (input.channel === "SMS") {
      const members = await prisma.member.findMany({
        where: { id: { in: recipientIds } },
        select: { phone: true },
      })
      for (const m of members) {
        if (m.phone) {
          await sendSMS(m.phone, `${title}: ${message}`).catch(() => undefined)
        }
      }
      await prisma.electionNotificationRecipient.updateMany({
        where: { notificationId: notification.id },
        data: { deliveredAt: new Date() },
      })
    }
  } catch (e) {
    console.error("[elections] dispatchElectionNotification failed:", input.type, e)
  }
}
