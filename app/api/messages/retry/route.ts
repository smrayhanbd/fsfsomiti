import { NextRequest, NextResponse } from "next/server"
import { verifyCronRequest } from "@/lib/cron"
import { tryAcquireLock, windowLockKey } from "@/lib/cronLock"
import { runMessageRetry } from "@/lib/messages/retry"

export const dynamic = "force-dynamic"

// Vercel Hobby caps serverless function execution at 60s. Each retry tick
// processes up to 50 rows × ~3s per send = up to 150s in the worst case.
// We use the full 60s and rely on the idempotency lock + RETRYING status
// to make the next tick pick up where this one left off.
export const maxDuration = 60

/**
 * POST /api/messages/retry
 *
 * Manual admin trigger for the message retry pump. The primary scheduler
 * is Inngest (see lib/inngest/scheduled.ts → scheduledMessageRetry) which
 * fires every 5 minutes; this route exists for on-demand admin triggers.
 *
 * Auth: CRON_SECRET only — this endpoint must NEVER accept untrusted
 * callers (it triggers outbound messages).
 *
 * The actual retry work is in lib/messages/retry.ts so this route and
 * the Inngest function share the exact same logic.
 */
export async function POST(req: NextRequest) {
  const auth = verifyCronRequest(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  // Idempotency lock — 5-minute window, 4-min TTL. Prevents overlap if
  // an admin manually fires while an Inngest run is in progress.
  const lockKey = windowLockKey("msg-retry", 5)
  const acquired = await tryAcquireLock(lockKey, 4 * 60)
  if (!acquired) {
    return NextResponse.json(
      { skipped: "already-running-in-window", lockKey },
      { status: 200 }
    )
  }

  const result = await runMessageRetry()
  return NextResponse.json(result)
}
