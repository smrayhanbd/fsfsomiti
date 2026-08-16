/**
 * Cron idempotency lock (Vercel Hobby resilience layer).
 *
 * Why this exists:
 *   Vercel Cron on the Hobby plan has two reliability gaps:
 *     1. The runner occasionally fires the same cron twice in quick succession
 *        (cold-start retries, deploy-time warm-up probes).
 *     2. If you later move scheduling to Inngest or an external scheduler
 *        (cron-job.org, GitHub Actions), the old Vercel Cron may still be
 *        active for a deploy or two and double-fire the route.
 *
 *   A late-fee scan that runs twice in one day double-charges members. A
 *   backup that runs twice writes two rows + uploads two S3 objects. A
 *   maturity-scan that runs twice can create two maturity-payout
 *   transactions against the same deposit. All bad.
 *
 * What this does:
 *   `tryAcquireLock(key, ttlSeconds)` returns true exactly once per TTL
 *   window. The second caller within the window gets false and the route
 *   should short-circuit with 200 + `{ skipped: "already-running" }`.
 *
 * Storage:
 *   - Primary: Upstash Redis (already in deps, used by lib/rateLimit.ts).
 *     Multi-instance safe — works across all Vercel Lambdas.
 *   - Fallback: in-memory Map. Single-instance only — fine for dev / preview
 *     deploys without Upstash configured. Logged when first used so you
 *     know the lock is not multi-instance safe.
 *
 * TTL:
 *   Each route picks its own TTL based on the schedule. A daily cron uses
 *   `ttlSeconds = 23 * 3600` (23h) — leaves a 1h buffer before the next
 *   scheduled fire so a slightly-early retry still gets blocked. A 5-min
 *   cron uses `ttlSeconds = 4 * 60` (4min).
 *
 * Server-only.
 */
import { Redis } from "@upstash/redis"
import { logger } from "@/lib/logger"

let redisClient: Redis | null = null
let warnedInMemory = false

function getRedis(): Redis | null {
  if (redisClient !== null) return redisClient
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  redisClient = new Redis({ url, token })
  return redisClient
}

// In-memory fallback. Single-instance only.
const inMemoryLocks = new Map<string, number>()

/**
 * Try to acquire a lock for `key`. Returns true if this caller is the
 * winner (i.e. the route should proceed), false if another caller holds
 * the lock (i.e. the route should skip).
 *
 * Never throws — on Redis errors we fail OPEN (let the route proceed)
 * because blocking a daily backup due to a Redis blip is worse than
 * running it twice with idempotent business logic.
 */
export async function tryAcquireLock(
  key: string,
  ttlSeconds: number
): Promise<boolean> {
  const redis = getRedis()

  // ── Redis path: atomic SET NX EX ──────────────────────────────────────
  if (redis) {
    try {
      // SET key 1 NX EX ttl — returns "OK" only if the key was newly set.
      const result = await redis.set(key, "1", {
        ex: ttlSeconds,
        nx: true,
      })
      return result === "OK"
    } catch (e) {
      // Fail open — log and let the route proceed.
      logger.warn(
        { err: e, key },
        "[cronLock] Redis SET NX failed — failing open (route will proceed without lock)"
      )
      return true
    }
  }

  // ── In-memory fallback ────────────────────────────────────────────────
  if (!warnedInMemory) {
    warnedInMemory = true
    logger.warn(
      "[cronLock] UPSTASH_REDIS_REST_URL not set — using in-memory lock. " +
        "NOT multi-instance safe. Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in production."
    )
  }
  const now = Date.now()
  const expiresAt = inMemoryLocks.get(key)
  if (expiresAt && expiresAt > now) return false
  inMemoryLocks.set(key, now + ttlSeconds * 1000)
  return true
}

/**
 * Build a date-scoped lock key. Use this for daily jobs where the lock
 * should be valid for "this calendar day" regardless of when the route
 * fires within that day.
 *
 *   key = `cron:late-fee:2026-08-13`
 *
 * Pass the resulting string to `tryAcquireLock` with a TTL that covers
 * the rest of the day (e.g. 23h to be safe).
 */
export function dailyLockKey(jobName: string, now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(now.getUTCDate()).padStart(2, "0")
  return `cron:${jobName}:${yyyy}-${mm}-${dd}`
}

/**
 * Build a window-scoped lock key for sub-daily jobs. Use the minute
 * bucket so multiple fires within the same minute are de-duped.
 *
 *   key = `cron:msg-retry:2026-08-13T12:05`
 */
export function windowLockKey(
  jobName: string,
  windowMinutes: number,
  now: Date = new Date()
): string {
  const bucket = Math.floor(now.getUTCMinutes() / windowMinutes) * windowMinutes
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(now.getUTCDate()).padStart(2, "0")
  const hh = String(now.getUTCHours()).padStart(2, "0")
  const min = String(bucket).padStart(2, "0")
  return `cron:${jobName}:${yyyy}-${mm}-${dd}T${hh}:${min}`
}
