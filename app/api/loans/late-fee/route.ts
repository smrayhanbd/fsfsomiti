import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getCurrentUser, isSuperAdmin } from "@/lib/permissions"
import { scanAndAccrueLateFees } from "@/lib/loanLateFee"

export const dynamic = "force-dynamic"

/**
 * POST /api/loans/late-fee
 *
 * Scans every overdue loan schedule row and accrues a daily-prorated late
 * fee against the principal. Designed to be invoked by a Vercel Cron job
 * (see vercel.json) but may also be triggered manually by an admin.
 *
 * Auth:
 *   - Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` — accepted
 *     as a trusted invocation.
 *   - Otherwise a logged-in super admin / admin can call directly.
 */
export async function POST(req: NextRequest) {
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
