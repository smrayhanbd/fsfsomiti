"use server"

/**
 * Server actions for the Transparency Settings page.
 *
 * Mirrors the MailSettings/SmsSettings save pattern in app/actions/messaging.ts:
 *   - self-authorises with `requireSuperAdmin` (server actions are POST-reachable
 *     regardless of the page-level redirect, and these store a secret),
 *   - preserves the iBanking password when the field is submitted blank via
 *     `reencrypt()` from lib/crypto.ts,
 *   - writes a redacted SettingsAuditLog row (section = "TRANSPARENCY") so every
 *     change is traceable. The password field is recorded as "***CHANGED***",
 *     never its value.
 */

import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { getCurrentUser, requireSuperAdmin } from "@/lib/permissions"
import { reencrypt } from "@/lib/crypto"

// ── helpers ──────────────────────────────────────────────────────────────────

async function callerIp(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

function getStr(fd: FormData, key: string): string {
  return ((fd.get(key) as string) || "").trim()
}

function getBool(fd: FormData, key: string): boolean {
  const v = fd.get(key)
  return v === "true" || v === "YES" || v === "on" || v === "1"
}

/** Secret field marker for the audit diff — never the value. */
const SECRET_KEYS = new Set(["ibankingPasswordEnc"])

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
async function audit(action: string, summary: string, changes?: Record<string, unknown>): Promise<void> {
  try {
    const user = await getCurrentUser()
    await prisma.settingsAuditLog.create({
      data: {
        section: "TRANSPARENCY",
        action,
        summary,
        changes: (changes as Prisma.InputJsonValue | undefined) ?? undefined,
        userId: user?.id,
        userEmail: user?.email,
        ipAddress: await callerIp(),
      },
    })
  } catch (e) {
    console.error("[audit] failed to write transparency audit log:", e)
  }
}

// ── save ─────────────────────────────────────────────────────────────────────

export async function saveTransparencySettings(formData: FormData) {
  const user = await getCurrentUser()
  requireSuperAdmin(user)

  const data = {
    showBankStatement: getBool(formData, "showBankStatement"),
    showInvestments: getBool(formData, "showInvestments"),
    showProjects: getBool(formData, "showProjects"),
    showMeetingMinutes: getBool(formData, "showMeetingMinutes"),
    bankName: getStr(formData, "bankName") || null,
    ibankingUrl: getStr(formData, "ibankingUrl") || null,
    ibankingUserId: getStr(formData, "ibankingUserId") || null,
    bankInstructions: getStr(formData, "bankInstructions") || null,
    updatedBy: user.id,
  }

  // Secret — only overwrite when the field is non-empty; else preserve.
  const existing = await prisma.transparencySettings.findUnique({ where: { id: "singleton" } })
  const ibankingPasswordEnc = reencrypt(
    getStr(formData, "ibankingPassword"),
    existing?.ibankingPasswordEnc ?? null
  )

  const before = (existing ?? {}) as Record<string, unknown>
  const after = { ...data, ibankingPasswordEnc } as Record<string, unknown>

  await prisma.transparencySettings.upsert({
    where: { id: "singleton" },
    update: { ...data, ibankingPasswordEnc },
    create: { id: "singleton", ...data, ibankingPasswordEnc },
  })

  await audit(
    "UPDATE_SETTINGS",
    "Transparency settings saved.",
    redactedDiff(before, after)
  )

  // Portal chrome reads the toggles, so invalidate the portal layout too.
  revalidatePath("/dashboard/settings/transparency")
  revalidatePath("/portal", "layout")
}
