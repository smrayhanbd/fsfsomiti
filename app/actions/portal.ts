"use server"

import prisma, { directPrisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"
import { Prisma, Gender, MaritalStatus, BloodGroup } from "@prisma/client"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { generateSchedule, expectedCloseFromSchedule, type InterestType, type RepaymentFreq } from "@/lib/loanSchedule"
import { uploadImage } from "@/lib/cloudinary"
import { spawnTask } from "@/lib/tasks/spawn"
import { createAdminNotification } from "@/app/actions/notifications"
import {
  getCurrentUser,
  requirePermission,
  PERMISSIONS,
} from "@/lib/permissions"

export interface PortalNotificationItem {
  id: string
  type: "due" | "meeting" | "request" | "info"
  title: string
  message: string
  href?: string
  createdAt?: string
}

// ──────────────────────────────────────────────────────────────────────────────
// IDOR guard — derive memberId from the authenticated session, never from
// the request body. Mirrors the proven pattern in app/actions/elections.ts
// (getCurrentMemberId at lines 88-98). The session.user.id IS the memberId
// for member logins (see lib/auth.ts: returns id: memberAccount.memberId).
//
// NOTE: a `getCurrentMemberId()` helper is already defined later in this file
// (in the Nominee Self-Service section) — it's reused here, no duplicate.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * IDOR guard. Returns the session-derived memberId. Throws (or returns
 * `unauthorizedResult` if provided) when the caller-supplied memberId
 * doesn't match the session.
 *
 * Usage:
 *   const m = await assertMemberId(memberId)
 *   // then use `m` everywhere `memberId` was used.
 */
async function assertMemberId(
  memberId: string | undefined | null
): Promise<string> {
  const sessionMemberId = await getCurrentMemberId()
  if (memberId && memberId !== sessionMemberId) {
    throw new Error("Unauthorized: session does not match requested member.")
  }
  return sessionMemberId
}

// Generate the next sequential loan number like L0001.
// NOTE: H8 fix — applyMemberLoan now uses the Counter-table pattern (see
// lib/transactions/voucher.ts) for atomic, race-free loan numbering, inside
// a $transaction. The legacy `count+1` helper below is retained for any
// future call sites that explicitly opt out of transactional safety; today
// it has no in-file callers. eslint may flag it as unused — that's expected.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function nextLoanNo(): Promise<string> {
  const count = await prisma.loan.count()
  return `L${String(count + 1).padStart(4, "0")}`
}

export async function changePassword(memberId: string, formData: FormData) {
  // IDOR guard (S4): never trust the client-supplied memberId — derive it
  // from the authenticated session. If a member tries to act on a different
  // memberId, return Unauthorized.
  let effectiveMemberId: string
  try {
    effectiveMemberId = await assertMemberId(memberId)
  } catch (e) {
    return { error: (e as Error).message }
  }

  const currentPassword = formData.get("currentPassword") as string
  const newPassword = formData.get("newPassword") as string

  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return { error: "New password must be at least 6 characters long." }
  }

  const account = await prisma.memberAccount.findFirst({ where: { memberId: effectiveMemberId } })

  if (!account) {
    return { error: "Account not found." }
  }

  const passwordMatch = await bcrypt.compare(currentPassword, account.passwordHash)
  if (!passwordMatch) {
    return { error: "Your current password is incorrect." }
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10)

  await prisma.memberAccount.update({
    where: { id: account.id },
    data: { passwordHash: hashedPassword },
  })

  revalidatePath("/portal/settings")
  return { success: "Password updated successfully!" }
}

export async function submitWithdrawalRequest(memberId: string, formData: FormData) {
  // IDOR guard (S4): derive memberId from the session.
  let memberIdResolved: string
  try {
    memberIdResolved = await assertMemberId(memberId)
  } catch (e) {
    return { error: (e as Error).message }
  }
  memberId = memberIdResolved

  const amount = parseFloat(formData.get("amount") as string)
  // Payment method — must be a valid Prisma PaymentMethod enum value
  // (BANK_TRANSFER / CHEQUE per spec §7). The form sends these directly.
  const method = (formData.get("method") as string) || null
  // Withdrawal type — stored in breakdown.withdrawalType for the audit trail.
  // Mirrors the admin WithdrawalForm's WithdrawalType field.
  const withdrawalType = (formData.get("withdrawalType") as string) || "SAVINGS"
  // Reason — stored in remarks (same column the admin form uses).
  const reason = ((formData.get("reason") as string) || "").trim() || null

  if (!amount || amount <= 0) {
    return { error: "Please enter a valid amount." }
  }

  // ── Validate the member + their withdrawable balance ──────────────────
  // Mirrors the check in approveTransaction §4: a member can't withdraw more
  // than their current savings balance. We check here (at submission time)
  // so the member gets immediate feedback rather than waiting for admin
  // approval to fail.
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      memberNo: true,
      fullName: true,
      phone: true,
      email: true,
      status: true,
      savings: { select: { type: true, amount: true } },
    },
  })
  if (!member) return { error: "Member not found." }

  const blockedStatuses = ["SUSPENDED", "CLOSED", "REJECTED", "DECEASED"]
  if (blockedStatuses.includes(member.status)) {
    return { error: `Your membership is ${member.status}. Please contact management.` }
  }

  const totalDeposit = member.savings
    .filter((s) => s.type !== "WITHDRAWAL")
    .reduce((acc, s) => acc + Number(s.amount), 0)
  const totalWithdrawal = member.savings
    .filter((s) => s.type === "WITHDRAWAL")
    .reduce((acc, s) => acc + Number(s.amount), 0)
  const currentBalance = totalDeposit - totalWithdrawal
  if (amount > currentBalance) {
    return {
      error: `Withdrawal amount cannot exceed your current balance of ৳ ${currentBalance.toLocaleString()}.`,
    }
  }

  // ── Resolve the chart-of-accounts (cashAccountId) for the chosen payment
  // method. Same default-COA resolver used by the admin Withdrawal form and
  // the deposit-request flow. If no default COA is configured for the method,
  // we still create the request + transaction but leave cashAccountId null —
  // the admin will need to set it before approval (approveTransaction throws
  // a clear error if null).
  let coaAccountId: string | null = null
  if (method) {
    const { getDefaultCoaForMethod } = await import("@/lib/transactions/bankAccounts")
    const coa = await getDefaultCoaForMethod(
      // The form only sends BANK_TRANSFER or CHEQUE (per spec §7), both
      // valid PaymentMethod enum values.
      method as "BANK_TRANSFER" | "CHEQUE"
    )
    coaAccountId = coa.coaAccountId
  }

  // ── Atomic create: MemberRequest + linked pending Transaction ──────────
  // Both rows are written inside a single prisma.$transaction so a failure
  // in either rolls the whole submission back. This mirrors the
  // submitDepositRequest pattern — the linked Transaction lets the existing
  // approveTransaction flow do all the heavy lifting on admin approval:
  //   - postTransactionEffects() debits the member's savings balance
  //     (Dr MEMBER-SAVINGS-LIABILITY, Cr Cash/Bank)
  //   - notifyMember() sends the money-receipt link email + SMS
  //   - the linked MemberRequest is auto-marked APPROVED
  const { nextTransactionNo } = await import("@/lib/transactions/voucher")
  const { loadApprovalLimits, resolveLevelForAmount } = await import("@/lib/transactions/validation")

  const result = await directPrisma.$transaction(async (tx) => {
    // B16: Block if there's already a pending PENDING_APPROVAL withdrawal for
    // this member. This prevents a member from stacking multiple pending
    // withdrawals that together exceed their balance (the balance check above
    // only sees the current committed balance, not other pending withdrawals).
    const conflicting = await tx.transaction.findFirst({
      where: {
        memberId,
        transactionType: "WITHDRAWAL",
        status: "PENDING_APPROVAL",
      },
      select: { voucherNo: true, id: true },
    })
    if (conflicting) {
      throw new Error(
        `You already have a pending withdrawal (${conflicting.voucherNo}). Please wait for it to be reviewed before submitting another.`
      )
    }

    // a) MemberRequest (portal-facing row — what the member sees in "My Requests")
    const request = await tx.memberRequest.create({
      data: {
        memberId,
        type: "WITHDRAWAL",
        amount,
        method,
        // Store the reason as notes so it shows up in the member's "My Requests"
        // list. The Transaction.remarks column carries the same text for the
        // admin's audit trail.
        notes: reason,
        // Store the withdrawal type in breakdown so the admin can see it on
        // the approval page (same JSON shape as the admin WithdrawalForm).
        breakdown: { withdrawalType } as unknown as Prisma.InputJsonValue,
        status: "PENDING",
      },
      select: { id: true },
    })

    // b) Transaction — the engine row. PENDING_APPROVAL so it shows up in the
    // admin Transaction Approvals queue. The approval tier is resolved by
    // amount using the same ApprovalLimit table the admin submit flow uses.
    const voucherNo = await nextTransactionNo(tx, "WITHDRAWAL")
    const limits = await loadApprovalLimits()
    const approvalLevel = resolveLevelForAmount(amount, limits)

    const txn = await tx.transaction.create({
      data: {
        voucherNo,
        transactionType: "WITHDRAWAL",
        subType: "SAVINGS_DEPOSIT",
        category: "MEMBER",
        memberId,
        amount,
        // Cast to the Prisma PaymentMethod enum. The form only sends
        // BANK_TRANSFER or CHEQUE (per spec §7), both valid enum values.
        paymentMethod: method as "BANK_TRANSFER" | "CHEQUE",
        cashAccountId: coaAccountId,
        remarks: reason,
        // Store the withdrawal type in breakdown — same JSON shape as the
        // admin WithdrawalForm so the admin approval page renders it
        // identically.
        breakdown: { withdrawalType } as unknown as Prisma.JsonObject,
        transactionDate: new Date(),
        status: "PENDING_APPROVAL",
        approvalLevel,
        memberSubmitted: true,
        memberRequestId: request.id,
        // Audit — member is the "maker". Use a sentinel so the Maker-Checker
        // rule (createdById === approving admin id) never matches.
        createdBy: `MEMBER:${member.memberNo}`,
        createdById: `MEMBER_PORTAL::${memberId}`,
        submittedBy: `MEMBER:${member.memberNo}`,
        submittedById: `MEMBER_PORTAL::${memberId}`,
        submittedAt: new Date(),
      },
      select: { id: true, voucherNo: true },
    })

    return { request, txn }
  })

  // ── Side-effects (best-effort, non-throwing) ────────────────────────────
  // Notify admins + auto-spawn a review task. Both are best-effort.
  await createAdminNotification({
    type: "MEMBER_REQUEST",
    title: "New withdrawal request",
    message: `${member.fullName} (${member.memberNo}) requested a ${method ?? ""} withdrawal of ৳ ${amount.toLocaleString()}.${reason ? ` Reason: ${reason}` : ""}`,
    link: `/dashboard/transactions/${result.txn.id}`,
  }).catch(() => undefined)

  await spawnTask({
    title: `Review withdrawal request: ৳${amount.toLocaleString()} from ${member.fullName}`,
    description: `Member ${member.memberNo} submitted a ${withdrawalType} withdrawal request of ৳${amount.toLocaleString()} via ${method}.${reason ? ` Reason: ${reason}` : ""} Open the linked transaction to review and approve or reject.`,
    priority: "HIGH",
    dueInDays: 2,
    memberRequestId: result.request.id,
    relatedMemberId: memberId,
    transactionId: result.txn.id,
    createdByLabel: "MEMBER_REQUEST_SYSTEM",
  }).catch(() => undefined)

  // The withdrawal form now lives on its own page (used to be a dialog on
  // /portal/savings) — redirect back there so the member sees the new request
  // in the recent-requests feed.
  revalidatePath("/portal/withdrawal-request")
  redirect("/portal/withdrawal-request")
}

// =====================================================================
// DEPOSIT REQUEST (member portal -> admin approval -> auto-credit)
// =====================================================================
// When a member deposits money to the Somiti account (cash/bank/mobile),
// they submit a deposit request from their portal with the deposit slip or
// transaction document attached as proof. This creates:
//
//   1. A MemberRequest row (type="DEPOSIT") carrying the slip URL + metadata
//      so the member can track it under "My Requests" and the admin can see
//      the proof on the approval page.
//   2. A Transaction row in PENDING_APPROVAL status with memberSubmitted=true
//      and memberRequestId linked. This lets the existing approveTransaction
//      flow do all the heavy lifting on admin approval:
//        - postTransactionEffects() credits the member's deposit balance
//          (Dr Cash/Bank, Cr MEMBER-SAVINGS-LIABILITY)
//        - notifyMember() generates the money-receipt PDF and emails/SMS the
//          member (same code path as a direct admin deposit entry)
//        - the linked MemberRequest is auto-marked APPROVED
//
// The Transaction's createdById is set to a sentinel ("MEMBER_PORTAL::" +
// memberId) so the Maker-Checker rule in approveTransaction (which compares
// createdById === approving admin's id) never blocks the approval.
//
// The COA (cashAccountId) is auto-resolved from the member's chosen payment
// method using the same default-COA resolver the admin Deposit form uses,
// so the member doesn't need to know the chart-of-accounts.
// =====================================================================
const DEPOSIT_SLIP_MAX_BYTES = 10 * 1024 * 1024 // 10 MB — matches lib/upload.ts
const ALLOWED_SLIP_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
])

export async function submitDepositRequest(
  memberId: string,
  formData: FormData
): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  try {
    // IDOR guard (S4): derive memberId from the session.
    let memberIdResolved: string
    try {
      memberIdResolved = await assertMemberId(memberId)
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
    memberId = memberIdResolved

    // ── 1. Parse + validate input ──────────────────────────────────────────
    const amount = parseFloat(formData.get("amount") as string)
    const method = (formData.get("method") as string) || null
    const collectionTypeId = (formData.get("collectionTypeId") as string) || null
    const referenceNo = ((formData.get("referenceNo") as string) || "").trim() || null
    const transactionDateStr = (formData.get("transactionDate") as string) || null
    const notes = ((formData.get("notes") as string) || "").trim() || null
    const slipFile = formData.get("slip") as File | null

    if (!amount || amount <= 0) {
      return { ok: false, error: "Please enter a valid deposit amount." }
    }
    if (amount > 100_000_000) {
      return { ok: false, error: "Deposit amount is unreasonably large." }
    }
    if (!method) {
      return { ok: false, error: "Please select a payment method." }
    }
    if (!slipFile || slipFile.size === 0) {
      return { ok: false, error: "Please attach the deposit slip / transaction document as proof." }
    }
    if (slipFile.size > DEPOSIT_SLIP_MAX_BYTES) {
      return { ok: false, error: "Deposit slip file is too large. Maximum size is 10 MB." }
    }
    // Allow common document/image types. If the browser didn't send a MIME
    // we accept based on extension so mobile browsers that mislabel files
    // don't get blocked.
    // M8 fix: invert the check so a bad extension OR a bad MIME is rejected.
    // The old `&& !extOk` logic let an attacker pass any extension as long as
    // the (attacker-controlled) MIME header didn't match a known bad set.
    const ext = slipFile.name.toLowerCase().split(".").pop() ?? ""
    const extOk = ["pdf", "png", "jpg", "jpeg", "webp", "gif"].includes(ext)
    if (!extOk || (slipFile.type && !ALLOWED_SLIP_TYPES.has(slipFile.type))) {
      return { ok: false, error: "Unsupported file type. Allowed: PDF, PNG, JPG, WEBP, GIF." }
    }

    // ── 2. Resolve the member + their organization ─────────────────────────
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, memberNo: true, fullName: true, phone: true, email: true, status: true },
    })
    if (!member) return { ok: false, error: "Member not found." }
    if (member.status === "SUSPENDED" || member.status === "CLOSED" || member.status === "REJECTED") {
      return { ok: false, error: `Your membership is ${member.status}. Please contact management.` }
    }

    // ── 3. Persist the slip to disk (public/uploads/deposit-slips/<uuid>.<ext>)
    // We use the same saveUploadedFile() helper the rest of the app uses for
    // task attachments etc. — it returns a web-accessible URL we can store
    // on both the MemberRequest and the Transaction.
    const { saveUploadedFile } = await import("@/lib/upload")
    const saved = await saveUploadedFile(slipFile, "deposit-slips")
    const slipAttachment = {
      type: "Deposit Slip",
      name: saved.fileName,
      url: saved.url,
    }

    // ── 4. Resolve the chart-of-accounts (cashAccountId) for the chosen
    // payment method. This is the same default-COA resolver used by the
    // admin Deposit form — if the Somiti hasn't configured a default bank
    // account for the method, we still create the request but leave
    // cashAccountId null, and the admin will need to set it before approval
    // (the approveTransaction action will throw a clear error if null).
    const { getDefaultCoaForMethod } = await import("@/lib/transactions/bankAccounts")
    const coa = await getDefaultCoaForMethod(method as "CASH" | "BANK_TRANSFER" | "CHEQUE" | "BKASH" | "NAGAD" | "ROCKET")
    if (coa.missing) {
      // Soft-fail: still create the MemberRequest + Transaction, but the admin
      // will see a warning on the approval page and must either configure a
      // default COA in Somiti Settings or pick one manually on the txn.
      // (The Transaction detail page already supports editing cashAccountId
      // for DRAFT/RETURNED txns; for PENDING_APPROVAL the admin can return
      // it for correction.)
    }

    // ── 5. Resolve the collection type name (if any) for the breakdown ────
    let collectionTypeName: string | null = null
    if (collectionTypeId) {
      const ct = await prisma.chargeType.findUnique({
        where: { id: collectionTypeId },
        select: { name: true },
      })
      collectionTypeName = ct?.name ?? null
    }

    // ── 6. Atomic create: MemberRequest + linked pending Transaction ──────
    // Both rows are written inside a single prisma.$transaction so a failure
    // in either rolls the whole submission back — no orphan requests or
    // orphan transactions.
    const { nextTransactionNo } = await import("@/lib/transactions/voucher")
    const { loadApprovalLimits, resolveLevelForAmount } = await import("@/lib/transactions/validation")

    const result = await directPrisma.$transaction(async (tx) => {
      // a) MemberRequest (portal-facing row — what the member sees in "My Requests")
      const request = await tx.memberRequest.create({
        data: {
          memberId,
          type: "DEPOSIT",
          amount,
          method,
          notes,
          status: "PENDING",
          attachments: [slipAttachment] as unknown as Prisma.InputJsonValue,
          breakdown: collectionTypeId
            ? ({ collectionTypeId, collectionTypeName } as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          referenceNo,
          transactionDate: transactionDateStr ? new Date(transactionDateStr) : null,
        },
        select: { id: true },
      })

      // b) Transaction — the engine row. PENDING_APPROVAL skips the DRAFT
      // step because the member is "submitting" it directly. The approval
      // tier is resolved by amount using the same ApprovalLimit table the
      // admin submit flow uses, so high-value member deposits still require
      // the right tier of admin to approve.
      const voucherNo = await nextTransactionNo(tx, "DEPOSIT")
      const limits = await loadApprovalLimits()
      const approvalLevel = resolveLevelForAmount(amount, limits)

      const txn = await tx.transaction.create({
        data: {
          voucherNo,
          transactionType: "DEPOSIT",
          subType: "SAVINGS_DEPOSIT",
          category: "MEMBER",
          memberId,
          amount,
          paymentMethod: method as "CASH" | "BANK_TRANSFER" | "CHEQUE" | "BKASH" | "NAGAD" | "ROCKET",
          cashAccountId: coa.coaAccountId,
          referenceNo,
          breakdown: collectionTypeId
            ? ({ collectionTypeId, collectionTypeName } as unknown as Prisma.JsonObject)
            : Prisma.JsonNull,
          attachments: [slipAttachment] as unknown as Prisma.InputJsonValue,
          remarks: notes,
          transactionDate: transactionDateStr ? new Date(transactionDateStr) : new Date(),
          status: "PENDING_APPROVAL",
          approvalLevel,
          memberSubmitted: true,
          memberRequestId: request.id,
          // Audit — member is the "maker". Use a sentinel so the Maker-Checker
          // rule (createdById === approving admin id) never matches.
          createdBy: `MEMBER:${member.memberNo}`,
          createdById: `MEMBER_PORTAL::${memberId}`,
          submittedBy: `MEMBER:${member.memberNo}`,
          submittedById: `MEMBER_PORTAL::${memberId}`,
          submittedAt: new Date(),
        },
        select: { id: true, voucherNo: true },
      })

      return { request, txn }
    })

    // ── 7. Side-effects (best-effort, non-throwing) ────────────────────────
    // Notify admins + auto-spawn a review task so the deposit request isn't
    // missed. Both are best-effort: a failure here must never roll back the
    // submission the member already saw succeed.
    await createAdminNotification({
      type: "MEMBER_REQUEST",
      title: "New deposit request",
      message: `${member.fullName} (${member.memberNo}) requested a deposit of ৳ ${amount.toLocaleString()} via ${method}. Review the attached slip and approve to credit the balance.`,
      link: `/dashboard/transactions/${result.txn.id}`,
    }).catch(() => undefined)

    await spawnTask({
      title: `Review deposit request: ৳${amount.toLocaleString()} from ${member.fullName}`,
      description: `Member ${member.memberNo} submitted a deposit request of ৳${amount.toLocaleString()} via ${method}.${referenceNo ? ` Reference: ${referenceNo}.` : ""}${notes ? ` Notes: ${notes}` : ""} Open the linked transaction to view the deposit slip and approve or reject.`,
      priority: "HIGH",
      dueInDays: 2,
      memberRequestId: result.request.id,
      relatedMemberId: memberId,
      transactionId: result.txn.id,
      createdByLabel: "MEMBER_REQUEST_SYSTEM",
    }).catch(() => undefined)

    // ── 8. Member confirmation (best-effort, non-throwing) ─────────────────
    // Send the member an immediate SMS + Email confirming their deposit request
    // was received and is pending admin approval. Uses the editable
    // DEPOSIT_REQUEST_RECEIVED / DEPOSIT_REQUEST_RECEIVED_SMS templates; falls
    // back to inline copy if the templates haven't been seeded yet. Failures
    // are logged as in-app MemberNotification rows + admin Notification rows
    // so the member is never left uninformed without the admin noticing.
    await notifyMemberDepositRequestReceived({
      member,
      amount,
      method: method as string,
      referenceNo,
      transactionDateStr,
      voucherNo: result.txn.voucherNo,
    }).catch((e) =>
      console.error("[submitDepositRequest] member confirmation failed:", e)
    )

    revalidatePath("/portal/deposit-request")
    revalidatePath("/portal/requests")
    revalidatePath("/dashboard/transaction-approvals")
    revalidatePath("/dashboard/transactions")

    return { ok: true, requestId: result.request.id }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Helper: send the member an SMS + Email confirming their deposit request
// was received. Best-effort — failures are logged but never throw.
//
// Uses the DEPOSIT_REQUEST_RECEIVED(_SMS) templates if seeded; otherwise falls
// back to inline copy. Always writes an in-app MemberNotification row so the
// member sees the confirmation in their portal notification feed regardless
// of whether SMS/Email delivery succeeded.
// ───────────────────────────────────────────────────────────────────────────
async function notifyMemberDepositRequestReceived(input: {
  member: { id: string; memberNo: string; fullName: string; phone: string | null; email: string | null }
  amount: number
  method: string
  referenceNo: string | null
  transactionDateStr: string | null
  voucherNo: string
}): Promise<void> {
  const { member, amount, method, referenceNo, transactionDateStr, voucherNo } = input

  // 1. In-app notification — always written.
  await prisma.memberNotification.create({
    data: {
      memberId: member.id,
      type: "DEPOSIT_REQUEST_RECEIVED",
      title: "Deposit Request Received",
      message: `Your deposit request of ৳${amount.toLocaleString()} via ${method} (voucher ${voucherNo}) is pending admin approval. You'll be notified once it's reviewed.`,
    },
  }).catch((e) => console.error("[notifyMemberDepositRequestReceived] in-app failed:", e))

  // Resolve the templates (best-effort; null when not seeded).
  const { renderTemplate, fillTemplate } = await import("@/lib/templates")
  const methodLabel = PAYMENT_METHOD_LABEL_FOR_TEMPLATE[method] ?? method
  const txnDateLabel = transactionDateStr
    ? new Date(transactionDateStr).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })
    : "—"
  const referenceNoLi = referenceNo ? `<li>Reference No: ${referenceNo}</li>` : ""
  const tplVars = {
    memberName: member.fullName,
    amount: amount.toLocaleString(),
    method: methodLabel,
    referenceNo: referenceNo ?? "",
    transactionDate: txnDateLabel,
    voucherNo,
  }

  const emailTpl = await renderTemplate("DEPOSIT_REQUEST_RECEIVED", tplVars)
  const smsTpl = await renderTemplate("DEPOSIT_REQUEST_RECEIVED_SMS", tplVars)

  // 2. SMS — short plain-text confirmation.
  if (member.phone) {
    const smsBody =
      smsTpl?.body ??
      fillTemplate(
        `Dear {{memberName}}, deposit request of ৳{{amount}} via {{method}} received. Voucher {{voucherNo}}. Pending admin approval. — Future Savings Foundation`,
        tplVars
      )
    try {
      const { sendSMS } = await import("@/lib/sms")
      const res = await sendSMS(member.phone, smsBody)
      if (res.status !== "OK") {
        await prisma.notification.create({
          data: {
            type: "SMS_ERROR",
            title: "Deposit-request confirmation SMS failed",
            message: `Failed to send deposit-request confirmation SMS to ${member.fullName} (${member.phone}). Reason: ${res.response ?? "Unknown"}`,
          },
        }).catch(() => undefined)
      }
    } catch (e) {
      console.error("[notifyMemberDepositRequestReceived] SMS failed:", e)
    }
  }

  // 3. Email — richer HTML body.
  if (member.email) {
    const subject =
      emailTpl?.subject ??
      fillTemplate(`Deposit Request Received — ৳{{amount}} (pending approval)`, tplVars)
    const html =
      emailTpl?.body ??
      `<p>Dear ${member.fullName},</p>` +
      `<p>We've received your deposit request of <strong>৳${amount.toLocaleString()}</strong> via ${methodLabel}.</p>` +
      `<p>Your request is now <strong>pending admin approval</strong>. Once approved, the amount will be credited to your deposit balance and a money receipt will be generated automatically.</p>` +
      `<p><strong>Request details:</strong></p><ul><li>Voucher No: ${voucherNo}</li><li>Method: ${methodLabel}</li><li>Deposit Date: ${txnDateLabel}</li>${referenceNoLi}</ul>` +
      `<p>You can track the status from your portal under <em>My Requests → Deposits</em>.</p>` +
      `<p>Future Savings Foundation</p>`
    try {
      const { sendEmail } = await import("@/lib/email")
      await sendEmail(member.email, subject, html)
    } catch (e) {
      console.error("[notifyMemberDepositRequestReceived] Email failed:", e)
      await prisma.notification.create({
        data: {
          type: "EMAIL_ERROR",
          title: "Deposit-request confirmation email failed",
          message: `Failed to send deposit-request confirmation email to ${member.fullName} (${member.email}). Reason: ${(e instanceof Error ? e.message : "") || "Unknown error"}`,
        },
      }).catch(() => undefined)
    }
  }
}

// Payment-method label map used by the confirmation helper above. Kept local
// to avoid a circular import with the client-safe types module.
const PAYMENT_METHOD_LABEL_FOR_TEMPLATE: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket",
}

// =====================================================================
// RESUBMIT DEPOSIT REQUEST — "Returned for correction" path.
// =====================================================================
// When an admin returns a member-submitted deposit transaction (status
// RETURNED + returnReason), the member can edit the fields and resubmit
// from their portal. This action:
//
//   1. Validates the linked Transaction is in RETURNED state and was
//      originally member-submitted (so admins can't accidentally resubmit
//      admin-created drafts through the portal).
//   2. Validates the new amount / slip / etc. exactly like the initial
//      submission.
//   3. Optionally uploads a NEW slip file (replacing the old URL). If no
//      new file is provided, the original slip is kept.
//   4. Updates BOTH the MemberRequest and the linked Transaction inside a
//      single prisma.$transaction — atomic, no orphans.
//   5. Sets the Transaction back to PENDING_APPROVAL, re-resolves the
//      approval tier (in case the amount changed), clears the return
//      reason, and bumps the submittedAt timestamp.
//   6. Sends the same "Deposit Request Received" confirmation to the member
//      so they get a fresh voucherNo-less receipt (the voucherNo stays the
//      same since we're updating the same Transaction row).
// =====================================================================
export async function resubmitDepositRequest(
  memberId: string,
  requestId: string,
  formData: FormData
): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  try {
    // IDOR guard (S4): derive memberId from the session.
    let memberIdResolved: string
    try {
      memberIdResolved = await assertMemberId(memberId)
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
    memberId = memberIdResolved

    // ── 1. Parse + validate input (same rules as submitDepositRequest) ─────
    const amount = parseFloat(formData.get("amount") as string)
    const method = (formData.get("method") as string) || null
    const collectionTypeId = (formData.get("collectionTypeId") as string) || null
    const referenceNo = ((formData.get("referenceNo") as string) || "").trim() || null
    const transactionDateStr = (formData.get("transactionDate") as string) || null
    const notes = ((formData.get("notes") as string) || "").trim() || null
    const slipFile = formData.get("slip") as File | null

    if (!amount || amount <= 0) {
      return { ok: false, error: "Please enter a valid deposit amount." }
    }
    if (amount > 100_000_000) {
      return { ok: false, error: "Deposit amount is unreasonably large." }
    }
    if (!method) {
      return { ok: false, error: "Please select a payment method." }
    }
    // Slip is optional on resubmit — keep the original if no new file.
    if (slipFile && slipFile.size > DEPOSIT_SLIP_MAX_BYTES) {
      return { ok: false, error: "Deposit slip file is too large. Maximum size is 10 MB." }
    }
    if (slipFile && slipFile.size > 0) {
      // M8 fix: invert the check (same as submitDepositRequest).
      const ext = slipFile.name.toLowerCase().split(".").pop() ?? ""
      const extOk = ["pdf", "png", "jpg", "jpeg", "webp", "gif"].includes(ext)
      if (!extOk || (slipFile.type && !ALLOWED_SLIP_TYPES.has(slipFile.type))) {
        return { ok: false, error: "Unsupported file type. Allowed: PDF, PNG, JPG, WEBP, GIF." }
      }
    }

    // ── 2. Load the existing request + linked transaction ──────────────────
    const existing = await prisma.memberRequest.findUnique({
      where: { id: requestId },
      include: {
        transactions: {
          // The member-submitted deposit flow creates exactly one Transaction
          // per MemberRequest. Take the most recent one (defensive — there
          // should only ever be one).
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            memberSubmitted: true,
            voucherNo: true,
            attachments: true,
          },
        },
      },
    })
    if (!existing) {
      return { ok: false, error: "Deposit request not found." }
    }
    if (existing.memberId !== memberId) {
      return { ok: false, error: "This deposit request does not belong to your account." }
    }
    if (existing.type !== "DEPOSIT") {
      return { ok: false, error: "This action is only valid for deposit requests." }
    }
    const linkedTxn = existing.transactions[0]
    if (!linkedTxn) {
      return { ok: false, error: "Linked transaction not found. Please contact management." }
    }
    if (linkedTxn.status !== "RETURNED") {
      return { ok: false, error: `Only returned deposit requests can be resubmitted (current: ${linkedTxn.status}).` }
    }
    if (!linkedTxn.memberSubmitted) {
      return { ok: false, error: "This deposit request was not member-submitted and cannot be resubmitted from the portal." }
    }

    // ── 3. Resolve the member (fresh status check) ─────────────────────────
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, memberNo: true, fullName: true, phone: true, email: true, status: true },
    })
    if (!member) return { ok: false, error: "Member not found." }
    if (member.status === "SUSPENDED" || member.status === "CLOSED" || member.status === "REJECTED") {
      return { ok: false, error: `Your membership is ${member.status}. Please contact management.` }
    }

    // ── 4. Upload new slip if provided ─────────────────────────────────────
    let slipAttachment: { type: string; name: string; url: string } | null = null
    if (slipFile && slipFile.size > 0) {
      const { saveUploadedFile } = await import("@/lib/upload")
      const saved = await saveUploadedFile(slipFile, "deposit-slips")
      slipAttachment = {
        type: "Deposit Slip",
        name: saved.fileName,
        url: saved.url,
      }
    } else {
      // Keep the original slip — pull it from the existing transaction's
      // attachments JSON column.
      const oldAttachments =
        (linkedTxn.attachments as { type: string; name: string; url: string }[] | null) ?? []
      slipAttachment = oldAttachments[0] ?? null
    }
    if (!slipAttachment) {
      return { ok: false, error: "No deposit slip on record. Please attach one and resubmit." }
    }

    // ── 5. Resolve the COA for the (possibly new) payment method ───────────
    const { getDefaultCoaForMethod } = await import("@/lib/transactions/bankAccounts")
    const coa = await getDefaultCoaForMethod(
      method as "CASH" | "BANK_TRANSFER" | "CHEQUE" | "BKASH" | "NAGAD" | "ROCKET"
    )

    // ── 6. Resolve collection type name (if changed) ───────────────────────
    let collectionTypeName: string | null = null
    if (collectionTypeId) {
      const ct = await prisma.chargeType.findUnique({
        where: { id: collectionTypeId },
        select: { name: true },
      })
      collectionTypeName = ct?.name ?? null
    }

    // ── 7. Atomic update: MemberRequest + linked Transaction ──────────────
    const { loadApprovalLimits, resolveLevelForAmount } = await import(
      "@/lib/transactions/validation"
    )

    await directPrisma.$transaction(async (tx) => {
      // a) MemberRequest — refresh the metadata + reset to PENDING.
      await tx.memberRequest.update({
        where: { id: requestId },
        data: {
          amount,
          method,
          notes,
          status: "PENDING",
          attachments: [slipAttachment!] as unknown as Prisma.InputJsonValue,
          breakdown: collectionTypeId
            ? ({ collectionTypeId, collectionTypeName } as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          referenceNo,
          transactionDate: transactionDateStr ? new Date(transactionDateStr) : null,
          // Clear any prior rejection metadata (a prior rejection is
          // impossible here because we checked status===RETURNED above, but
          // defensive in case the workflow changes later).
          rejectionReason: null,
          reviewedBy: null,
          reviewedAt: null,
        },
      })

      // b) Transaction — move back to PENDING_APPROVAL, re-resolve approval
      // tier (amount may have changed), clear return reason, refresh
      // submittedAt.
      const limits = await loadApprovalLimits()
      const approvalLevel = resolveLevelForAmount(amount, limits)

      await tx.transaction.update({
        where: { id: linkedTxn.id },
        data: {
          amount,
          paymentMethod: method as "CASH" | "BANK_TRANSFER" | "CHEQUE" | "BKASH" | "NAGAD" | "ROCKET",
          cashAccountId: coa.coaAccountId,
          referenceNo,
          breakdown: collectionTypeId
            ? ({ collectionTypeId, collectionTypeName } as unknown as Prisma.JsonObject)
            : Prisma.JsonNull,
          attachments: [slipAttachment!] as unknown as Prisma.InputJsonValue,
          remarks: notes,
          transactionDate: transactionDateStr ? new Date(transactionDateStr) : new Date(),
          status: "PENDING_APPROVAL",
          approvalLevel,
          // Clear the return-trail — the request is fresh again.
          returnReason: null,
          returnedBy: null,
          returnedById: null,
          returnedAt: null,
          // Bump submittedAt so the approval queue order is fresh.
          submittedBy: `MEMBER:${member.memberNo}`,
          submittedById: `MEMBER_PORTAL::${memberId}`,
          submittedAt: new Date(),
        },
      })
    })

    // ── 8. Side-effects (admin notification + member confirmation) ─────────
    await createAdminNotification({
      type: "MEMBER_REQUEST",
      title: "Deposit request resubmitted",
      message: `${member.fullName} (${member.memberNo}) edited and resubmitted a deposit request of ৳ ${amount.toLocaleString()} via ${method}. Voucher ${linkedTxn.voucherNo}.`,
      link: `/dashboard/transactions/${linkedTxn.id}`,
    }).catch(() => undefined)

    await notifyMemberDepositRequestReceived({
      member,
      amount,
      method: method as string,
      referenceNo,
      transactionDateStr,
      voucherNo: linkedTxn.voucherNo,
    }).catch((e) =>
      console.error("[resubmitDepositRequest] member confirmation failed:", e)
    )

    revalidatePath("/portal/deposit-request")
    revalidatePath("/portal/requests")
    revalidatePath("/dashboard/transaction-approvals")
    revalidatePath("/dashboard/transactions")

    return { ok: true, requestId }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function submitClosingRequest(memberId: string, formData: FormData) {
  // IDOR guard (S4): derive memberId from the session.
  let memberIdResolved: string
  try {
    memberIdResolved = await assertMemberId(memberId)
  } catch (e) {
    return { error: (e as Error).message }
  }
  memberId = memberIdResolved

  const reason = (formData.get("reason") as string) || null

  // Check if there's already a pending closing request
  const existing = await prisma.memberRequest.findFirst({
    where: { memberId, type: "CLOSING", status: "PENDING" }
  })

  if (existing) {
    return { error: "You already have a pending account closing request." }
  }

  const request = await prisma.memberRequest.create({
    data: {
      memberId,
      type: "CLOSING",
      reason,
      status: "PENDING",
    },
  })

  // Task auto-spawn: review the account-closing request. Non-blocking.
  await spawnTask({
    title: `Review account-closing request`,
    description: `A member requested account closure.${reason ? ` Reason: ${reason}` : ""} Verify outstanding balances, settle dues, and process the closure.`,
    priority: "HIGH",
    dueInDays: 5,
    memberRequestId: request.id,
    relatedMemberId: memberId,
    createdByLabel: "MEMBER_REQUEST_SYSTEM",
    checklist: ["Verify outstanding balances", "Settle outstanding dues", "Process account closure", "Notify member of outcome"],
  }).catch(() => undefined)

  // Notify admins of the new account-closing request. Best-effort, non-throwing.
  await createAdminNotification({
    type: "MEMBER_REQUEST",
    title: "New account-closure request",
    message: `A member requested account closure.${reason ? ` Reason: ${reason}` : ""}`,
    link: "/dashboard/transaction-approvals?tab=member",
  })

  revalidatePath("/portal/settings")
  redirect("/portal/settings")
}

export async function submitProfileUpdateRequest(memberId: string, formData: FormData) {
  // IDOR guard (S4): derive memberId from the session.
  let memberIdResolved: string
  try {
    memberIdResolved = await assertMemberId(memberId)
  } catch (e) {
    return { error: (e as Error).message }
  }
  memberId = memberIdResolved

  const payload: Record<string, string> = {}

  // Compare current data with submitted data to build a payload of changes
  const fields = ["firstName", "lastName", "phone", "email", "fatherName", "motherName", "spouseName", "occupation", "profession"]

  fields.forEach(field => {
    const value = formData.get(field) as string
    if (value) {
      payload[field] = value
    }
  })

  if (Object.keys(payload).length === 0) {
    return { error: "No changes detected to request." }
  }

  await prisma.profileUpdateRequest.create({
    data: {
      memberId,
      payload: payload,
      status: "PENDING",
    },
  })

  // Notify admins of the new profile-update request. Best-effort, non-throwing.
  await createAdminNotification({
    type: "PROFILE_REQUEST",
    title: "New profile update request",
    message: `A member requested changes to their profile (${Object.keys(payload).join(", ")}).`,
    link: "/dashboard/profile-approvals",
  })

  revalidatePath("/portal/profile")
  return { success: "Profile update request submitted to admin!" }
}

// =====================================================================
// FULL PROFILE UPDATE REQUEST (member portal edit page)
// Mirrors the admin MemberForm field contract: personal, contact,
// identity, bank, current/permanent addresses, and nominees.
// Files are uploaded to Cloudinary at submit time and stored as URLs in
// the pending payload so the JSON column stays serializable. On admin
// approval, `approveProfileUpdateRequest` replays the payload against the
// member record using the same write logic as `updateMember`.
// =====================================================================
function formDataString(formData: FormData, key: string): string {
  const v = formData.get(key)
  return v == null ? "" : String(v)
}

export async function submitFullProfileUpdateRequest(memberId: string, formData: FormData) {
  // IDOR guard (S4): derive memberId from the session.
  let memberIdResolved: string
  try {
    memberIdResolved = await assertMemberId(memberId)
  } catch (e) {
    return { error: (e as Error).message }
  }
  memberId = memberIdResolved

  // --- Personal ---
  const firstName = formDataString(formData, "firstName").trim()
  const lastName = formDataString(formData, "lastName").trim()
  if (!firstName) {
    return { error: "First name is required." }
  }
  // Last name is optional.

  const personal = {
    firstName,
    lastName,
    fatherName: formDataString(formData, "fatherName").trim() || null,
    motherName: formDataString(formData, "motherName").trim() || null,
    spouseName: formDataString(formData, "spouseName").trim() || null,
    dateOfBirth: formDataString(formData, "dob").trim() || null,
    gender: formDataString(formData, "gender").trim() || null, // uppercase enum
    maritalStatus: formDataString(formData, "maritalStatus").trim() || null,
    marriageDate: formDataString(formData, "marriageDate").trim() || null,
    religion: formDataString(formData, "religion").trim() || null,
    nationality: formDataString(formData, "nationality").trim() || null,
    bloodGroup: formDataString(formData, "bloodGroup").trim() || null, // A_POSITIVE etc.
    profession: formDataString(formData, "profession").trim() || null,
  }

  // --- Contact & identity ---
  const phone = formDataString(formData, "phone").trim()
  if (!phone) return { error: "Phone number is required." }

  const contact = {
    phone,
    email: formDataString(formData, "email").trim() || null,
    emergencyPhone: formDataString(formData, "emergencyPhone").trim() || null,
    emergencyContactName: formDataString(formData, "emergencyContactName").trim() || null,
    idType: formDataString(formData, "idType").trim() || null,
    idNumber: formDataString(formData, "idNumber").trim() || null,
  }

  // --- Bank ---
  const bank = {
    accountName: formDataString(formData, "accountName").trim() || null,
    accountNumber: formDataString(formData, "accountNumber").trim() || null,
    bankName: formDataString(formData, "bankName").trim() || null,
    branch: formDataString(formData, "branch").trim() || null,
    routingNumber: formDataString(formData, "routingNumber").trim() || null,
  }

  // --- Addresses ---
  const currentAddress = {
    addressType: "CURRENT",
    village: formDataString(formData, "c_village").trim() || null,
    postOffice: formDataString(formData, "c_postOffice").trim() || null,
    district: formDataString(formData, "c_district").trim() || null,
    postalCode: formDataString(formData, "c_postalCode").trim() || null,
  }
  const permanentAddress = {
    addressType: "PERMANENT",
    village: formDataString(formData, "p_village").trim() || null,
    postOffice: formDataString(formData, "p_postOffice").trim() || null,
    district: formDataString(formData, "p_district").trim() || null,
    postalCode: formDataString(formData, "p_postalCode").trim() || null,
  }

  // --- Nominees (nom_*_* indexed) ---
  const nominees: Array<{
    name: string; relation: string; share: number; phone: string | null
    idType: string | null; idNumber: string | null
    photoUrl: string | null; idDocumentUrl: string | null; signatureUrl: string | null; dbId?: string
  }> = []
  let i = 0
  while (true) {
    const name = formDataString(formData, `nom_${i}_name`)
    if (!name) break
    const relation = formDataString(formData, `nom_${i}_relation`) || "Unknown"
    const shareRaw = formDataString(formData, `nom_${i}_share`)
    const dbId = formDataString(formData, `nom_${i}_dbId`) || undefined

    const photoFile = formData.get(`nom_${i}_photo`) as File | null
    const photoUrl = photoFile && photoFile.size > 0
      ? (await uploadImage(photoFile).catch(() => null))
      : null

    const idDocFile = formData.get(`nom_${i}_idDoc`) as File | null
    const idDocumentUrl = idDocFile && idDocFile.size > 0
      ? (await uploadImage(idDocFile).catch(() => null))
      : null

    // Nominee signature — optional, embedded on the PDF if provided.
    const signatureFile = formData.get(`nom_${i}_signature`) as File | null
    const signatureUrl = signatureFile && signatureFile.size > 0
      ? (await uploadImage(signatureFile).catch(() => null))
      : null

    nominees.push({
      name: name.trim(),
      relation,
      share: shareRaw ? parseFloat(shareRaw) : 0,
      phone: formDataString(formData, `nom_${i}_phone`).trim() || null,
      idType: formDataString(formData, `nom_${i}_idType`).trim() || null,
      idNumber: formDataString(formData, `nom_${i}_idNumber`).trim() || null,
      photoUrl,
      idDocumentUrl,
      signatureUrl,
      ...(dbId ? { dbId } : {}),
    })
    i++
  }

  // Validate nominee shares total 100% if any present.
  if (nominees.length > 0) {
    const total = nominees.reduce((acc, n) => acc + (Number.isFinite(n.share) ? n.share : 0), 0)
    if (Math.round(total) !== 100) {
      return { error: `Total nominee shares must equal 100%. Currently at ${total}%.` }
    }
  }

  // --- Files (member photo, ID document, signature) ---
  const memberPhotoFile = formData.get("memberPhoto") as File | null
  const memberPhotoUrl = memberPhotoFile && memberPhotoFile.size > 0
    ? (await uploadImage(memberPhotoFile).catch(() => null))
    : null

  const idDocFile = formData.get("idDocument") as File | null
  const idDocumentUrl = idDocFile && idDocFile.size > 0
    ? (await uploadImage(idDocFile).catch(() => null))
    : null

  // Member signature — required, embedded on the Membership Application Form PDF.
  const signatureFile = formData.get("signature") as File | null
  const signatureUrl = signatureFile && signatureFile.size > 0
    ? (await uploadImage(signatureFile).catch(() => null))
    : null

  const payload = {
    personal,
    contact,
    bank,
    currentAddress,
    permanentAddress,
    nominees,
    ...(memberPhotoUrl ? { memberPhotoUrl } : {}),
    ...(idDocumentUrl ? { idDocumentUrl } : {}),
    ...(signatureUrl ? { signatureUrl } : {}),
  }

  await prisma.profileUpdateRequest.create({
    data: {
      memberId,
      payload: payload as Prisma.InputJsonValue,
      status: "PENDING",
    },
  })

  // Notify admins of the new full profile-update request. Best-effort.
  await createAdminNotification({
    type: "PROFILE_REQUEST",
    title: "New profile update request",
    message: `A member submitted a full profile update for approval (personal details, contact, bank, address, nominees).`,
    link: "/dashboard/profile-approvals",
  })

  revalidatePath("/portal/profile")
  revalidatePath("/portal/requests")
  revalidatePath("/dashboard/profile-approvals")
  return { success: "Profile update request submitted to admin for approval!" }
}

// =====================================================================
// MEMBER LOAN APPLICATION
// Creates a PENDING loan (with full schedule) for admin approval.
// Mirrors the admin buildLoan flow but is restricted to the signed-in member.
// =====================================================================
export async function applyMemberLoan(memberId: string, formData: FormData) {
  // IDOR guard (S4): derive memberId from the session.
  let memberIdResolved: string
  try {
    memberIdResolved = await assertMemberId(memberId)
  } catch (e) {
    throw e // applyMemberLoan uses throw semantics already (see "Member not found" etc.)
  }
  memberId = memberIdResolved

  const member = await prisma.member.findUnique({ where: { id: memberId } })
  if (!member) throw new Error("Member not found.")
  if (member.status !== "ACTIVE") {
    throw new Error("Only active members can apply for loans.")
  }

  const productId = (formData.get("productId") as string)?.trim()
  if (!productId) throw new Error("Please select a loan product.")

  const product = await prisma.loanProduct.findUnique({ where: { id: productId } })
  if (!product) throw new Error("Loan product not found.")
  if (!product.isActive) throw new Error("Selected loan product is no longer available.")

  const principal = parseFloat((formData.get("principal") as string) || "0")
  if (!Number.isFinite(principal) || principal <= 0) {
    throw new Error("Please enter a valid principal amount.")
  }
  if (Number(product.minAmount) > 0 && principal < Number(product.minAmount)) {
    throw new Error(`Amount is below this product's minimum (৳ ${Number(product.minAmount).toLocaleString()}).`)
  }
  if (Number(product.maxAmount) > 0 && principal > Number(product.maxAmount)) {
    throw new Error(`Amount exceeds this product's maximum (৳ ${Number(product.maxAmount).toLocaleString()}).`)
  }

  // Allow member to override rate/tenure within the product's defaults; fall back to product values.
  const rate =
    parseFloat((formData.get("interestRate") as string) || "") || Number(product.interestRate)
  const installments =
    parseInt((formData.get("numberOfInstallments") as string) || "0", 10) || product.numberOfInstallments
  const interestType = (product.interestType as InterestType)
  const freq = (product.repaymentFreq as RepaymentFreq)
  const grace = product.gracePeriod ?? 0
  const purpose = ((formData.get("purpose") as string) || "").trim() || null
  const notes = ((formData.get("notes") as string) || "").trim() || null

  const disburseDate = new Date()

  const schedule = generateSchedule({
    principal,
    annualRate: rate,
    interestType,
    repaymentFreq: freq,
    numberOfInstallments: installments,
    disburseDate,
    gracePeriod: grace,
  })

  const closeDate = expectedCloseFromSchedule(schedule.rows)

  // Optional guarantors posted as a JSON array from the client form.
  let guarantors: { name: string; relation?: string; phone?: string; nidNumber?: string; address?: string }[] = []
  const guarantorJson = formData.get("guarantors") as string
  if (guarantorJson) {
    try {
      guarantors = JSON.parse(guarantorJson)
    } catch {
      guarantors = []
    }
  }

  // H8 fix: use the Counter-table pattern (mirrors lib/transactions/voucher.ts)
  // for atomic, race-free loan numbering. The old `prisma.loan.count() + 1`
  // approach races under concurrent inserts and could collide on the
  // `loanNo` @unique constraint. Wrapped inside a $transaction so the
  // counter increment + loan create commit atomically.
  const loan = await directPrisma.$transaction(async (tx) => {
    const counter = await tx.counter.upsert({
      where: { id: "loan" },
      update: { value: { increment: 1 } },
      create: { id: "loan", value: 1 },
    })
    const loanNo = `L-${String(counter.value).padStart(6, "0")}`

    return tx.loan.create({
      data: {
        loanNo,
        memberId,
        productId,
        principal,
        interestRate: rate,
        interestType,
        repaymentFreq: freq,
        numberOfInstallments: installments,
        totalInterest: schedule.totalInterest,
        totalPayable: schedule.totalPayable,
        installmentAmount: schedule.installmentAmount,
        processingFee: product.processingFee,
        gracePeriod: grace,
        lateFinePerDay: product.lateFinePerDay,
        applicationDate: disburseDate,
        status: "PENDING",
        purpose,
        notes,
        expectedCloseDate: closeDate,
        outstandingBalance: 0,
        schedule: {
          create: schedule.rows.map((row) => ({
            installmentNo: row.installmentNo,
            dueDate: row.dueDate,
            principal: row.principal,
            interest: row.interest,
            installmentAmount: row.installmentAmount,
            balanceAfter: row.balanceAfter,
          })),
        },
        guarantors: guarantors.filter((g) => g.name?.trim()).length
          ? {
              create: guarantors
                .filter((g) => g.name?.trim())
                .map((g) => ({
                  name: g.name.trim(),
                  relation: g.relation?.trim() || null,
                  phone: g.phone?.trim() || null,
                  nidNumber: g.nidNumber?.trim() || null,
                  address: g.address?.trim() || null,
                })),
            }
          : undefined,
      },
    })
  })

  // Task auto-spawn: review the member's loan application. Non-blocking.
  await spawnTask({
    title: `Review loan application: ${loan.loanNo}`,
    description: `A member applied for a loan of ৳ ${principal.toLocaleString()} (${installments} installments @ ${rate}%). Review and approve or reject.`,
    priority: "HIGH",
    dueInDays: 2,
    loanId: loan.id,
    relatedMemberId: memberId,
    createdByLabel: "LOAN_SYSTEM",
  }).catch(() => undefined)

  // Notify admins of the new loan application. Best-effort, non-throwing.
  await createAdminNotification({
    type: "LOAN_REQUEST",
    title: "New loan application",
    message: `Loan ${loan.loanNo}: a member applied for ৳ ${principal.toLocaleString()} over ${installments} installments at ${rate}%.`,
    link: "/dashboard/loans",
  })

  revalidatePath("/portal/loans")
  revalidatePath("/portal/requests")
  redirect("/portal/loans")
}

// =====================================================================
// PROFILE PHOTO REQUEST
// Uploads the photo to Cloudinary and stores the URL in a pending
// ProfileUpdateRequest for admin approval.
// =====================================================================
export async function submitProfilePhotoRequest(memberId: string, file: File) {
  // IDOR guard (S4): derive memberId from the session.
  let memberIdResolved: string
  try {
    memberIdResolved = await assertMemberId(memberId)
  } catch (e) {
    return { error: (e as Error).message }
  }
  memberId = memberIdResolved

  if (!file) return { error: "No file selected." }
  if (file.size > 5 * 1024 * 1024) return { error: "Image must be under 5 MB." }
  if (!file.type.startsWith("image/")) return { error: "Please upload an image file." }

  const photoUrl = await uploadImage(file)
  if (!photoUrl) return { error: "Failed to upload image. Please try again." }

  await prisma.profileUpdateRequest.create({
    data: {
      memberId,
      payload: { photoUrl } as Prisma.InputJsonValue,
      status: "PENDING",
    },
  })

  // Notify admins of the new photo-update request. Best-effort.
  await createAdminNotification({
    type: "PROFILE_REQUEST",
    title: "New profile photo request",
    message: `A member submitted a new profile photo for approval.`,
    link: "/dashboard/profile-approvals",
  })

  revalidatePath("/portal/profile")
  return { success: "Photo submitted! It will appear once an admin approves it." }
}

// =====================================================================
// COMPUTED NOTIFICATIONS
// Pulled live from data: upcoming meetings, overdue dues, recently
// resolved requests. No dedicated table required.
// =====================================================================
export async function getMemberNotifications(memberId: string): Promise<PortalNotificationItem[]> {
  // IDOR guard (S4): read-only but still derives memberId from the session.
  let memberIdResolved: string
  try {
    memberIdResolved = await assertMemberId(memberId)
  } catch {
    // Read-only caller (portal/layout.tsx) wraps in .catch(() => []); throw
    // a soft error rather than crashing the layout render.
    return []
  }
  memberId = memberIdResolved

  const out: PortalNotificationItem[] = []

  // Load the member's dismissed computed-notification IDs so we can filter
  // them out. Computed notifications (meetings, dues, resolved requests) are
  // live queries — they don't live in MemberNotification, so "Mark all read"
  // records their stable ID here so they stay dismissed until the underlying
  // condition changes (e.g. a new request is resolved → new ID → shows again).
  const dismissed = await prisma.memberNotificationDismissal.findMany({
    where: { memberId },
    select: { notificationKey: true },
  })
  const dismissedSet = new Set(dismissed.map((d) => d.notificationKey))

  // 1. Upcoming meetings (next 7 days).
  const now = new Date()
  const in7 = new Date()
  in7.setDate(in7.getDate() + 7)
  const meetings = await prisma.meeting.findMany({
    where: { date: { gte: now, lte: in7 } },
    orderBy: { date: "asc" },
    take: 3,
  })
  meetings.forEach((m) => {
    out.push({
      id: `meeting-${m.id}`,
      type: "meeting",
      title: m.title,
      message: `Upcoming on ${new Date(m.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} at ${m.location || "TBD"}`,
      href: "/portal",
      createdAt: m.createdAt.toISOString(),
    })
  })

  // 2. Overdue dues (any fee with an open balance).
  try {
    const [member, feeSetups] = await Promise.all([
      prisma.member.findUnique({
        where: { id: memberId },
        include: { savings: true },
      }),
      prisma.feeSetup.findMany(),
    ])
    if (member) {
      const { calculateDues } = await import("@/lib/dueCalculator")
      const joinDate = member.membershipDate || member.createdAt
      const dues = calculateDues(member.id, joinDate, feeSetups, member.savings)
      if (Number(dues.totalDue) > 0) {
        out.push({
          id: `due-${member.id}`,
          type: "due",
          title: "Outstanding Dues",
          message: `You have ৳ ${Number(dues.totalDue).toLocaleString()} in outstanding dues. Please clear them soon.`,
          href: "/portal/savings",
        })
      }
    }
  } catch {
    // due calculation is best-effort; never block the portal over it.
  }

  // 3. Recently resolved requests (last 14 days).
  const since = new Date()
  since.setDate(since.getDate() - 14)
  const [resolvedRequests, resolvedProfile] = await Promise.all([
    prisma.memberRequest.findMany({
      where: { memberId, status: { in: ["APPROVED", "REJECTED"] }, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    prisma.profileUpdateRequest.findMany({
      where: { memberId, status: { in: ["APPROVED", "REJECTED"] }, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 2,
    }),
  ])
  resolvedRequests.forEach((r) => {
    // Resolve the human-readable kind label for the request type. The old
    // code used a binary ternary (WITHDRAWAL → "Withdrawal", anything else →
    // "Account closure") which mislabeled DEPOSIT requests as "Account
    // closure". Handle all three types explicitly.
    const kind =
      r.type === "WITHDRAWAL"
        ? "Withdrawal"
        : r.type === "CLOSING"
          ? "Account closure"
          : r.type === "DEPOSIT"
            ? "Deposit"
            : "Request"
    out.push({
      id: `req-${r.id}`,
      type: r.status === "APPROVED" ? "request" : "info",
      title: `${kind} ${r.status.charAt(0) + r.status.slice(1).toLowerCase()}`,
      message:
        r.status === "APPROVED"
          ? `Your ${kind.toLowerCase()} request was approved.`
          : `Your ${kind.toLowerCase()} request was rejected. Contact management for details.`,
      href: "/portal/requests",
      createdAt: r.createdAt.toISOString(),
    })
  })
  resolvedProfile.forEach((r) => {
    out.push({
      id: `profile-${r.id}`,
      type: r.status === "APPROVED" ? "request" : "info",
      title: `Profile update ${r.status.charAt(0) + r.status.slice(1).toLowerCase()}`,
      message:
        r.status === "APPROVED"
          ? "Your profile update request was approved."
          : "Your profile update request was rejected.",
      href: "/portal/requests",
      createdAt: r.createdAt.toISOString(),
    })
  })

  // 4. Trust Score notifications (FRS §14) — score changes, badge awards,
  // suspensions, etc. Surface the most recent few from the persistent table.
  try {
    // Only surface UNREAD MemberNotification rows — once a member marks them
    // read (via the topbar "Mark all as read" button), they leave the bell.
    const scoreNotes = await prisma.memberNotification.findMany({
      where: { memberId, isRead: false },
      orderBy: { createdAt: "desc" },
      take: 4,
    })
    scoreNotes.forEach((n: { id: string; type: string; title: string; message: string; createdAt: Date }) => {
      const tone =
        n.type === "SCORE_INCREASED" ||
        n.type === "ACHIEVEMENT_EARNED" ||
        n.type === "BADGE_UPGRADED" ||
        n.type === "REACTIVATED"
          ? "request"
          : n.type === "AUTO_SUSPENDED" ||
            n.type === "ACHIEVEMENT_LOST" ||
            n.type === "BADGE_DOWNGRADED"
          ? "due"
          : "info"
      out.push({
        id: `score-${n.id}`,
        type: tone as "due" | "meeting" | "request" | "info",
        title: n.title,
        message: n.message,
        href: "/portal/trust-score",
        createdAt: n.createdAt.toISOString(),
      })
    })
  } catch {
    // best-effort; never block the portal over it.
  }

  // Filter out dismissed computed notifications (meetings, dues, requests).
  // MemberNotification rows are already filtered by isRead: false above.
  const visible = out.filter((n) => !dismissedSet.has(n.id))

  // Most relevant first; cap at 8.
  return visible.slice(0, 8)
}

// Count of pending member-side requests, used to badge the "My Requests" nav item.
export async function getMemberPendingRequestCount(memberId: string): Promise<number> {
  // IDOR guard (S4): read-only but still derives memberId from the session.
  let memberIdResolved: string
  try {
    memberIdResolved = await assertMemberId(memberId)
  } catch {
    // Read-only caller (portal/layout.tsx) wraps in .catch(() => 0); return
    // 0 rather than crashing the layout render.
    return 0
  }
  memberId = memberIdResolved

  const [member, profile] = await Promise.all([
    prisma.memberRequest.count({ where: { memberId, status: "PENDING" } }),
    prisma.profileUpdateRequest.count({ where: { memberId, status: "PENDING" } }),
  ])
  return member + profile
}

// =====================================================================
// ADMIN COMPANION: Approve / reject a ProfileUpdateRequest.
//
// Two payload shapes are supported:
//  1. Legacy flat string map (from the old modal) — e.g.
//     { firstName, phone, photoUrl, … }. Whitelisted via PROFILE_PAYLOAD_FIELDS.
//  2. Full structured payload (from the portal edit page) —
//     { personal, contact, bank, currentAddress, permanentAddress,
//       nominees, memberPhotoUrl?, idDocumentUrl? } — replayed against
//     the member record using the same write logic as `updateMember`.
//
// Safe, guarded, and idempotent: re-running on an already-processed
// request is blocked by the status check.
// =====================================================================
const PROFILE_PAYLOAD_FIELDS: Record<string, string> = {
  firstName: "firstName",
  lastName: "lastName",
  phone: "phone",
  email: "email",
  fatherName: "fatherName",
  motherName: "motherName",
  spouseName: "spouseName",
  occupation: "occupation",
  profession: "profession",
  photoUrl: "photoUrl",
}

// Helpers to safely coerce JSON payload values into the Prisma types
// `updateMember` expects. Enums arrive uppercase; dates arrive as
// "YYYY-MM-DD" strings.
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}
function enumOrNull<T extends string>(v: unknown, valid: readonly T[]): T | null {
  const s = typeof v === "string" ? v.trim().toUpperCase() : ""
  return (valid as readonly string[]).includes(s) ? (s as T) : null
}
function dateOrNull(v: unknown): Date | null {
  const s = typeof v === "string" ? v.trim() : ""
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

// Apply the structured (full) payload — mirrors `updateMember` writes.
// The payload comes from a Prisma `Json` column, so it is loosely typed as
// `Record<string, unknown>`; each field is coerced via the str/enum/date helpers above.
type StructuredPayload = Record<string, unknown> & {
  personal?: Record<string, unknown>
  contact?: Record<string, unknown>
  bank?: Record<string, unknown>
  currentAddress?: Record<string, unknown>
  permanentAddress?: Record<string, unknown>
  nominees?: unknown[]
  memberPhotoUrl?: unknown
  idDocumentUrl?: unknown
}

async function applyStructuredProfileUpdate(
  tx: Prisma.TransactionClient,
  memberId: string,
  payload: StructuredPayload
) {
  const { personal, contact, bank, currentAddress, permanentAddress, nominees } = payload

  // Fetch existing member so we can preserve untouched fields and resolve idType.
  const existing = await tx.member.findUnique({ where: { id: memberId } })
  if (!existing) throw new Error("Member not found.")

  const firstName = strOrNull(personal?.firstName) ?? existing.firstName
  const lastName = strOrNull(personal?.lastName) ?? existing.lastName
  const fullName = `${firstName} ${lastName}`.trim()

  // Identity: map idType/idNumber to the matching column.
  const idType = strOrNull(contact?.idType)
  const idNumber = strOrNull(contact?.idNumber)
  const nidNumber = idType === "National ID" ? idNumber : null
  const passportNumber = idType === "Passport" ? idNumber : null
  const birthCertificateNo = idType === "Birth Certificate" ? idNumber : null

  await tx.member.update({
    where: { id: memberId },
    data: {
      firstName,
      lastName,
      fullName,
      fatherName: personal?.fatherName !== undefined ? strOrNull(personal.fatherName) : undefined,
      motherName: personal?.motherName !== undefined ? strOrNull(personal.motherName) : undefined,
      spouseName: personal?.spouseName !== undefined ? strOrNull(personal.spouseName) : undefined,
      dateOfBirth: personal?.dateOfBirth !== undefined ? dateOrNull(personal.dateOfBirth) : undefined,
      gender: personal?.gender !== undefined ? enumOrNull(personal.gender, Object.values(Gender) as readonly Gender[]) ?? undefined : undefined,
      religion: personal?.religion !== undefined ? strOrNull(personal.religion) ?? null : undefined,
      nationality: personal?.nationality !== undefined ? strOrNull(personal.nationality) ?? "Bangladeshi" : undefined,
      bloodGroup: personal?.bloodGroup !== undefined
        ? enumOrNull(personal.bloodGroup, Object.values(BloodGroup) as readonly BloodGroup[]) ?? undefined
        : undefined,
      profession: personal?.profession !== undefined ? strOrNull(personal.profession) ?? null : undefined,
      maritalStatus: personal?.maritalStatus !== undefined ? enumOrNull(personal.maritalStatus, Object.values(MaritalStatus) as readonly MaritalStatus[]) ?? undefined : undefined,
      marriageDate: personal?.marriageDate !== undefined ? dateOrNull(personal.marriageDate) : undefined,
      phone: strOrNull(contact?.phone) ?? existing.phone,
      email: contact?.email !== undefined ? strOrNull(contact.email) : undefined,
      emergencyPhone: contact?.emergencyPhone !== undefined ? strOrNull(contact.emergencyPhone) : undefined,
      emergencyContactName: contact?.emergencyContactName !== undefined ? strOrNull(contact.emergencyContactName) : undefined,
      nidNumber: nidNumber !== null ? nidNumber : undefined,
      passportNumber: passportNumber !== null ? passportNumber : undefined,
      birthCertificateNo: birthCertificateNo !== null ? birthCertificateNo : undefined,
      accountName: bank?.accountName !== undefined ? strOrNull(bank.accountName) : undefined,
      accountNumber: bank?.accountNumber !== undefined ? strOrNull(bank.accountNumber) : undefined,
      bankName: bank?.bankName !== undefined ? strOrNull(bank.bankName) : undefined,
      branch: bank?.branch !== undefined ? strOrNull(bank.branch) : undefined,
      routingNumber: bank?.routingNumber !== undefined ? strOrNull(bank.routingNumber) : undefined,
      ...(typeof payload.memberPhotoUrl === "string" && payload.memberPhotoUrl
        ? { photoUrl: payload.memberPhotoUrl }
        : {}),
    },
  })

  // Replace addresses (only when the edit included address data).
  if (currentAddress || permanentAddress) {
    await tx.memberAddress.deleteMany({ where: { memberId } })
    if (currentAddress && (currentAddress.village || currentAddress.district)) {
      await tx.memberAddress.create({
        data: {
          memberId,
          addressType: "CURRENT",
          village: strOrNull(currentAddress.village),
          postOffice: strOrNull(currentAddress.postOffice),
          district: strOrNull(currentAddress.district),
          postalCode: strOrNull(currentAddress.postalCode),
        },
      })
    }
    if (permanentAddress && (permanentAddress.village || permanentAddress.district)) {
      await tx.memberAddress.create({
        data: {
          memberId,
          addressType: "PERMANENT",
          village: strOrNull(permanentAddress.village),
          postOffice: strOrNull(permanentAddress.postOffice),
          district: strOrNull(permanentAddress.district),
          postalCode: strOrNull(permanentAddress.postalCode),
        },
      })
    }
  }

  // Replace ID document if a new URL was uploaded.
  if (typeof payload.idDocumentUrl === "string" && payload.idDocumentUrl && idType) {
    await tx.memberDocument.deleteMany({ where: { memberId, documentType: idType } })
    await tx.memberDocument.create({
      data: {
        memberId,
        documentType: idType,
        name: "Member ID Document",
        fileName: "id-document",
        fileUrl: payload.idDocumentUrl,
      },
    })
  }

  // Replace nominees if the payload included a nominee array.
  if (Array.isArray(nominees)) {
    const existingNominees = await tx.memberNominee.findMany({ where: { memberId } })
    await tx.memberNominee.deleteMany({ where: { memberId } })
    for (const raw of nominees) {
      const n = (raw || {}) as Record<string, unknown>
      const dbId = typeof n.dbId === "string" ? n.dbId : undefined
      const existingNom = dbId ? existingNominees.find((x) => x.id === dbId) : undefined
      await tx.memberNominee.create({
        data: {
          memberId,
          name: strOrNull(n.name) ?? "Unknown",
          relation: strOrNull(n.relation) ?? "Unknown",
          sharePercentage: Number.isFinite(n.share) ? Number(n.share) : 0,
          phone: strOrNull(n.phone),
          idType: strOrNull(n.idType),
          nidNumber: strOrNull(n.idNumber),
          // Preserve previously-uploaded file URLs if the member didn't supply new ones.
          photoUrl: typeof n.photoUrl === "string" && n.photoUrl ? n.photoUrl : existingNom?.photoUrl ?? null,
          idDocumentUrl: typeof n.idDocumentUrl === "string" && n.idDocumentUrl ? n.idDocumentUrl : existingNom?.idDocumentUrl ?? null,
        },
      })
    }
  }
}

export async function approveProfileUpdateRequest(
  requestId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // S16 fix: require TRANSACTION_APPROVE permission. Previously used
    // getCurrentUser() only — an unauthenticated caller could trigger the
    // approval flow. requirePermission throws on null actor.
    const actor = await requirePermission(await getCurrentUser(), PERMISSIONS.TRANSACTION_APPROVE)
    if (!actor) {
      return { ok: false, error: "Unauthorized." }
    }

    const req = await prisma.profileUpdateRequest.findUnique({ where: { id: requestId } })
    if (!req) return { ok: false, error: "Request not found." }
    if (req.status !== "PENDING")
      return { ok: false, error: "This request has already been processed." }

    const payload = (req.payload || {}) as Record<string, unknown>
    const isStructured = Boolean(
      payload && (payload.personal || payload.contact || payload.bank || payload.nominees)
    )

    if (isStructured) {
      // H7 fix: move the profileUpdateRequest.update({ status: "APPROVED" })
      // INSIDE the same directPrisma.$transaction block that calls
      // applyStructuredProfileUpdate. Otherwise a failure between the
      // member write and the status update could leave the request PENDING
      // while the member record was already changed (or vice versa).
      await directPrisma.$transaction(async (tx) => {
        await applyStructuredProfileUpdate(tx, req.memberId, payload as StructuredPayload)
        await tx.profileUpdateRequest.update({
          where: { id: requestId },
          // NOTE: ProfileUpdateRequest has no reviewedBy/reviewedAt columns in
          // the schema (id/memberId/payload/status/createdAt only). The
          // actor identity is recorded in the audit trail by `createAdminNotification`
          // — see the sister admin-notification calls in submitProfileUpdateRequest.
          data: { status: "APPROVED" },
        })
      })
    } else {
      // Legacy flat payload: whitelist-map onto member fields.
      // H7 fix: same — wrap both writes in a single tx.
      await directPrisma.$transaction(async (tx) => {
        const data: Record<string, unknown> = {}
        for (const [key, memberField] of Object.entries(PROFILE_PAYLOAD_FIELDS)) {
          const v = payload[key]
          if (typeof v === "string" && v.trim()) data[memberField] = v.trim()
        }
        if (data.firstName || data.lastName) {
          const member = await tx.member.findUnique({ where: { id: req.memberId } })
          if (member) {
            const fn = (data.firstName as string) || member.firstName
            const ln = (data.lastName as string) || member.lastName
            data.fullName = `${fn} ${ln}`.trim()
          }
        }
        if (Object.keys(data).length > 0) {
          await tx.member.update({ where: { id: req.memberId }, data })
        }
        await tx.profileUpdateRequest.update({
          where: { id: requestId },
          data: { status: "APPROVED" },
        })
      })
    }

    revalidatePath(`/dashboard/members/${req.memberId}`)
    revalidatePath("/portal/profile")
    revalidatePath("/portal/requests")
    revalidatePath("/dashboard/profile-approvals")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function rejectProfileUpdateRequest(
  requestId: string,
  reason?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // S16 fix: require TRANSACTION_APPROVE permission (sister to approve).
    const actor = await requirePermission(await getCurrentUser(), PERMISSIONS.TRANSACTION_APPROVE)
    if (!actor) {
      return { ok: false, error: "Unauthorized." }
    }

    const req = await prisma.profileUpdateRequest.findUnique({ where: { id: requestId } })
    if (!req) return { ok: false, error: "Request not found." }
    if (req.status !== "PENDING")
      return { ok: false, error: "This request has already been processed." }

    const trimmed = reason?.trim()
    await prisma.profileUpdateRequest.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        // Store the reject reason + reviewer email INSIDE the JSON payload,
        // since ProfileUpdateRequest has no dedicated reviewedBy/reviewedAt
        // columns in the schema.
        payload: {
          ...(req.payload as object | null ?? {}),
          ...(trimmed ? { rejectReason: trimmed } : {}),
          _reviewedBy: actor.email,
          _reviewedAt: new Date().toISOString(),
        },
      },
    })

    revalidatePath("/portal/profile")
    revalidatePath("/portal/requests")
    revalidatePath("/dashboard/profile-approvals")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// Withdrawal / Account-closure requests (MemberRequest table)
// Approval here marks the request; the actual money movement is created as a
// Transaction through the Transactions Module for proper Maker-Checker control.
// ---------------------------------------------------------------------------
export async function approveMemberRequest(
  requestId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // S16 fix: require TRANSACTION_APPROVE permission. Previously used
    // getCurrentUser() only — an unauthenticated caller could trigger the
    // approval flow. requirePermission throws on null actor.
    const actor = await requirePermission(await getCurrentUser(), PERMISSIONS.TRANSACTION_APPROVE)
    if (!actor) {
      return { ok: false, error: "Unauthorized." }
    }

    const req = await prisma.memberRequest.findUnique({ where: { id: requestId } })
    if (!req) return { ok: false, error: "Request not found." }
    if (req.status !== "PENDING")
      return { ok: false, error: "This request has already been processed." }

    // For WITHDRAWAL requests that have a linked Transaction (the new flow
    // since submitWithdrawalRequest now creates both rows), delegate to
    // approveTransaction — which handles ALL the accounting:
    //   - postTransactionEffects() debits the member's savings balance
    //     (Dr MEMBER-SAVINGS-LIABILITY, Cr Cash/Bank)
    //   - Creates the JournalEntry + Savings mirror row (the voucher)
    //   - notifyMember() sends the money-receipt link email + SMS
    //   - The linked MemberRequest is auto-marked APPROVED inside the same
    //     DB transaction (see approveTransaction §8)
    //
    // For CLOSING requests (and legacy WITHDRAWAL requests without a linked
    // Transaction), fall through to the simple status-update path below.
    if (req.type === "WITHDRAWAL") {
      const linked = await prisma.transaction.findFirst({
        where: { memberRequestId: requestId, status: "PENDING_APPROVAL" },
        select: { id: true },
      })
      if (linked) {
        // Delegate to the full Transaction approval flow — this is where the
        // voucher, journal entry, savings mirror, and member notification are
        // all generated. If approveTransaction throws (e.g. insufficient
        // balance, missing COA), we surface the error to the admin.
        const { approveTransaction } = await import("@/app/actions/transactions")
        const result = await approveTransaction(linked.id)
        if (!result.ok) {
          return { ok: false, error: result.error }
        }
        // approveTransaction already revalidates the relevant paths + marks
        // the MemberRequest as APPROVED. Just revalidate the member-requests
        // tab as a safety net.
        revalidatePath("/dashboard/transaction-approvals")
        revalidatePath("/portal/requests")
        return { ok: true }
      }
    }

    // For DEPOSIT requests the actual money movement + receipt generation
    // is driven by the linked Transaction, so this path is only used for
    // WITHDRAWAL (legacy, no linked Transaction) / CLOSING requests. We
    // still record who acted + when so the member portal can show the
    // review trail.
    await prisma.memberRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        reviewedBy: actor.email,
        reviewedAt: new Date(),
      },
    })
    revalidatePath("/dashboard/transaction-approvals")
    revalidatePath("/portal/requests")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function rejectMemberRequest(
  requestId: string,
  reason?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // S16 fix: require TRANSACTION_APPROVE permission (sister to approve).
    const actor = await requirePermission(await getCurrentUser(), PERMISSIONS.TRANSACTION_APPROVE)
    if (!actor) {
      return { ok: false, error: "Unauthorized." }
    }

    const req = await prisma.memberRequest.findUnique({ where: { id: requestId } })
    if (!req) return { ok: false, error: "Request not found." }
    if (req.status !== "PENDING")
      return { ok: false, error: "This request has already been processed." }

    const trimmed = reason?.trim()
    await prisma.memberRequest.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        rejectionReason: trimmed || null,
        reviewedBy: actor.email,
        reviewedAt: new Date(),
      },
    })

    // For DEPOSIT and WITHDRAWAL requests, also reject the linked pending
    // Transaction so it disappears from the admin approval queue. Best-effort:
    // if the Transaction is missing or already processed, the MemberRequest
    // rejection above is still the source of truth.
    if (req.type === "DEPOSIT" || req.type === "WITHDRAWAL") {
      const linked = await prisma.transaction.findFirst({
        where: { memberRequestId: requestId, status: "PENDING_APPROVAL" },
        select: { id: true },
      })
      if (linked) {
        await prisma.transaction.update({
          where: { id: linked.id },
          data: {
            status: "REJECTED",
            rejectionReason: trimmed || "Rejected from member-request queue",
            rejectedBy: actor.email,
            rejectedById: actor.id,
            rejectedAt: new Date(),
          },
        })
      }
    }

    revalidatePath("/dashboard/transaction-approvals")
    revalidatePath("/portal/requests")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Transparency settings — toggle flags only (never secrets).
 *
 * Returns the 4 per-feature on/off booleans so the portal sidebar can hide
 * disabled modules and the portal pages can short-circuit. Defaults every
 * flag to `true` when the singleton row is missing, matching the model's
 * `@default(true)` semantics.
 */
export async function getTransparencySettings(): Promise<{
  showBankStatement: boolean
  showInvestments: boolean
  showProjects: boolean
  showMeetingMinutes: boolean
}> {
  const s = await prisma.transparencySettings.findUnique({ where: { id: "singleton" } })
  if (!s) {
    return { showBankStatement: true, showInvestments: true, showProjects: true, showMeetingMinutes: true }
  }
  return {
    showBankStatement: s.showBankStatement,
    showInvestments: s.showInvestments,
    showProjects: s.showProjects,
    showMeetingMinutes: s.showMeetingMinutes,
  }
}

// ============================================================================
// NOMINEE SELF-SERVICE (Roadmap item 18)
//
// The member portal now lets a member manage their own nominees — add, edit,
// delete. Each mutation derives the `memberId` from the session (NOT from the
// request body) so a tampered `memberId` in the form data can't write to
// another member's nominees (IDOR fix — same pattern as the IDOR audit
// elsewhere). Each change also fires a `createAdminNotification` so the
// office sees the nominee change and can verify the new nominee's ID.
// ============================================================================

/**
 * Resolve the memberId from the current session. Throws if the caller isn't
 * a logged-in MEMBER. This is the IDOR fix pattern — used by `upsertNominee`
 * and `deleteNominee` below so the body's `memberId` is ignored.
 */
async function getCurrentMemberId(): Promise<string> {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") {
    throw new Error("You must be signed in as a member to perform this action.")
  }
  return session.user.id
}

export interface NomineeInput {
  id?: string
  name: string
  relation: string
  phone: string | null
  email: string | null
  dateOfBirth: Date | null
  nidNumber: string | null
  idType: string
  sharePercentage: number
  photoUrl: string | null
  signatureUrl: string | null
  idDocumentUrl: string | null
}

export async function upsertNominee(
  input: NomineeInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const memberId = await getCurrentMemberId()
    if (!input.name.trim() || !input.relation.trim()) {
      return { ok: false, error: "Name and relation are required." }
    }
    if (input.sharePercentage < 0 || input.sharePercentage > 100) {
      return { ok: false, error: "Share percentage must be between 0 and 100." }
    }

    // Run inside a $transaction so a partial failure (nominee written but
    // notification missing) can't leave the system inconsistent.
    const nominee = await directPrisma.$transaction(async (tx) => {
      // Verify total share across nominees stays <= 100% (excluding the row
      // we're editing, if any).
      const others = await tx.memberNominee.findMany({
        where: { memberId, ...(input.id ? { id: { not: input.id } } : {}) },
        select: { sharePercentage: true },
      })
      const othersTotal = others.reduce((s, n) => s + Number(n.sharePercentage), 0)
      if (othersTotal + input.sharePercentage > 100.01) {
        throw new Error(
          `Total share would exceed 100% (existing ${othersTotal.toFixed(2)}% + new ${input.sharePercentage}%).`
        )
      }

      if (input.id) {
        // Update only if the row belongs to the current member.
        return tx.memberNominee.update({
          where: { id: input.id, memberId },
          data: {
            name: input.name.trim(),
            relation: input.relation.trim(),
            phone: input.phone,
            email: input.email,
            dateOfBirth: input.dateOfBirth,
            nidNumber: input.nidNumber,
            idType: input.idType,
            sharePercentage: input.sharePercentage,
            photoUrl: input.photoUrl,
            signatureUrl: input.signatureUrl,
            idDocumentUrl: input.idDocumentUrl,
          },
        })
      }
      return tx.memberNominee.create({
        data: {
          memberId,
          name: input.name.trim(),
          relation: input.relation.trim(),
          phone: input.phone,
          email: input.email,
          dateOfBirth: input.dateOfBirth,
          nidNumber: input.nidNumber,
          idType: input.idType,
          sharePercentage: input.sharePercentage,
          photoUrl: input.photoUrl,
          signatureUrl: input.signatureUrl,
          idDocumentUrl: input.idDocumentUrl,
        },
      })
    })

    // Notify admins of the change. Best-effort — never throws.
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { memberNo: true, fullName: true },
    })
    await createAdminNotification({
      type: "NOMINEE_CHANGE",
      title: `Nominee ${input.id ? "updated" : "added"} by ${member?.fullName ?? "member"}`,
      message: `${member?.fullName ?? "Member"} (${member?.memberNo ?? memberId}) ${
        input.id ? "updated" : "added"
      } nominee "${input.name}" (relation: ${input.relation}, share: ${input.sharePercentage}%). Verify the nominee's identity.`,
      link: `/dashboard/members/${memberId}`,
    })

    return { ok: true, id: nominee.id }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function deleteNominee(
  nomineeId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const memberId = await getCurrentMemberId()
    // The where clause includes `memberId` so a member can't delete another
    // member's nominee by guessing its id.
    const deleted = await directPrisma.memberNominee.deleteMany({
      where: { id: nomineeId, memberId },
    })
    if (deleted.count === 0) {
      return { ok: false, error: "Nominee not found." }
    }

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { memberNo: true, fullName: true },
    })
    await createAdminNotification({
      type: "NOMINEE_CHANGE",
      title: `Nominee removed by ${member?.fullName ?? "member"}`,
      message: `${member?.fullName ?? "Member"} (${member?.memberNo ?? memberId}) removed nominee ${nomineeId}.`,
      link: `/dashboard/members/${memberId}`,
    })

    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
