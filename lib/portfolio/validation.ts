// Shared validation helpers + audit-log writer for the Investment & Project
// server actions. Server-side defense — the client forms also validate, but
// this is the authoritative gate.

import { Prisma } from "@prisma/client"
import type { CurrentUser } from "@/lib/permissions"

export type ActionResult =
  | { ok: true; id?: string; voucherNo?: string }
  | { ok: false; error: string }

/** Positive-number guard used across all money inputs. */
export function requirePositive(value: number, field: string): string | null {
  if (!Number.isFinite(value) || value <= 0) return `${field} must be greater than zero.`
  return null
}

/** ISO-date-string guard. */
export function requireDate(value: string | undefined, field: string): string | null {
  if (!value) return `${field} is required.`
  const d = new Date(value)
  if (isNaN(d.getTime())) return `${field} is not a valid date.`
  return null
}

/**
 * Append an immutable audit-log row inside the caller's transaction. Mirrors
 * the SettingsAuditLog / TaskAuditLog append-only convention.
 */
export async function writeAuditLog(
  tx: Prisma.TransactionClient,
  args: {
    entityType: "INVESTMENT" | "PROJECT"
    entityId: string
    action: string
    summary: string
    changes?: Prisma.InputJsonValue
    actor?: CurrentUser | null
  }
): Promise<void> {
  await tx.entityAuditLog.create({
    data: {
      entityType: args.entityType,
      investmentId: args.entityType === "INVESTMENT" ? args.entityId : null,
      projectId: args.entityType === "PROJECT" ? args.entityId : null,
      action: args.action,
      summary: args.summary,
      changes: args.changes ?? undefined,
      actorUserId: args.actor?.id ?? null,
      actorName: args.actor?.email ?? null,
    },
  })
}
