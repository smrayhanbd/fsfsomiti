/**
 * Fire-and-forget job dispatcher (Roadmap item 20).
 *
 * `dispatch(event, data)` sends an event to Inngest when configured, or
 * becomes a no-op when `INNGEST_EVENT_KEY` is unset (local dev / fresh
 * deploys). In the no-op case the CALLER is responsible for invoking the
 * side-effect handler directly if it wants the old synchronous behaviour —
 * this is intentional, so dispatch sites stay explicit about their fallback.
 *
 * Never throws — a dispatch failure is logged and swallowed so the request
 * that triggered the job never rolls back. The DB write already committed;
 * losing the notification is preferable to erroring the user's request.
 *
 * Usage:
 *
 *   import { dispatch } from "@/lib/inngest/dispatch"
 *   import { isInngestEnabled } from "@/lib/inngest/client"
 *
 *   await dispatch("transaction.approved.notify", { transactionId, memberId })
 *     .catch((e) => logger.error({ e }, "dispatch failed"))
 *   if (!isInngestEnabled()) {
 *     // Inline fallback for dev — same side-effect as the Inngest job.
 *     notifyMember(txn, user).catch(() => undefined)
 *   }
 *
 * Server-only.
 */
import { inngest, isInngestEnabled } from "./client"
import { logger } from "@/lib/logger"

export async function dispatch<T>(event: string, data: T): Promise<void> {
  if (isInngestEnabled() && inngest) {
    try {
      // Inngest v3 uses `name` for the event payload key (was `event` in v2).
      // The function trigger (createFunction options) still uses `{ event: ... }`.
      await inngest.send({ name: event, data: data as Record<string, unknown> })
      logger.debug({ event }, "Inngest event dispatched")
    } catch (e) {
      // Log + swallow — see file header. The dispatch is fire-and-forget.
      logger.error({ event, err: e }, "Inngest dispatch failed")
    }
    return
  }

  // No-op fallback: caller is responsible for invoking the handler inline.
  logger.debug({ event }, "Inngest not configured — dispatch is a no-op (caller runs inline fallback)")
}
