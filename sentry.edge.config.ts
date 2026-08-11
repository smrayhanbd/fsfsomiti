/**
 * Sentry Edge-runtime configuration.
 *
 * Loaded automatically by `@sentry/nextjs` for the Edge runtime
 * (`runtime: "edge"` Route Handlers, middleware, `proxy.ts`). The Edge runtime
 * is a subset of Node — no `fs`, no `Buffer` (mostly), so the SDK uses
 * `fetch()` to send events to Sentry's ingest endpoint.
 *
 * Same graceful-fallback strategy as the other two configs: no DSN ⇒ no-op.
 */
import * as Sentry from "@sentry/nextjs"

const dsn = process.env.SENTRY_DSN

if (dsn && dsn.length > 0) {
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    release:
      process.env.SENTRY_RELEASE ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      undefined,
    // Edge functions are short-lived — sample a higher fraction of traces
    // so we still get useful data from cold starts.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  })
}
