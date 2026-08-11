/**
 * Message-delivery-log wrapper (Roadmap item 19).
 *
 * Wraps `lib/sms.ts:sendSMS` and `lib/email.ts:sendEmail` so every outbound
 * message writes a `MessageDeliveryLog` row before dispatch and updates it
 * with the gateway response / error. Failed rows are scheduled for retry by
 * the `/api/messages/retry` cron (see vercel.json — every 5 minutes).
 *
 * The wrappers are intentionally defensive: a failure in the log write never
 * blocks the underlying send (best-effort). The retry worker picks up any
 * rows left in RETRYING.
 *
 * Server-only — uses Prisma + the wrapped transports.
 */
import prisma from "@/lib/prisma"
import { sendSMS as rawSendSMS, type SmsResult } from "@/lib/sms"
import { sendEmail as rawSendEmail, type EmailAttachment } from "@/lib/email"

const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 5 * 60 * 1000 // 5 minutes

export interface LogOpts {
  /** Polymorphic back-link to the triggering record (TRANSACTION | LOAN | ELECTION | …). */
  relatedType?: string | null
  relatedId?: string | null
}

/**
 * Insert a PENDING MessageDeliveryLog row, dispatch the SMS via the existing
 * `sendSMS` transport, then update the row to SENT / RETRYING based on the
 * result.
 *
 * Returns the SmsResult from the underlying transport so existing callers
 * that branch on `status` keep working unchanged.
 */
export async function sendSmsWithLog(
  to: string,
  body: string,
  opts: LogOpts = {}
): Promise<SmsResult> {
  // 1. PENDING row.
  let logId: string | null = null
  try {
    const row = await prisma.messageDeliveryLog.create({
      data: {
        channel: "SMS",
        recipient: to,
        body,
        status: "PENDING",
        attemptCount: 0,
        maxAttempts: MAX_ATTEMPTS,
        relatedType: opts.relatedType ?? null,
        relatedId: opts.relatedId ?? null,
      },
      select: { id: true },
    })
    logId = row.id
  } catch (e) {
    console.error("[messageLog] could not create PENDING SMS log:", e)
  }

  // 2. Dispatch.
  let result: SmsResult
  try {
    result = await rawSendSMS(to, body)
  } catch (e) {
    result = {
      status: "ERROR",
      response: e instanceof Error ? e.message : "SMS threw",
    }
  }

  // 3. Update log row.
  if (logId) {
    try {
      await updateLogFromSmsResult(logId, 1, result)
    } catch (e) {
      console.error("[messageLog] could not update SMS log:", e)
    }
  }
  return result
}

async function updateLogFromSmsResult(
  logId: string,
  attempt: number,
  result: SmsResult
): Promise<void> {
  if (result.status === "OK") {
    await prisma.messageDeliveryLog.update({
      where: { id: logId },
      data: {
        status: "SENT",
        gatewayResponse: result.response ?? null,
        attemptCount: attempt,
        lastError: null,
        nextRetryAt: null,
      },
    })
    return
  }
  // Failure — schedule a retry if we have attempts left.
  const retriesLeft = attempt < MAX_ATTEMPTS
  await prisma.messageDeliveryLog.update({
    where: { id: logId },
    data: {
      status: retriesLeft ? "RETRYING" : "FAILED",
      gatewayResponse: result.response ?? null,
      attemptCount: attempt,
      lastError: result.response ?? "Unknown error",
      nextRetryAt: retriesLeft ? new Date(Date.now() + RETRY_DELAY_MS) : null,
    },
  })
}

/**
 * Insert a PENDING MessageDeliveryLog row, dispatch the email via the
 * existing `sendEmail` transport, then update the row to SENT / RETRYING.
 *
 * Throws on delivery failure — matching the existing `sendEmail` contract so
 * callers that wrap calls in try/catch keep working unchanged.
 */
export async function sendEmailWithLog(
  to: string,
  subject: string,
  html: string,
  attachments?: EmailAttachment[],
  opts: LogOpts = {}
): Promise<void> {
  let logId: string | null = null
  try {
    const row = await prisma.messageDeliveryLog.create({
      data: {
        channel: "EMAIL",
        recipient: to,
        body: `${subject}\n\n${html}`,
        status: "PENDING",
        attemptCount: 0,
        maxAttempts: MAX_ATTEMPTS,
        relatedType: opts.relatedType ?? null,
        relatedId: opts.relatedId ?? null,
      },
      select: { id: true },
    })
    logId = row.id
  } catch (e) {
    console.error("[messageLog] could not create PENDING EMAIL log:", e)
  }

  try {
    await rawSendEmail(to, subject, html, attachments)
    if (logId) {
      try {
        await prisma.messageDeliveryLog.update({
          where: { id: logId },
          data: {
            status: "SENT",
            gatewayResponse: "OK",
            attemptCount: 1,
            lastError: null,
            nextRetryAt: null,
          },
        })
      } catch (e) {
        console.error("[messageLog] could not update EMAIL log (success):", e)
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Email send failed"
    if (logId) {
      try {
        await prisma.messageDeliveryLog.update({
          where: { id: logId },
          data: {
            status: "RETRYING",
            gatewayResponse: msg,
            attemptCount: 1,
            lastError: msg,
            nextRetryAt: new Date(Date.now() + RETRY_DELAY_MS),
          },
        })
      } catch (e2) {
        console.error("[messageLog] could not update EMAIL log (failure):", e2)
      }
    }
    throw e
  }
}
