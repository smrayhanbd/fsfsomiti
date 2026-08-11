/**
 * Nagad RSA-encrypted checkout integration (Roadmap item 21).
 *
 * Flow:
 *   1. App encrypts { merchantId, datetime, orderId, challenge } with Nagad's
 *      RSA public key and signs the request with our merchant private key.
 *   2. App POSTs to /check-out/initialize/{merchantId}/{datetime} → returns
 *      { callBackUrl, paymentRefId, status }.
 *   3. User is redirected to callBackUrl (Nagad's hosted checkout).
 *   4. After the user pays, Nagad calls our webhook (POST) AND redirects the
 *      user's browser (GET) with `merchantOrderId` + `paymentRefId` + a
 *      signed `merchantSignature`.
 *   5. App verifies the signature, then POSTs to /verify/{paymentRefId} to
 *      confirm the money landed.
 *
 * Env:
 *   NAGAD_MERCHANT_ID   — your merchant ID on Nagad
 *   NAGAD_PUBLIC_KEY    — Nagad's RSA public key (PEM, for encrypting payloads)
 *   NAGAD_PRIVATE_KEY   — your merchant RSA private key (PEM, for signing)
 *   NAGAD_SANDBOX      — "true" => sandbox-ssl.mynagad.com, else api.mynagad.com
 *   NAGAD_CALLBACK_URL — public URL Nagad redirects to / calls webhook at
 *
 * When NAGAD_MERCHANT_ID (or keys) are unset, isNagadConfigured() returns
 * false and the API routes return 503 with `{ error: "Nagad not configured" }`.
 *
 * Crypto: Node's built-in `node:crypto` provides everything — RSA-SHA256
 * signing/verifying and RSA-PKCS1 encryption. No external dependency.
 */
import crypto from "node:crypto"
import { logger } from "@/lib/logger"

const SANDBOX_BASE = "https://sandbox-ssl.mynagad.com/api/dfs"
const PROD_BASE = "https://api.mynagad.com/api/dfs"

export function isNagadConfigured(): boolean {
  return !!(
    process.env.NAGAD_MERCHANT_ID &&
    process.env.NAGAD_PUBLIC_KEY &&
    process.env.NAGAD_PRIVATE_KEY
  )
}

export function isNagadSandbox(): boolean {
  return (process.env.NAGAD_SANDBOX ?? "true").toLowerCase() !== "false"
}

function baseUrl(): string {
  return isNagadSandbox() ? SANDBOX_BASE : PROD_BASE
}

export function nagadCallbackUrl(): string {
  return (
    process.env.NAGAD_CALLBACK_URL ||
    "http://localhost:3000/api/payments/nagad/callback"
  )
}

function loadPrivateKey(): crypto.KeyObject {
  const pem = process.env.NAGAD_PRIVATE_KEY
  if (!pem) throw new Error("NAGAD_PRIVATE_KEY is not configured.")
  return crypto.createPrivateKey({
    key: pem,
    format: "pem",
  })
}

function loadPublicKey(): crypto.KeyObject {
  const pem = process.env.NAGAD_PUBLIC_KEY
  if (!pem) throw new Error("NAGAD_PUBLIC_KEY is not configured.")
  return crypto.createPublicKey({
    key: pem,
    format: "pem",
  })
}

// ──────────────────────────────────────────────────────────────────────────
// Crypto primitives
// ──────────────────────────────────────────────────────────────────────────

/**
 * Sign `data` (any string-able object — usually a JSON-serialised payload)
 * with our merchant private key using RSA-SHA256, returning a Base64
 * signature. Nagad expects the signature over the EXACT byte sequence we
 * sent in the body, so the caller must serialise the body once and pass the
 * same string here.
 */
export function generateNagadSignature(
  data: string,
  privateKeyPem?: string
): string {
  const key = privateKeyPem
    ? crypto.createPrivateKey({ key: privateKeyPem, format: "pem" })
    : loadPrivateKey()
  const sign = crypto.createSign("RSA-SHA256")
  sign.update(data, "utf8")
  return sign.sign(key, "base64")
}

/**
 * Verify a Nagad-returned signature. `data` is the canonical string the
 * gateway signed (typically its `merchantOrderId` + `paymentRefId` +
 * `status`, joined — Nagad publishes the canonical form in their docs).
 * Returns true if the signature matches.
 */
export function verifyNagadSignature(
  data: string,
  signature: string,
  publicKeyPem?: string
): boolean {
  try {
    const key = publicKeyPem
      ? crypto.createPublicKey({ key: publicKeyPem, format: "pem" })
      : loadPublicKey()
    const verify = crypto.createVerify("RSA-SHA256")
    verify.update(data, "utf8")
    return verify.verify(key, signature, "base64")
  } catch (err) {
    logger
      .child({ module: "nagad" })
      .error({ err: (err as Error).message }, "nagad signature verification threw")
    return false
  }
}

/**
 * Encrypt `data` with Nagad's RSA public key using RSA-PKCS1. The plaintext
 * must be short enough for a single RSA block (≤ 245 bytes with a 2048-bit
 * key — fine for our small init payloads). The result is a Base64 string
 * Nagad decrypts with their private key.
 */
export function encryptNagadPayload(
  data: string,
  publicKeyPem?: string
): string {
  const key = publicKeyPem
    ? crypto.createPublicKey({ key: publicKeyPem, format: "pem" })
    : loadPublicKey()
  // Nagad uses RSAES-PKCS1-v1_5 padding. Chunk length: 245 bytes for a 2048-bit
  // key. Our payloads are well under that; if a larger payload is needed,
  // wrap it via an AES session key (out of scope here).
  return crypto.publicEncrypt(
    {
      key,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(data, "utf8")
  ).toString("base64")
}

/** Decrypt a Nagad-encrypted callback payload with our merchant private key. */
export function decryptNagadPayload(
  ciphertextB64: string,
  privateKeyPem?: string
): string {
  const key = privateKeyPem
    ? crypto.createPrivateKey({ key: privateKeyPem, format: "pem" })
    : loadPrivateKey()
  const decrypted = crypto.privateDecrypt(
    {
      key,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(ciphertextB64, "base64")
  )
  return decrypted.toString("utf8")
}

// ──────────────────────────────────────────────────────────────────────────
// API endpoints
// ──────────────────────────────────────────────────────────────────────────

export interface NagadInitInput {
  merchantId: string
  datetime: string
  orderId: string
  challenge: string
}

export interface NagadInitResponse {
  merchantId?: string
  orderId?: string
  paymentRefId?: string
  callBackUrl?: string
  status?: string
  message?: string
  statusCode?: string
}

/**
 * Initiate a Nagad checkout session.
 *
 * The init payload is encrypted with Nagad's public key, signed with our
 * private key, and POSTed to /check-out/initialize/{merchantId}/{datetime}.
 * Nagad responds with { callBackUrl, paymentRefId } — the user is redirected
 * to `callBackUrl` to authorise the payment.
 */
export async function initNagadPayment(
  amount: string | number,
  orderId: string
): Promise<NagadInitResponse> {
  if (!isNagadConfigured()) {
    throw new Error("Nagad credentials are not configured.")
  }
  const merchantId = process.env.NAGAD_MERCHANT_ID!
  const datetime = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14) // YYYYMMDDHHmmss

  const initPayload: NagadInitInput = {
    merchantId,
    datetime,
    orderId,
    challenge: crypto.randomBytes(16).toString("hex"),
  }
  const sensitiveJson = JSON.stringify({
    merchantId,
    datetime,
    orderId,
    challenge: initPayload.challenge,
    amount: String(amount),
    currency: "BDT",
  })
  const encrypted = encryptNagadPayload(sensitiveJson)
  const signature = generateNagadSignature(sensitiveJson)

  const body = {
    accountNumber: merchantId,
    dateTime: datetime,
    sensitiveData: encrypted,
    signature,
  }

  const url = `${baseUrl()}/check-out/initialize/${merchantId}/${orderId}`
  const res = await nagadFetch<NagadInitResponse>(url, body)

  if (!res.callBackUrl || !res.paymentRefId) {
    throw new Error(
      `Nagad init failed: ${res.status ?? "unknown"} — ${res.message ?? "no message"}`
    )
  }
  return res
}

export interface NagadVerifyResponse {
  merchantId?: string
  orderId?: string
  paymentRefId?: string
  paymentReferenceId?: string
  amount?: string
  currency?: string
  status?: string // "Success" | "Failed" | "Pending"
  statusCode?: string
  message?: string
  customerMsisdn?: string
  issuerPaymentRef?: string
  issuerPaymentDateTime?: string
}

/**
 * Verify a payment after the user has completed checkout on Nagad's hosted
 * page. Calls /verify/{paymentRefId} — Nagad returns the final status and
 * the actual amount that was charged (which we MUST compare against what we
 * recorded before crediting the member).
 */
export async function verifyNagadPayment(
  paymentRefId: string,
  orderId: string
): Promise<NagadVerifyResponse> {
  const merchantId = process.env.NAGAD_MERCHANT_ID
  if (!merchantId) throw new Error("NAGAD_MERCHANT_ID is not configured.")

  const sensitiveJson = JSON.stringify({
    merchantId,
    orderId,
    paymentRefId,
  })
  const encrypted = encryptNagadPayload(sensitiveJson)
  const signature = generateNagadSignature(sensitiveJson)

  const body = {
    accountNumber: merchantId,
    sensitiveData: encrypted,
    signature,
  }

  const url = `${baseUrl()}/verify/payment/${paymentRefId}`
  const res = await nagadFetch<NagadVerifyResponse>(url, body)
  return res
}

// ──────────────────────────────────────────────────────────────────────────
// Internal fetch helper
// ──────────────────────────────────────────────────────────────────────────

async function nagadFetch<T>(
  url: string,
  body: Record<string, unknown>
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-KM-Api-Version": "v-0.2.0",
    "X-KM-Client-Type": "PC",
  }

  const log = logger.child({ module: "nagad" })
  log.debug({ url, body: redactForLog(body) }, "nagad request")

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
      "nagad API non-2xx response"
    )
    const errBody = (parsed as Record<string, unknown> | null) ?? {}
    throw new Error(
      `Nagad API ${res.status}: ${
        (errBody.message as string) || (errBody.status as string) || res.statusText
      }`
    )
  }
  return parsed as T
}

function redactForLog(body: Record<string, unknown>): Record<string, unknown> {
  const REDACT = new Set(["sensitiveData", "signature", "accountNumber"])
  return Object.fromEntries(
    Object.entries(body).map(([k, v]) =>
      REDACT.has(k) ? [k, v ? "[Redacted]" : null] : [k, v]
    )
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Callback helpers — used by the webhook + redirect handlers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Parse the Nagad callback envelope (sent both as a query string on the
 * redirect AND as JSON in the webhook POST). Nagad's canonical signed
 * payload is: `merchantOrderId + paymentRefId + status` (no separators).
 */
export function buildNagadSignatureMessage(input: {
  merchantOrderId: string
  paymentRefId: string
  status: string
}): string {
  return input.merchantOrderId + input.paymentRefId + input.status
}

export interface NagadCallbackPayload {
  merchantId?: string
  merchantOrderId?: string
  orderId?: string
  paymentRefId?: string
  paymentReferenceId?: string
  amount?: string
  currency?: string
  status?: string
  statusCode?: string
  message?: string
  merchantSignature?: string
  // Some Nagad SDKs send the signature on a different key.
  signature?: string
}

/**
 * Verify the callback's signature. Reads `merchantOrderId`, `paymentRefId`
 * and `status` out of the payload, builds the canonical message, and
 * verifies with Nagad's public key. Returns false if any field is missing.
 */
export function verifyNagadCallback(payload: NagadCallbackPayload): boolean {
  const orderId = payload.merchantOrderId || payload.orderId
  const paymentRefId = payload.paymentRefId || payload.paymentReferenceId
  const status = payload.status
  const sig = payload.merchantSignature || payload.signature
  if (!orderId || !paymentRefId || !status || !sig) return false
  const message = buildNagadSignatureMessage({
    merchantOrderId: orderId,
    paymentRefId,
    status,
  })
  return verifyNagadSignature(message, sig)
}
