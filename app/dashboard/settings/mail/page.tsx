import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getCurrentUser, isSuperAdmin } from "@/lib/permissions"
import MailSettingsClient from "./MailSettingsClient"
import type { MailProvider } from "@/lib/mail/provider-metadata"

export const dynamic = "force-dynamic"

/** Mail settings row shape handed to the client (secrets already masked). */
function serializeSettings(s: Awaited<ReturnType<typeof prisma.mailSettings.findUnique>>) {
  return {
    provider: (s?.provider as MailProvider) || "gmail",
    isActive: s?.isActive ?? true,
    displayName: s?.displayName ?? "",
    fromEmail: s?.fromEmail ?? "",
    replyTo: s?.replyTo ?? "",
    smtpHost: s?.smtpHost ?? "",
    smtpPort: s?.smtpPort ?? 587,
    encryption: s?.encryption ?? "tls",
    smtpUsername: s?.smtpUsername ?? "",
    smtpPasswordHas: !!s?.smtpPasswordEnc,
    sesRegion: s?.sesRegion ?? "",
    sesConfigSet: s?.sesConfigSet ?? "",
    sesSandbox: s?.sesSandbox ?? false,
    apiDomain: s?.apiDomain ?? "",
    apiRegion: s?.apiRegion ?? "US",
    apiKeyHas: !!s?.apiKeyEnc,
    maxRetry: s?.maxRetry ?? 3,
    retryIntervalMin: s?.retryIntervalMin ?? 5,
    timeoutSec: s?.timeoutSec ?? 30,
    dailyLimit: s?.dailyLimit ?? null,
    perMinuteLimit: s?.perMinuteLimit ?? null,
  }
}

export default async function MailSettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  if (!isSuperAdmin(user)) redirect("/dashboard")

  const [settings, templates, auditLogs] = await Promise.all([
    prisma.mailSettings.findUnique({ where: { id: "singleton" } }),
    prisma.messageTemplate.findMany({ where: { channel: "EMAIL" }, orderBy: { name: "asc" } }),
    prisma.settingsAuditLog.findMany({ where: { section: "MAIL" }, orderBy: { createdAt: "desc" }, take: 10 }),
  ])

  return (
    <MailSettingsClient
      settings={serializeSettings(settings)}
      templates={templates.map((t) => ({
        id: t.id,
        channel: t.channel,
        key: t.key,
        name: t.name,
        subject: t.subject ?? "",
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
