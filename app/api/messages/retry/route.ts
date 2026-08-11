import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { sendSMS } from "@/lib/sms"
import { sendEmail } from "@/lib/email"

export const dynamic = "force-dynamic"

/**
 * POST /api/messages/retry
 *
 * Picks up every MessageDeliveryLog row left in RETRYING whose nextRetryAt
 * has elapsed and attemptCount is below maxAttempts, re-dispatches it via the
 * underlying SMS / Email transport, and updates the row to SENT (success) or
 * FAILED (out of retries).
 *
 * Auth: Vercel Cron secret only — this endpoint must NEVER accept untrusted
 * callers (it triggers outbound messages).
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get("authorization") || ""
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  // Pull up to 50 retryable rows per tick (every 5 minutes) so a backlog
  // drains gradually without overwhelming the gateway.
  //
  // The `attemptCount < maxAttempts` predicate is a column-to-column
  // comparison Prisma can't express in a `where` clause, so we fetch by
  // status + nextRetryAt and post-filter in JS below.
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
      console.error("[/api/messages/retry] row failed:", r.id, e)
    }
  }

  return NextResponse.json({
    picked: eligible.length,
    retried,
    succeeded,
    failed,
  })
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
