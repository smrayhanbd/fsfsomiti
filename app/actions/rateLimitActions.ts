"use server"

/**
 * Rate-limit pre-check server actions.
 *
 * These are tiny server actions the client calls BEFORE the actual auth flow
 * (signIn / register / password reset) so we can fail fast with a friendly
 * "Too many attempts" message instead of letting the user submit and get a
 * generic auth error.
 *
 * The IP is obtained from `headers()` (server-side) — never trust a
 * client-supplied IP.
 *
 * NOTE: the actual auth server action (`requestPasswordReset` in
 * `app/actions/auth.ts`) ALSO calls the limiter — defense in depth. The
 * client-side check is the "fast" path; the server-side check is the
 * authoritative one (it runs even if the user disables JS).
 */
import { headers } from "next/headers"
import {
  loginLimiter,
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
 * Pre-check the login rate limit. The client calls this BEFORE `signIn()`.
 * Returns `{ ok: false, retryAfter }` if the IP is over limit — the client
 * shows the retry-after string to the user.
 */
export async function checkLoginRateLimit(): Promise<RateLimitCheck> {
  const ip = await getClientIp()
  const r = await loginLimiter.limit(ip)
  return toCheck(r)
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
