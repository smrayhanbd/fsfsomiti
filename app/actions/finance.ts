"use server"

import prisma, { directPrisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { recalculateTrustScore } from "@/lib/trustScore"
import {
  getCurrentUser,
  requirePermission,
  PERMISSIONS,
} from "@/lib/permissions"

// Valid PaymentMethod values per the Prisma enum (lib/transactions/types.ts).
// The Collection Entry form previously emitted "BANK" for the Bank Transfer
// option, which is NOT a valid PaymentMethod and silently broke the Savings
// insert. We now reject unknown values up-front and back-fill the legacy
// "BANK" -> "BANK_TRANSFER" mapping so existing client caches still work.
const VALID_METHODS = new Set([
  "CASH",
  "BANK_TRANSFER",
  "CHEQUE",
  "BKASH",
  "NAGAD",
  "ROCKET",
])

function normaliseMethod(raw: string): string {
  if (!raw) return ""
  // Backward-compat: the old Collection Entry form sent "BANK" for the
  // Bank Transfer option. Map it to the canonical enum value.
  if (raw === "BANK") return "BANK_TRANSFER"
  return raw
}

export async function addCollection(formData: FormData) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.TRANSACTION_CREATE)
  const memberId = formData.get("memberId") as string
  const amount = parseFloat(formData.get("amount") as string)
  const type = formData.get("type") as string
  const rawMethod = formData.get("method") as string
  const method = normaliseMethod(rawMethod)
  const date = formData.get("date") as string

  if (!memberId) {
    throw new Error("Member is required.")
  }
  if (!amount || isNaN(amount) || amount <= 0) {
    throw new Error("A positive amount is required.")
  }
  if (!type) {
    throw new Error("Collection type is required.")
  }
  if (!method || !VALID_METHODS.has(method)) {
    throw new Error(
      `Invalid payment method "${rawMethod}". Please select a valid option.`
    )
  }
  if (!date) {
    throw new Error("Collection date is required.")
  }

  // Generate Receipt Number (e.g., R0001)
  const collectionCount = await prisma.savings.count()
  const receiptNo = `R${String(collectionCount + 1).padStart(4, "0")}`

  const savings = await prisma.savings.create({
    data: {
      receiptNo,
      memberId,
      amount,
      type,
      method,
      date: new Date(date),
    },
  })

  // Trust Score event hook (FRS §8.1/§8.4). Must run before redirect() throws.
  // A scoring failure must never break the parent business operation.
  try {
    const eventType = type === "FINE" ? "FINE_ISSUED" : "DEPOSIT_COLLECTED"
    await recalculateTrustScore(memberId, eventType, {
      referenceId: savings.id,
      referenceType: type === "FINE" ? "fine" : "deposit",
    })
  } catch (e) {
    console.error("[trustScore] addCollection hook failed:", e)
  }

  revalidatePath("/dashboard/collection-entry")
  revalidatePath("/dashboard/members")
  redirect("/dashboard/collection-entry")
}

export async function addWithdrawal(formData: FormData) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.TRANSACTION_CREATE)
  const memberId = formData.get("memberId") as string
  const amount = parseFloat(formData.get("amount") as string)
  const method = formData.get("method") as string
  const date = formData.get("date") as string
  const referenceNo = (formData.get("referenceNo") as string) || null

  if (!memberId || !amount || amount <= 0) {
    throw new Error("Invalid withdrawal data")
  }

  // Generate Voucher Number (e.g., W0001)
  const withdrawalCount = await prisma.savings.count({ where: { type: "WITHDRAWAL" } })
  const voucherNo = `W${String(withdrawalCount + 1).padStart(4, "0")}`

  await prisma.savings.create({
    data: {
      receiptNo: voucherNo, // Reusing receiptNo field for Voucher No
      memberId,
      amount,
      type: "WITHDRAWAL",
      method,
      date: new Date(date),
    },
  })

  revalidatePath("/dashboard/deposits")
  redirect("/dashboard/deposits")
}
// --- Collection Type Actions ---
export async function createChargeType(formData: FormData) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  const name = formData.get("name") as string
  if (!name) throw new Error("Name is required")

  await prisma.chargeType.create({
    data: { name }
  })

  revalidatePath("/dashboard/collection-setup")
  redirect("/dashboard/collection-setup")
}

export async function updateCollectionType(id: string, name: string) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  if (!name) throw new Error("Name is required")
  
  await prisma.chargeType.update({
    where: { id },
    data: { name },
  })

  revalidatePath("/dashboard/collection-setup")
}

export async function deleteCollectionType(id: string) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  // Find the type to get its name
  const type = await prisma.chargeType.findUnique({ where: { id } })
  if (!type) throw new Error("Collection type not found.")

  // Safety Check: See if any FeeSetup uses this name
  const setupsCount = await prisma.feeSetup.count({
    where: { name: type.name }
  })

  if (setupsCount > 0) {
    throw new Error("Cannot delete: This Collection Type is used in existing Collection Setups.")
  }

  await prisma.chargeType.delete({ where: { id } })
  revalidatePath("/dashboard/collection-setup")
}

export async function toggleCollectionTypeStatus(id: string, isActive: boolean) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  await prisma.chargeType.update({
    where: { id },
    data: { isActive },
  })

  revalidatePath("/dashboard/collection-setup")
}

// --- Charge Type Actions ---
// Charge Type rows back the "Charge Type" tab on the Fees & Charge Setup page.
// These are free-form names created by the user (mirrors the Collection Type
// tab). The Charge Management page reads the active rows for its dropdown and
// snapshots the chosen name onto Transaction.chargeTypeName.

export async function createChargeTypeConfig(formData: FormData) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  const name = (formData.get("name") as string)?.trim()
  if (!name) throw new Error("Charge type name is required.")

  await prisma.chargeTypeConfig.create({
    data: { name },
  })

  revalidatePath("/dashboard/collection-setup")
  revalidatePath("/dashboard/transactions/charges")
  redirect("/dashboard/collection-setup")
}

export async function updateChargeTypeConfig(id: string, name: string) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  const trimmed = name?.trim()
  if (!trimmed) throw new Error("Charge type name is required.")

  await prisma.chargeTypeConfig.update({
    where: { id },
    data: { name: trimmed },
  })

  revalidatePath("/dashboard/collection-setup")
  revalidatePath("/dashboard/transactions/charges")
}

export async function deleteChargeTypeConfig(id: string) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  const config = await prisma.chargeTypeConfig.findUnique({ where: { id } })
  if (!config) throw new Error("Charge type not found.")

  // Safety check: refuse to delete a charge type whose name has been snapshotted
  // onto any charge transaction.
  const usedCount = await prisma.transaction.count({
    where: { transactionType: "CHARGE", chargeTypeName: config.name },
  })
  if (usedCount > 0) {
    throw new Error("Cannot delete: This charge type is used on existing transactions.")
  }

  await prisma.chargeTypeConfig.delete({ where: { id } })

  revalidatePath("/dashboard/collection-setup")
  revalidatePath("/dashboard/transactions/charges")
}

export async function toggleChargeTypeConfigStatus(id: string, isActive: boolean) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  await prisma.chargeTypeConfig.update({
    where: { id },
    data: { isActive },
  })

  revalidatePath("/dashboard/collection-setup")
  revalidatePath("/dashboard/transactions/charges")
}

// --- Updated Fee Setup Action ---
export async function createFeeSetup(formData: FormData) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  const chargeTypeId = formData.get("name") as string
  const amount = parseFloat(formData.get("amount") as string)
  const effectiveDate = new Date(formData.get("effectiveDate") as string)
  const frequency = formData.get("frequency") as string
  const dueDay = parseInt(formData.get("dueDay") as string)
  
  const hasFine = formData.get("hasFine") === "YES"
  const fineAmount = parseFloat(formData.get("fineAmount") as string) || 0
  
  const targetType = formData.get("targetType") as string
  const targetMemberIds = formData.get("targetMemberIds") as string

  if (!chargeTypeId || !amount || !effectiveDate || !dueDay) {
    throw new Error("All fields marked with * are required.")
  }

  if (targetType === "SPECIFIC" && (!targetMemberIds || JSON.parse(targetMemberIds).length === 0)) {
    throw new Error("Please select at least one member for 'Specific Members'.")
  }

  const chargeType = await prisma.chargeType.findUnique({ where: { id: chargeTypeId } })
  const chargeName = chargeType?.name || "Unknown Charge"

  await prisma.feeSetup.create({
    data: {
      name: chargeName,
      amount,
      effectiveDate,
      frequency,
      dueDay,
      hasFine,
      fineAmount: hasFine ? fineAmount : null,
      boardApproved: false, 
      targetType,
      targetMemberIds: targetType === "SPECIFIC" ? targetMemberIds : null,
    },
  })

  revalidatePath("/dashboard/collection-setup")
  redirect("/dashboard/collection-setup")
}

import { sendEmail } from "@/lib/email"
import { sendSMS } from "@/lib/sms"
import { calculateDues } from "@/lib/dueCalculator"
import type { PaymentMethod } from "@/lib/transactions/types"

// --- Bank Account Actions (Somiti Settings → Active Bank Accounts) ---
// Each BankAccount maps a PaymentMethod to the COA Account that should receive
// deposits made via that method. The Deposit form reads the default for the
// chosen method to auto-select the "Received COA".

/** Payment-method groups used by the UI. Methods in the same group share one
 *  default BankAccount — e.g. BANK_TRANSFER & CHEQUE both fall back to the same
 *  bank COA. We track the default at the group level so the user picks one
 *  "default bank account" rather than one per payment method. */
const METHOD_GROUPS: Record<PaymentMethod, "CASH" | "BANK" | "MOBILE"> = {
  CASH: "CASH",
  BANK_TRANSFER: "BANK",
  CHEQUE: "BANK",
  BKASH: "MOBILE",
  NAGAD: "MOBILE",
  ROCKET: "MOBILE",
}

/** All granular PaymentMethod values that belong to a group.
 *  Not exported: a "use server" module may only export async functions. */
const METHODS_BY_GROUP: Record<"CASH" | "BANK" | "MOBILE", PaymentMethod[]> = {
  CASH: ["CASH"],
  BANK: ["BANK_TRANSFER", "CHEQUE"],
  MOBILE: ["BKASH", "NAGAD", "ROCKET"],
}

/**
 * Set this BankAccount as the default for its payment-method group, unsetting
 * the previous default in the same group. Runs as one transaction so there is
 * never a window where a group has zero or two defaults.
 */
export async function setDefaultBankAccount(id: string, paymentMethod: PaymentMethod) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  const group = METHOD_GROUPS[paymentMethod]
  const groupMethods = METHODS_BY_GROUP[group]

  await directPrisma.$transaction([
    prisma.bankAccount.updateMany({
      where: { paymentMethod: { in: groupMethods } },
      data: { isDefault: false },
    }),
    prisma.bankAccount.update({ where: { id }, data: { isDefault: true } }),
  ])

  revalidatePath("/dashboard/settings/bank")
  revalidatePath("/dashboard/transactions/deposits")
}

export async function createBankAccount(formData: FormData) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  const accountName = (formData.get("accountName") as string)?.trim()
  const paymentMethod = formData.get("paymentMethod") as PaymentMethod
  const coaAccountId = formData.get("coaAccountId") as string
  const bankName = ((formData.get("bankName") as string) || "").trim() || null
  const accountNumber = ((formData.get("accountNumber") as string) || "").trim() || null
  const branch = ((formData.get("branch") as string) || "").trim() || null
  const isDefault = formData.get("isDefault") === "YES"

  if (!accountName) throw new Error("Account name is required.")
  if (!paymentMethod) throw new Error("Collection method is required.")
  if (!coaAccountId) throw new Error("A Chart-of-Accounts account must be linked.")

  // Validate the linked COA exists and is an active, postable account.
  const coa = await prisma.account.findUnique({
    where: { id: coaAccountId },
    select: { id: true, status: true, allowPosting: true, accountName: true },
  })
  if (!coa) throw new Error("Linked account not found.")
  if (coa.status !== "ACTIVE" || !coa.allowPosting) {
    throw new Error(`Account "${coa.accountName}" is not active/postable.`)
  }

  const created = await prisma.bankAccount.create({
    data: { accountName, bankName, accountNumber, branch, paymentMethod, coaAccountId, isDefault },
  })

  // If marked default, demote siblings in the same group.
  if (isDefault) {
    await setDefaultBankAccount(created.id, paymentMethod)
  }

  revalidatePath("/dashboard/settings/bank")
  revalidatePath("/dashboard/transactions/deposits")
  redirect("/dashboard/settings/bank")
}

export async function updateBankAccount(id: string, formData: FormData) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  const accountName = (formData.get("accountName") as string)?.trim()
  const paymentMethod = formData.get("paymentMethod") as PaymentMethod
  const coaAccountId = formData.get("coaAccountId") as string
  const bankName = ((formData.get("bankName") as string) || "").trim() || null
  const accountNumber = ((formData.get("accountNumber") as string) || "").trim() || null
  const branch = ((formData.get("branch") as string) || "").trim() || null
  const isDefault = formData.get("isDefault") === "YES"

  if (!accountName || !paymentMethod || !coaAccountId) {
    throw new Error("Account name, method, and linked COA are required.")
  }

  await prisma.bankAccount.update({
    where: { id },
    data: { accountName, bankName, accountNumber, branch, paymentMethod, coaAccountId },
  })

  if (isDefault) {
    await setDefaultBankAccount(id, paymentMethod)
  } else {
    await prisma.bankAccount.update({ where: { id }, data: { isDefault: false } })
  }

  revalidatePath("/dashboard/settings/bank")
  revalidatePath("/dashboard/transactions/deposits")
}

export async function deleteBankAccount(id: string) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  await prisma.bankAccount.delete({ where: { id } })
  revalidatePath("/dashboard/settings/bank")
  revalidatePath("/dashboard/transactions/deposits")
}

export async function toggleBankAccountStatus(id: string, isActive: boolean) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  await prisma.bankAccount.update({ where: { id }, data: { isActive } })
  revalidatePath("/dashboard/settings/bank")
  revalidatePath("/dashboard/transactions/deposits")
}

export async function sendDueReminders() {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  const feeSetups = await prisma.feeSetup.findMany()
  const members = await prisma.member.findMany({
    where: { status: "ACTIVE" },
    include: { savings: true },
  })

  let smsCount = 0
  let emailCount = 0
  let failedCount = 0

  for (const member of members) {
      const dues = calculateDues(member.id, member.membershipDate || member.createdAt, feeSetups, member.savings)
    
    if (dues.totalDue > 0) {
      const msg = `Dear ${member.fullName}, your due balance is ৳ ${dues.totalDue.toLocaleString()}. Please clear your dues ASAP. - Future Savings Foundation`
      
      if (member.phone) {
        try {
          const smsRes = await sendSMS(member.phone, msg)
          if (smsRes.status === "OK") smsCount++
          else failedCount++
        } catch { failedCount++ }
      }
      
      if (member.email) {
        try {
          await sendEmail(
            member.email,
            "Payment Reminder - Future Savings Foundation",
            `<p>Dear ${member.fullName},</p><p>This is a gentle reminder that you have an outstanding due balance of <strong>৳ ${dues.totalDue.toLocaleString()}</strong>.</p><p>Please visit the office or your member portal to clear your dues.</p>`
          )
          emailCount++
        } catch { failedCount++ }
      }
    }
  }

  revalidatePath("/dashboard/due-list")
  return { success: true, smsCount, emailCount, failedCount }
}