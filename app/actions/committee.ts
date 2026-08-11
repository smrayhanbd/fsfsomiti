"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import {
  getCurrentUser,
  hasPermission,
  isSuperAdmin,
  requirePermission,
  PERMISSIONS,
} from "@/lib/permissions"
import { z } from "zod"

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string }

const COMMITTEES_PATH = "/dashboard/committees"

const committeeSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(120),
  description: z.string().max(5000).optional().nullable(),
  chairUserId: z.string().optional().nullable(),
})

// ──────────────────────────────────────────────────────────────────────────────
// CRUD
// ──────────────────────────────────────────────────────────────────────────────

export async function createCommittee(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission(await getCurrentUser(), PERMISSIONS.COMMITTEE_MANAGE)
    const parsed = committeeSchema.parse({
      name: formData.get("name"),
      description: formData.get("description") || null,
      chairUserId: formData.get("chairUserId") || null,
    })

    const created = await prisma.committee.create({
      data: {
        name: parsed.name,
        description: parsed.description ?? null,
        chairUserId: parsed.chairUserId || null,
      },
    })
    revalidatePath(COMMITTEES_PATH)
    return { ok: true, id: created.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create committee." }
  }
}

export async function updateCommittee(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requirePermission(await getCurrentUser(), PERMISSIONS.COMMITTEE_MANAGE)
    const parsed = committeeSchema.parse({
      name: formData.get("name"),
      description: formData.get("description") || null,
      chairUserId: formData.get("chairUserId") || null,
    })
    await prisma.committee.update({
      where: { id },
      data: {
        name: parsed.name,
        description: parsed.description ?? null,
        chairUserId: parsed.chairUserId || null,
      },
    })
    revalidatePath(COMMITTEES_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update committee." }
  }
}

export async function toggleCommitteeActive(id: string): Promise<ActionResult> {
  try {
    const user = await requirePermission(await getCurrentUser(), PERMISSIONS.COMMITTEE_MANAGE)
    const current = await prisma.committee.findUnique({ where: { id }, select: { isActive: true } })
    if (!current) throw new Error("Committee not found.")
    await prisma.committee.update({ where: { id }, data: { isActive: !current.isActive } })
    revalidatePath(COMMITTEES_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to toggle committee." }
  }
}

export async function deleteCommittee(id: string): Promise<ActionResult> {
  try {
    await requirePermission(await getCurrentUser(), PERMISSIONS.COMMITTEE_MANAGE)
    // Block deletion if tasks are still assigned to this committee.
    const linked = await prisma.taskAssignee.count({ where: { committeeId: id } })
    if (linked > 0) throw new Error("This committee still has tasks assigned. Reassign them first.")
    await prisma.committee.delete({ where: { id } })
    revalidatePath(COMMITTEES_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete committee." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// MEMBERSHIPS
// ──────────────────────────────────────────────────────────────────────────────

export async function addCommitteeMember(committeeId: string, data: {
  memberId?: string
  userId?: string
  role?: string
}): Promise<ActionResult> {
  try {
    await requirePermission(await getCurrentUser(), PERMISSIONS.COMMITTEE_MANAGE)
    if (!data.memberId && !data.userId) throw new Error("Select a member or staff user.")
    // Compound uniques guard against duplicates — but we still handle it gracefully.
    try {
      await prisma.committeeMember.create({
        data: { committeeId, memberId: data.memberId ?? null, userId: data.userId ?? null, role: data.role ?? null },
      })
    } catch {
      return { ok: false, error: "This person is already a member of the committee." }
    }
    revalidatePath(COMMITTEES_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to add member." }
  }
}

export async function removeCommitteeMember(membershipId: string): Promise<ActionResult> {
  try {
    await requirePermission(await getCurrentUser(), PERMISSIONS.COMMITTEE_MANAGE)
    await prisma.committeeMember.delete({ where: { id: membershipId } }).catch(() => undefined)
    revalidatePath(COMMITTEES_PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to remove member." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// READS
// ──────────────────────────────────────────────────────────────────────────────

export async function listCommittees() {
  const committees = await prisma.committee.findMany({
    include: {
      chairUser: { select: { id: true, name: true, email: true } },
      members: {
        include: {
          member: { select: { id: true, fullName: true, memberNo: true, phone: true } },
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
      _count: { select: { taskAssignees: true } },
    },
    orderBy: { name: "asc" },
  })
  return JSON.parse(JSON.stringify(committees))
}

export async function listStaffForSelect() {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  })
  return JSON.parse(JSON.stringify(users))
}
