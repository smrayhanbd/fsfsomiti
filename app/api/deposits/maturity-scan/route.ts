import { NextRequest, NextResponse } from "next/server"
import { verifyCronRequest } from "@/lib/cron"
import { tryAcquireLock, dailyLockKey } from "@/lib/cronLock"
import { runMaturityScan } from "@/lib/deposits/maturityScan"

export const dynamic = "force-dynamic"

// Vercel Hobby caps serverless function execution at 60s. Maturity scan
// processes every due deposit in a transaction — give it the full budget.
export const maxDuration = 60

/**
 * POST /api/deposits/maturity-scan
 *
 * Manual admin trigger for the daily maturity scan. The primary scheduler
 * is Inngest (see lib/inngest/scheduled.ts → scheduledMaturityScan); this
 * route exists for on-demand admin triggers.
 *
 * Auth: CRON_SECRET only.
 *
 * The actual scan work is in lib/deposits/maturityScan.ts so this route
 * and the Inngest function share the exact same logic.
 */
export async function POST(req: NextRequest) {
  const auth = verifyCronRequest(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  // Idempotency lock — daily cron, 23h TTL. Critical here because a
  // double-fire would create two maturity-payout Transactions against
  // the same deposit (the scan itself is idempotent via MATURED status,
  // but the lock is an extra safety net for manual admin triggers).
  const lockKey = dailyLockKey("maturity-scan")
  const acquired = await tryAcquireLock(lockKey, 23 * 3600)
  if (!acquired) {
    return NextResponse.json(
      { skipped: "already-run-today", lockKey },
      { status: 200 }
    )
  }

  const result = await runMaturityScan()
  return NextResponse.json(result)
}
