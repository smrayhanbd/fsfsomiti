import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getCurrentUser, isSuperAdmin } from "@/lib/permissions"
import SmsSettingsClient from "./SmsSettingsClient"
import type { SmsProvider } from "@/lib/sms/provider-metadata"

export const dynamic = "force-dynamic"

/** SMS settings row shape handed to the client (secrets already masked). */
function serializeSettings(s: Awaited<ReturnType<typeof prisma.smsSettings.findUnique>>) {
  return {
    provider: (s?.provider as SmsProvider) || "bulksmsbd",
    isActive: s?.isActive ?? true,
    displayName: s?.displayName ?? "",
    bulksmsbdUrl: s?.bulksmsbdUrl ?? "http://bulksmsbd.net/api/smsapi",
    bulksmsbdApiKeyHas: !!s?.bulksmsbdApiKeyEnc,
    bulksmsbdSender: s?.bulksmsbdSender ?? "",
    sendmysmsUrl: s?.sendmysmsUrl ?? "https://sendmysms.net/api.php",
    sendmysmsUser: s?.sendmysmsUser ?? "",
    sendmysmsKeyHas: !!s?.sendmysmsKeyEnc,
    sslSender: s?.sslSender ?? "",
    sslUrl: s?.sslUrl ?? "https://smsplus.sslwireless.com/api/v3/send-sms",
    sslTokenHas: !!s?.sslTokenEnc,
    twilioSid: s?.twilioSid ?? "",
    twilioFrom: s?.twilioFrom ?? "",
    twilioTokenHas: !!s?.twilioTokenEnc,
    customUrl: s?.customUrl ?? "",
    customMethod: s?.customMethod ?? "GET",
    customAuthType: s?.customAuthType ?? "none",
    customAuthValueHas: !!s?.customAuthValueEnc,
    customBodyType: s?.customBodyType ?? "query",
    customPhoneParam: s?.customPhoneParam ?? "to",
    customMsgParam: s?.customMsgParam ?? "message",
    customSenderParam: s?.customSenderParam ?? "",
    customApiKeyParam: s?.customApiKeyParam ?? "",
    customSuccessField: s?.customSuccessField ?? "",
    customSuccessValue: s?.customSuccessValue ?? "",
    countryCode: s?.countryCode ?? "+880",
    phoneFormat: s?.phoneFormat ?? "88017XXXXXXXX",
    urlEncode: s?.urlEncode ?? true,
    timeoutSec: s?.timeoutSec ?? 30,
    maxRetry: s?.maxRetry ?? 3,
    dailyLimit: s?.dailyLimit ?? null,
  }
}

export default async function SmsSettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  if (!isSuperAdmin(user)) redirect("/dashboard")

  const [settings, templates, auditLogs] = await Promise.all([
    prisma.smsSettings.findUnique({ where: { id: "singleton" } }),
    prisma.messageTemplate.findMany({ where: { channel: "SMS" }, orderBy: { name: "asc" } }),
    prisma.settingsAuditLog.findMany({ where: { section: "SMS" }, orderBy: { createdAt: "desc" }, take: 10 }),
  ])

  return (
    <SmsSettingsClient
      settings={serializeSettings(settings)}
      templates={templates.map((t) => ({
        id: t.id,
        channel: t.channel,
        key: t.key,
        name: t.name,
        body: t.body,
        variables: t.variables ?? "",
        updatedAt: t.updatedAt.toISOString(),
      }))}
      auditLogs={auditLogs.map((a) => ({
        id: a.id,
        action: a.action,
        summary: a.summary,
        userEmail: a.userEmail ?? "—",
        createdAt: a.createdAt.toISOString(),
      }))}
    />
  )
}
