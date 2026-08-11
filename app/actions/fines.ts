"use server"

// Fines & Penalties management (FRS §5.5, §12.3).
//
// FineTypes are configurable categories with a penaltyPoints value that feeds
// the FINE KPI. Fines are issued against members; paying or waiving a fine
// reverses its penalty immediately via a Trust Score recalc.

import prisma, { directPrisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { recalculateTrustScore } from "@/lib/trustScore"
import { Prisma } from "@prisma/client"
import {
  getCurrentUser,
  requirePermission,
  PERMISSIONS,
} from "@/lib/permissions"
import { postTransactionEffects } from "@/lib/transactions/posting"

const FINES_PATH = "/dashboard/fines"

// =====================================================================
// FINE TYPES (FRS §12.3)
// =====================================================================

export async function createFineType(formData: FormData) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.TRANSACTION_APPROVE)
  const typeName = (formData.get("typeName") as string)?.trim()
  const penaltyPoints = parseInt((formData.get("penaltyPoints") as string) || "0", 10)
  if (!typeName) throw new Error("Fine type name is required.")
  if (!penaltyPoints || penaltyPoints <= 0) {
    throw new Error("Penalty points must be greater than zero.")
  }

  // B2: wrap every write in a single transaction so partial failures don't
  // leave half-configured state. (A single create here, but the transaction
  // boundary keeps the pattern uniform across the file and protects against
  // future multi-write additions.)
  try {
    await directPrisma.$transaction(async (tx) => {
      await tx.fineType.create({ data: { typeName, penaltyPoints } })
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("A fine type with this name already exists.")
    }
    throw e
  }
  revalidatePath(FINES_PATH)
  redirect(FINES_PATH)
}

export async function toggleFineTypeStatus(id: string, isActive: boolean) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.TRANSACTION_APPROVE)
  await directPrisma.$transaction(async (tx) => {
    await tx.fineType.update({ where: { id }, data: { isActive } })
  })
  revalidatePath(FINES_PATH)
}

export async function deleteFineType(id: string) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.TRANSACTION_APPROVE)
  // B2: wrap the read-then-delete so concurrent inserts between the in-use
  // check and the delete can't slip a Fine referencing this type through.
  await directPrisma.$transaction(async (tx) => {
    // Guard: cannot delete a type that's referenced by existing fines.
    const inUse = await tx.fine.count({ where: { fineTypeId: id } })
    if (inUse > 0) {
      throw new Error("Cannot delete: this fine type is used by existing fines. Deactivate it instead.")
    }
    await tx.fineType.delete({ where: { id } })
  })
  revalidatePath(FINES_PATH)
}

// =====================================================================
// FINES (issue / pay / waive) — FRS §5.5, §8.4
// =====================================================================

export async function issueFine(formData: FormData) {
  // B1/B2: authenticate the issuer and wrap every write (Fine create + Savings
  // mirror create + Fine.update linking the savings mirror) in a single
  // `directPrisma.$transaction` so they all succeed or fail together.
  //
  // Audit B2 also asks us to route issueFine through `postTransactionEffects`
  // so the GL stays in sync — i.e. issuing a fine now creates a proper
  // CHARGE JournalEntry (Dr MEMBER-SAVINGS-LIABILITY, Cr EXPENSE-RECOVERY-
  // INCOME) plus the member-facing Savings mirror row, instead of only the
  // Savings row that the legacy stub wrote.
  const user = await requirePermission(
    await getCurrentUser(),
    PERMISSIONS.TRANSACTION_APPROVE
  )

  const memberId = formData.get("memberId") as string
  const fineTypeId = formData.get("fineTypeId") as string
  const amount = parseFloat((formData.get("amount") as string) || "0") || 0
  const notes = (formData.get("notes") as string) || null

  if (!memberId || !fineTypeId) {
    throw new Error("Member and fine type are required.")
  }
  if (amount <= 0) {
    throw new Error("Fine amount must be greater than zero.")
  }

  const fineType = await prisma.fineType.findUnique({ where: { id: fineTypeId } })
  if (!fineType || !fineType.isActive) {
    throw new Error("Selected fine type is not active.")
  }

  const fine = await directPrisma.$transaction(async (tx) => {
    const created = await tx.fine.create({
      data: {
        memberId,
        fineTypeId,
        amount,
        status: "ISSUED",
        notes,
        referenceType: "manual",
      },
    })

    // Route through postTransactionEffects so the GL gets a balanced
    // CHARGE JournalEntry and the member-facing Savings mirror row is
    // created with a Counter-allocated receiptNo (voucher.ts handles the
    // atomic counter increment; we don't need a separate `fine-receipt`
    // Counter here). The Savings row type "FINE" matches the existing
    // due-list / member-ledger renderers so nothing downstream breaks.
    //
    // transactionType CHARGE does not require a cashAccountId (rules.ts
    // allows it) since issuing a fine moves no cash — it debits the
    // member's savings liability and credits expense-recovery income.
    const post = await postTransactionEffects(tx, {
      transactionId: created.id,
      transactionType: "CHARGE",
      amount,
      memberId,
      cashAccountId: null,
      narration: `Fine issued — ${fineType.typeName}${notes ? `: ${notes}` : ""}`,
      referenceNo: `FN-${created.id.slice(-8)}`,
      savingsType: "FINE",
      savingsMethod: "CASH",
    })

    // Link the Fine to the GL mirror so waive/pay can find it later.
    await tx.fine.update({
      where: { id: created.id },
      data: {
        referenceType: "savings",
        referenceId: post.savingsMirrorId,
      },
    })

    return created
  })

  // Trust Score: an issued (unresolved) fine deducts from the FINE KPI.
  try {
    await recalculateTrustScore(memberId, "FINE_ISSUED", {
      referenceId: fine.id,
      referenceType: "fine",
    })
  } catch (e) {
    console.error("[trustScore] issueFine hook failed:", e)
  }

  revalidatePath(FINES_PATH)
  revalidatePath(`/dashboard/members/${memberId}`)
  redirect(FINES_PATH)
}

/** Mark a fine as paid — reverses its penalty (FRS §5.5). */
export async function payFine(fineId: string) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.TRANSACTION_APPROVE)
  // B2: wrap the read-then-write so a concurrent waive/pay can't double-flip
  // the status between the check and the update.
  const fine = await directPrisma.$transaction(async (tx) => {
    const row = await tx.fine.findUnique({ where: { id: fineId } })
    if (!row) throw new Error("Fine not found.")
    if (row.status !== "ISSUED") throw new Error("Only issued fines can be paid.")
    return tx.fine.update({
      where: { id: fineId },
      data: { status: "PAID", resolvedDate: new Date() },
    })
  })

  try {
    await recalculateTrustScore(fine.memberId, "FINE_PAID", {
      referenceId: fineId,
      referenceType: "fine",
    })
  } catch (e) {
    console.error("[trustScore] payFine hook failed:", e)
  }

  revalidatePath(FINES_PATH)
  revalidatePath(`/dashboard/members/${fine.memberId}`)
}

/** Waive a fine — reverses its penalty immediately (FRS §5.5 / §8.4). */
export async function waiveFine(fineId: string) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.TRANSACTION_APPROVE)
  // B2: wrap the read-then-write so a concurrent pay/waive can't double-flip
  // the status between the check and the update.
  const fine = await directPrisma.$transaction(async (tx) => {
    const row = await tx.fine.findUnique({ where: { id: fineId } })
    if (!row) throw new Error("Fine not found.")
    if (row.status !== "ISSUED") throw new Error("Only issued fines can be waived.")
    return tx.fine.update({
      where: { id: fineId },
      data: { status: "WAIVED", resolvedDate: new Date() },
    })
  })

  try {
    await recalculateTrustScore(fine.memberId, "FINE_WAIVED", {
      referenceId: fineId,
      referenceType: "fine",
    })
  } catch (e) {
    console.error("[trustScore] waiveFine hook failed:", e)
  }

  revalidatePath(FINES_PATH)
  revalidatePath(`/dashboard/members/${fine.memberId}`)
}
