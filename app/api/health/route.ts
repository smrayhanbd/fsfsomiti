/**
 * GET /api/health
 *
 * Liveness + readiness probe for uptime monitors (Vercel Cron, Better
 * Stack, Render, k8s, Docker HEALTHCHECK). Two checks are run in series so
 * we can return a single, structured payload:
 *
 *   1. Config check — verifies that the four environment variables that
 *      the app cannot run without are present. Missing any one of them is a
 *      deployment misconfiguration (not a transient outage) and should fail
 *      readiness without even touching the DB.
 *
 *   2. DB ping — `prisma.$queryRaw\`SELECT 1\`` exercises the pooled
 *      DATABASE_URL connection. If Supabase's pooler is up but the backend
 *      is down, this query will time out and we return 503 with `db: "error"`.
 *
 * Response shape:
 *   200  { ok: true, config: "ok", db: "ok", time: ISO, version: "0.x.0" }
 *   503  { ok: false, config: "incomplete" | "ok", db: "error" | "ok", error?, time, version }
 *
 * Cache: 30s `revalidate` so Vercel's Edge cache absorbs probe traffic — we
 * don't want every health-check pinging the DB 60×/min.
 *
 * Auth: NONE — this endpoint is intentionally public. The payload reveals
 * only app version + DB up/down; nothing user-specific.
 */
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

// Treat this as a route handler (not statically prerendered at build time).
export const dynamic = "force-dynamic"
// Vercel/Next cache the response for 30s — see header above.
export const revalidate = 30

const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXTAUTH_SECRET",
  "ENCRYPTION_KEY",
] as const

export async function GET() {
  const time = new Date().toISOString()
  const version = process.env.npm_package_version ?? "unknown"

  // ── 1. Config check ────────────────────────────────────────────────────
  const missing = REQUIRED_ENV_VARS.filter((k) => !process.env[k])
  if (missing.length > 0) {
    // Don't leak WHICH vars are missing in the public response — only that
    // the config is incomplete. The server-side log keeps the names.
    // eslint-disable-next-line no-console
    console.warn("[/api/health] missing required env vars:", missing.join(", "))
    return NextResponse.json(
      {
        ok: false,
        config: "incomplete",
        db: "unknown",
        time,
        version,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }

  // ── 2. DB ping ──────────────────────────────────────────────────────────
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json(
      {
        ok: true,
        config: "ok",
        db: "ok",
        time,
        version,
      },
      {
        status: 200,
        // Allow the CDN to cache the 200 for ~30s; never cache failures.
        headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
      },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // eslint-disable-next-line no-console
    console.error("[/api/health] DB ping failed:", message)
    return NextResponse.json(
      {
        ok: false,
        config: "ok",
        db: "error",
        error: message.slice(0, 200),
        time,
        version,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
}
