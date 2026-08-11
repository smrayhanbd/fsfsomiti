"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import {
  getCurrentUser,
  requirePermission,
  PERMISSIONS,
} from "@/lib/permissions"
import { createTransaction } from "@/app/actions/transactions"

// =====================================================================
// Savings deposit (audit item B1).
//
// Previously this stub called `prisma.savings.create` directly, bypassing
// the Transaction pipeline entirely — meaning the new deposit:
//   • never appeared in the GL or Trial Balance,
//   • skipped maker-checker / approval-tier rules,
//   • never got a voucher number from the atomic Counter,
//   • updated the member's savings balance without any audit trail.
//
// We now route through `createTransaction` so the deposit enters the same
// DRAFT → PENDING_APPROVAL → APPROVED lifecycle as every other ledger
// movement. Approval flow side-effects (posting the GL, trust-score hooks,
// voucher numbering) all run when the deposit is approved downstream.
// =====================================================================
export async function addSavings(memberId: string, formData: FormData) {
  const user = await requirePermission(
    await getCurrentUser(),
    PERMISSIONS.TRANSACTION_CREATE
  )

  const amount = parseFloat((formData.get("amount") as string) || "")
  const method = (formData.get("method") as string) || null
  const referenceNo = (formData.get("referenceNo") as string) || null
  const remarks = (formData.get("remarks") as string) || null

  if (!amount || isNaN(amount) || amount <= 0) {
    throw new Error("A positive savings amount is required.")
  }
  if (!memberId) {
    throw new Error("Member is required.")
  }

  // Route through the transaction pipeline so the GL stays in sync and the
  // approval flow can run. SAVINGS_DEPOSIT is the canonical subType for a
  // member savings deposit; createTransaction already enforces its own
  // TRANSACTION_CREATE auth check, but we re-check here too so the call
  // surface is consistent and the error message mentions savings.
  const result = await createTransaction({
    transactionType: "DEPOSIT",
    subType: "SAVINGS_DEPOSIT",
    memberId,
    amount,
    paymentMethod: method as never,
    referenceNo,
    remarks,
    // createdBy / createdById are populated inside createTransaction from the
    // resolved session user — no need to pass them here.
  })

  if (!result.ok) {
    throw new Error(result.error || "Could not create the savings deposit.")
  }

  // Sanity log so we can trace which savings deposits bypassed the ledger
  // before this fix landed. Keep at debug level so it doesn't spam prod logs.
  console.debug("[addSavings] deposit routed through ledger", {
    memberId,
    amount,
    transactionId: result.id,
    voucherNo: result.voucherNo,
    createdBy: user.email,
  })

  revalidatePath(`/dashboard/members/${memberId}`)
  revalidatePath("/dashboard/transactions")
  revalidatePath("/dashboard/transaction-approvals")
  redirect(`/dashboard/members/${memberId}`)
}
