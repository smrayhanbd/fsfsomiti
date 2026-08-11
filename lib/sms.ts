import { resolveAndSendSms } from "@/lib/sms/providers"

export interface SmsResult {
  status: "OK" | "ERROR"
  response?: string
}

/**
 * Backwards-compatible single entry point for transactional SMS.
 *
 * The public contract is unchanged: `sendSMS(to, msg)` returns
 * `Promise<{ status: "OK" | "ERROR"; response?: string }>`. Five callers branch
 * on `smsRes.status` and read `smsRes.response`, so this shape is load-bearing.
 *
 * Internally the gateway is now resolved from the active SmsSettings row
 * (see lib/sms/providers.ts). When no provider is configured yet — or the row
 * is disabled / missing required secrets — we fall back to the legacy
 * env-based SendMySMS transport so the app keeps sending on first deploy.
 */
export async function sendSMS(to: string, msg: string): Promise<SmsResult> {
  try {
    const result = await resolveAndSendSms(to, msg)
    if (result) return result

    // Fall back to legacy env-based SendMySMS transport.
    return await legacySendMySms(to, msg)
  } catch (error) {
    return { status: "ERROR", response: error instanceof Error ? error.message : "SMS request failed" }
  }
}

/** Legacy env-based SendMySMS transport — kept as a private fallback. */
async function legacySendMySms(to: string, msg: string): Promise<SmsResult> {
  const user = process.env.SMS_USER
  const key = process.env.SMS_KEY

  if (!user || !key) {
    return { status: "ERROR", response: "SMS API credentials missing in .env" }
  }

  try {
    const url = `https://sendmysms.net/api.php?user=${user}&key=${key}&to=${to}&msg=${encodeURIComponent(msg)}`
    const response = await fetch(url)
    const data = (await response.json()) as SmsResult
    return data // { status: "OK" } or { status: "ERROR", response: "..." }
  } catch (error) {
    return { status: "ERROR", response: error instanceof Error ? error.message : "SMS request failed" }
  }
}

/**
 * Send a test SMS from the settings page. Resolves to an outcome object the
 * client can render, rather than the OK/ERROR shape, so the UI can show ✓/❌ +
 * timing and error mapping in one place.
 */
export async function sendTestSms(
  to: string,
  msg: string
): Promise<{ ok: boolean; message: string; ms: number }> {
  const started = Date.now()
  const result = await sendSMS(to, msg)
  return {
    ok: result.status === "OK",
    message: result.response || (result.status === "OK" ? "SMS sent successfully." : "SMS failed."),
    ms: Date.now() - started,
  }
}
