import { NextResponse } from "next/server"
import { runTaskDispatcher } from "@/lib/tasks/dispatcher"

// Hourly cron endpoint for the Task Management module. Mirrors the
// /api/wishes/send contract (CRON_SECRET gate + force-dynamic).
//
// Responsibilities (see lib/tasks/dispatcher.ts):
//   1. Dispatch due TaskReminder rows (In-App / SMS / Email) once each.
//   2. Spawn recurring-task occurrences whose next run is due.
//   3. Escalate overdue open tasks to creators + assignees.
//
// Schedule HOURLY via an external scheduler. Vercel example:
//   // vercel.json
//   { "crons": [{ "path": "/api/tasks/process", "schedule": "0 * * * *" }] }
//
// Alternative: cron-job.org / GitHub Actions hitting this URL hourly with the
// x-cron-secret header (or ?secret=) set to process.env.CRON_SECRET.

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
    console.error("[cron.tasks] CRON_SECRET not set — refusing to run. Set it in env.")
    return { ok: false, status: 500, error: "Server misconfigured: CRON_SECRET is not set." }
  }
  const url = new URL(request.url)
  const token =
    url.searchParams.get("secret") || request.headers.get("x-cron-secret") || ""
  if (token !== CRON_SECRET) {
    return { ok: false, status: 401, error: "Unauthorized" }
  }
  return { ok: true }
}

export async function GET(request: Request) {
  const auth = authorizeCron(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status ?? 401 }
    )
  }
  try {
    const summary = await runTaskDispatcher()
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...summary,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[tasks.process] dispatcher error:", error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return GET(request)
}
