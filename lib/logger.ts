/**
 * Structured logger + request-context (AsyncLocalStorage).
 *
 * We use `pino` for raw throughput — pino's design (no allocation per log
 * call, JSON in prod, `pino-pretty` in dev) makes it the standard choice for
 * Next.js on Vercel: each Lambda invocation streams log lines to stdout,
 * where Vercel picks them up and forwards to the configured log drain.
 *
 * Usage patterns:
 *
 *   import { logger } from "@/lib/logger"
 *   logger.info({ userId }, "user signed in")
 *
 *   // inside a request handler (route / server action / middleware):
 *   import { getRequestLogger, requestContext } from "@/lib/logger"
 *   const log = getRequestLogger()
 *   log.debug("hello")            // → includes requestId + userId if set
 *
 *   // wrap a request to attach the context (one call per request):
 *   await requestContext.run({ requestId, userId }, async () => { ... })
 *
 * Levels:
 *   - Production → "info"  (warn/info/error/fatal; JSON to stdout)
 *   - Dev        → "debug" (everything; pretty-coloured via pino-pretty)
 *   - Override    → set LOG_LEVEL=trace | debug | info | warn | error | fatal
 *
 * NOTE: do NOT sweep through existing `console.*` calls yet — leave them in
 * place; the logger is for NEW code only. Old code can be migrated gradually.
 */
import pino from "pino"
import { AsyncLocalStorage } from "node:async_hooks"

const level =
  process.env.LOG_LEVEL ||
  (process.env.NODE_ENV === "production" ? "info" : "debug")

export const logger = pino({
  level,
  // Production: emit raw JSON lines to stdout (Vercel's log drain ingests
  // these as structured JSON, so we can query by `requestId` / `userId`).
  // Dev: pretty-coloured output via pino-pretty — only added as a devDep so
  // production bundles stay lean.
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
  // Redact common sensitive fields so they never make it to the log drain.
  // Keys at any depth matching these names are replaced with "[Redacted]".
  redact: {
    paths: [
      "password",
      "passwordHash",
      "token",
      "authorization",
      "cookie",
      "cookies",
      "secret",
      "NEXTAUTH_SECRET",
      "ENCRYPTION_KEY",
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.secret",
    ],
    censor: "[Redacted]",
  },
})

/**
 * Request-scoped storage. Wrap a request handler in `requestContext.run(...)`
 * to attach a `requestId` and (optional) `userId` to every log line emitted
 * by `getRequestLogger()` inside that callback — no need to thread the
 * request ID through every function signature.
 */
export const requestContext = new AsyncLocalStorage<{
  requestId: string
  userId?: string
}>()

/**
 * Returns a child logger bound to the current AsyncLocalStorage store, if
 * any. Outside a request context, returns the bare {@link logger} so callers
 * in cron jobs / scripts still work without ceremony.
 */
export function getRequestLogger() {
  const ctx = requestContext.getStore()
  if (!ctx) return logger
  return logger.child({ requestId: ctx.requestId, userId: ctx.userId })
}
