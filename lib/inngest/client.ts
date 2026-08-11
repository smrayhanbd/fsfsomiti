/**
 * Inngest client singleton (Roadmap item 20 — deferred job queue).
 *
 * Why: Vercel function timeout is 60s, but a slow SMS gateway (SendMySMS,
 * BulkSMSBD) can take 5–30s per message, and we send several per request
 * (approveTransaction → SMS + email; meeting blast → N members). When the
 * gateway stalls, the entire request times out and the user sees a 500 even
 * though the DB write already committed.
 *
 * Inngest moves the side effects off the request path: we fire an event,
 * Inngest invokes the registered job asynchronously with retries + timeouts.
 *
 * No-op fallback: when `INNGEST_EVENT_KEY` is unset (local dev, fresh deploys,
 * self-hosted), the client is `null` and `dispatch()` becomes a no-op. The
 * caller is responsible for invoking the inline fallback so behaviour is
 * unchanged from before this refactor — see `lib/inngest/dispatch.ts`.
 *
 * The client is a singleton (module-level const) so the same instance is
 * reused across hot-reloads in dev and across warm Lambda invocations in
 * prod — never `new Inngest()` per request.
 *
 * Server-only.
 */
import { Inngest } from "inngest"

// NOTE: Inngest v3 reads `INNGEST_EVENT_KEY` from env automatically when
// `eventKey` is omitted, but we pass it explicitly so the no-op fallback can
// detect "not configured" without instantiating a client that warns.
export const inngest = process.env.INNGEST_EVENT_KEY
  ? new Inngest({
      id: "somiti-ms",
      eventKey: process.env.INNGEST_EVENT_KEY,
      name: "Somiti Management System",
    })
  : null

export const isInngestEnabled = (): boolean => inngest !== null

export type InngestClient = Inngest
