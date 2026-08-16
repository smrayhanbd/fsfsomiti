import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getCurrentUser, isSuperAdmin } from "@/lib/permissions"
import { scanAllLoansForNpl } from "@/lib/loanNpl"
import { verifyCronRequest } from "@/lib/cron"
import { tryAcquireLock, dailyLockKey } from "@/lib/cronLock"

export const dynamic = "force-dynamic"

// Vercel Hobby caps serverless function execution at 60s. NPL scan iterates
// every active loan + its schedule rows — on a large book this can take
// 20-40s, so we need the full 60s budget.
export const maxDuration = 60

/**
 * POST /api/loans/npl-scan
 *
 * Manual admin trigger for the daily NPL classification scan. The primary
 * scheduler is Inngest (see lib/inngest/scheduled.ts → scheduledNplScan);
 * this route exists for on-demand admin triggers.
 *
 * Auth:
 *   - CRON_SECRET (constant-time compare via lib/cron.ts) — used by any
 *     external scheduler.
 *   - Otherwise a logged-in super admin / admin can call directly.
 *
 * The actual scan work is in lib/loanNpl.ts (scanAllLoansForNpl) so this
 * route and the Inngest function share the exact same logic.
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

  // Idempotency lock — only for cron-triggered runs. Daily cron, 23h TTL.
  if (isCron) {
    const lockKey = dailyLockKey("npl-scan")
    const acquired = await tryAcquireLock(lockKey, 23 * 3600)
    if (!acquired) {
      return NextResponse.json(
        { skipped: "already-run-today", lockKey },
        { status: 200 }
      )
    }
  }

  try {
    const result = await scanAllLoansForNpl()
    return NextResponse.json(result)
  } catch (e) {
    console.error("[/api/loans/npl-scan] failed:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Scan failed" },
      { status: 500 }
    )
  }
}
