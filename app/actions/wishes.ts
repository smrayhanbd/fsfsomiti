"use server"

import prisma from "@/lib/prisma"
import { Prisma, WishType, WishChannel } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { sendSpecialWishesForDate } from "@/lib/specialWishes"
import { getCurrentUser } from "@/lib/permissions"
import { requireAction, canPerformAction, authErrorResult } from "@/lib/auth-guard"

// Permission scope — "Special Wishes" page under "Operations & Management".
const SCOPE = {
  menuGroup: "Operations & Management",
  page: "Special Wishes",
} as const

// ===================== Festival CRUD =====================

export async function addFestival(formData: FormData) {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be signed in.")

  try {
    await requireAction(user, SCOPE.menuGroup, SCOPE.page, "create_wish")
  } catch (e) {
    throw e instanceof Error ? e : new Error("Authorization failed")
  }

  const name = formData.get("name") as string
  const month = parseInt(formData.get("month") as string)
  const day = parseInt(formData.get("day") as string)
  const message = (formData.get("message") as string) || null

  if (!name || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error("Invalid festival data. Name, month (1-12), and day (1-31) are required.")
  }

  await prisma.festival.create({
    data: { name, month, day, message },
  })

  revalidatePath("/dashboard/wishes")
}

export async function updateFestival(id: string, formData: FormData) {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be signed in.")

  try {
    await requireAction(user, SCOPE.menuGroup, SCOPE.page, "edit_wish")
  } catch (e) {
    throw e instanceof Error ? e : new Error("Authorization failed")
  }

  const name = formData.get("name") as string
  const month = parseInt(formData.get("month") as string)
  const day = parseInt(formData.get("day") as string)
  const message = (formData.get("message") as string) || null
  const isActive = formData.get("isActive") === "on"

  if (!name || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error("Invalid festival data. Name, month (1-12), and day (1-31) are required.")
  }

  await prisma.festival.update({
    where: { id },
    data: { name, month, day, message, isActive },
  })

  revalidatePath("/dashboard/wishes")
}

export async function toggleFestivalStatus(id: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be signed in.")

  try {
    await requireAction(user, SCOPE.menuGroup, SCOPE.page, "edit_wish")
  } catch (e) {
    throw e instanceof Error ? e : new Error("Authorization failed")
  }

  const festival = await prisma.festival.findUnique({ where: { id } })
  if (!festival) throw new Error("Festival not found.")

  await prisma.festival.update({
    where: { id },
    data: { isActive: !festival.isActive },
  })

  revalidatePath("/dashboard/wishes")
}

export async function deleteFestival(id: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be signed in.")

  try {
    await requireAction(user, SCOPE.menuGroup, SCOPE.page, "delete_wish")
  } catch (e) {
    throw e instanceof Error ? e : new Error("Authorization failed")
  }

  await prisma.festival.delete({ where: { id } })
  revalidatePath("/dashboard/wishes")
}

// ===================== Manual Send =====================

export async function sendWishesNow() {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be signed in.")

  try {
    await requireAction(user, SCOPE.menuGroup, SCOPE.page, "send_sms")
  } catch (e) {
    throw e instanceof Error ? e : new Error("Authorization failed")
  }

  const summary = await sendSpecialWishesForDate()
  revalidatePath("/dashboard/wishes")
  return summary
}

// ===================== Data Fetchers =====================

export type WishLogWithDetails = {
  id: string
  type: string
  message: string
  channel: string
  status: string
  error: string | null
  sentAt: string
  member: { id: string; fullName: string; memberNo: string } | null
  festival: { id: string; name: string } | null
}

export async function getWishLogs(
  page = 1,
  limit = 50,
  filters?: { type?: WishType; channel?: WishChannel; status?: string }
): Promise<{ logs: WishLogWithDetails[]; total: number; pages: number }> {
  const user = await getCurrentUser()
  if (!user) return { logs: [], total: 0, pages: 0 }

  // Read access — requires page-level view permission.
  const canView = await canPerformAction(user, SCOPE.menuGroup, SCOPE.page, "send_sms")
  if (!canView) return { logs: [], total: 0, pages: 0 }

  const where: Prisma.SpecialWishLogWhereInput = {}
  if (filters?.type) where.type = filters.type
  if (filters?.channel) where.channel = filters.channel
  if (filters?.status) where.status = filters.status

  const [logs, total] = await Promise.all([
    prisma.specialWishLog.findMany({
      where,
      include: {
        member: { select: { id: true, fullName: true, memberNo: true } },
        festival: { select: { id: true, name: true } },
      },
      orderBy: { sentAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.specialWishLog.count({ where }),
  ])

  return {
    logs: logs.map((l) => ({
      ...l,
      sentAt: l.sentAt.toISOString(),
      member: l.member
        ? { id: l.member.id, fullName: l.member.fullName, memberNo: l.member.memberNo }
        : null,
      festival: l.festival ? { id: l.festival.id, name: l.festival.name } : null,
    })),
    total,
    pages: Math.ceil(total / limit),
  }
}

export async function getWishStats() {
  const user = await getCurrentUser()
  if (!user) return { totalSent: 0, todaySent: 0, todayFailed: 0, memberCount: 0, festivalCount: 0 }

  const canView = await canPerformAction(user, SCOPE.menuGroup, SCOPE.page, "send_sms")
  if (!canView) return { totalSent: 0, todaySent: 0, todayFailed: 0, memberCount: 0, festivalCount: 0 }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [totalSent, todaySent, todayFailed, memberCount] = await Promise.all([
    prisma.specialWishLog.count({ where: { status: "SENT" } }),
    prisma.specialWishLog.count({
      where: { sentAt: { gte: today }, status: "SENT" },
    }),
    prisma.specialWishLog.count({
      where: { sentAt: { gte: today }, status: "FAILED" },
    }),
    prisma.member.count({ where: { status: "ACTIVE", deletedAt: null } }),
  ])

  const festivalCount = await prisma.festival.count({ where: { isActive: true } })

  return { totalSent, todaySent, todayFailed, memberCount, festivalCount }
}
