/**
 * Inngest client singleton.
 *
 * Why Inngest is the project's scheduler:
 *   Vercel Hobby plan caps Cron at 2 daily jobs and does NOT support
 *   sub-daily schedules. Inngest's free tier (5,000 runs/month) supports
 *   any cron expression, automatic retries on transient failures, and
 *   per-function concurrency limits. All 5 scheduled jobs (backup,
 *   late-fee, npl-scan, maturity-scan, message-retry) are registered as
 *   Inngest scheduled functions in lib/inngest/scheduled.ts.
 *
 * No-op fallback: when `INNGEST_EVENT_KEY` is unset (local dev without
 * the Inngest CLI, or a fresh deploy before secrets are added), the
 * client is `null` and `dispatch()` becomes a no-op. The Inngest route
 * at /api/inngest returns 503, and NO scheduled jobs will fire — you
 * must trigger them manually via the admin dashboard or the Inngest
 * dev server (`npx inngest-cli@latest dev`).
 *
 * The client is a singleton (module-level const) so the same instance is
 * reused across hot-reloads in dev and across warm Lambda invocations in
 * prod — never `new Inngest()` per request.
 *
 * Server-only.
 */
import { Inngest } from "inngest"

// Inngest v3 reads these from env automatically when omitted, but we pass
// them explicitly so the no-op fallback can detect "not configured"
// without instantiating a client that warns on every send.
const eventKey = process.env.INNGEST_EVENT_KEY
const signingKey = process.env.INNGEST_SIGNING_KEY

export const inngest = eventKey
  ? new Inngest({
      id: "somiti-ms",
      eventKey,
      // signingKey is used by the serve() endpoint to verify incoming
      // requests from Inngest Cloud (prevents forged invocations). When
      // omitted, Inngest v3 reads it from INNGEST_SIGNING_KEY env var
      // automatically — we pass it explicitly for clarity + to surface
      // misconfigurations at startup rather than at first request.
      ...(signingKey ? { signingKey } : {}),
      name: "Somiti Management System",
    })
  : null

export const isInngestEnabled = (): boolean => inngest !== null

export type InngestClient = Inngest
