/**
 * POST /api/backup/run
 *
 * Manual admin trigger for the daily backup. The primary scheduler is
 * Inngest (see lib/inngest/scheduled.ts → scheduledBackup); this route
 * exists so an admin can fire a backup on-demand from the dashboard.
 *
 * Auth: CRON_SECRET (constant-time compare via lib/cron.ts) — also used
 * by any legacy external scheduler that still hits this URL.
 *
 * The actual backup work is in lib/backup/scheduledBackup.ts so this
 * route and the Inngest function share the exact same logic.
 */
import { NextResponse, type NextRequest } from "next/server"

import { verifyCronRequest } from "@/lib/cron"
import { getRequestLogger } from "@/lib/logger"
import { tryAcquireLock, dailyLockKey } from "@/lib/cronLock"
import { runScheduledBackup } from "@/lib/backup/scheduledBackup"

export const dynamic = "force-dynamic"

// Vercel Hobby caps serverless function execution at 60s. The backup dumps
// every table + uploads to S3 — on a large DB this can take 30-50s. We
// declare the max so the runtime doesn't terminate mid-upload.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const log = getRequestLogger()

  // ── Auth ─────────────────────────────────────────────────────────────
  const auth = verifyCronRequest(req)
  if (!auth.ok) {
    log.warn("[/api/backup/run] unauthorized cron attempt")
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  // ── Idempotency lock ─────────────────────────────────────────────────
  // Prevents double-backup if Inngest + a manual admin trigger fire in
  // the same UTC day. Daily cron → 23h TTL leaves a 1h buffer.
  const lockKey = dailyLockKey("backup-run")
  const acquired = await tryAcquireLock(lockKey, 23 * 3600)
  if (!acquired) {
    log.info({ lockKey }, "[/api/backup/run] skipped — already ran today")
    return NextResponse.json(
      { skipped: "already-run-today", lockKey },
      { status: 200 }
    )
  }

  // ── Run the backup ──────────────────────────────────────────────────
  const result = await runScheduledBackup("admin")

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, backupId: result.backupId },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, backupId: result.backupId })
}

// Vercel Cron also issues a GET (for warm-up probes); respond 200 so the
// probe doesn't trigger an alert, but don't run the backup on a GET —
// only POST is allowed to start one.
export async function GET() {
  return NextResponse.json({ ok: true, message: "backup runner ready" })
}
