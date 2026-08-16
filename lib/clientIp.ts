/**
 * Resolve the caller's IP from Next.js request headers.
 *
 * Extracted from `app/actions/rateLimitActions.ts` so it can be imported by
 * server-only modules that must not cross the `"use server"` boundary — most
 * importantly `lib/auth.ts` (the NextAuth `authorize()` callback) which needs
 * to apply the login rate limiter but cannot import a `"use server"` module.
 *
 * Server-only — must never be imported from a client component. Imports here
 * (`next/headers`) are server-only by contract.
 *
 * ⚠️ NOTE: This module MUST NOT be transitively imported by client components.
 * It is intentionally NOT imported from `lib/auth.ts` directly because doing
 * so leaks `next/headers` into the client bundle (Turbopack errors with
 * "You're importing a module that depends on next/headers"). Instead,
 * `lib/auth.ts` uses the email-based rate-limit key directly (no IP) for the
 * credentials provider — the per-IP defense-in-depth is provided by the
 * `checkLoginRateLimit` server action in `app/actions/rateLimitActions.ts`,
 * which is the authoritative gate before `signIn()` is called.
 *
 * Other server-side callers can import this safely (server actions, route
 * handlers, server components). Do NOT add this to a module that is
 * transitively imported by client components.
 */
import "server-only"
import { headers } from "next/headers"

/**
 * Vercel sets `x-forwarded-for` on every request; the first entry is the
 * original client IP. Fall back to `x-real-ip` (some proxies) and finally to
 * a synthetic "dev" bucket so the limiter still works locally.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers()
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "dev"
  )
}
