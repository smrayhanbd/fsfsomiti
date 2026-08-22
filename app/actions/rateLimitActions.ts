"use server"

/**
 * Rate-limit helper server actions.
 *
 * `checkRegisterRateLimit` is a client pre-check the register form calls
 * before submitting (friendly fail-fast UX); the authoritative register
 * limiter also runs inside the register server action. Password reset is
 * checked server-side only (`assertPasswordResetAllowed`).
 *
 * LOGIN deliberately has NO pre-check action: it used to add a full extra
 * browser→server→Upstash roundtrip to every login. The login limiter now
 * runs authoritatively INSIDE NextAuth's authorize() (lib/auth.ts), in
 * parallel with the account lookups, so it costs no additional latency.
 *
 * The IP is obtained from `headers()` (server-side) — never trust a
 * client-supplied IP.
 */
import { headers } from "next/headers"
import {
  passwordResetLimiter,
  registerLimiter,
  formatRetryAfter,
  type RateLimitResult,
} from "@/lib/rateLimit"

export async function getClientIp(): Promise<string> {
  const h = await headers()
  // Vercel sets this for every request. Fall back to a synthetic key when
  // no forwarding header is present (e.g. local dev) so the limiter still
  // works — every local request shares the "dev" bucket.
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "dev"
  )
}

export interface RateLimitCheck {
  ok: boolean
  /** Human-readable retry-after string ("30 seconds" / "1 hour"). */
  retryAfter?: string
  remaining: number
  limit: number
}

function toCheck(r: RateLimitResult): RateLimitCheck {
  return {
    ok: r.success,
    retryAfter: r.success ? undefined : formatRetryAfter(r.reset),
    remaining: r.remaining,
    limit: r.limit,
  }
}

/**
 * Pre-check the register rate limit. Same shape.
 */
export async function checkRegisterRateLimit(): Promise<RateLimitCheck> {
  const ip = await getClientIp()
  const r = await registerLimiter.limit(ip)
  return toCheck(r)
}

/**
 * Authoritative rate-limit check for password-reset — called by the
 * `requestPasswordReset` server action (not the client). Uses email+IP so
 * a single attacker can't lock out a victim by spamming their email, AND
 * a distributed attacker still hits the per-IP cap.
 *
 * Throws on rate-limit exceeded so the calling action can decide how to
 * surface the error.
 */
export async function assertPasswordResetAllowed(email: string): Promise<void> {
  const ip = await getClientIp()
  const r = await passwordResetLimiter.limit(`${email.toLowerCase()}:${ip}`)
  if (!r.success) {
    throw new Error(
      `Too many reset attempts, try again in ${formatRetryAfter(r.reset)}.`,
    )
  }
}
