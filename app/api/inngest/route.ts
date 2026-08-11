/**
 * Inngest webhook endpoint (Roadmap item 20).
 *
 * Inngest invokes this endpoint to receive + dispatch scheduled + triggered
 * jobs. When Inngest is not configured (INNGEST_EVENT_KEY unset), this route
 * returns 503 so Vercel Cron (which points to /api/backup/run directly) keeps
 * working but the Inngest dashboard stays disabled.
 */
import { serve } from "inngest/next"
import { inngest } from "@/lib/inngest/client"
import { allJobs } from "@/lib/inngest/jobs"

export const dynamic = "force-dynamic"

// Convert plain InngestJob objects into Inngest function executables.
// Guard against inngest being null (no INNGEST_EVENT_KEY configured).
const client = inngest
const functions = client
  ? allJobs.map((job) =>
      client.createFunction(
        { id: job.id, name: job.id },
        { event: job.event },
        async ({ event }) => {
          await job.run(event.data as Record<string, unknown>)
        }
      )
    )
  : []

const handler = client
  ? serve({
      client,
      functions: functions as unknown as NonNullable<Parameters<typeof serve>[0]["functions"]>,
      streaming: "allow",
    })
  : () =>
      new Response(
        JSON.stringify({ error: "Inngest not configured — set INNGEST_EVENT_KEY" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      )

export { handler as GET, handler as POST, handler as PUT }
