"use server"

import prisma, { directPrisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import {
  calculateExpectedProfit,
  maturityDate,
} from "@/lib/depositProfit"
import { nextTransactionNo } from "@/lib/transactions/voucher"

/**
 * Member-side term-deposit actions.
 *
 * `applyForDeposit` is the entry point — a member picks a DepositProduct
 * and a principal amount; this creates the MemberDeposit row, creates a
 * linked Transaction of type DEPOSIT for the principal, and links them. The
 * Transaction goes through the standard approval flow (PENDING_APPROVAL →
 * APPROVED), at which point the cash is moved via postTransactionEffects.
 *
 * Auth is derived from the session (MEMBER role), so a tampered `memberId`
 * in the body is ignored — same IDOR-fix pattern as the nominee actions.
 */

export interface ApplyDepositResult {
  ok: boolean
  id?: string
  transactionId?: string
  error?: string
}

export async function applyForDeposit(
  productId: string,
  principalAmount: number
): Promise<ApplyDepositResult> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || session.user.role !== "MEMBER") {
      return { ok: false, error: "You must be signed in as a member." }
    }
    const memberId = session.user.id

    if (!productId || principalAmount <= 0) {
      return { ok: false, error: "Product and a positive principal are required." }
    }

    // Load the product up-front so we can validate the principal range.
    const product = await prisma.depositProduct.findUnique({
      where: { id: productId },
    })
    if (!product) return { ok: false, error: "Product not found." }
    if (product.status !== "ACTIVE") {
      return { ok: false, error: "This product is no longer available." }
    }
    if (principalAmount < Number(product.minAmount)) {
      return {
        ok: false,
        error: `Minimum amount for this product is ৳${Number(product.minAmount).toLocaleString()}.`,
      }
    }
    if (product.maxAmount && principalAmount > Number(product.maxAmount)) {
      return {
        ok: false,
        error: `Maximum amount for this product is ৳${Number(product.maxAmount).toLocaleString()}.`,
      }
    }

    // Compute the deposit dates + expected profit.
    const startDate = new Date()
    startDate.setHours(0, 0, 0, 0)
    const matDate = maturityDate(startDate, product.termMonths)
    const expectedProfit = calculateExpectedProfit(
      principalAmount,
      Number(product.profitRate),
      product.termMonths,
      Number(product.profitSharingRatio)
    )

    // Create the MemberDeposit row + the linked Transaction inside a single
    // $transaction. The Transaction is created as PENDING_APPROVAL so it
    // flows through the normal Maker-Checker approval queue — the cash isn't
    // actually moved until an admin approves it.
    const result = await directPrisma.$transaction(async (tx) => {
      // Member must exist + be ACTIVE.
      const member = await tx.member.findUnique({
        where: { id: memberId },
        select: { id: true, status: true, memberNo: true, fullName: true, email: true },
      })
      if (!member) throw new Error("Member not found.")
      if (member.status !== "ACTIVE") {
        throw new Error(`Member account is ${member.status}.`)
      }

      // Generate the next transaction voucher number (TR-DEP-000001 style).
      const voucherNo = await nextTransactionNo(tx, "DEPOSIT")

      // Create the Transaction (PENDING_APPROVAL — Maker-Checker applies).
      const txn = await tx.transaction.create({
        data: {
          voucherNo,
          transactionType: "DEPOSIT",
          subType: "SAVINGS_DEPOSIT",
          category: "MEMBER",
          memberId,
          amount: new Prisma.Decimal(principalAmount),
          paymentMethod: null, // filled by admin on approval
          referenceNo: `TERM-DEPOSIT-${product.code}`,
          status: "PENDING_APPROVAL",
          memberSubmitted: true,
          breakdown: {
            productId,
            productName: product.name,
            principalAmount,
            termMonths: product.termMonths,
            expectedProfit,
          } as Prisma.InputJsonValue,
          remarks: `Term deposit application — ${product.name} (${product.termMonths} months @ ${Number(product.profitRate).toFixed(4)})`,
          createdBy: member.email || member.memberNo,
          createdById: member.id,
          transactionDate: new Date(),
        },
      })

      // Create the MemberDeposit row, linked to the Transaction.
      const deposit = await tx.memberDeposit.create({
        data: {
          memberId,
          productId,
          principalAmount: new Prisma.Decimal(principalAmount),
          startDate,
          maturityDate: matDate,
          expectedProfit: new Prisma.Decimal(expectedProfit),
          status: "ACTIVE",
          transactionId: txn.id,
        },
      })

      return { deposit, txn }
    })

    revalidatePath("/portal/deposits")
    revalidatePath("/dashboard/transaction-approvals")
    return {
      ok: true,
      id: result.deposit.id,
      transactionId: result.txn.id,
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
