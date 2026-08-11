// ============================================================================
// Election audit log — append-only, never edited or deleted.
// ============================================================================
// Per spec §31, §70, §71: every important action creates an immutable record.
// Corrections are recorded as NEW events (never edits). Metadata must NEVER
// contain: ballot selections, raw ballot contents, passwords/OTP/tokens,
// or encryption keys.

import prisma from "@/lib/prisma"
import type { ElectionAuditAction } from "@prisma/client"
import type { Prisma } from "@prisma/client"

export interface AuditEvent {
  electionId: string
  action: ElectionAuditAction
  performedById?: string | null
  performedByRole?: string | null
  metadata?: Record<string, unknown>
  ipAddress?: string | null
  userAgent?: string | null
}

/**
 * Append an audit event. Never throws — failures are logged to stderr so the
 * calling action completes. (Same philosophy as lib/tasks/spawn.ts and the
 * existing admin-notification helper.)
 */
export async function writeElectionAudit(event: AuditEvent): Promise<void> {
  try {
    await prisma.electionAuditLog.create({
      data: {
        electionId: event.electionId,
        action: event.action,
        performedById: event.performedById ?? null,
        performedByRole: event.performedByRole ?? null,
        metadata: (event.metadata ?? {}) as Prisma.InputJsonValue,
        ipAddress: event.ipAddress ?? null,
        userAgent: event.userAgent ?? null,
      },
    })
  } catch (e) {
    console.error("[elections] writeElectionAudit failed:", event.action, e)
  }
}

/**
 * Read the audit log for an election. Optionally filter by action. Returns
 * newest-first. NEVER includes ballot selections (they're never written).
 */
export async function readElectionAudit(
  electionId: string,
  opts?: { action?: ElectionAuditAction; limit?: number; offset?: number }
) {
  return prisma.electionAuditLog.findMany({
    where: {
      electionId,
      ...(opts?.action ? { action: opts.action } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts?.limit || 100,
    skip: opts?.offset || 0,
  })
}
