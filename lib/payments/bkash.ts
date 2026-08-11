/**
 * bKash Tokenized Checkout integration (Roadmap item 21).
 *
 * Flow:
 *   1. App authenticates with app_key + app_secret to get an `id_token`.
 *   2. App creates a payment (amount, merchantInvoiceNumber, intent=sale).
 *      bKash returns { paymentID, bkashURL } — user is redirected there.
 *   3. After the user pays, bKash redirects back to BKASH_CALLBACK_URL with
 *      ?paymentID=...&status=...
 *   4. App calls /execute with the paymentID to capture the funds and reads
 *      transactionStatus. "Completed" => the money is in the merchant wallet.
 *   5. /payment/status polls the gateway (e.g. when the user closed the tab
 *      before the redirect fired) — returns the same status object.
 *
 * Env:
 *   BKASH_APP_KEY      — sandbox/production app key
 *   BKASH_APP_SECRET   — sandbox/production app secret
 *   BKASH_USERNAME     — sandbox/production API user
 *   BKASH_PASSWORD      — sandbox/production API password
 *   BKASH_SANDBOX      — "true" => sandbox-secured.bka.sh, else tokenized.pay.bka.sh
 *   BKASH_CALLBACK_URL — public URL bKash redirects to after the user pays
 *
 * When BKASH_APP_KEY is unset, isBkashConfigured() returns false and the API
 * routes return 503 with `{ error: "bKash not configured" }` instead of
 * attempting a call that will fail with a 401.
 */
import { logger } from "@/lib/logger"

const SANDBOX_BASE = "https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout"
const PROD_BASE = "https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout"

export function isBkashConfigured(): boolean {
  return !!(
    process.env.BKASH_APP_KEY &&
    process.env.BKASH_APP_SECRET &&
    process.env.BKASH_USERNAME &&
    process.env.BKASH_PASSWORD
  )
}

export function isBkashSandbox(): boolean {
  return (process.env.BKASH_SANDBOX ?? "true").toLowerCase() !== "false"
}

function baseUrl(): string {
  return isBkashSandbox() ? SANDBOX_BASE : PROD_BASE
}

export function bkashCallbackUrl(): string {
  return (
    process.env.BKASH_CALLBACK_URL ||
    "http://localhost:3000/api/payments/bkash/callback"
  )
}

interface BkashConfig {
  appKey: string
  appSecret: string
  username: string
  password: string
}

function readConfig(): BkashConfig {
  const appKey = process.env.BKASH_APP_KEY
  const appSecret = process.env.BKASH_APP_SECRET
  const username = process.env.BKASH_USERNAME
  const password = process.env.BKASH_PASSWORD
  if (!appKey || !appSecret || !username || !password) {
    throw new Error("bKash credentials are not configured.")
  }
  return { appKey, appSecret, username, password }
}

/** In-memory token cache so we don't re-auth on every payment create. */
let cachedToken: { idToken: string; expiresAt: number } | null = null

export interface BkashTokenResponse {
  id_token?: string
  token_type?: string
  expires_in?: number
  status?: string
  msg?: string
  statusCode?: string
}

/**
 * Grant a fresh id_token from bKash. Cached for `expires_in - 60s` so
 * repeated creates in a short window reuse the same token. On any failure we
 * clear the cache and re-throw.
 */
export async function getBkashToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.idToken
  }
  const cfg = readConfig()
  const body = {
    app_key: cfg.appKey,
    app_secret: cfg.appSecret,
  }
  const res = await bkashFetch<BkashTokenResponse>("/token/grant", body, {
    username: cfg.username,
    password: cfg.password,
  })
  if (!res.id_token) {
    throw new Error(
      `bKash token grant failed: ${res.status ?? "unknown"} — ${res.msg ?? "no message"}`
    )
  }
  const expiresInMs = (res.expires_in ?? 3600) * 1000
  cachedToken = {
    idToken: res.id_token,
    expiresAt: Date.now() + expiresInMs - 60_000, // 1-min safety margin
  }
  return res.id_token
}

export interface BkashCreatePaymentInput {
  mode?: string
  paymentReference?: string
  callbackURL?: string
  amount: string | number
  merchantInvoiceNumber: string
  callbackUrl?: string
  currency?: string
  intent?: string
}

export interface BkashCreatePaymentResponse {
  paymentID?: string
  bkashURL?: string
  createTime?: string
  orgMessage?: string
  transactionStatus?: string
  amount?: string
  currency?: string
  intent?: string
  merchantInvoiceNumber?: string
  status?: string
  statusCode?: string
  msg?: string
}

/**
 * Create a bKash payment. Returns { paymentID, bkashURL } — the client
 * redirects the user to `bkashURL` to authorise the payment.
 */
export async function createBkashPayment(
  amount: string | number,
  merchantInvoiceNumber: string,
  callbackUrl?: string
): Promise<BkashCreatePaymentResponse> {
  const token = await getBkashToken()
  const body: BkashCreatePaymentInput = {
    mode: "0011",
    paymentReference: merchantInvoiceNumber,
    callbackURL: callbackUrl || bkashCallbackUrl(),
    amount: String(amount),
    currency: "BDT",
    intent: "sale",
    merchantInvoiceNumber,
  }
  const res = await bkashFetch<BkashCreatePaymentResponse>("/create", body as unknown as Record<string, unknown>, { token })
  if (!res.paymentID || !res.bkashURL) {
    throw new Error(
      `bKash create failed: ${res.status ?? "unknown"} — ${res.msg ?? "no message"}`
    )
  }
  return res
}

export interface BkashExecutePaymentResponse {
  paymentID?: string
  trxID?: string
  transactionStatus?: string
  amount?: string
  currency?: string
  intent?: string
  merchantInvoiceNumber?: string
  payerReference?: string
  customerMsisdn?: string
  statusCode?: string
  statusMessage?: string
  msg?: string
}

/**
 * Execute (capture) a payment after the user has authorised it on the bKash
 * checkout page. Returns `transactionStatus: "Completed"` on success.
 */
export async function executeBkashPayment(
  paymentID: string
): Promise<BkashExecutePaymentResponse> {
  const token = await getBkashToken()
  const res = await bkashFetch<BkashExecutePaymentResponse>("/execute", { paymentID }, { token })
  return res
}

export interface BkashPaymentStatusResponse {
  paymentID?: string
  trxID?: string
  transactionStatus?: string
  amount?: string
  currency?: string
  intent?: string
  merchantInvoiceNumber?: string
  payerReference?: string
  customerMsisdn?: string
  statusCode?: string
  statusMessage?: string
  msg?: string
}

/** Query the live status of a payment from bKash (for client polling). */
export async function queryBkashPayment(
  paymentID: string
): Promise<BkashPaymentStatusResponse> {
  const token = await getBkashToken()
  const res = await bkashFetch<BkashPaymentStatusResponse>(
    "/payment/status",
    { paymentID },
    { token }
  )
  return res
}

// ──────────────────────────────────────────────────────────────────────────
// Internal fetch helper
// ──────────────────────────────────────────────────────────────────────────

type BkashFetchAuth =
  | { username: string; password: string } // token grant
  | { token: string } // authed API call
  | Record<string, never> // not currently used, kept for completeness

/**
 * Single point of contact with the bKash API. Adds the right base URL,
 * JSON headers, and either Basic auth (token grant) or the `authorization`
 * + `x-app-key` headers required for authed calls.
 */
async function bkashFetch<T>(
  path: string,
  body: Record<string, unknown>,
  auth: BkashFetchAuth
): Promise<T> {
  const url = `${baseUrl()}${path}`
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  }
  if ("username" in auth) {
    // Token-grant call uses HTTP Basic auth.
    const basic = Buffer.from(`${auth.username}:${auth.password}`).toString("base64")
    headers.authorization = `Basic ${basic}`
  } else if ("token" in auth) {
    headers.authorization = `Bearer ${auth.token}`
    headers["x-app-key"] = process.env.BKASH_APP_KEY || ""
  }

  const log = logger.child({ module: "bkash" })
  log.debug({ url, body: redactForLog(body) }, "bkash request")

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  })

  const text = await res.text()
  let parsed: unknown = null
  try {
    parsed = text ? (JSON.parse(text) as unknown) : null
  } catch {
    parsed = { raw: text }
  }

  if (!res.ok) {
    log.error(
      { url, status: res.status, statusText: res.statusText, body: parsed },
      "bkash API non-2xx response"
    )
    // Surface the gateway's error envelope if it sent one; otherwise a
    // generic message so the caller can render a friendly failure.
    const errBody = (parsed as Record<string, unknown> | null) ?? {}
    throw new Error(
      `bKash API ${res.status}: ${
        (errBody.msg as string) || (errBody.statusMessage as string) || res.statusText
      }`
    )
  }
  return parsed as T
}

/** Keep secrets out of the logs. */
function redactForLog(body: Record<string, unknown>): Record<string, unknown> {
  const REDACT = new Set(["app_secret", "password"])
  return Object.fromEntries(
    Object.entries(body).map(([k, v]) => (REDACT.has(k) ? [k, "[Redacted]"] : [k, v]))
  )
}
