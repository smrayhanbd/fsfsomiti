import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getCurrentUser, isSuperAdmin } from "@/lib/permissions"
import { scanAllLoansForNpl } from "@/lib/loanNpl"

export const dynamic = "force-dynamic"

/**
 * POST /api/loans/npl-scan
 *
 * Scans every active loan for days-past-due, computes its NPL bucket, and
 * flags newly-overdue / escalated loans. Designed to be invoked by a Vercel
 * Cron job (see vercel.json) but may also be triggered manually by an admin.
 *
 * Auth:
 *   - Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` — accepted as
 *     a trusted invocation.
 *   - Otherwise a logged-in super admin / admin can call directly.
 */
export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get("authorization") || ""
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`

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
