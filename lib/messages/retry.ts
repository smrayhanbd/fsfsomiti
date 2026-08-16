/**
 * Message retry pump — shared by the /api/messages/retry route (manual
 * admin trigger) and the Inngest scheduled-message-retry function.
 *
 * Extracted from app/api/messages/retry/route.ts so both callers use the
 * exact same logic. The route handler still owns auth + idempotency;
 * this function owns the retry loop + transport calls.
 *
 * Server-only.
 */
import prisma from "@/lib/prisma"
import { sendSMS } from "@/lib/sms"
import { sendEmail } from "@/lib/email"
import { logger } from "@/lib/logger"

export interface MessageRetryResult {
  picked: number
  retried: number
  succeeded: number
  failed: number
}

/**
 * Pick up every MessageDeliveryLog row left in RETRYING whose nextRetryAt
 * has elapsed and attemptCount is below maxAttempts, re-dispatch it via
 * the underlying SMS / Email transport, and update the row to SENT
 * (success) or FAILED (out of retries).
 *
 * Pulls up to 50 rows per tick so a backlog drains gradually without
 * overwhelming the gateway.
 *
 * Idempotency: each row's status transitions RETRYING → SENT / FAILED,
 * so a double-fire within the same window simply finds no eligible rows
 * on the second run.
 */
export async function runMessageRetry(): Promise<MessageRetryResult> {
  const now = new Date()
  const rows = await prisma.messageDeliveryLog.findMany({
    where: {
      status: "RETRYING",
      nextRetryAt: { lte: now },
    },
    orderBy: { nextRetryAt: "asc" },
    take: 50,
  })

  // Drop rows already at their max-attempts cap — they should be marked
  // FAILED instead of re-dispatched.
  const eligible = rows.filter((r) => r.attemptCount < r.maxAttempts)
  for (const exhausted of rows.filter((r) => r.attemptCount >= r.maxAttempts)) {
    await prisma.messageDeliveryLog.update({
      where: { id: exhausted.id },
      data: { status: "FAILED", nextRetryAt: null },
    }).catch(() => undefined)
  }

  let retried = 0
  let succeeded = 0
  let failed = 0

  for (const r of eligible) {
    const attempt = r.attemptCount + 1
    try {
      if (r.channel === "SMS") {
        const result = await sendSMS(r.recipient, r.body)
        if (result.status === "OK") {
          await prisma.messageDeliveryLog.update({
            where: { id: r.id },
            data: {
              status: "SENT",
              gatewayResponse: result.response ?? null,
              attemptCount: attempt,
              lastError: null,
              nextRetryAt: null,
            },
          })
          succeeded++
        } else {
          await markRetryOrFail(r, attempt, result.response ?? "Unknown error")
          if (attempt >= r.maxAttempts) failed++
          else retried++
        }
      } else if (r.channel === "EMAIL") {
        try {
          await sendEmail(r.recipient, r.body.split("\n\n")[0] || "(retry)", r.body)
          await prisma.messageDeliveryLog.update({
            where: { id: r.id },
            data: {
              status: "SENT",
              gatewayResponse: "OK",
              attemptCount: attempt,
              lastError: null,
              nextRetryAt: null,
            },
          })
          succeeded++
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Email retry failed"
          await markRetryOrFail(r, attempt, msg)
          if (attempt >= r.maxAttempts) failed++
          else retried++
        }
      }
    } catch (e) {
      // Defensive — never crash the whole tick because one row failed.
      logger.error({ err: e, rowId: r.id }, "[runMessageRetry] row failed")
    }
  }

  return { picked: eligible.length, retried, succeeded, failed }
}

async function markRetryOrFail(
  row: { id: string; attemptCount: number; maxAttempts: number },
  attempt: number,
  errorMsg: string
): Promise<void> {
  const retriesLeft = attempt < row.maxAttempts
  await prisma.messageDeliveryLog.update({
    where: { id: row.id },
    data: {
      status: retriesLeft ? "RETRYING" : "FAILED",
      attemptCount: attempt,
      lastError: errorMsg,
      nextRetryAt: retriesLeft ? new Date(Date.now() + 5 * 60 * 1000) : null,
    },
  })
}
