"use server"

import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { getCurrentUser, requireSuperAdmin } from "@/lib/permissions"
import { encrypt, reencrypt } from "@/lib/crypto"
import { sendTestEmail, testMailConnection } from "@/lib/email"
import { sendTestSms } from "@/lib/sms"
import { seedDefaultTemplates } from "@/lib/templates"

/**
 * Server actions for the Mail & SMS settings pages.
 *
 * Every mutating/test action self-authorises with `requireSuperAdmin` — these
 * endpoints store secrets and write audit rows, so the page-level redirect is
 * not enough (server actions are POST-reachable regardless of the UI). The
 * throw inside `requireSuperAdmin` surfaces to the client as an error message.
 *
 * Secrets (passwords, API keys, tokens) are only re-encrypted when the form
 * submits a non-empty value; a blank field preserves the existing ciphertext,
 * mirroring the Organization logo-preservation pattern.
 */

// ── helpers ──────────────────────────────────────────────────────────────────

/** Read the caller IP from common proxy headers, best-effort. */
async function callerIp(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

/** Build a redacted diff: secret fields become "***CHANGED***", never values. */
const SECRET_KEYS = new Set([
  "smtpPasswordEnc",
  "apiKeyEnc",
  "bulksmsbdApiKeyEnc",
  "sendmysmsKeyEnc",
  "sslTokenEnc",
  "twilioTokenEnc",
  "customAuthValueEnc",
])

function redactedDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, unknown> {
  const diff: Record<string, unknown> = {}
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[k]
    const b = after[k]
    if (a === b) continue
    diff[k] = SECRET_KEYS.has(k) ? "***CHANGED***" : { from: a, to: b }
  }
  return diff
}

/** Write one audit row. Swallows errors — auditing must never break a save. */
async function audit(
  section: "MAIL" | "SMS",
  action: string,
  summary: string,
  changes?: Record<string, unknown>
): Promise<void> {
  try {
    const user = await getCurrentUser()
    await prisma.settingsAuditLog.create({
      data: {
        section,
        action,
        summary,
        changes: (changes as Prisma.InputJsonValue | undefined) ?? undefined,
        userId: user?.id,
        userEmail: user?.email,
        ipAddress: await callerIp(),
      },
    })
  } catch (e) {
    console.error("[audit] failed to write settings audit log:", e)
  }
}

function getStr(fd: FormData, key: string): string {
  return ((fd.get(key) as string) || "").trim()
}
function getInt(fd: FormData, key: string): number | null {
  const raw = (fd.get(key) as string) || ""
  if (raw.trim() === "") return null
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}
function getBool(fd: FormData, key: string): boolean {
  const v = fd.get(key)
  return v === "true" || v === "YES" || v === "on" || v === "1"
}

// ── Mail settings ────────────────────────────────────────────────────────────

export async function saveMailSettings(formData: FormData) {
  const user = await getCurrentUser()
  requireSuperAdmin(user)
  const provider = getStr(formData, "provider") || "gmail"
  const isActive = getBool(formData, "isActive")

  const data = {
    provider,
    isActive,
    displayName: getStr(formData, "displayName") || null,
    fromEmail: getStr(formData, "fromEmail") || null,
    replyTo: getStr(formData, "replyTo") || null,
    smtpHost: getStr(formData, "smtpHost") || null,
    smtpPort: getInt(formData, "smtpPort"),
    encryption: getStr(formData, "encryption") || null,
    smtpUsername: getStr(formData, "smtpUsername") || null,
    sesRegion: getStr(formData, "sesRegion") || null,
    sesConfigSet: getStr(formData, "sesConfigSet") || null,
    sesSandbox: getBool(formData, "sesSandbox"),
    apiDomain: getStr(formData, "apiDomain") || null,
    apiRegion: getStr(formData, "apiRegion") || null,
    maxRetry: getInt(formData, "maxRetry") ?? 3,
    retryIntervalMin: getInt(formData, "retryIntervalMin") ?? 5,
    timeoutSec: getInt(formData, "timeoutSec") ?? 30,
    dailyLimit: getInt(formData, "dailyLimit"),
    perMinuteLimit: getInt(formData, "perMinuteLimit"),
    updatedBy: user.id,
  }

  // Secrets — only overwrite when the field is non-empty; else preserve.
  const existing = await prisma.mailSettings.findUnique({ where: { id: "singleton" } })
  const smtpPasswordEnc = reencrypt(
    getStr(formData, "smtpPassword"),
    existing?.smtpPasswordEnc ?? null
  )
  const apiKeyEnc = reencrypt(getStr(formData, "apiKey"), existing?.apiKeyEnc ?? null)

  const before = (existing ?? {}) as Record<string, unknown>
  const after = { ...data, smtpPasswordEnc, apiKeyEnc } as Record<string, unknown>

  await prisma.mailSettings.upsert({
    where: { id: "singleton" },
    update: { ...data, smtpPasswordEnc, apiKeyEnc },
    create: { id: "singleton", ...data, smtpPasswordEnc, apiKeyEnc },
  })

  await audit("MAIL", "UPDATE_PROVIDER", `Mail provider saved: ${provider}`, redactedDiff(before, after))

  revalidatePath("/dashboard/settings/mail")
}

export async function testMailSettings(): Promise<{ ok: boolean; message: string }> {
  try {
    requireSuperAdmin(await getCurrentUser())
    await testMailConnection()
    await audit("MAIL", "TEST_MAIL", "Mail connection verified successfully.")
    return { ok: true, message: "Connection successful — the configured mail provider is reachable." }
  } catch (error) {
    await audit("MAIL", "TEST_MAIL", `Mail test failed: ${error instanceof Error ? error.message : "unknown"}`)
    return { ok: false, message: error instanceof Error ? error.message : "Verification failed." }
  }
}

export async function sendTestMailAction(formData: FormData): Promise<{ ok: boolean; message: string; ms: number }> {
  try {
    requireSuperAdmin(await getCurrentUser())
    const to = getStr(formData, "testTo")
    const subject = getStr(formData, "testSubject") || "Test Email from Future Savings"
    const message = getStr(formData, "testMessage") || "<p>This is a test email from your Mail settings.</p>"
    if (!to) return { ok: false, message: "Recipient email is required.", ms: 0 }
    const result = await sendTestEmail(to, subject, message)
    await audit("MAIL", "TEST_MAIL", `Test email to ${to} → ${result.ok ? "OK" : "FAILED: " + result.message}`)
    return result
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Test failed.", ms: 0 }
  }
}

// ── SMS settings ─────────────────────────────────────────────────────────────

export async function saveSmsSettings(formData: FormData) {
  const user = await getCurrentUser()
  requireSuperAdmin(user)
  const provider = getStr(formData, "provider") || "bulksmsbd"
  const isActive = getBool(formData, "isActive")

  const data = {
    provider,
    isActive,
    displayName: getStr(formData, "displayName") || null,
    bulksmsbdUrl: getStr(formData, "bulksmsbdUrl") || null,
    bulksmsbdSender: getStr(formData, "bulksmsbdSender") || null,
    sendmysmsUrl: getStr(formData, "sendmysmsUrl") || null,
    sendmysmsUser: getStr(formData, "sendmysmsUser") || null,
    sslSender: getStr(formData, "sslSender") || null,
    sslUrl: getStr(formData, "sslUrl") || null,
    twilioSid: getStr(formData, "twilioSid") || null,
    twilioFrom: getStr(formData, "twilioFrom") || null,
    customUrl: getStr(formData, "customUrl") || null,
    customMethod: getStr(formData, "customMethod") || null,
    customAuthType: getStr(formData, "customAuthType") || null,
    customBodyType: getStr(formData, "customBodyType") || null,
    customPhoneParam: getStr(formData, "customPhoneParam") || null,
    customMsgParam: getStr(formData, "customMsgParam") || null,
    customSenderParam: getStr(formData, "customSenderParam") || null,
    customApiKeyParam: getStr(formData, "customApiKeyParam") || null,
    customSuccessField: getStr(formData, "customSuccessField") || null,
    customSuccessValue: getStr(formData, "customSuccessValue") || null,
    countryCode: getStr(formData, "countryCode") || null,
    phoneFormat: getStr(formData, "phoneFormat") || null,
    urlEncode: getBool(formData, "urlEncode"),
    timeoutSec: getInt(formData, "timeoutSec") ?? 30,
    maxRetry: getInt(formData, "maxRetry") ?? 3,
    dailyLimit: getInt(formData, "dailyLimit"),
    updatedBy: user.id,
  }

  const existing = await prisma.smsSettings.findUnique({ where: { id: "singleton" } })
  const bulksmsbdApiKeyEnc = reencrypt(getStr(formData, "bulksmsbdApiKey"), existing?.bulksmsbdApiKeyEnc ?? null)
  const sendmysmsKeyEnc = reencrypt(getStr(formData, "sendmysmsKey"), existing?.sendmysmsKeyEnc ?? null)
  const sslTokenEnc = reencrypt(getStr(formData, "sslToken"), existing?.sslTokenEnc ?? null)
  const twilioTokenEnc = reencrypt(getStr(formData, "twilioToken"), existing?.twilioTokenEnc ?? null)
  const customAuthValueEnc = reencrypt(getStr(formData, "customAuthValue"), existing?.customAuthValueEnc ?? null)

  const before = (existing ?? {}) as Record<string, unknown>
  const after = {
    ...data,
    bulksmsbdApiKeyEnc,
    sendmysmsKeyEnc,
    sslTokenEnc,
    twilioTokenEnc,
    customAuthValueEnc,
  } as Record<string, unknown>

  await prisma.smsSettings.upsert({
    where: { id: "singleton" },
    update: { ...data, bulksmsbdApiKeyEnc, sendmysmsKeyEnc, sslTokenEnc, twilioTokenEnc, customAuthValueEnc },
    create: {
      id: "singleton",
      ...data,
      bulksmsbdApiKeyEnc,
      sendmysmsKeyEnc,
      sslTokenEnc,
      twilioTokenEnc,
      customAuthValueEnc,
    },
  })

  await audit("SMS", "UPDATE_PROVIDER", `SMS provider saved: ${provider}`, redactedDiff(before, after))

  revalidatePath("/dashboard/settings/sms")
}

export async function sendTestSmsAction(formData: FormData): Promise<{ ok: boolean; message: string; ms: number }> {
  try {
    requireSuperAdmin(await getCurrentUser())
    const to = getStr(formData, "testTo")
    const message = getStr(formData, "testMessage") || "This is a test SMS from Future Savings Foundation."
    if (!to) return { ok: false, message: "Recipient number is required.", ms: 0 }
    const result = await sendTestSms(to, message)
    await audit("SMS", "TEST_SMS", `Test SMS to ${to} → ${result.ok ? "OK" : "FAILED: " + result.message}`)
    return result
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Test failed.", ms: 0 }
  }
}

// ── Templates ────────────────────────────────────────────────────────────────

/** Ensure the default template catalogue is present (idempotent). */
export async function seedTemplatesAction(returnTo?: "mail" | "sms") {
  requireSuperAdmin(await getCurrentUser())
  await seedDefaultTemplates()
  await audit("MAIL", "TEMPLATE_SAVE", "Default templates seeded.")
  revalidatePath("/dashboard/settings/mail")
  revalidatePath("/dashboard/settings/sms")
}

export async function saveTemplate(formData: FormData) {
  requireSuperAdmin(await getCurrentUser())
  const id = getStr(formData, "id")
  const channel = (getStr(formData, "channel") || "EMAIL").toUpperCase() as "EMAIL" | "SMS"
  const key = getStr(formData, "key")
  const name = getStr(formData, "name") || key
  const subject = getStr(formData, "subject") || null
  const body = getStr(formData, "body")
  const variables = getStr(formData, "variables") || null
  if (!key || !body) throw new Error("Template key and body are required.")

  if (id) {
    await prisma.messageTemplate.update({
      where: { id },
      data: { channel, key, name, subject, body, variables },
    })
  } else {
    await prisma.messageTemplate.create({ data: { channel, key, name, subject, body, variables } })
  }

  await audit(channel === "EMAIL" ? "MAIL" : "SMS", "TEMPLATE_SAVE", `Template "${name}" (${key}) saved.`)

  revalidatePath("/dashboard/settings/mail")
  revalidatePath("/dashboard/settings/sms")
}

export async function deleteTemplate(id: string) {
  await requireSuperAdmin(await getCurrentUser())
  const tpl = await prisma.messageTemplate.findUnique({ where: { id } })
  if (!tpl) throw new Error("Template not found.")
  await prisma.messageTemplate.delete({ where: { id } })
  await audit(
    tpl.channel === "EMAIL" ? "MAIL" : "SMS",
    "TEMPLATE_DELETE",
    `Template "${tpl.name}" (${tpl.key}) deleted.`
  )
  revalidatePath("/dashboard/settings/mail")
  revalidatePath("/dashboard/settings/sms")
}
