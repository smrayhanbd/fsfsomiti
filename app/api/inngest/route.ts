/**
 * Inngest webhook endpoint — the single entry point for ALL scheduled
 * jobs in the project.
 *
 * Two flavours of function are registered here:
 *   1. Event-triggered jobs (lib/inngest/jobs.ts) — fired by `dispatch()`
 *      from inside request handlers (e.g. transaction.approved.notify).
 *   2. Scheduled (cron) functions (lib/inngest/scheduled.ts) — fired by
 *      Inngest Cloud on a cron schedule. These ARE the project's cron
 *      scheduler (Vercel Cron is no longer used).
 *
 * When Inngest is not configured (INNGEST_EVENT_KEY unset), this route
 * returns 503. NO scheduled jobs will fire in that state — you must
 * either:
 *   - Set INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY in Vercel env vars, OR
 *   - Run `npx inngest-cli@latest dev` locally for development.
 *
 * See CRON-SETUP.md for the full setup guide.
 */
import { serve } from "inngest/next"
import { inngest } from "@/lib/inngest/client"
import { allJobs } from "@/lib/inngest/jobs"
import { allScheduledFunctions } from "@/lib/inngest/scheduled"

export const dynamic = "force-dynamic"

// Convert plain InngestJob objects into Inngest function executables.
// Combine with scheduled functions so Inngest Cloud sees both event-triggered
// and cron-triggered functions when it syncs on deploy.
//
// Guard against inngest being null (no INNGEST_EVENT_KEY configured).
const client = inngest
const eventFunctions = client
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

const functions = client
  ? [...eventFunctions, ...allScheduledFunctions]
  : []

const handler = client
  ? serve({
      client,
      functions: functions as unknown as NonNullable<Parameters<typeof serve>[0]["functions"]>,
      streaming: "allow",
    })
  : () =>
      new Response(
        JSON.stringify({
          error: "Inngest not configured — set INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY",
          hint: "See CRON-SETUP.md for setup instructions",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      )

export { handler as GET, handler as POST, handler as PUT }
