import { Prisma } from "@prisma/client"
import { isSuperAdmin, type CurrentUser } from "@/lib/permissions"

/**
 * Maker-Checker validation (spec §12).
 *
 * The user who created the transaction cannot also approve it. The only
 * exception is a SUPER_ADMIN override, in which case the override reason is
 * recorded in the transaction's remarks audit trail.
 *
 * Throws an Error when the approval is not allowed.
 *
 * Extracted from `approveTransaction` (transactions.ts:194-215) so the same
 * rule can be reused by the bulk-approve path and any future approval flow.
 */
export async function validateMakerChecker(
  tx: Prisma.TransactionClient,
  txn: { id: string; createdById: string | null; remarks: string | null },
  user: CurrentUser,
  opts: { overrideReason?: string }
): Promise<void> {
  const isMaker = txn.createdById === user.id
  if (!isMaker) return

  if (isSuperAdmin(user) && opts.overrideReason?.trim()) {
    // Super Admin override — record the reason in the audit trail.
    await tx.transaction.update({
      where: { id: txn.id },
      data: {
        remarks: [
          typeof txn.remarks === "string" ? txn.remarks : null,
          `[SUPER_ADMIN OVERRIDE by ${user.email}: ${opts.overrideReason.trim()}]`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    })
    return
  }

  throw new Error(
    "Maker-Checker rule: you cannot approve a transaction you created. " +
      "Ask another authorised user to approve it."
  )
}
