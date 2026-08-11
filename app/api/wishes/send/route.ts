import { NextResponse } from "next/server"
import { sendSpecialWishesForDate } from "@/lib/specialWishes"

// This endpoint is designed to be called by a cron service (e.g., Vercel Cron, GitHub Actions, or any external scheduler).
// It automatically sends birthday, marriage anniversary, joining anniversary, and festival wishes to all active members.
//
// To set up automatic daily execution:
//
// Option 1: Vercel Cron (vercel.json)
//   {
//     "crons": [{
//       "path": "/api/wishes/send",
//       "schedule": "0 6 * * *"
//     }]
//   }
//
// Option 2: GitHub Actions
//   Schedule a workflow that calls this endpoint daily.
//
// Option 3: External cron services
//   Use cron-job.org, EasyCron, etc. to hit this URL daily.
//
// Security: You can add a query param check like ?secret=YOUR_SECRET
// and validate it below if needed.

export const dynamic = "force-dynamic"

// S11/S12 fix: read CRON_SECRET per-request (not at module load — env can
// change between hot-reloads in dev). Fail CLOSED when unset: previously
// `if (!CRON_SECRET) return true` left the endpoint open in any environment
// that forgot to set the env var, which is the worst-case security posture.
function authorizeCron(request: Request): {
  ok: boolean
  status?: number
  error?: string
} {
  const CRON_SECRET = process.env.CRON_SECRET
  if (!CRON_SECRET) {
    console.error("[cron.wishes] CRON_SECRET not set — refusing to run. Set it in env.")
    return { ok: false, status: 500, error: "Server misconfigured: CRON_SECRET is not set." }
  }
  const url = new URL(request.url)
  const token = url.searchParams.get("secret") || request.headers.get("x-cron-secret") || ""
  if (token !== CRON_SECRET) {
    return { ok: false, status: 401, error: "Unauthorized" }
  }
  return { ok: true }
}

export async function GET(request: Request) {
  // Security check (S11/S12 fail-closed)
  const auth = authorizeCron(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status ?? 401 }
    )
  }

  try {
    const summary = await sendSpecialWishesForDate()
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...summary,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Wish sender error:", error)
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  return GET(request)
}
