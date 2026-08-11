"use server"

// Admin / committee actions for the Trust Score system (FRS §9.2, §12, §17).
//
// These are the ONLY manual entry points into the scoring system:
//   - reactivateMember  (Committee / Admin — gated by score threshold)
//   - saveKpiConfig     (Admin — re-validates weights sum + batch recalc)
//
// There is intentionally NO action to edit a member's score directly (FRS §3, §18).

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import {
  recalculateTrustScore,
  getKpiConfig,
  invalidateKpiConfigCache,
} from "@/lib/trustScore"

// =====================================================================
// REACTIVATE A SUSPENDED MEMBER (FRS §9.2)
// Committee / Admin only. Allowed only when the current score clears the
// reactivation threshold; the orchestrator lifts the suspension status.
// =====================================================================
export async function reactivateMember(memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { status: true, trustScore: true },
  })
  if (!member) throw new Error("Member not found.")
  if (member.status !== "SUSPENDED") {
    throw new Error("Only suspended members can be reactivated.")
  }

  const config = await getKpiConfig()
  if (member.trustScore < config.reactivationThreshold) {
    throw new Error(
      `Cannot reactivate: Trust Score (${member.trustScore}) is below the reactivation threshold (${config.reactivationThreshold}).`
    )
  }

  // The orchestrator handles the full recalc + status lift + audit row.
  await recalculateTrustScore(memberId, "MEMBER_REACTIVATED", {
    referenceType: "member",
    createdBy: "COMMITTEE",
  })

  revalidatePath(`/dashboard/trust-score/${memberId}`)
  revalidatePath("/dashboard/trust-score")
  revalidatePath(`/dashboard/members/${memberId}`)
}

// =====================================================================
// SAVE KPI CONFIGURATION (FRS §12)
// Admin only. Validates that the five KPI weights sum to exactly 100 and that
// badge thresholds are non-overlapping; blocks the save otherwise. On success,
// triggers a background batch recalc across all members (FRS §20 edge case).
// =====================================================================
export async function saveKpiConfig(formData: FormData) {
  const data = {
    depositWeight: parseInt((formData.get("depositWeight") as string) || "0", 10),
    loanWeight: parseInt((formData.get("loanWeight") as string) || "0", 10),
    attendanceWeight: parseInt((formData.get("attendanceWeight") as string) || "0", 10),
    fineWeight: parseInt((formData.get("fineWeight") as string) || "0", 10),
    referralWeight: parseInt((formData.get("referralWeight") as string) || "0", 10),
    initialScore: parseInt((formData.get("initialScore") as string) || "0", 10),
    suspensionThreshold: parseInt((formData.get("suspensionThreshold") as string) || "0", 10),
    reactivationThreshold: parseInt((formData.get("reactivationThreshold") as string) || "0", 10),
    badgeDiamondMin: parseInt((formData.get("badgeDiamondMin") as string) || "0", 10),
    badgePlatinumMin: parseInt((formData.get("badgePlatinumMin") as string) || "0", 10),
    badgeGoldMin: parseInt((formData.get("badgeGoldMin") as string) || "0", 10),
    badgeSilverMin: parseInt((formData.get("badgeSilverMin") as string) || "0", 10),
    badgeWarningMin: parseInt((formData.get("badgeWarningMin") as string) || "0", 10),
    badgeHighRiskMin: parseInt((formData.get("badgeHighRiskMin") as string) || "0", 10),
    approvedAbsenceCounts: formData.get("approvedAbsenceCounts") === "on",
    depositLinearInterp: formData.get("depositLinearInterp") === "on",
    loanRecoveryMonths: parseInt((formData.get("loanRecoveryMonths") as string) || "6", 10),
  }

  // Validation — weights must sum to exactly 100 (FRS §12.1).
  const weightSum =
    data.depositWeight +
    data.loanWeight +
    data.attendanceWeight +
    data.fineWeight +
    data.referralWeight
  if (weightSum !== 100) {
    throw new Error(`KPI weights must sum to 100. Current sum: ${weightSum}.`)
  }

  // Validation — badge thresholds non-overlapping & descending (FRS §12.4).
  const tiers = [
    data.badgeDiamondMin,
    data.badgePlatinumMin,
    data.badgeGoldMin,
    data.badgeSilverMin,
    data.badgeWarningMin,
    data.badgeHighRiskMin,
  ]
  for (let i = 0; i < tiers.length - 1; i++) {
    if (tiers[i] <= tiers[i + 1]) {
      throw new Error("Badge thresholds must be strictly descending (Diamond > Platinum > Gold > Silver > Warning > High Risk).")
    }
  }
  if (data.badgeHighRiskMin < 0 || data.badgeDiamondMin > 100) {
    throw new Error("Badge thresholds must stay within 0–100.")
  }
  if (data.suspensionThreshold >= data.reactivationThreshold) {
    throw new Error("Reactivation threshold must be higher than the suspension threshold.")
  }

  await prisma.kpiConfiguration.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data, updatedBy: "ADMIN", updatedAt: new Date() },
    update: { ...data, updatedBy: "ADMIN", updatedAt: new Date() },
  })

  invalidateKpiConfigCache()

  // Background batch recalc for all members (FRS §20). Non-blocking per member;
  // errors are logged but never abort the config save.
  const members = await prisma.member.findMany({
    where: { status: { in: ["ACTIVE", "SUSPENDED", "INACTIVE"] } },
    select: { id: true },
  })
  for (const m of members) {
    try {
      await recalculateTrustScore(m.id, "MEMBER_CONFIG_CHANGED", {
        referenceType: "config",
        createdBy: "ADMIN",
      })
    } catch (e) {
      console.error(`[trustScore] batch recalc failed for ${m.id}:`, e)
    }
  }

  revalidatePath("/dashboard/trust-score")
  revalidatePath("/dashboard/trust-score/config")
  redirect("/dashboard/trust-score/config")
}

/** Mark all of a member's score notifications as read (used by the portal). */
export async function markNotificationsRead(memberId: string) {
  await prisma.memberNotification.updateMany({
    where: { memberId, isRead: false },
    data: { isRead: true },
  })
  revalidatePath("/portal/trust-score")
}
