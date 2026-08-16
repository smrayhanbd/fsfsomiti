import { NextResponse, type NextRequest } from "next/server"
import { verifyCronRequest } from "@/lib/cron"
import { runTaskDispatcher } from "@/lib/tasks/dispatcher"

// Hourly cron endpoint for the Task Management module.
//
// Responsibilities (see lib/tasks/dispatcher.ts):
//   1. Dispatch due TaskReminder rows (In-App / SMS / Email) once each.
//   2. Spawn recurring-task occurrences whose next run is due.
//   3. Escalate overdue open tasks to creators + assignees.
//
// Schedule HOURLY via an external scheduler (Inngest, GitHub Actions, etc.).
// Auth: CRON_SECRET — fail-closed if not set.

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
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

export async function POST(request: NextRequest) {
  return GET(request)
}
