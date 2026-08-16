import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getCurrentUser, isSuperAdmin } from "@/lib/permissions"
import { scanAndAccrueLateFees } from "@/lib/loanLateFee"
import { verifyCronRequest } from "@/lib/cron"
import { tryAcquireLock, dailyLockKey } from "@/lib/cronLock"

export const dynamic = "force-dynamic"

// Vercel Hobby caps serverless function execution at 60s. We explicitly
// declare it so the runtime doesn't terminate the request early when the
// late-fee scan is running across a large loan book.
export const maxDuration = 60

/**
 * POST /api/loans/late-fee
 *
 * Manual admin trigger for the daily late-fee scan. The primary scheduler
 * is Inngest (see lib/inngest/scheduled.ts → scheduledLateFee); this route
 * exists for on-demand admin triggers.
 *
 * Auth:
 *   - CRON_SECRET (constant-time compare via lib/cron.ts) — used by any
 *     external scheduler.
 *   - Otherwise a logged-in super admin / admin can call directly.
 *
 * The actual scan work is in lib/loanLateFee.ts (scanAndAccrueLateFees)
 * so this route and the Inngest function share the exact same logic.
 */
export async function POST(req: NextRequest) {
  // ── Auth: cron secret OR admin session ──────────────────────────────
  const cronAuth = verifyCronRequest(req)
  const isCron = cronAuth.ok

  let isAdmin = false
  if (!isCron) {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const user = await getCurrentUser()
    isAdmin = isSuperAdmin(user) || user?.role === "ADMIN"
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  // Idempotency lock — only for cron-triggered runs (admin manual triggers
  // are allowed to bypass so an admin can force a re-run). Daily cron →
  // 23h TTL leaves a 1h buffer before the next day's fire.
  if (isCron) {
    const lockKey = dailyLockKey("late-fee")
    const acquired = await tryAcquireLock(lockKey, 23 * 3600)
    if (!acquired) {
      return NextResponse.json(
        { skipped: "already-run-today", lockKey },
        { status: 200 }
      )
    }
  }

  try {
    const result = await scanAndAccrueLateFees()
    return NextResponse.json(result)
  } catch (e) {
    console.error("[/api/loans/late-fee] failed:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Late fee scan failed" },
      { status: 500 }
    )
  }
}
