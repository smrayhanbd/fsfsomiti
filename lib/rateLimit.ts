/**
 * Rate limiting for unauthenticated + sensitive routes.
 *
 * Two backing implementations:
 *
 *   1. Upstash Redis (`@upstash/ratelimit` + `@upstash/redis`):
 *      Used in production when UPSTASH_REDIS_REST_URL + TOKEN are set.
 *      Shared across every Vercel Lambda invocation, so a distributed
 *      attacker can't bypass the limit by hitting different instances.
 *
 *   2. In-memory Map<key, timestamps[]>:
 *      Fallback for local dev, single-instance deploys, and CI. NOT safe for
 *      multi-instance production — each Lambda has its own Map and the limit
 *      is effectively multiplied by the number of warm instances.
 *
 * The factory returns a limiter with a uniform `.limit(identifier)` API so
 * callers don't care which backend is active:
 *
 *   const { success, remaining, reset } = await loginLimiter.limit(ip)
 *   if (!success) throw new Error("Too many attempts")
 *
 * Sliding-window algorithm (both backends): each request records a timestamp;
 * the window slides forward with each call, dropping timestamps older than
 * `window`. Limit is enforced against the count of surviving timestamps.
 *
 * Three pre-built limiters are exported:
 *
 *   loginLimiter          — 10 attempts / minute per IP
 *   passwordResetLimiter  — 5 attempts / hour per email+IP
 *   registerLimiter       — 3 attempts / hour per IP
 */
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

// ── Types ───────────────────────────────────────────────────────────────

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  /** Unix-ms timestamp when the limit will reset. */
  reset: number
}

export interface RateLimiter {
  limit: (identifier: string) => Promise<RateLimitResult>
}

type Window = "1 m" | "5 m" | "1 h" | "24 h"

// Parse "1 m" / "1 h" / "5 m" → milliseconds.
function windowToMs(w: Window): number {
  const [n, unit] = w.split(" ")
  const num = Number(n) || 1
  switch (unit) {
    case "m":
      return num * 60_000
    case "h":
      return num * 60 * 60_000
    default:
      return 60_000
  }
}

// ── In-memory fallback ──────────────────────────────────────────────────
//
// Map<key, timestamps[]> where timestamps is a sorted array of millisecond
// epoch times of recent requests. On each call we:
//   1. Drop timestamps older than now - windowMs.
//   2. If the surviving count >= limit, deny.
//   3. Otherwise push the new timestamp and allow.
//
// This is the classic "sliding-window log" algorithm — slightly more memory
// than fixed-window but never lets a burst through at the boundary.
function makeInMemoryLimiter(limit: number, window: Window): RateLimiter {
  const windowMs = windowToMs(window)
  const buckets = new Map<string, number[]>()

  // Periodic GC: every 5 minutes, drop entirely-stale buckets so the Map
  // doesn't grow forever. (Unbounded Maps are a classic memory leak in
  // long-lived serverless functions.)
  const GC_INTERVAL = 5 * 60_000
  let lastGc = Date.now()

  return {
    async limit(identifier: string): Promise<RateLimitResult> {
      const now = Date.now()

      // GC pass — runs inline; cheap enough (one Map iteration).
      if (now - lastGc > GC_INTERVAL) {
        for (const [k, arr] of buckets) {
          const cutoff = now - windowMs
          const fresh = arr.filter((t) => t > cutoff)
          if (fresh.length === 0) buckets.delete(k)
          else buckets.set(k, fresh)
        }
        lastGc = now
      }

      const cutoff = now - windowMs
      const existing = (buckets.get(identifier) ?? []).filter((t) => t > cutoff)

      if (existing.length >= limit) {
        // Denied — the reset time is when the OLDEST surviving timestamp
        // exits the window (i.e. its time + windowMs).
        const oldest = existing[0]
        return {
          success: false,
          limit,
          remaining: 0,
          reset: oldest + windowMs,
        }
      }

      existing.push(now)
      buckets.set(identifier, existing)
      return {
        success: true,
        limit,
        remaining: Math.max(0, limit - existing.length),
        reset: now + windowMs,
      }
    },
  }
}

// ── Factory ─────────────────────────────────────────────────────────────

function makeLimiter(identifier: string, limit: number, window: Window): RateLimiter {
  // Use Upstash when configured — this is the only multi-instance-safe option.
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    return new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `ratelimit:${identifier}`,
      // Per-request analytics — disabled to keep Upstash costs down. Enable
      // when debugging a runaway route.
      analytics: false,
    }) as unknown as RateLimiter
  }

  // Fallback: in-memory Map. Fine for dev / single-instance deploys.
  return makeInMemoryLimiter(limit, window)
}

// ── Pre-built limiters ──────────────────────────────────────────────────

export const loginLimiter = makeLimiter("login", 10, "1 m")
export const passwordResetLimiter = makeLimiter("password-reset", 5, "1 h")
export const registerLimiter = makeLimiter("register", 3, "1 h")

// ── Helper for callers ─────────────────────────────────────────────────

/**
 * Format the reset timestamp as a human-readable "try again in 30s" string.
 * Used by error messages so the user knows how long to wait.
 */
export function formatRetryAfter(resetMs: number): string {
  const waitMs = Math.max(0, resetMs - Date.now())
  if (waitMs < 60_000) return `${Math.ceil(waitMs / 1000)} seconds`
  const mins = Math.ceil(waitMs / 60_000)
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`
  const hrs = Math.ceil(mins / 60)
  return `${hrs} hour${hrs === 1 ? "" : "s"}`
}
