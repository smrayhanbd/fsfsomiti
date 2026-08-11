/**
 * Inngest job definitions (Roadmap item 20).
 *
 * Each export is an Inngest function bound to a specific event. The Inngest
 * runtime invokes these asynchronously when the corresponding event is dispatched.
 *
 * Jobs use the existing `sendSmsWithLog` / `sendEmailWithLog` wrappers so every
 * send is persisted in MessageDeliveryLog for retry + audit.
 *
 * When Inngest is NOT configured (INNGEST_EVENT_KEY unset), `dispatch()` is a
 * no-op and callers fall back to inline execution — these job functions are
 * never invoked in that mode.
 */
import { sendSmsWithLog, sendEmailWithLog } from "@/lib/messageLog"
import { createDatabaseBackup } from "@/lib/backup"
import { logger } from "@/lib/logger"
import prisma from "@/lib/prisma"

// Each job is a plain object — the Inngest route wraps them with `createFunction`.
// (We avoid the `inngest.createFunction()` call here so this module is importable
// even when Inngest is not configured — keeps tsc happy in the no-INGEST_EVENT_KEY case.)

export interface InngestJob {
  id: string
  event: string
  run: (data: Record<string, unknown>) => Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────
// transaction.approved.notify
// ─────────────────────────────────────────────────────────────────────────
export const transactionApprovedNotify: InngestJob = {
  id: "transaction-approved-notify",
  event: "transaction.approved.notify",
  run: async (data) => {
    const { transactionId, memberId } = data as { transactionId: string; memberId: string }
    const txn = await prisma.transaction.findUnique({
      where: { id: transactionId },
      select: { id: true, voucherNo: true, amount: true, transactionType: true },
    })
    if (!txn) return
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { phone: true, email: true, fullName: true },
    })
    if (!member) return
    const msg = `Dear ${member.fullName}, your ${txn.transactionType} (voucher ${txn.voucherNo}, ৳${txn.amount}) has been approved. — Somiti MS`
    if (member.phone) {
      await sendSmsWithLog(member.phone, msg, {
        relatedType: "TRANSACTION",
        relatedId: transactionId,
      }).catch((e) => logger.error({ e, transactionId }, "approved SMS failed"))
    }
    if (member.email) {
      await sendEmailWithLog(member.email, "Transaction Approved", msg, undefined, {
        relatedType: "TRANSACTION",
        relatedId: transactionId,
      }).catch((e) => logger.error({ e, transactionId }, "approved email failed"))
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────
// transaction.reversed.notify
// ─────────────────────────────────────────────────────────────────────────
export const transactionReversedNotify: InngestJob = {
  id: "transaction-reversed-notify",
  event: "transaction.reversed.notify",
  run: async (data) => {
    const { transactionId, memberId } = data as { transactionId: string; memberId: string }
    const txn = await prisma.transaction.findUnique({
      where: { id: transactionId },
      select: { voucherNo: true },
    })
    if (!txn) return
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { phone: true, email: true, fullName: true },
    })
    if (!member) return
    const msg = `Dear ${member.fullName}, transaction ${txn.voucherNo} has been reversed. — Somiti MS`
    if (member.phone) {
      await sendSmsWithLog(member.phone, msg, {
        relatedType: "TRANSACTION",
        relatedId: transactionId,
      }).catch((e) => logger.error({ e, transactionId }, "reversed SMS failed"))
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────
// loan.repayment.recorded
// ─────────────────────────────────────────────────────────────────────────
export const loanRepaymentRecorded: InngestJob = {
  id: "loan-repayment-recorded",
  event: "loan.repayment.recorded",
  run: async (data) => {
    const { loanId, memberId, amount } = data as {
      loanId: string
      memberId: string
      amount: string
    }
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { phone: true, email: true, fullName: true },
    })
    if (!member) return
    const msg = `Dear ${member.fullName}, your loan repayment of ৳${amount} has been recorded. Thank you. — Somiti MS`
    if (member.phone) {
      await sendSmsWithLog(member.phone, msg, {
        relatedType: "LOAN",
        relatedId: loanId,
      }).catch((e) => logger.error({ e, loanId }, "loan repayment SMS failed"))
    }
    if (member.email) {
      await sendEmailWithLog(member.email, "Loan Repayment Recorded", msg, undefined, {
        relatedType: "LOAN",
        relatedId: loanId,
      }).catch((e) => logger.error({ e, loanId }, "loan repayment email failed"))
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────
// loan.disbursed.notify
// ─────────────────────────────────────────────────────────────────────────
export const loanDisbursedNotify: InngestJob = {
  id: "loan-disbursed-notify",
  event: "loan.disbursed.notify",
  run: async (data) => {
    const { loanId, memberId, amount } = data as {
      loanId: string
      memberId: string
      amount: string
    }
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { phone: true, email: true, fullName: true },
    })
    if (!member) return
    const msg = `Dear ${member.fullName}, your loan of ৳${amount} has been disbursed. Please check your account. — Somiti MS`
    if (member.phone) {
      await sendSmsWithLog(member.phone, msg, {
        relatedType: "LOAN",
        relatedId: loanId,
      }).catch((e) => logger.error({ e, loanId }, "loan disbursement SMS failed"))
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────
// election.notification.dispatch
// ─────────────────────────────────────────────────────────────────────────
export const electionNotificationDispatch: InngestJob = {
  id: "election-notification-dispatch",
  event: "election.notification.dispatch",
  run: async (data) => {
    const { electionId, phase } = data as { electionId: string; phase: string }
    const voters = await prisma.member.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, phone: true, email: true, fullName: true },
    })
    logger.info({ electionId, phase, count: voters.length }, "Election notification dispatch")
    for (const v of voters) {
      if (!v.phone) continue
      await sendSmsWithLog(
        v.phone,
        `Election update: ${phase}. Check your portal for details. — Somiti MS`,
        { relatedType: "ELECTION", relatedId: electionId }
      ).catch((e) => logger.error({ e, electionId, memberId: v.id }, "election SMS failed"))
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────
// backup.scheduled
// ─────────────────────────────────────────────────────────────────────────
export const backupScheduled: InngestJob = {
  id: "backup-scheduled",
  event: "backup.scheduled",
  run: async () => {
    await createDatabaseBackup().catch((e) =>
      logger.error({ e }, "backup.scheduled job failed")
    )
  },
}

// ─────────────────────────────────────────────────────────────────────────
// member.wishes.send
// ─────────────────────────────────────────────────────────────────────────
export const memberWishesSend: InngestJob = {
  id: "member-wishes-send",
  event: "member.wishes.send",
  run: async () => {
    const today = new Date()
    const monthDay = `${today.getMonth() + 1}-${today.getDate()}`
    const birthdayMembers = await prisma.member.findMany({
      where: { status: "ACTIVE", dateOfBirth: { not: null } },
      select: { id: true, phone: true, email: true, fullName: true, dateOfBirth: true },
    })
    for (const m of birthdayMembers) {
      if (!m.dateOfBirth) continue
      const dob = new Date(m.dateOfBirth)
      const dobMonthDay = `${dob.getMonth() + 1}-${dob.getDate()}`
      if (dobMonthDay !== monthDay) continue
      const msg = `Happy Birthday ${m.fullName}! Wishing you a wonderful year ahead. — Somiti MS`
      if (m.phone) {
        await sendSmsWithLog(m.phone, msg, {
          relatedType: "WISH",
          relatedId: m.id,
        }).catch((e) => logger.error({ e, memberId: m.id }, "birthday SMS failed"))
      }
      if (m.email) {
        await sendEmailWithLog(m.email, "Happy Birthday!", msg, undefined, {
          relatedType: "WISH",
          relatedId: m.id,
        }).catch((e) => logger.error({ e, memberId: m.id }, "birthday email failed"))
      }
    }
  },
}

export const allJobs: InngestJob[] = [
  transactionApprovedNotify,
  transactionReversedNotify,
  loanRepaymentRecorded,
  loanDisbursedNotify,
  electionNotificationDispatch,
  backupScheduled,
  memberWishesSend,
]
