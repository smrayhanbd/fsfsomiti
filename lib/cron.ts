/**
 * Cron-secret verification helper.
 *
 * Used by every `/api/{cron}/route.ts` to validate the caller is an authorized
 * cron scheduler (Vercel Cron, GitHub Actions, external cron service). The
 * secret is the shared `CRON_SECRET` env var.
 *
 * ── Security contract (CRITICAL — see C3 + M6 fixes): ──
 *
 *  1. The secret MUST be transmitted via the `Authorization: Bearer <secret>`
 *     header OR the `x-cron-secret` header. NEVER via the URL query string
 *     (`?secret=...`) — query strings leak into Vercel access logs, CDN edge
 *     logs, browser history, referrer headers, and error pages. Three cron
 *     routes previously accepted `?secret=` as a fallback — that fallback
 *     has been removed.
 *
 *  2. The comparison MUST be constant-time (`timingSafeEqual`). A naive
 *     `===` / `!==` comparison leaks the secret byte-by-byte through timing
 *     differences. While practically infeasible for 32-byte+ random secrets
 *     over the network, it is a clear best-practice violation and inconsistent
 *     with the backup route which already used `timingSafeEqual`.
 *
 *  3. Fail CLOSED when `CRON_SECRET` is unset. The previous behaviour
 *     (`if (!CRON_SECRET) return true`) left the endpoint wide open in any
 *     environment that forgot to set the env var — the worst possible
 *     security posture.
 *
 * Usage:
 *
 *   import { verifyCronRequest } from "@/lib/cron"
 *
 *   export async function POST(req: Request) {
 *     const auth = verifyCronRequest(req)
 *     if (!auth.ok) {
 *       return NextResponse.json({ error: auth.error }, { status: auth.status })
 *     }
 *     // …do work…
 *   }
 */
import { timingSafeEqual } from "node:crypto"

export interface CronAuthSuccess {
  ok: true
}
export interface CronAuthFailure {
  ok: false
  status: number
  error: string
}
export type CronAuthResult = CronAuthSuccess | CronAuthFailure

/**
 * Constant-time string compare. Returns true iff `a` and `b` are equal in
 * both length and contents. Avoids the classic timing-attack oracle where
 * `===` short-circuits on the first mismatched byte.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Verify the cron secret on an incoming request. Reads from either the
 * `Authorization: Bearer <secret>` header (preferred, Vercel Cron default)
 * or the `x-cron-secret` header (legacy GitHub-Actions style). Never reads
 * the URL query string.
 */
export function verifyCronRequest(req: Request): CronAuthResult {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error("[cron] CRON_SECRET not set — refusing to run. Set it in env.")
    return {
      ok: false,
      status: 500,
      error: "Server misconfigured: CRON_SECRET is not set.",
    }
  }

  const authHeader = req.headers.get("authorization") || ""
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : ""
  const xHeader = req.headers.get("x-cron-secret") || ""
  const supplied = bearer || xHeader

  if (!supplied || !safeEqual(supplied, secret)) {
    return { ok: false, status: 401, error: "Unauthorized" }
  }
  return { ok: true }
}
