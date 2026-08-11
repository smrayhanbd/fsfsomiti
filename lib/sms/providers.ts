import prisma from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { type SmsProvider } from "@/lib/sms/provider-metadata"

/**
 * SMS gateway dispatch.
 *
 * Reads the active {@link SmsSettings} singleton and routes the message to the
 * configured provider. Each provider normalises its response to the shared
 * {@link SmsResult} shape (`{ status: "OK" | "ERROR"; response? }`) that
 * `lib/sms.ts` exposes — that shape is load-bearing for 5 callers that branch
 * on `smsRes.status` and read `smsRes.response`.
 *
 * Bangladesh SMS gateways (BulkSMSBD, SendMySMS, SSLWireless) each have their
 * own request/response vocabulary; the per-provider helpers below translate
 * those into the shared shape.
 *
 * This module is server-only. The client-safe {@link SmsProvider} type and
 * SMS_PROVIDERS catalogue live in lib/sms/provider-metadata.ts.
 */

export interface SmsResult {
  status: "OK" | "ERROR"
  response?: string
}

type SmsSettingsRow = NonNullable<Awaited<ReturnType<typeof prisma.smsSettings.findUnique>>>

/** Normalise a raw phone number to the E.164-ish form the gateways expect. */
function normalisePhone(raw: string): string {
  let p = raw.replace(/[^\d+]/g, "")
  if (p.startsWith("+")) p = p.slice(1)
  // Bangladeshi local → international: 01XXXXXXXXX → 8801XXXXXXXXX
  if (p.length === 11 && p.startsWith("01")) p = "88" + p
  return p
}

// ── BulkSMSBD ────────────────────────────────────────────────────────────────
// GET http://bulksmsbd.net/api/smsapi?api_key=…&type=text&number=…&sender_id=…&message=…
async function sendBulkSmsBd(s: SmsSettingsRow, to: string, msg: string): Promise<SmsResult> {
  if (!s.bulksmsbdApiKeyEnc) return { status: "ERROR", response: "BulkSMSBD API key not set." }
  const apiKey = decrypt(s.bulksmsbdApiKeyEnc)
  const url = new URL(s.bulksmsbdUrl || "http://bulksmsbd.net/api/smsapi")
  url.searchParams.set("api_key", apiKey)
  url.searchParams.set("type", "text")
  url.searchParams.set("number", normalisePhone(to))
  url.searchParams.set("sender_id", s.bulksmsbdSender || "")
  url.searchParams.set("message", s.urlEncode ? msg : encodeURIComponent(msg))
  try {
    const res = await fetch(url, { method: "GET" })
    const text = await res.text()
    // BulkSMSBD returns response codes as text; "202" = success.
    const code = text.trim().split(/\s|\|/)[0]
    if (code === "202" || res.ok) return { status: "OK", response: text }
    return { status: "ERROR", response: text || `HTTP ${res.status}` }
  } catch (e) {
    return { status: "ERROR", response: e instanceof Error ? e.message : "request failed" }
  }
}

// ── SendMySMS ────────────────────────────────────────────────────────────────
// GET https://sendmysms.net/api.php?user=…&key=…&to=…&msg=…
async function sendMySms(s: SmsSettingsRow, to: string, msg: string): Promise<SmsResult> {
  if (!s.sendmysmsUser || !s.sendmysmsKeyEnc) return { status: "ERROR", response: "SendMySMS credentials not set." }
  const key = decrypt(s.sendmysmsKeyEnc)
  const url = new URL(s.sendmysmsUrl || "https://sendmysms.net/api.php")
  url.searchParams.set("user", s.sendmysmsUser)
  url.searchParams.set("key", key)
  url.searchParams.set("to", normalisePhone(to))
  url.searchParams.set("msg", msg) // URLSearchParams already encodes
  try {
    const res = await fetch(url, { method: "GET" })
    const text = await res.text()
    // SendMySMS returns JSON-shaped {status:"OK"} or {status:"ERROR",response:"…"}
    try {
      const data = JSON.parse(text) as SmsResult
      return data
    } catch {
      return { status: res.ok ? "OK" : "ERROR", response: text || `HTTP ${res.status}` }
    }
  } catch (e) {
    return { status: "ERROR", response: e instanceof Error ? e.message : "request failed" }
  }
}

// ── SSLWireless ──────────────────────────────────────────────────────────────
// POST https://smsplus.sslwireless.com/api/v3/send-sms  (JSON body)
async function sendSslWireless(s: SmsSettingsRow, to: string, msg: string): Promise<SmsResult> {
  if (!s.sslTokenEnc) return { status: "ERROR", response: "SSLWireless API token not set." }
  const token = decrypt(s.sslTokenEnc)
  const url = s.sslUrl || "https://smsplus.sslwireless.com/api/v3/send-sms"
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authtoken: token,
      },
      body: JSON.stringify({
        sid: s.sslSender || "",
        msisdn: normalisePhone(to),
        sms: msg,
        csms_id: "fs_" + Date.now(),
      }),
    })
    const text = await res.text()
    try {
      const data = JSON.parse(text) as { status?: string; message?: string; error_code?: number }
      const ok = (data.status || "").toLowerCase() === "success" || (res.ok && !data.error_code)
      return ok ? { status: "OK", response: text } : { status: "ERROR", response: data.message || text }
    } catch {
      return { status: res.ok ? "OK" : "ERROR", response: text || `HTTP ${res.status}` }
    }
  } catch (e) {
    return { status: "ERROR", response: e instanceof Error ? e.message : "request failed" }
  }
}

// ── Twilio ───────────────────────────────────────────────────────────────────
// POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json (Basic auth)
async function sendTwilio(s: SmsSettingsRow, to: string, msg: string): Promise<SmsResult> {
  if (!s.twilioSid || !s.twilioTokenEnc) return { status: "ERROR", response: "Twilio credentials not set." }
  const token = decrypt(s.twilioTokenEnc)
  const url = `https://api.twilio.com/2010-04-01/Accounts/${s.twilioSid}/Messages.json`
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${s.twilioSid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: s.twilioFrom || "",
        To: normalisePhone(to),
        Body: msg,
      }),
    })
    const text = await res.text()
    if (res.ok) return { status: "OK", response: text }
    return { status: "ERROR", response: text || `HTTP ${res.status}` }
  } catch (e) {
    return { status: "ERROR", response: e instanceof Error ? e.message : "request failed" }
  }
}

// ── Custom HTTP gateway ──────────────────────────────────────────────────────
async function sendCustom(s: SmsSettingsRow, to: string, msg: string): Promise<SmsResult> {
  if (!s.customUrl) return { status: "ERROR", response: "Custom gateway URL not set." }
  const method = (s.customMethod || "GET").toUpperCase()
  const bodyType = (s.customBodyType || "query").toLowerCase()
  const authType = (s.customAuthType || "none").toLowerCase()
  const phoneParam = s.customPhoneParam || "to"
  const msgParam = s.customMsgParam || "message"
  const senderParam = s.customSenderParam || "sender"
  const apiKeyParam = s.customApiKeyParam || "api_key"
  const authValue = s.customAuthValueEnc ? decrypt(s.customAuthValueEnc) : ""

  const buildParamEntries = () => {
    const entries = new URLSearchParams()
    entries.set(phoneParam, normalisePhone(to))
    entries.set(msgParam, msg)
    if (s.customSenderParam) entries.set(senderParam, s.bulksmsbdSender || "") // reuse if set
    return entries
  }

  try {
    const url = new URL(s.customUrl)
    const headers: Record<string, string> = {}
    let body: BodyInit | undefined

    if (authType === "bearer") headers["Authorization"] = `Bearer ${authValue}`
    else if (authType === "basic") headers["Authorization"] = `Basic ${authValue}`
    else if (authType === "header") {
      const [hk, hv] = authValue.split(":")
      if (hk && hv) headers[hk.trim()] = hv.trim()
    }

    if (bodyType === "query" || method === "GET") {
      const params = buildParamEntries()
      if (s.customApiKeyParam && authValue && authType === "none") params.set(apiKeyParam, authValue)
      params.forEach((v, k) => url.searchParams.set(k, v))
    } else if (bodyType === "form") {
      headers["Content-Type"] = "application/x-www-form-urlencoded"
      const params = buildParamEntries()
      if (s.customApiKeyParam && authValue && authType === "none") params.set(apiKeyParam, authValue)
      body = params
    } else {
      // json
      headers["Content-Type"] = "application/json"
      const payload: Record<string, string> = {
        [phoneParam]: normalisePhone(to),
        [msgParam]: msg,
      }
      if (s.customApiKeyParam && authValue && authType === "none") payload[apiKeyParam] = authValue
      body = JSON.stringify(payload)
    }

    const res = await fetch(url.toString(), { method, headers, body })
    const text = await res.text()

    // Success detection: optional success field/value, else HTTP 2xx.
    if (s.customSuccessField && s.customSuccessValue) {
      try {
        const data = JSON.parse(text) as Record<string, unknown>
        const got = String(data[s.customSuccessField] ?? "")
        return got === s.customSuccessValue
          ? { status: "OK", response: text }
          : { status: "ERROR", response: text }
      } catch {
        return { status: "ERROR", response: text }
      }
    }
    return res.ok ? { status: "OK", response: text } : { status: "ERROR", response: text || `HTTP ${res.status}` }
  } catch (e) {
    return { status: "ERROR", response: e instanceof Error ? e.message : "request failed" }
  }
}

/**
 * Resolve the active SMS gateway and send the message. Returns the shared
 * {@link SmsResult} shape. When no provider is configured or the row is
 * disabled, returns `{status:"ERROR"}` so `sendSMS` can fall back to the
 * legacy env-based SendMySMS transport.
 */
export async function resolveAndSendSms(to: string, msg: string): Promise<SmsResult | null> {
  const s = await prisma.smsSettings.findUnique({ where: { id: "singleton" } })
  if (!s || !s.isActive) return null

  switch (s.provider as SmsProvider) {
    case "bulksmsbd":
      return sendBulkSmsBd(s, to, msg)
    case "sendmysms":
      return sendMySms(s, to, msg)
    case "sslwireless":
      return sendSslWireless(s, to, msg)
    case "twilio":
      return sendTwilio(s, to, msg)
    case "custom":
      return sendCustom(s, to, msg)
    default:
      return null
  }
}

// Client-safe metadata re-exported for convenience (server-side importers).
export { SMS_PROVIDERS } from "@/lib/sms/provider-metadata"
