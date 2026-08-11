"use server"

import prisma, { directPrisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { getCurrentUser, requireSuperAdmin } from "@/lib/permissions"

export type ActionResult = { ok: true } | { ok: false; error: string }

const PATH = "/dashboard/settings/approval-limits"

export interface ApprovalLimitInput {
  id?: string
  level: number
  label: string
  role: "ADMIN" | "SUPER_ADMIN"
  permission?: string | null
  minAmount: number
  maxAmount: number
  isActive: boolean
}

/** Replace the full approval-limits configuration in one transaction (spec §13). */
export async function saveApprovalLimits(rows: ApprovalLimitInput[]): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    requireSuperAdmin(user)

    if (rows.length === 0) return { ok: false, error: "Add at least one tier." }
    // Basic validation: ranges ascending, no overlap, labels present.
    const sorted = [...rows].sort((a, b) => a.minAmount - b.minAmount)
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i]
      if (!r.label.trim()) return { ok: false, error: `Tier ${i + 1}: label required.` }
      if (r.minAmount < 0) return { ok: false, error: `Tier ${i + 1}: min amount ≥ 0.` }
      if (r.maxAmount <= r.minAmount)
        return { ok: false, error: `Tier ${i + 1}: max must exceed min.` }
      if (i > 0 && r.minAmount <= sorted[i - 1].maxAmount) {
        return { ok: false, error: `Tier ${i + 1}: overlaps tier ${i}.` }
      }
    }
    // There must always be at least one SUPER_ADMIN tier (top of chain).
    if (!sorted.some((r) => r.role === "SUPER_ADMIN")) {
      return { ok: false, error: "At least one tier must be SUPER_ADMIN." }
    }

    await directPrisma.$transaction([
      prisma.approvalLimit.deleteMany({}),
      prisma.approvalLimit.createMany({
        data: sorted.map((r) => ({
          level: r.level,
          label: r.label.trim(),
          role: r.role,
          permission: r.permission || null,
          minAmount: r.minAmount,
          maxAmount: r.maxAmount,
          isActive: r.isActive,
        })),
      }),
    ])
    revalidatePath(PATH)
    revalidatePath("/dashboard/transaction-approvals")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
