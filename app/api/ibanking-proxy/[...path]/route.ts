/**
 * GET/POST /api/ibanking-proxy/[...path]
 *
 * Same-origin reverse proxy for the somiti's bank iBanking portal.
 *
 * WHY THIS EXISTS — the bank's WAF resets requests that carry iframe
 * fetch-metadata (Sec-Fetch-Dest: iframe): the login page renders inside an
 * <iframe> but the post-login navigation gets ERR_CONNECTION_RESET. When the
 * portal is loaded through this proxy instead, the frame talks only to our
 * own origin, and the server fetches the bank with clean top-level-style
 * headers — the bank never sees an embedded context, so the full login →
 * statement flow works inside the member panel.
 *
 * Access: signed-in MEMBER only (same gate as /portal/bank-statement).
 * Upstream is pinned to the origin of the admin-configured `ibankingUrl`
 * (no arbitrary-host proxying). Bank cookies are relayed path-scoped to
 * /api/ibanking-proxy; our own app cookies (next-auth etc.) are never
 * forwarded upstream. Member credentials submitted to the bank pass through
 * this server exactly as they would through the member's browser — they are
 * not stored or logged.
 */
import { NextResponse, type NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { Agent, fetch as undiciFetch, type Response as UndiciResponse } from "undici"

import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { IBANKING_CA_CHAIN } from "@/lib/ibankingCaChain"

export const dynamic = "force-dynamic"

const PROXY_PREFIX = "/api/ibanking-proxy"
// Some WAFs reset non-browser user agents — present as a desktop browser.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"

// The bank serves an incomplete TLS chain (see lib/ibankingCaChain.ts), so
// upstream requests go through a dispatcher whose trust store includes the
// missing intermediate. Verification stays fully enabled.
const upstreamAgent = new Agent({ connect: { ca: IBANKING_CA_CHAIN } })
// Headers that must never be relayed onto OUR origin from the bank's response.
const STRIP_RESPONSE_HEADERS = new Set([
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
  "strict-transport-security", // bank HSTS must not apply to our host
  "report-to",
  "nel",
  "content-encoding", // body is decoded by fetch before re-serving
  "content-length", // rewritten bodies change length
  "transfer-encoding",
  "connection",
])
/** Cookie name prefixes that belong to OUR app and must not go upstream. */
const OUR_COOKIE_PREFIXES = ["next-auth.", "__Secure-next-auth.", "__Host-next-auth.", "__next"]

async function getUpstreamOrigin(): Promise<string | null> {
  const settings = await prisma.transparencySettings.findUnique({
    where: { id: "singleton" },
    select: { ibankingUrl: true, showBankStatement: true },
  })
  if (!settings?.showBankStatement || !settings.ibankingUrl) return null
  try {
    const u = new URL(settings.ibankingUrl)
    if (u.protocol !== "https:" && u.protocol !== "http:") return null
    return u.origin
  } catch {
    return null
  }
}

/**
 * The bank's WAF intermittently RSTs connections. A plain retry from the
 * server (fresh connection, clean headers) almost always succeeds, which is
 * what makes the proxied frame reliable where a direct iframe is not.
 */
async function fetchWithRetry(url: string, init: Record<string, unknown>, retries = 2): Promise<UndiciResponse> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await undiciFetch(url, {
        ...init,
        dispatcher: upstreamAgent,
        signal: AbortSignal.timeout(20_000),
      } as never)
    } catch (error) {
      lastError = error
      if (attempt < retries) await new Promise((r) => setTimeout(r, 350 * (attempt + 1)))
    }
  }
  throw lastError
}

/** Rewrite HTML/CSS so every upstream URL keeps flowing through the proxy. */
function rewriteText(body: string, origin: string): string {
  return body
    // Absolute upstream URLs (https://host/x → /api/ibanking-proxy/x).
    // Runs first so root-relative rewriting below never sees them.
    .replaceAll(`${origin}/`, `${PROXY_PREFIX}/`)
    // Root-relative attribute values: href="/x", src='/x', action="/x" …
    .replace(/((?:href|src|action|poster|formaction)\s*=\s*["'])\/(?!\/)/gi, `$1${PROXY_PREFIX}/`)
    // CSS url(/x) — stylesheets and inline styles.
    .replace(/url\(\s*(["']?)\/(?!\/)/gi, `url($1${PROXY_PREFIX}/`)
    // <meta http-equiv="refresh" content="0;url=/x">
    .replace(/(content\s*=\s*["']\s*\d+\s*;\s*url\s*=\s*)\/(?!\/)/gi, `$1${PROXY_PREFIX}/`)
}

/** Map a Location header (absolute, root-relative, or relative) to the proxy. */
function mapLocation(location: string, origin: string, currentPath: string): string | null {
  try {
    const absolute = new URL(location, `${origin}${currentPath}`).href
    if (!absolute.startsWith(`${origin}/`)) return null // different host → don't follow through proxy
    return PROXY_PREFIX + absolute.slice(origin.length)
  } catch {
    return null
  }
}

async function proxy(req: NextRequest, pathSegments: string[]): Promise<Response> {
  // ── Auth: MEMBER only, mirroring the Bank Statement page guard ──────────
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const origin = await getUpstreamOrigin()
  if (!origin) {
    return NextResponse.json({ error: "iBanking is not configured" }, { status: 404 })
  }

  const path = `/${pathSegments.map(encodeURIComponent).join("/")}`.replace(/%2F/gi, "/")
  const upstreamUrl = `${origin}${path}${req.nextUrl.search}`

  // Forward only the bank's own cookies — never our app session cookies.
  const cookieHeader = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .filter((c) => {
      const name = c.split("=")[0]
      return c && !OUR_COOKIE_PREFIXES.some((p) => name.startsWith(p))
    })
    .join("; ")

  const headers: Record<string, string> = {
    "User-Agent": BROWSER_UA,
    Accept: req.headers.get("accept") ?? "*/*",
    "Accept-Language": req.headers.get("accept-language") ?? "en-US,en;q=0.9",
    "Accept-Encoding": "identity",
    Referer: `${origin}/`,
  }
  if (cookieHeader) headers.Cookie = cookieHeader

  let body: ArrayBuffer | undefined
  if (req.method === "POST") {
    const contentType = req.headers.get("content-type")
    if (contentType) headers["Content-Type"] = contentType
    body = await req.arrayBuffer()
  }

  let upstream: UndiciResponse
  try {
    upstream = await fetchWithRetry(upstreamUrl, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    })
  } catch {
    return new NextResponse(
      `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:24px;color:#334155">
        <h3>Could not reach the bank portal</h3>
        <p>The bank connection was reset even after retrying. Use <b>Reload</b> once,
        or open the portal in a new tab from the page above.</p></body>`,
      { status: 502, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
    )
  }

  // ── Redirects: hand the bank's Location back through the proxy so the
  // browser follows it (and keeps receiving Set-Cookie on each hop) ────────
  const location = upstream.headers.get("location")
  if (location && upstream.status >= 300 && upstream.status < 400) {
    const mapped = mapLocation(location, origin, path)
    const redirectHeaders = new Headers()
    redirectHeaders.set("Location", mapped ?? location)
    redirectHeaders.set("Cache-Control", "no-store")
    for (const sc of upstream.headers.getSetCookie()) {
      redirectHeaders.append("Set-Cookie", scopeCookie(sc))
    }
    return new NextResponse(null, { status: upstream.status, headers: redirectHeaders })
  }

  // ── Relay the response ───────────────────────────────────────────────────
  const outHeaders = new Headers()
  const contentType = upstream.headers.get("content-type")
  if (contentType) outHeaders.set("Content-Type", contentType)
  const disposition = upstream.headers.get("content-disposition")
  if (disposition) outHeaders.set("Content-Disposition", disposition)
  outHeaders.set("Cache-Control", "no-store")
  upstream.headers.forEach((_v, key) => {
    if (key.startsWith("x-") && !STRIP_RESPONSE_HEADERS.has(key)) outHeaders.set(key, _v)
  })
  for (const sc of upstream.headers.getSetCookie()) {
    outHeaders.append("Set-Cookie", scopeCookie(sc))
  }

  const isText = !!contentType && /text\/html|text\/css|application\/xhtml/i.test(contentType)
  if (isText) {
    const rewritten = rewriteText(await upstream.text(), origin)
    return new NextResponse(rewritten, { status: upstream.status, headers: outHeaders })
  }
  return new NextResponse(await upstream.arrayBuffer(), { status: upstream.status, headers: outHeaders })
}

/**
 * Bank cookies must live under the proxy path: strip Domain (wrong host),
 * and force Path=/api/ibanking-proxy so the browser sends them on every
 * proxied request and nowhere else.
 */
function scopeCookie(setCookie: string): string {
  return setCookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => {
      const key = part.toLowerCase().split("=")[0]
      return key !== "domain" && key !== "path"
    })
    .concat(`Path=${PROXY_PREFIX}`)
    .join("; ")
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path)
}
