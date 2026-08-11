"use server"

import prisma, { directPrisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import {
  getCurrentUser,
  isSuperAdmin,
  hasPermission,
  requirePermission,
  PERMISSIONS,
  type CurrentUser,
} from "@/lib/permissions"
import { recalculateTrustScore } from "@/lib/trustScore"
import { nextTransactionNo } from "@/lib/transactions/voucher"
import { postTransactionEffects } from "@/lib/transactions/posting"
import { lockRow } from "@/lib/transactions/lock"
import { sendSMS } from "@/lib/sms"
import { sendEmail } from "@/lib/email"
import {
  loadApprovalLimits,
  resolveLevelForAmount,
  userApprovalCeiling,
  computeMemberBalance,
  savingsTypeFor,
} from "@/lib/transactions/validation"
import {
  validateMakerChecker,
  validateApprovalLimit,
  validateWithdrawalEligibility,
  validatePaymentSource,
} from "@/lib/transactions/approval"
import type {
  TransactionType,
  TransactionSubType,
  PaymentMethod,
  TransactionBreakdown,
  TransactionAttachment,
  DistributionShare,
} from "@/lib/transactions/types"

export type ActionResult =
  | { ok: true; id?: string; voucherNo?: string }
  | { ok: false; error: string }

const PATHS = [
  "/dashboard/transactions",
  "/dashboard/transaction-approvals",
  "/dashboard/cash-closing",
  "/dashboard/accounts",
  "/dashboard/account-ledger",
  "/dashboard/member-ledger",
  "/dashboard/due-list",
  "/dashboard/members",
  "/dashboard/financials/trial-balance",
  "/dashboard/financials/balance-sheet",
  "/dashboard/financials/profit-loss",
]

function revalidateAll() {
  PATHS.forEach((p) => revalidatePath(p))
}

// ---------------------------------------------------------------------------
// CREATE — Maker step. Saves as DRAFT.
// ---------------------------------------------------------------------------
export interface CreateTransactionInput {
  transactionType: TransactionType
  subType: TransactionSubType
  // For dynamic charge types (subType = CUSTOM_CHARGE), the human-readable name
  // chosen on the Fees & Charge Setup → Charge Type tab.
  chargeTypeName?: string | null
  memberId?: string | null
  amount: number
  paymentMethod?: PaymentMethod | null
  cashAccountId?: string | null
  referenceNo?: string | null
  breakdown?: TransactionBreakdown | null
  attachments?: TransactionAttachment[]
  remarks?: string | null
  // Effective date of the transaction (when the money moved). Defaults to now
  // on the model, so omitting it keeps existing callers unchanged.
  transactionDate?: string | Date | null
  // For income distribution — the per-member split.
  distribution?: DistributionShare[] | null
  // For portal-originated requests.
  memberRequestId?: string | null
}

export async function createTransaction(
  input: CreateTransactionInput
): Promise<ActionResult> {
  try {
    const user = await requirePermission(await getCurrentUser(), PERMISSIONS.TRANSACTION_CREATE)
    if (!input.amount || input.amount <= 0) {
      return { ok: false, error: "Amount must be greater than zero." }
    }
    if (input.transactionType !== "INCOME_DISTRIBUTION" && !input.memberId) {
      return { ok: false, error: "A member is required for this transaction." }
    }

    const { id, voucherNo } = await directPrisma.$transaction(async (tx) => {
      const no = await nextTransactionNo(tx, input.transactionType)
      const created = await tx.transaction.create({
        data: {
          voucherNo: no,
          transactionType: input.transactionType,
          subType: input.subType,
          chargeTypeName: input.chargeTypeName || null,
          category: "MEMBER",
          memberId: input.memberId || null,
          amount: input.amount,
          paymentMethod: input.paymentMethod || null,
          cashAccountId: input.cashAccountId || null,
          referenceNo: input.referenceNo || null,
          breakdown: (input.breakdown as Prisma.JsonObject) ?? undefined,
          attachments: (input.attachments ?? []) as unknown as Prisma.InputJsonValue,
          remarks: input.remarks || null,
          transactionDate: input.transactionDate ? new Date(input.transactionDate) : undefined,
          status: "DRAFT",
          memberSubmitted: false,
          memberRequestId: input.memberRequestId || null,
          // Audit — keep both a human label and the user id.
          createdBy: user.email,
          createdById: user.id,
        },
        select: { id: true, voucherNo: true },
      })
      return created
    })

    revalidateAll()
    return { ok: true, id, voucherNo }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// SUBMIT — DRAFT → PENDING_APPROVAL. Resolves the approval tier by amount.
// ---------------------------------------------------------------------------
export async function submitTransaction(id: string): Promise<ActionResult> {
  try {
    const user = await requirePermission(await getCurrentUser(), PERMISSIONS.TRANSACTION_SUBMIT)

    const txn = await prisma.transaction.findUnique({
      where: { id },
      select: { status: true, amount: true, transactionType: true },
    })
    if (!txn) return { ok: false, error: "Transaction not found." }
    if (txn.status !== "DRAFT" && txn.status !== "RETURNED") {
      return { ok: false, error: `Cannot submit a ${txn.status} transaction.` }
    }

    const limits = await loadApprovalLimits()
    const approvalLevel = resolveLevelForAmount(Number(txn.amount), limits)

    await prisma.transaction.update({
      where: { id },
      data: {
        status: "PENDING_APPROVAL",
        approvalLevel,
        submittedBy: user.email,
        submittedById: user.id,
        submittedAt: new Date(),
        // Clear any prior return reason when re-submitting.
        returnReason: null,
      },
    })
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// APPROVE — the heart of the engine.
// ---------------------------------------------------------------------------
export async function approveTransaction(
  id: string,
  opts: { overrideReason?: string } = {}
): Promise<ActionResult> {
  try {
    const user = await requirePermission(await getCurrentUser(), PERMISSIONS.TRANSACTION_APPROVE)
    // IMPORTANT: must use `directPrisma` (session-mode pooler, DIRECT_URL) for
    // interactive transactions — the pooled `prisma` client (Supabase
    // transaction-mode Supavisor on port 6543) reclaims the underlying
    // connection mid-callback, causing "Transaction not found" errors on the
    // subsequent tx.account.findUnique() calls inside postTransactionEffects.
    // See lib/prisma.ts for the full rationale.
    const result = await directPrisma.$transaction(
      async (tx) => {
      // ── 1. Re-fetch inside tx (concurrent-approval safety, spec §7C) ───────
      // B11: acquire a Postgres row lock BEFORE reading the row. Two
      // concurrent approvers would otherwise both see PENDING_APPROVAL and
      // both post the GL entry + Savings mirror, double-spending the
      // underlying cash account. The lock serialises them: the second waits
      // until the first commits, then re-reads status === APPROVED and bails.
      await lockRow(tx, "Transaction", id)
      const txn = await tx.transaction.findUnique({
        where: { id },
        include: {
          member: { select: { id: true, status: true, fullName: true } },
          cashAccount: { select: { id: true, currentBalance: true, accountName: true } },
        },
      })
      if (!txn) throw new Error("Transaction not found.")
      if (txn.status !== "PENDING_APPROVAL") {
        throw new Error(`Only pending transactions can be approved (current: ${txn.status}).`)
      }

      // ── 2–5. Validation rules (Maker-Checker, approval-limit, withdrawal
      // eligibility, payment-source) — extracted into lib/transactions/approval/
      // so they can be unit-tested and reused by the bulk-approve path.
      await validateMakerChecker(tx, txn, user, opts)
      await validateApprovalLimit(txn, user)
      if (txn.transactionType === "WITHDRAWAL" && txn.memberId) {
        await validateWithdrawalEligibility(tx, txn)
      }
      validatePaymentSource(txn)

      // ── 6. Post double-entry + Savings mirror (spec §17, both ledgers) ─────
      const posting = await postTransactionEffects(tx, {
        transactionId: txn.id,
        transactionType: txn.transactionType,
        amount: Number(txn.amount),
        memberId: txn.memberId,
        cashAccountId: txn.cashAccountId,
        referenceNo: txn.referenceNo,
        narration: `${txn.transactionType} — ${txn.voucherNo}`,
        savingsType: savingsTypeFor(txn.transactionType),
        savingsMethod: (txn.paymentMethod as string) || "CASH",
      })

      // ── 7. Mark the transaction APPROVED + link posting results ────────────
      const updated = await tx.transaction.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedBy: user.email,
          approvedById: user.id,
          approvedAt: new Date(),
          journalEntryId: posting.journalEntryId,
          savingsMirrorId: posting.savingsMirrorId,
        },
      })

      // ── 8. Mark linked portal request as APPROVED (if any) ─────────────────
      // Records who approved and when so the member portal can show the
      // review trail. Works for both WITHDRAWAL (member-request flow) and
      // DEPOSIT (member-submitted Transaction flow).
      if (txn.memberRequestId) {
        await tx.memberRequest.update({
          where: { id: txn.memberRequestId },
          data: {
            status: "APPROVED",
            reviewedBy: user.email,
            reviewedAt: new Date(),
          },
        })
      }

      return { updated, posting }
      },
      // Allow up to 30s for the remote DB to finish all the findUnique / update
      // calls inside this callback (default Prisma timeout is 5s, which is too
      // tight for approval on a slow / distant DB).
      { maxWait: 15_000, timeout: 30_000 }
    ) // end $transaction

    // ── 9. Non-blocking side effects (trust score + notifications, spec §16) ─
    // These run after the DB transaction commits and must never roll back the
    // approval. Errors are logged inside notifyMember (via Notification rows)
    // and here to the console, then swallowed.
    if (result.updated.memberId) {
      const eventType = trustEventForType(result.updated.transactionType as TransactionType)
      if (eventType) {
        recalculateTrustScore(result.updated.memberId, eventType, {
          createdBy: user.email,
          referenceId: result.updated.id,
          referenceType: "deposit",
        }).catch((e) => console.error("[approveTransaction] trustScore failed:", e))
      }
      notifyMember(result.updated, user).catch((e) =>
        console.error("[approveTransaction] notifyMember failed:", e)
      )
    }

    revalidateAll()
    return { ok: true, id: result.updated.id }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// RETURN / REJECT
// ---------------------------------------------------------------------------
export async function returnTransaction(id: string, reason: string): Promise<ActionResult> {
  try {
    const user = await requirePermission(await getCurrentUser(), PERMISSIONS.TRANSACTION_APPROVE)
    const txn = await prisma.transaction.findUnique({
      where: { id },
      select: {
        status: true,
        voucherNo: true,
        amount: true,
        memberId: true,
        memberSubmitted: true,
        paymentMethod: true,
      },
    })
    if (!txn) return { ok: false, error: "Transaction not found." }
    if (txn.status !== "PENDING_APPROVAL") {
      return { ok: false, error: `Only pending transactions can be returned (current: ${txn.status}).` }
    }
    if (!reason?.trim()) return { ok: false, error: "A return reason is required." }

    await prisma.transaction.update({
      where: { id },
      data: {
        status: "RETURNED",
        returnReason: reason.trim(),
        returnedBy: user.email,
        returnedById: user.id,
        returnedAt: new Date(),
      },
    })
    revalidateAll()

    // ── Member notification for returned deposit requests ──────────────────
    // When an admin returns a member-submitted deposit, the member must be
    // notified so they can edit + resubmit from their portal. Uses the
    // editable DEPOSIT_REQUEST_RETURNED(_SMS) templates; falls back to inline
    // copy if not seeded. Best-effort — never throws / never rolls back.
    if (txn.memberSubmitted && txn.memberId) {
      notifyMemberDepositRequestReturned({
        memberId: txn.memberId,
        amount: Number(txn.amount),
        voucherNo: txn.voucherNo,
        method: (txn.paymentMethod as string) ?? "",
        returnReason: reason.trim(),
        returnedBy: user.email,
      }).catch((e) =>
        console.error("[returnTransaction] member return-notification failed:", e)
      )
    }

    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Helper: notify a member that their deposit request was returned for
// correction. Sends in-app + SMS + Email using the editable
// DEPOSIT_REQUEST_RETURNED(_SMS) templates (falls back to inline copy).
// Best-effort — failures are logged but never throw.
// ───────────────────────────────────────────────────────────────────────────
async function notifyMemberDepositRequestReturned(input: {
  memberId: string
  amount: number
  voucherNo: string
  method: string
  returnReason: string
  returnedBy: string
}): Promise<void> {
  const { memberId, amount, voucherNo, returnReason } = input

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, fullName: true, phone: true, email: true },
  })
  if (!member) return

  // 1. In-app notification — always written.
  await prisma.memberNotification.create({
    data: {
      memberId: member.id,
      type: "DEPOSIT_REQUEST_RETURNED",
      title: "Deposit Request Returned for Correction",
      message: `Your deposit request of ৳${amount.toLocaleString()} (voucher ${voucherNo}) was returned for correction. Reason: ${returnReason}. Please edit and resubmit from your portal.`,
    },
  }).catch((e) => console.error("[notifyMemberDepositRequestReturned] in-app failed:", e))

  // Resolve templates (best-effort; null when not seeded).
  const { renderTemplate, fillTemplate } = await import("@/lib/templates")
  const tplVars = {
    memberName: member.fullName,
    amount: amount.toLocaleString(),
    voucherNo,
    returnReason,
  }
  const emailTpl = await renderTemplate("DEPOSIT_REQUEST_RETURNED", tplVars)
  const smsTpl = await renderTemplate("DEPOSIT_REQUEST_RETURNED_SMS", tplVars)

  // 2. SMS.
  if (member.phone) {
    const smsBody =
      smsTpl?.body ??
      fillTemplate(
        `Dear {{memberName}}, your deposit request ৳{{amount}} ({{voucherNo}}) was returned for correction. Please edit & resubmit in your portal. — Future Savings Foundation`,
        tplVars
      )
    try {
      const res = await sendSMS(member.phone, smsBody)
      if (res.status !== "OK") {
        await prisma.notification.create({
          data: {
            type: "SMS_ERROR",
            title: "Deposit-return SMS failed",
            message: `Failed to send deposit-return SMS to ${member.fullName} (${member.phone}). Reason: ${res.response ?? "Unknown"}`,
          },
        })
      }
    } catch (e) {
      console.error("[notifyMemberDepositRequestReturned] SMS failed:", e)
    }
  }

  // 3. Email.
  if (member.email) {
    const subject =
      emailTpl?.subject ??
      fillTemplate(`Action Needed: Deposit Request Returned — ৳{{amount}}`, tplVars)
    const html =
      emailTpl?.body ??
      `<p>Dear ${member.fullName},</p>` +
      `<p>Your deposit request of <strong>৳${amount.toLocaleString()}</strong> (voucher ${voucherNo}) was <strong>returned for correction</strong> by the admin.</p>` +
      `<p><strong>Reason:</strong> ${returnReason}</p>` +
      `<p>Please log in to your member portal, open <em>Deposit Request</em>, edit the highlighted fields, and resubmit. Your deposit will then go back into the admin approval queue.</p>` +
      `<p>Future Savings Foundation</p>`
    try {
      await sendEmail(member.email, subject, html)
    } catch (e) {
      console.error("[notifyMemberDepositRequestReturned] Email failed:", e)
      await prisma.notification.create({
        data: {
          type: "EMAIL_ERROR",
          title: "Deposit-return email failed",
          message: `Failed to send deposit-return email to ${member.fullName} (${member.email}). Reason: ${(e instanceof Error ? e.message : "") || "Unknown error"}`,
        },
      })
    }
  }
}

export async function rejectTransaction(id: string, reason: string): Promise<ActionResult> {
  try {
    const user = await requirePermission(await getCurrentUser(), PERMISSIONS.TRANSACTION_APPROVE)
    const txn = await prisma.transaction.findUnique({
      where: { id },
      select: { status: true },
    })
    if (!txn) return { ok: false, error: "Transaction not found." }
    if (txn.status !== "PENDING_APPROVAL") {
      return { ok: false, error: `Only pending transactions can be rejected (current: ${txn.status}).` }
    }
    if (!reason?.trim()) return { ok: false, error: "A rejection reason is required." }

    await prisma.transaction.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectionReason: reason.trim(),
        rejectedBy: user.email,
        rejectedById: user.id,
        rejectedAt: new Date(),
      },
    })
    // Reject the linked member request too, if any. Records the rejection
    // reason + reviewer so the member sees why on their portal My Requests
    // page. Fetch inside the same catch block so a missing MemberRequest
    // never masks the Transaction rejection that already succeeded.
    const linked = await prisma.transaction.findUnique({
      where: { id },
      select: { memberRequestId: true },
    })
    if (linked?.memberRequestId) {
      await prisma.memberRequest.update({
        where: { id: linked.memberRequestId },
        data: {
          status: "REJECTED",
          rejectionReason: reason.trim(),
          reviewedBy: user.email,
          reviewedAt: new Date(),
        },
      })
    }
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// REVERSE — APPROVED → REVERSED via a new reversal transaction.
// Approved transactions are immutable (spec §29): we post a reversing voucher
// with sign −1 and link both rows.
// ---------------------------------------------------------------------------
export async function reverseTransaction(id: string, reason: string): Promise<ActionResult> {
  try {
    const user = await requirePermission(await getCurrentUser(), PERMISSIONS.TRANSACTION_REVERSE)
    if (!reason?.trim()) return { ok: false, error: "A reversal reason is required." }

    // Use directPrisma for interactive transactions — see approveTransaction
    // for the rationale. The pooled client causes "Transaction not found" here
    // too because the callback holds the connection open across many queries.
    const result = await directPrisma.$transaction(
      async (tx) => {
      // B12: lock the original Transaction row so two concurrent reversals
      // can't both pass the "not yet reversed" check and post two reversing
      // vouchers. The first reversal commits with reversedById set; the
      // second sees that and bails.
      await lockRow(tx, "Transaction", id)
      const original = await tx.transaction.findUnique({ where: { id } })
      if (!original) throw new Error("Transaction not found.")
      if (original.status !== "APPROVED") {
        throw new Error(`Only approved transactions can be reversed (current: ${original.status}).`)
      }
      if (original.reversalOfId) {
        throw new Error("This is already a reversal transaction; it cannot be reversed again.")
      }
      if (original.reversedById) {
        throw new Error("This transaction has already been reversed.")
      }

      const voucherNo = await nextTransactionNo(tx, original.transactionType as TransactionType)

      // Create the reversal transaction record first (without posting links).
      const reversal = await tx.transaction.create({
        data: {
          voucherNo,
          transactionType: original.transactionType,
          subType: original.subType,
          chargeTypeName: original.chargeTypeName,
          category: original.category,
          memberId: original.memberId,
          amount: original.amount,
          paymentMethod: original.paymentMethod,
          cashAccountId: original.cashAccountId,
          referenceNo: original.referenceNo,
          breakdown: original.breakdown as Prisma.JsonObject | undefined,
          attachments: original.attachments as Prisma.InputJsonValue,
          remarks: `REVERSAL of ${original.voucherNo}: ${reason.trim()}`,
          status: "APPROVED", // a reversal is itself an approved, posted voucher
          approvalLevel: original.approvalLevel,
          reversalOfId: original.id,
          reversalReason: reason.trim(),
          memberSubmitted: false,
          createdBy: user.email,
          createdById: user.id,
          approvedBy: user.email,
          approvedById: user.id,
          approvedAt: new Date(),
          reversedByUser: user.email,
          reversedByUserId: user.id,
          reversedAt: new Date(),
        },
      })

      // Post the reversing voucher (sign −1 swaps debit/credit, negates mirror).
      const posting = await postTransactionEffects(tx, {
        transactionId: reversal.id,
        transactionType: original.transactionType as TransactionType,
        amount: Number(original.amount),
        memberId: original.memberId,
        cashAccountId: original.cashAccountId,
        referenceNo: original.referenceNo,
        narration: `REVERSAL — ${original.voucherNo}`,
        savingsType: savingsTypeFor(original.transactionType as TransactionType),
        savingsMethod: (original.paymentMethod as string) || "CASH",
        sign: -1,
      })

      // Link the reversal's posting, and mark the original as reversed.
      await tx.transaction.update({
        where: { id: reversal.id },
        data: {
          journalEntryId: posting.journalEntryId,
          savingsMirrorId: posting.savingsMirrorId,
        },
      })
      await tx.transaction.update({
        where: { id: original.id },
        data: {
          status: "REVERSED",
          reversedById: reversal.id,
        },
      })
      return { reversal, original }
      },
      { maxWait: 15_000, timeout: 30_000 }
    )

    // Non-blocking trust score + notification.
    if (result.original.memberId) {
      notifyMemberReversed(result.original, user).catch((e) =>
        console.error("[reverseTransaction] notifyMemberReversed failed:", e)
      )
    }

    revalidateAll()
    return { ok: true, id: result.reversal.id, voucherNo: result.reversal.voucherNo }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// BULK APPROVE — validates each independently; failures stay pending (spec §11)
// ---------------------------------------------------------------------------
export async function bulkApproveTransactions(ids: string[]): Promise<{
  approved: string[]
  failed: { id: string; error: string }[]
}> {
  const approved: string[] = []
  const failed: { id: string; error: string }[] = []
  for (const id of ids) {
    const r = await approveTransaction(id)
    if (r.ok) approved.push(id)
    else failed.push({ id, error: r.error })
  }
  return { approved, failed }
}

// ---------------------------------------------------------------------------
// DELETE — only DRAFTs (approved are immutable, spec §29)
// ---------------------------------------------------------------------------
export async function deleteTransaction(id: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: "You must be signed in." }
    const txn = await prisma.transaction.findUnique({
      where: { id },
      select: { status: true, createdById: true },
    })
    if (!txn) return { ok: false, error: "Transaction not found." }
    if (txn.status !== "DRAFT") {
      return {
        ok: false,
        error:
          "Only draft transactions can be deleted. Approved transactions must be reversed.",
      }
    }
    // Makers can delete their own drafts; super admin can delete any.
    if (txn.createdById !== user.id && !isSuperAdmin(user)) {
      return { ok: false, error: "You can only delete your own draft transactions." }
    }
    await prisma.transaction.delete({ where: { id } })
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// READ — audit trail / detail fetcher
// ---------------------------------------------------------------------------
export async function getTransactionAuditTrail(id: string) {
  const txn = await prisma.transaction.findUnique({
    where: { id },
    include: {
      member: { select: { id: true, memberNo: true, fullName: true, phone: true } },
      cashAccount: { select: { id: true, accountName: true, accountCode: true } },
      journalEntry: {
        include: {
          lines: { include: { account: { select: { accountName: true, accountCode: true } } } },
        },
      },
      memberRequest: { select: { id: true, type: true, reason: true } },
      reversalOf: { select: { id: true, voucherNo: true } },
      reversedBy: { select: { id: true, voucherNo: true } },
    },
  })
  return txn
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function trustEventForType(
  type: TransactionType
): "DEPOSIT_COLLECTED" | "FINE_ISSUED" | null {
  switch (type) {
    case "DEPOSIT":
      return "DEPOSIT_COLLECTED"
    case "CHARGE":
      return "FINE_ISSUED"
    default:
      return null
  }
}

async function notifyMember(
  txn: { id: string; memberId: string | null; transactionType: string; amount: Prisma.Decimal; voucherNo: string },
  _user: CurrentUser
): Promise<void> {
  if (!txn.memberId) return
  const template = notificationTemplateFor(txn.transactionType)
  if (!template) return

  const amount = Number(txn.amount)
  const messageBody = template.message(amount, txn.voucherNo)

  // 1. In-app notification (always written).
  await prisma.memberNotification.create({
    data: {
      memberId: txn.memberId,
      type: "TRANSACTION_APPROVED",
      title: template.title,
      message: messageBody,
    },
  })

  // 2. Fetch the member's contact channels for SMS / Email delivery.
  const member = await prisma.member.findUnique({
    where: { id: txn.memberId },
    select: { fullName: true, phone: true, email: true },
  })
  if (!member) return

  // 3. SMS — short plain-text message.
  if (member.phone) {
    const smsMsg = `${template.title}: ${messageBody} - Future Savings Foundation`
    try {
      const res = await sendSMS(member.phone, smsMsg)
      if (res.status !== "OK") {
        await prisma.notification.create({
          data: {
            type: "SMS_ERROR",
            title: "Transaction SMS Failed",
            message: `Failed to send ${txn.transactionType} SMS to ${member.fullName} (${member.phone}). Reason: ${res.response ?? "Unknown"}`,
          },
        })
      }
    } catch (e) {
      console.error("[notifyMember] SMS send failed:", e)
    }
  }

  // 4. Email — richer HTML body. For deposit/withdrawal approvals, the email
  //    includes a link to the member-portal printable receipt page
  //    (`/portal/receipts/[transactionId]`) so the member sees the EXACT SAME
  //    HTML receipt they'd see in the portal — no pdfkit attachment that would
  //    look different from the on-screen / Print-Save-as-PDF version.
  if (member.email) {
    const canLinkReceipt =
      txn.transactionType === "DEPOSIT" || txn.transactionType === "WITHDRAWAL"

    // Build the full URL to the portal receipt page.
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const receiptUrl = canLinkReceipt
      ? `${baseUrl}/portal/receipts/${txn.id}`
      : null

    try {
      await sendEmail(
        member.email,
        template.title,
        `
          <p>Dear ${member.fullName},</p>
          <p><strong>${template.title}.</strong></p>
          <p>${messageBody}</p>
          ${receiptUrl ? `
            <p style="margin-top:16px">
              <a href="${receiptUrl}" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
                View Money Receipt
              </a>
            </p>
            <p style="color:#64748b;font-size:13px;margin-top:8px">
              Click the button above to view your money receipt. You can print it or save it as a PDF
              using your browser's print dialog — it will look exactly like the receipt you see in your member portal.
            </p>
          ` : ""}
          <p style="color:#64748b;font-size:13px;margin-top:16px">
            This is an automated message from Future Savings Foundation. Please do not reply.
          </p>
        `,
      )
    } catch (emailError) {
      await prisma.notification.create({
        data: {
          type: "EMAIL_ERROR",
          title: "Transaction Email Failed",
          message: `Failed to send ${txn.transactionType} email to ${member.fullName} (${member.email}). Reason: ${(emailError instanceof Error ? emailError.message : "") || "Unknown error"}`,
        },
      })
    }
  }
}

async function notifyMemberReversed(
  txn: { id: string; memberId: string | null; voucherNo: string },
  _user: CurrentUser
): Promise<void> {
  if (!txn.memberId) return
  const title = "Transaction Reversed"
  const messageBody = `Transaction ${txn.voucherNo} has been reversed. Please contact the Somiti office if you have questions.`

  // 1. In-app notification.
  await prisma.memberNotification.create({
    data: {
      memberId: txn.memberId,
      type: "TRANSACTION_REVERSED",
      title,
      message: messageBody,
    },
  })

  // 2. SMS / Email delivery.
  const member = await prisma.member.findUnique({
    where: { id: txn.memberId },
    select: { fullName: true, phone: true, email: true },
  })
  if (!member) return

  if (member.phone) {
    try {
      const res = await sendSMS(member.phone, `${title}: ${messageBody} - Future Savings Foundation`)
      if (res.status !== "OK") {
        await prisma.notification.create({
          data: {
            type: "SMS_ERROR",
            title: "Reversal SMS Failed",
            message: `Failed to send reversal SMS to ${member.fullName} (${member.phone}). Reason: ${res.response ?? "Unknown"}`,
          },
        })
      }
    } catch (e) {
      console.error("[notifyMemberReversed] SMS send failed:", e)
    }
  }

  if (member.email) {
    try {
      await sendEmail(
        member.email,
        title,
        `
          <p>Dear ${member.fullName},</p>
          <p><strong>${title}.</strong></p>
          <p>${messageBody}</p>
          <p style="color:#64748b;font-size:13px;margin-top:16px">
            This is an automated message from Future Savings Foundation. Please do not reply.
          </p>
        `
      )
    } catch (emailError) {
      await prisma.notification.create({
        data: {
          type: "EMAIL_ERROR",
          title: "Reversal Email Failed",
          message: `Failed to send reversal email to ${member.fullName} (${member.email}). Reason: ${(emailError instanceof Error ? emailError.message : "") || "Unknown error"}`,
        },
      })
    }
  }
}

function notificationTemplateFor(type: string): {
  title: string
  message: (amount: number, voucherNo: string) => string
} | null {
  switch (type) {
    case "DEPOSIT":
      return {
        title: "Deposit Successful",
        message: (a, v) =>
          `Your deposit of ৳${a.toLocaleString()} has been credited. Voucher ${v}.`,
      }
    case "WITHDRAWAL":
      return {
        title: "Withdrawal Approved",
        message: (a, v) =>
          `Your withdrawal of ৳${a.toLocaleString()} has been approved. Voucher ${v}.`,
      }
    case "CHARGE":
      return {
        title: "Charges Deducted",
        message: (a, v) =>
          `A charge of ৳${a.toLocaleString()} has been applied. Voucher ${v}.`,
      }
    case "INCOME_DISTRIBUTION":
      return {
        title: "Profit Credited",
        message: (a, v) =>
          `Profit of ৳${a.toLocaleString()} has been credited to your savings. Voucher ${v}.`,
      }
    default:
      return null
  }
}
