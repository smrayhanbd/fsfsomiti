"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import {
  getCurrentUser,
  requirePermission,
  isSuperAdmin,
  PERMISSIONS,
} from "@/lib/permissions"

/**
 * Server actions for managing DepositProducts (the admin rate sheet for term
 * deposits). All mutations require SUPER_ADMIN — admins can read the list
 * (for the member-facing deposit UI) but only the super admin edits rates.
 *
 * Same permission pattern as loan products and other admin entities.
 */

export interface DepositProductInput {
  id?: string
  name: string
  code: string
  termMonths: number
  minAmount: number
  maxAmount?: number | null
  profitRate: number
  profitSharingRatio: number
  maturityBehavior: "REINVEST" | "WITHDRAW" | "RENEW"
  status: "ACTIVE" | "INACTIVE"
}

export async function createDepositProduct(
  input: DepositProductInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const user = await requirePermission(
      await getCurrentUser(),
      PERMISSIONS.USER_MANAGE
    )
    if (!isSuperAdmin(user)) {
      return { ok: false, error: "Only the Super Admin can manage deposit products." }
    }
    if (!input.name.trim() || !input.code.trim()) {
      return { ok: false, error: "Name and code are required." }
    }
    if (input.termMonths <= 0) {
      return { ok: false, error: "Term must be at least 1 month." }
    }
    if (input.profitRate < 0 || input.profitSharingRatio < 0 || input.profitSharingRatio > 1) {
      return { ok: false, error: "Invalid rate or sharing ratio." }
    }

    const product = await prisma.depositProduct.create({
      data: {
        name: input.name.trim(),
        code: input.code.trim().toUpperCase(),
        termMonths: input.termMonths,
        minAmount: input.minAmount,
        maxAmount: input.maxAmount ?? null,
        profitRate: input.profitRate,
        profitSharingRatio: input.profitSharingRatio,
        maturityBehavior: input.maturityBehavior,
        status: input.status,
      },
    })
    revalidatePath("/dashboard/deposit-products")
    revalidatePath("/portal/deposits")
    return { ok: true, id: product.id }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function updateDepositProduct(
  input: DepositProductInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const user = await requirePermission(
      await getCurrentUser(),
      PERMISSIONS.USER_MANAGE
    )
    if (!isSuperAdmin(user)) {
      return { ok: false, error: "Only the Super Admin can manage deposit products." }
    }
    if (!input.id) {
      return { ok: false, error: "Product id is required for update." }
    }

    await prisma.depositProduct.update({
      where: { id: input.id },
      data: {
        name: input.name.trim(),
        code: input.code.trim().toUpperCase(),
        termMonths: input.termMonths,
        minAmount: input.minAmount,
        maxAmount: input.maxAmount ?? null,
        profitRate: input.profitRate,
        profitSharingRatio: input.profitSharingRatio,
        maturityBehavior: input.maturityBehavior,
        status: input.status,
      },
    })
    revalidatePath("/dashboard/deposit-products")
    revalidatePath("/portal/deposits")
    return { ok: true, id: input.id }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function deleteDepositProduct(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await requirePermission(
      await getCurrentUser(),
      PERMISSIONS.USER_MANAGE
    )
    if (!isSuperAdmin(user)) {
      return { ok: false, error: "Only the Super Admin can delete deposit products." }
    }
    await prisma.depositProduct.delete({ where: { id } })
    revalidatePath("/dashboard/deposit-products")
    revalidatePath("/portal/deposits")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
