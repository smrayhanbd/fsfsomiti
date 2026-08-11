"use server"
/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Election Management — server actions (admin + member).
// ============================================================================
// Mirrors the existing app/actions/*.ts pattern: form-driven mutations use
// server actions; pure JSON/transactional endpoints (ballot submit, verify,
// certificate, exports) use /api/elections/* routes (see app/api/elections/).
//
// All actions enforce authorization via the existing RBAC system
// (requirePermission / requireSuperAdmin / getCurrentUser). Member actions
// derive memberId from the authenticated session — never from the request body.

import prisma, { directPrisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import bcrypt from "bcryptjs"
import {
  getCurrentUser,
  hasPermission,
  isSuperAdmin,
  requirePermission,
  requireActiveUser,
  PERMISSIONS,
  type CurrentUser,
} from "@/lib/permissions"
import {
  CreateElectionSchema,
  PositionSchema,
  NominationSchema,
  OverrideEligibilitySchema,
  ResolveTieSchema,
  RunoffSchema,
  VacancySchema,
  CancelSchema,
  RecountSchema,
  ObserverSchema,
  validateElectionDates,
  validatePosition,
  sanitizeText,
} from "@/lib/elections/validation"
import { assertTransition, isConfigEditable, isPostVoting } from "@/lib/elections/stateMachine"
import { writeElectionAudit } from "@/lib/elections/audit"
import {
  generateEligibilitySnapshot,
  resolveMemberEligibility,
  determineMemberEligibility,
  parseEligibilityRules,
  parseEligibilityConfig,
  DEFAULT_ELIGIBILITY_RULES,
} from "@/lib/elections/eligibility"
import { countVotes, resolveTie, recountElection } from "@/lib/elections/counting"
import { dispatchElectionNotification } from "@/lib/elections/notifications"
import { sha256Json, getActiveKeyId, generateBallotReference } from "@/lib/elections/ballotCrypto"
import type { ElectionStatus, ElectionAuditAction } from "@prisma/client"

export type ActionResult = { ok: true; id?: string; data?: unknown } | { ok: false; error: string }

const PATH = "/dashboard/elections"

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

async function requireElectionAdmin(user: CurrentUser | null): Promise<CurrentUser> {
  return requirePermission(user, PERMISSIONS.ELECTION_MANAGE)
}

async function requireElectionReviewer(user: CurrentUser | null): Promise<CurrentUser> {
  // Reviewer = ELECTION_REVIEW permission OR ELECTION_MANAGE (admins can review too).
  const u = await requireActiveUser()
  if (isSuperAdmin(u)) return u
  const manage = await hasPermission(u.id, PERMISSIONS.ELECTION_MANAGE, u)
  if (manage) return u
  const review = await hasPermission(u.id, PERMISSIONS.ELECTION_REVIEW, u)
  if (review) return u
  throw new Error("You do not have permission to review candidates.")
}

function getMemberIdFromSession(sessionUser: { role: string; id: string }): string {
  if (sessionUser.role !== "MEMBER") {
    throw new Error("Only members can perform this action.")
  }
  return sessionUser.id
}

async function getCurrentMemberId(): Promise<string> {
  // Members authenticate via MemberAccount; the session.id IS the memberId
  // (see lib/auth.ts: returns id: memberAccount.memberId for member logins).
  const { getServerSession } = await import("next-auth")
  const { authOptions } = await import("@/lib/auth")
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") {
    throw new Error("You must be signed in as a member to perform this action.")
  }
  return session.user.id
}

// ──────────────────────────────────────────────────────────────────────────────
// ELECTION CRUD
// ──────────────────────────────────────────────────────────────────────────────

export async function createElection(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())

    const parsed = CreateElectionSchema.parse({
      code: formData.get("code"),
      name: formData.get("name"),
      description: formData.get("description") || null,
      termStartDate: formData.get("termStartDate"),
      termEndDate: formData.get("termEndDate"),
      nominationStartAt: formData.get("nominationStartAt"),
      nominationEndAt: formData.get("nominationEndAt"),
      votingStartAt: formData.get("votingStartAt"),
      votingEndAt: formData.get("votingEndAt"),
      timezone: formData.get("timezone") || "Asia/Dhaka",
      allowSelfNomination: formData.get("allowSelfNomination") === "true",
      allowMemberNomination: formData.get("allowMemberNomination") === "true",
      secretBallot: formData.get("secretBallot") !== "false",
      showLiveResults: formData.get("showLiveResults") === "true",
      maxPositionsPerCandidate: Number(formData.get("maxPositionsPerCandidate") || 1),
      minTurnoutPercentage: formData.get("minTurnoutPercentage") || null,
      quorumRequired: formData.get("quorumRequired") === "true",
      allowTermOverlap: formData.get("allowTermOverlap") === "true",
      ballotStorageMode: formData.get("ballotStorageMode") || "ENCRYPTED",
      tieBreakingMethod: formData.get("tieBreakingMethod") || "RUNOFF_ELECTION",
      isTestElection: formData.get("isTestElection") === "true",
      eligibilityRulesJson: formData.get("eligibilityRulesJson") || null,
    })

    const dateErrors = validateElectionDates({
      termStartDate: parsed.termStartDate,
      termEndDate: parsed.termEndDate,
      nominationStartAt: parsed.nominationStartAt,
      nominationEndAt: parsed.nominationEndAt,
      votingStartAt: parsed.votingStartAt,
      votingEndAt: parsed.votingEndAt,
    })
    if (dateErrors.length > 0) {
      return { ok: false, error: dateErrors.map((e) => e.message).join(" ") }
    }

    // Term overlap check (spec §7.2).
    if (!parsed.allowTermOverlap) {
      const overlap = await prisma.election.findFirst({
        where: {
          status: { notIn: ["CANCELLED", "ARCHIVED", "DRAFT"] },
          isTestElection: parsed.isTestElection ? undefined : false,
          OR: [
            {
              termStartDate: { lte: parsed.termEndDate },
              termEndDate: { gte: parsed.termStartDate },
            },
          ],
        },
        select: { code: true },
      })
      if (overlap) {
        return { ok: false, error: `An active election (${overlap.code}) already exists for an overlapping term. Set allowTermOverlap to override.` }
      }
    }

    // Unique code check.
    const existing = await prisma.election.findUnique({ where: { code: parsed.code } })
    if (existing) return { ok: false, error: `Election code "${parsed.code}" is already in use.` }

    const created = await prisma.election.create({
      data: {
        ...parsed,
        description: parsed.description ?? null,
        minTurnoutPercentage: parsed.minTurnoutPercentage ?? null,
        eligibilityRulesJson: parsed.eligibilityRulesJson ?? undefined,
        createdById: user.id,
        status: "DRAFT",
        activeKeyId: getActiveKeyId(),
      },
    })

    // Capture initial settings snapshot.
    await prisma.electionSettingsSnapshot.create({
      data: {
        electionId: created.id,
        settingsJson: parsed as any,
        capturedById: user.id,
      },
    })

    await writeElectionAudit({
      electionId: created.id,
      action: parsed.isTestElection ? "TEST_ELECTION_CREATED" : "CREATED",
      performedById: user.id,
      performedByRole: user.role,
      metadata: { code: parsed.code, name: parsed.name },
    })

    revalidatePath(PATH)
    return { ok: true, id: created.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create election." }
  }
}

export async function updateElection(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    const election = await prisma.election.findUnique({ where: { id } })
    if (!election) return { ok: false, error: "Election not found." }
    if (!isConfigEditable(election.status)) {
      return { ok: false, error: `Election configuration is locked in status ${election.status}.` }
    }

    const parsed = CreateElectionSchema.parse({
      code: formData.get("code") || election.code,
      name: formData.get("name") || election.name,
      description: formData.get("description") || null,
      termStartDate: formData.get("termStartDate") || election.termStartDate,
      termEndDate: formData.get("termEndDate") || election.termEndDate,
      nominationStartAt: formData.get("nominationStartAt") || election.nominationStartAt,
      nominationEndAt: formData.get("nominationEndAt") || election.nominationEndAt,
      votingStartAt: formData.get("votingStartAt") || election.votingStartAt,
      votingEndAt: formData.get("votingEndAt") || election.votingEndAt,
      timezone: formData.get("timezone") || election.timezone,
      allowSelfNomination: formData.get("allowSelfNomination") === "true",
      allowMemberNomination: formData.get("allowMemberNomination") === "true",
      secretBallot: formData.get("secretBallot") !== "false",
      showLiveResults: formData.get("showLiveResults") === "true",
      maxPositionsPerCandidate: Number(formData.get("maxPositionsPerCandidate") || election.maxPositionsPerCandidate),
      minTurnoutPercentage: formData.get("minTurnoutPercentage") || null,
      quorumRequired: formData.get("quorumRequired") === "true",
      allowTermOverlap: formData.get("allowTermOverlap") === "true",
      ballotStorageMode: formData.get("ballotStorageMode") || election.ballotStorageMode,
      tieBreakingMethod: formData.get("tieBreakingMethod") || election.tieBreakingMethod,
      isTestElection: election.isTestElection, // cannot change after creation
      eligibilityRulesJson: formData.get("eligibilityRulesJson") || null,
    })

    const dateErrors = validateElectionDates({ ...parsed, isUpdate: true })
    if (dateErrors.length > 0) return { ok: false, error: dateErrors.map((e) => e.message).join(" ") }

    await prisma.election.update({
      where: { id },
      data: {
        ...parsed,
        description: parsed.description ?? null,
        minTurnoutPercentage: parsed.minTurnoutPercentage ?? null,
        eligibilityRulesJson: parsed.eligibilityRulesJson ?? undefined,
      },
    })

    await prisma.electionSettingsSnapshot.create({
      data: {
        electionId: id,
        settingsJson: parsed as any,
        capturedById: user.id,
      },
    })

    await writeElectionAudit({
      electionId: id,
      action: "UPDATED",
      performedById: user.id,
      performedByRole: user.role,
    })

    revalidatePath(`${PATH}/${id}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update election." }
  }
}

export async function deleteDraftElection(id: string): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    const election = await prisma.election.findUnique({
      where: { id },
      select: { status: true, isTestElection: true, code: true, name: true },
    })
    if (!election) return { ok: false, error: "Election not found." }
    if (election.status !== "DRAFT") {
      return { ok: false, error: "Only DRAFT elections can be deleted." }
    }
    // Record the deletion intent in the audit log BEFORE deleting. The audit
    // row itself will be cascade-deleted along with the election (a DRAFT
    // election has no historical value to preserve — spec §75 "no hard delete
    // after voting begins" applies only post-voting). We still log here so the
    // action is visible in the admin's session even though the row won't persist.
    await writeElectionAudit({
      electionId: id,
      action: "DELETED_DRAFT",
      performedById: user.id,
      performedByRole: user.role,
      metadata: { code: election.code, name: election.name },
    })
    // Explicitly clean up ALL child tables before the delete, in case the DB
    // migration changing onDelete from Restrict to Cascade hasn't been applied
    // yet. This makes the action work pre- and post-migration. A DRAFT election
    // should have no ballots/participation/results, but we delete them anyway
    // for safety (they'd only exist if the election was force-advanced).
    await prisma.electionAuditLog.deleteMany({ where: { electionId: id } })
    await prisma.electionSettingsSnapshot.deleteMany({ where: { electionId: id } })
    await prisma.electionScheduledEvent.deleteMany({ where: { electionId: id } })
    await prisma.electionObserverAssignment.deleteMany({ where: { electionId: id } })
    await prisma.electionEligibilityOverride.deleteMany({ where: { electionId: id } })
    await prisma.recountRequest.deleteMany({ where: { electionId: id } })
    await prisma.ballotKeyRotation.deleteMany({ where: { electionId: id } })
    await prisma.electionIdempotencyKey.deleteMany({ where: { electionId: id } })
    await prisma.electionNotification.deleteMany({ where: { electionId: id } })
    await prisma.election.delete({ where: { id } })
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete election." }
  }
}

export async function purgeTestElection(id: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user || !isSuperAdmin(user)) return { ok: false, error: "Only Super Admin can purge test elections." }
    const election = await prisma.election.findUnique({ where: { id }, select: { isTestElection: true, code: true } })
    if (!election) return { ok: false, error: "Election not found." }
    if (!election.isTestElection) return { ok: false, error: "Only test elections can be hard-deleted." }
    // Clean up ALL child tables before the delete, in case the DB migration
    // changing onDelete from Restrict to Cascade hasn't been applied yet.
    // Test elections can have any of these (votes were cast during testing),
    // so we wipe them all. Order matters: delete dependents before parents.
    await prisma.electionIdempotencyKey.deleteMany({ where: { electionId: id } })
    await prisma.electionNotificationRecipient.deleteMany({
      where: { notification: { electionId: id } },
    }).catch(() => undefined)
    await prisma.electionNotification.deleteMany({ where: { electionId: id } })
    await prisma.recountRequest.deleteMany({ where: { electionId: id } })
    await prisma.electionObserverAssignment.deleteMany({ where: { electionId: id } })
    await prisma.electionScheduledEvent.deleteMany({ where: { electionId: id } })
    await prisma.electionSettingsSnapshot.deleteMany({ where: { electionId: id } })
    await prisma.ballotKeyRotation.deleteMany({ where: { electionId: id } })
    await prisma.electionEligibilityOverride.deleteMany({ where: { electionId: id } })
    await prisma.electionAuditLog.deleteMany({ where: { electionId: id } })
    await prisma.electionResult.deleteMany({ where: { electionId: id } })
    await prisma.ballotSelection.deleteMany({ where: { ballot: { electionId: id } } }).catch(() => undefined)
    await prisma.electionBallot.deleteMany({ where: { electionId: id } })
    await prisma.electionParticipation.deleteMany({ where: { electionId: id } })
    await prisma.electionEligibility.deleteMany({ where: { electionId: id } })
    await prisma.electionCandidate.deleteMany({ where: { electionId: id } })
    await prisma.electionNomination.deleteMany({ where: { electionId: id } })
    await prisma.electionPosition.deleteMany({ where: { electionId: id } })
    await prisma.election.delete({ where: { id } })
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to purge test election." }
  }
}

export async function cloneElection(id: string, newCode: string, newName: string): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    const source = await prisma.election.findUnique({
      where: { id },
      include: { positions: true },
    })
    if (!source) return { ok: false, error: "Election not found." }

    const existing = await prisma.election.findUnique({ where: { code: newCode } })
    if (existing) return { ok: false, error: `Code "${newCode}" is already in use.` }

    const cloned = await prisma.election.create({
      data: {
        code: newCode,
        name: newName,
        description: source.description,
        // Dates must be re-set by the admin — clone with placeholder future dates.
        termStartDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        termEndDate: new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000),
        nominationStartAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        nominationEndAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        votingStartAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
        votingEndAt: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000),
        timezone: source.timezone,
        allowSelfNomination: source.allowSelfNomination,
        allowMemberNomination: source.allowMemberNomination,
        secretBallot: source.secretBallot,
        showLiveResults: source.showLiveResults,
        maxPositionsPerCandidate: source.maxPositionsPerCandidate,
        minTurnoutPercentage: source.minTurnoutPercentage,
        quorumRequired: source.quorumRequired,
        allowTermOverlap: source.allowTermOverlap,
        ballotStorageMode: source.ballotStorageMode,
        tieBreakingMethod: source.tieBreakingMethod,
        isTestElection: source.isTestElection,
        eligibilityRulesJson: source.eligibilityRulesJson as any,
        rulesJson: source.rulesJson as any,
        createdById: user.id,
        status: "DRAFT",
        activeKeyId: getActiveKeyId(),
        positions: {
          create: source.positions.map((p) => ({
            name: p.name,
            code: p.code,
            description: p.description,
            displayOrder: p.displayOrder,
            seatCount: p.seatCount,
            minSelections: p.minSelections,
            maxSelections: p.maxSelections,
            isRequired: p.isRequired,
            isActive: p.isActive,
            showNOTA: p.showNOTA,
            allowSkip: p.allowSkip,
            uncontestedPolicy: p.uncontestedPolicy,
          })),
        },
      },
    })

    await writeElectionAudit({
      electionId: cloned.id,
      action: "CLONED",
      performedById: user.id,
      performedByRole: user.role,
      metadata: { sourceElectionId: id, sourceCode: source.code },
    })

    revalidatePath(PATH)
    return { ok: true, id: cloned.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to clone election." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POSITIONS
// ──────────────────────────────────────────────────────────────────────────────

export async function addPosition(electionId: string, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    const election = await prisma.election.findUnique({ where: { id: electionId }, select: { status: true } })
    if (!election) return { ok: false, error: "Election not found." }
    if (!isConfigEditable(election.status)) {
      return { ok: false, error: `Positions are locked in status ${election.status}.` }
    }
    const parsed = PositionSchema.parse({
      name: formData.get("name"),
      code: formData.get("code"),
      description: formData.get("description") || null,
      displayOrder: Number(formData.get("displayOrder") || 0),
      seatCount: Number(formData.get("seatCount") || 1),
      minSelections: Number(formData.get("minSelections") || 1),
      maxSelections: Number(formData.get("maxSelections") || 1),
      isRequired: formData.get("isRequired") !== "false",
      isActive: formData.get("isActive") !== "false",
      showNOTA: formData.get("showNOTA") !== "false",
      allowSkip: formData.get("allowSkip") === "true",
      uncontestedPolicy: formData.get("uncontestedPolicy") || "AUTO_ELECT",
    })
    const errs = validatePosition(parsed)
    if (errs.length > 0) return { ok: false, error: errs.map((e) => e.message).join(" ") }

    const created = await prisma.electionPosition.create({
      data: { ...parsed, description: parsed.description ?? null, electionId },
    })
    await writeElectionAudit({
      electionId,
      action: "UPDATED",
      performedById: user.id,
      performedByRole: user.role,
      metadata: { action: "position_added", positionId: created.id, code: parsed.code },
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true, id: created.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to add position." }
  }
}

export async function updatePosition(electionId: string, positionId: string, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    const election = await prisma.election.findUnique({ where: { id: electionId }, select: { status: true } })
    if (!election) return { ok: false, error: "Election not found." }
    if (!isConfigEditable(election.status)) {
      return { ok: false, error: `Positions are locked in status ${election.status}.` }
    }
    const parsed = PositionSchema.parse({
      name: formData.get("name"),
      code: formData.get("code"),
      description: formData.get("description") || null,
      displayOrder: Number(formData.get("displayOrder") || 0),
      seatCount: Number(formData.get("seatCount") || 1),
      minSelections: Number(formData.get("minSelections") || 1),
      maxSelections: Number(formData.get("maxSelections") || 1),
      isRequired: formData.get("isRequired") !== "false",
      isActive: formData.get("isActive") !== "false",
      showNOTA: formData.get("showNOTA") !== "false",
      allowSkip: formData.get("allowSkip") === "true",
      uncontestedPolicy: formData.get("uncontestedPolicy") || "AUTO_ELECT",
    })
    await prisma.electionPosition.update({
      where: { id: positionId },
      data: { ...parsed, description: parsed.description ?? null },
    })
    await writeElectionAudit({
      electionId,
      action: "UPDATED",
      performedById: user.id,
      performedByRole: user.role,
      metadata: { action: "position_updated", positionId },
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update position." }
  }
}

export async function deletePosition(electionId: string, positionId: string): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    const election = await prisma.election.findUnique({ where: { id: electionId }, select: { status: true } })
    if (!election) return { ok: false, error: "Election not found." }
    if (!isConfigEditable(election.status)) {
      return { ok: false, error: `Positions are locked in status ${election.status}.` }
    }
    await prisma.electionPosition.delete({ where: { id: positionId } })
    await writeElectionAudit({
      electionId,
      action: "UPDATED",
      performedById: user.id,
      performedByRole: user.role,
      metadata: { action: "position_deleted", positionId },
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete position." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// LIFECYCLE TRANSITIONS
// ──────────────────────────────────────────────────────────────────────────────

export async function openNominations(electionId: string): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    const election = await prisma.election.findUnique({ where: { id: electionId }, select: { status: true, code: true } })
    if (!election) return { ok: false, error: "Election not found." }
    assertTransition(election.status, "NOMINATION_OPEN")
    await prisma.election.update({ where: { id: electionId }, data: { status: "NOMINATION_OPEN" } })
    await writeElectionAudit({
      electionId, action: "NOMINATION_OPENED", performedById: user.id, performedByRole: user.role,
    })
    await dispatchElectionNotification({
      electionId, type: "NOMINATION_OPENED", channel: "IN_APP",
      title: "Nominations Open", message: "",
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to open nominations." }
  }
}

export async function closeNominations(electionId: string): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    const election = await prisma.election.findUnique({ where: { id: electionId }, select: { status: true } })
    if (!election) return { ok: false, error: "Election not found." }
    assertTransition(election.status, "NOMINATION_CLOSED")
    await prisma.election.update({ where: { id: electionId }, data: { status: "NOMINATION_CLOSED" } })
    await writeElectionAudit({
      electionId, action: "NOMINATION_CLOSED", performedById: user.id, performedByRole: user.role,
    })
    await dispatchElectionNotification({
      electionId, type: "NOMINATION_CLOSED", channel: "IN_APP",
      title: "Nominations Closed", message: "",
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to close nominations." }
  }
}

export async function finalizeCandidates(electionId: string): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    const election = await prisma.election.findUnique({
      where: { id: electionId },
      include: {
        positions: { where: { isActive: true }, include: { candidates: true, nominations: true } },
      },
    })
    if (!election) return { ok: false, error: "Election not found." }
    assertTransition(election.status, "CANDIDATES_FINALIZED")

    // Case 20: zero-seat positions rejected at creation; re-validate here too.
    for (const p of election.positions) {
      if (p.seatCount < 1) return { ok: false, error: `Position "${p.name}" has 0 seats.` }
    }

    // For each position, ensure at least 1 approved candidate (or flag uncontested).
    for (const p of election.positions) {
      const approved = p.candidates.filter((c) => c.status === "APPROVED")
      if (approved.length === 0) {
        // Case 17: no approved candidates for a required position.
        if (p.isRequired) {
          return { ok: false, error: `Position "${p.name}" has no approved candidates. Extend nominations or mark the position as vacant.` }
        }
        continue
      }
      // Case 16: uncontested position (1 candidate, 1 seat).
      if (approved.length === 1 && p.seatCount === 1 && p.uncontestedPolicy === "AUTO_ELECT") {
        await prisma.electionCandidate.update({
          where: { id: approved[0].id },
          data: {
            status: "UNCONTESTED_ELECTED",
            electedAt: new Date(),
            electionMethod: "UNCONTESTED",
          },
        })
      }
    }

    // Generate candidate list hash (canonical JSON of approved candidate IDs per position).
    const candidateList = election.positions.map((p) => ({
      positionId: p.id,
      candidates: p.candidates.filter((c) => c.status === "APPROVED" || c.status === "UNCONTESTED_ELECTED").map((c) => c.id).sort(),
    }))
    const candidateListHash = sha256Json(candidateList)

    // Generate eligibility snapshot.
    // Generate eligibility snapshot using VOTER rule set (who can vote).
    const config = parseEligibilityConfig(election.eligibilityRulesJson)
    const rules = config.voter
    const snapshot = await generateEligibilitySnapshot(electionId, rules)
    const eligibilitySnapshotHash = sha256Json({
      snapshotId: snapshot.snapshotId,
      eligibleCount: snapshot.eligibleCount,
      ineligibleCount: snapshot.ineligibleCount,
    })

    // Capture settings snapshot.
    await prisma.electionSettingsSnapshot.create({
      data: {
        electionId,
        settingsJson: { status: "CANDIDATES_FINALIZED", candidateListHash, eligibilitySnapshotHash } as any,
        capturedById: user.id,
      },
    })

    await prisma.election.update({
      where: { id: electionId },
      data: {
        status: "CANDIDATES_FINALIZED",
        candidateListHash,
        eligibilitySnapshotHash,
      },
    })

    await writeElectionAudit({
      electionId, action: "CANDIDATES_FINALIZED", performedById: user.id, performedByRole: user.role,
      metadata: { candidateListHash, eligibilitySnapshotHash, eligibleCount: snapshot.eligibleCount },
    })
    await writeElectionAudit({
      electionId, action: "ELIGIBILITY_SNAPSHOT_CREATED", performedById: user.id, performedByRole: user.role,
      metadata: { snapshotId: snapshot.snapshotId, eligibleCount: snapshot.eligibleCount },
    })

    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to finalize candidates." }
  }
}

export async function openVoting(electionId: string): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    const election = await prisma.election.findUnique({ where: { id: electionId }, select: { status: true, votingStartAt: true, votingEndAt: true } })
    if (!election) return { ok: false, error: "Election not found." }
    assertTransition(election.status, "VOTING_SCHEDULED")
    // Then VOTING_SCHEDULED → VOTING_OPEN (server-time check).
    const now = new Date()
    if (now < election.votingStartAt) {
      return { ok: false, error: "Voting start time has not yet arrived." }
    }
    if (now > election.votingEndAt) {
      return { ok: false, error: "Voting end time has already passed." }
    }

    // Two-step: if at CANDIDATES_FINALIZED, move to VOTING_SCHEDULED first.
    if (election.status === "CANDIDATES_FINALIZED") {
      await prisma.election.update({ where: { id: electionId }, data: { status: "VOTING_SCHEDULED" } })
    }
    await prisma.election.update({ where: { id: electionId }, data: { status: "VOTING_OPEN" } })

    await writeElectionAudit({
      electionId, action: "VOTING_OPENED", performedById: user.id, performedByRole: user.role,
    })
    await dispatchElectionNotification({
      electionId, type: "VOTING_OPENED", channel: "IN_APP", title: "Voting Open", message: "",
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to open voting." }
  }
}

export async function closeVoting(electionId: string): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    const election = await prisma.election.findUnique({ where: { id: electionId }, select: { status: true, votingEndAt: true } })
    if (!election) return { ok: false, error: "Election not found." }
    if (election.status !== "VOTING_OPEN") {
      return { ok: false, error: "Voting is not currently open." }
    }
    // Allow early closure only by admin; the deadline check is informational.
    await prisma.election.update({ where: { id: electionId }, data: { status: "VOTING_CLOSED" } })
    await writeElectionAudit({
      electionId, action: "VOTING_CLOSED", performedById: user.id, performedByRole: user.role,
      metadata: { earlyClosure: new Date() < election.votingEndAt },
    })
    await dispatchElectionNotification({
      electionId, type: "VOTING_CLOSED", channel: "IN_APP", title: "Voting Closed", message: "",
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to close voting." }
  }
}

export async function reopenVoting(electionId: string, reason: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user || !isSuperAdmin(user)) return { ok: false, error: "Only Super Admin can reopen voting." }
    const election = await prisma.election.findUnique({ where: { id: electionId }, select: { status: true, votingEndAt: true } })
    if (!election) return { ok: false, error: "Election not found." }
    if (election.status !== "VOTING_CLOSED") {
      return { ok: false, error: "Voting is not closed." }
    }
    if (new Date() > election.votingEndAt) {
      return { ok: false, error: "Cannot reopen voting after the original deadline has passed." }
    }
    if (!reason || reason.trim().length < 5) {
      return { ok: false, error: "A mandatory reason (min 5 chars) is required." }
    }
    await prisma.election.update({ where: { id: electionId }, data: { status: "VOTING_OPEN" } })
    await writeElectionAudit({
      electionId, action: "VOTING_REOPENED", performedById: user.id, performedByRole: user.role,
      metadata: { reason },
    })
    await dispatchElectionNotification({
      electionId, type: "VOTING_REOPENED", channel: "IN_APP", title: "Voting Reopened", message: reason,
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to reopen voting." }
  }
}

export async function countElectionVotes(electionId: string): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    const election = await prisma.election.findUnique({
      where: { id: electionId },
      select: { id: true, status: true, quorumRequired: true, minTurnoutPercentage: true, tieBreakingMethod: true },
    })
    if (!election) return { ok: false, error: "Election not found." }
    if (election.status !== "VOTING_CLOSED" && election.status !== "RESULTS_READY" && election.status !== "RUNOFF_REQUIRED") {
      return { ok: false, error: "Counting requires voting to be closed." }
    }

    await prisma.election.update({ where: { id: electionId }, data: { status: "COUNTING" } })
    await writeElectionAudit({
      electionId, action: "COUNTING_STARTED", performedById: user.id, performedByRole: user.role,
    })

    const result = await directPrisma.$transaction(async (tx) => countVotes(election, tx))

    await prisma.election.update({
      where: { id: electionId },
      data: {
        status: result.hasUnresolvedTies ? "RUNOFF_REQUIRED" : "RESULTS_READY",
        resultHash: result.resultHash,
      },
    })

    if (!result.quorumMet && result.quorumRequired) {
      await writeElectionAudit({
        electionId, action: "QUORUM_NOT_MET", performedById: user.id, performedByRole: user.role,
        metadata: { turnout: result.turnoutPercentage, threshold: Number(election.minTurnoutPercentage || 0) },
      })
      await dispatchElectionNotification({
        electionId, type: "QUORUM_NOT_MET", channel: "IN_APP", title: "Quorum Not Met", message: "",
      })
    }

    await writeElectionAudit({
      electionId, action: "COUNTING_COMPLETED", performedById: user.id, performedByRole: user.role,
      metadata: {
        resultHash: result.resultHash,
        validBallots: result.validBallots,
        invalidBallots: result.invalidBallots,
        turnout: result.turnoutPercentage,
        ties: result.hasUnresolvedTies,
      },
    })

    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true, data: result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to count votes." }
  }
}

export async function publishResults(electionId: string): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    const election = await prisma.election.findUnique({
      where: { id: electionId },
      select: { status: true, resultHash: true, quorumRequired: true },
    })
    if (!election) return { ok: false, error: "Election not found." }
    if (election.status !== "RESULTS_READY" && election.status !== "RUNOFF_REQUIRED") {
      return { ok: false, error: "Results are not ready for publication." }
    }
    // Quorum must be met (if required) before publication.
    const turnout = await prisma.electionParticipation.count({ where: { electionId, voted: true } })
    const eligible = await prisma.electionEligibility.count({ where: { electionId, eligible: true } })
    const turnoutPct = eligible > 0 ? (turnout / eligible) * 100 : 0
    if (election.quorumRequired) {
      const threshold = await prisma.election.findUnique({ where: { id: electionId }, select: { minTurnoutPercentage: true } })
      if (turnoutPct < Number(threshold?.minTurnoutPercentage || 0)) {
        return { ok: false, error: `Quorum not met (${turnoutPct.toFixed(2)}% < ${Number(threshold?.minTurnoutPercentage || 0)}%).` }
      }
    }

    // Publish all results at once (partial publication is a separate action).
    await prisma.electionResult.updateMany({
      where: { electionId, publishedAt: null },
      data: { publishedAt: new Date(), publishedById: user.id },
    })
    await prisma.electionPosition.updateMany({
      where: { electionId, resultsPublished: false },
      data: { resultsPublished: true, resultsPublishedAt: new Date(), resultsPublishedById: user.id },
    })

    // Only advance to RESULTS_PUBLISHED if there are no unresolved ties.
    const hasTies = await prisma.electionPosition.count({ where: { electionId, runoffRequired: true } })
    const newStatus: ElectionStatus = hasTies > 0 ? "RUNOFF_REQUIRED" : "RESULTS_PUBLISHED"
    await prisma.election.update({ where: { id: electionId }, data: { status: newStatus } })

    await writeElectionAudit({
      electionId, action: "RESULTS_PUBLISHED", performedById: user.id, performedByRole: user.role,
      metadata: { resultHash: election.resultHash, turnout: turnoutPct },
    })
    await dispatchElectionNotification({
      electionId, type: "RESULTS_PUBLISHED", channel: "IN_APP", title: "Results Published", message: "",
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to publish results." }
  }
}

export async function publishPositionResults(electionId: string, positionId: string): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    await prisma.electionResult.updateMany({
      where: { electionId, positionId, publishedAt: null },
      data: { publishedAt: new Date(), publishedById: user.id },
    })
    await prisma.electionPosition.update({
      where: { id: positionId },
      data: { resultsPublished: true, resultsPublishedAt: new Date(), resultsPublishedById: user.id },
    })
    await writeElectionAudit({
      electionId, action: "RESULTS_PARTIALLY_PUBLISHED", performedById: user.id, performedByRole: user.role,
      metadata: { positionId },
    })
    // If all positions are now published, advance the election status.
    const remaining = await prisma.electionPosition.count({ where: { electionId, resultsPublished: false, isActive: true } })
    if (remaining === 0) {
      await prisma.election.update({ where: { id: electionId }, data: { status: "RESULTS_PUBLISHED" } })
    }
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to publish position results." }
  }
}

export async function formCommittee(electionId: string): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    const election = await prisma.election.findUnique({
      where: { id: electionId },
      select: { id: true, status: true, termStartDate: true, termEndDate: true, name: true },
    })
    if (!election) return { ok: false, error: "Election not found." }
    if (election.status !== "RESULTS_PUBLISHED" && election.status !== "COMMITTEE_FORMED") {
      return { ok: false, error: "Committee can only be formed after results are published." }
    }

    // Load elected candidates per position. ElectionResult has candidateId (nullable);
    // resolve the member via the ElectionCandidate relation.
    const results = await prisma.electionResult.findMany({
      where: { electionId, elected: true, candidateId: { not: null } },
      include: {
        position: { select: { name: true } },
      },
    })
    const candidateIds = results.map((r) => r.candidateId!).filter(Boolean)
    const candidates = await prisma.electionCandidate.findMany({
      where: { id: { in: candidateIds } },
      select: { id: true, memberId: true },
    })
    const candidateToMember = new Map(candidates.map((c) => [c.id, c.memberId]))

    const committee = await prisma.electionCommittee.create({
      data: {
        electionId,
        name: `Executive Committee — ${election.name}`,
        termStartDate: election.termStartDate,
        termEndDate: election.termEndDate,
        status: "ACTIVE",
        members: {
          create: results
            .map((r) => {
              const memberId = r.candidateId ? candidateToMember.get(r.candidateId) : undefined
              if (!memberId) return null
              return {
                memberId,
                positionName: r.position.name,
                startDate: election.termStartDate,
                endDate: election.termEndDate,
                active: true,
                electionMethod: r.electionMethod || "VOTED",
              }
            })
            .filter((x): x is NonNullable<typeof x> => x !== null),
        },
      },
    })

    await prisma.election.update({ where: { id: electionId }, data: { status: "COMMITTEE_FORMED" } })
    await writeElectionAudit({
      electionId, action: "COMMITTEE_FORMED", performedById: user.id, performedByRole: user.role,
      metadata: { committeeId: committee.id, memberCount: results.length },
    })
    await dispatchElectionNotification({
      electionId, type: "COMMITTEE_FORMED", channel: "IN_APP", title: "Executive Committee Formed", message: "",
    })
    // Auto-sync the new committee to the landing page "Our Management Committee"
    // section so members appear on the public site immediately.
    await syncCommitteeToLandingPage(committee.id).catch(() => undefined)
    revalidatePath(`${PATH}/${electionId}`)
    revalidatePath("/")
    return { ok: true, id: committee.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to form committee." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// FREEZE / CANCEL
// ──────────────────────────────────────────────────────────────────────────────

export async function freezeElection(electionId: string, reason: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user || !isSuperAdmin(user)) return { ok: false, error: "Only Super Admin can freeze an election." }
    const election = await prisma.election.findUnique({ where: { id: electionId }, select: { status: true } })
    if (!election) return { ok: false, error: "Election not found." }
    if (election.status === "FROZEN") return { ok: false, error: "Election is already frozen." }
    await prisma.election.update({
      where: { id: electionId },
      data: { status: "FROZEN", previousStatus: election.status },
    })
    await writeElectionAudit({
      electionId, action: "FROZEN", performedById: user.id, performedByRole: user.role, metadata: { reason },
    })
    await dispatchElectionNotification({
      electionId, type: "ELECTION_FROZEN", channel: "IN_APP", title: "Election Suspended", message: reason,
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to freeze election." }
  }
}

export async function unfreezeElection(electionId: string, reason: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user || !isSuperAdmin(user)) return { ok: false, error: "Only Super Admin can unfreeze an election." }
    const election = await prisma.election.findUnique({ where: { id: electionId }, select: { status: true, previousStatus: true } })
    if (!election) return { ok: false, error: "Election not found." }
    if (election.status !== "FROZEN") return { ok: false, error: "Election is not frozen." }
    await prisma.election.update({
      where: { id: electionId },
      data: { status: election.previousStatus || "DRAFT", previousStatus: null },
    })
    await writeElectionAudit({
      electionId, action: "UNFROZEN", performedById: user.id, performedByRole: user.role,
      metadata: { reason, restoredStatus: election.previousStatus },
    })
    await dispatchElectionNotification({
      electionId, type: "ELECTION_UNFROZEN", channel: "IN_APP", title: "Election Resumed", message: reason,
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to unfreeze election." }
  }
}

export async function cancelElection(electionId: string, reason: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user || !isSuperAdmin(user)) return { ok: false, error: "Only Super Admin can cancel an election." }
    const election = await prisma.election.findUnique({ where: { id: electionId }, select: { status: true } })
    if (!election) return { ok: false, error: "Election not found." }
    if (isPostVoting(election.status)) {
      return { ok: false, error: "Cannot cancel an election after voting has begun." }
    }
    await prisma.election.update({ where: { id: electionId }, data: { status: "CANCELLED" } })
    await writeElectionAudit({
      electionId, action: "CANCELLED", performedById: user.id, performedByRole: user.role, metadata: { reason },
    })
    await dispatchElectionNotification({
      electionId, type: "ELECTION_CANCELLED", channel: "IN_APP", title: "Election Cancelled", message: reason,
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to cancel election." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// ELIGIBILITY OVERRIDE (Super Admin)
// ──────────────────────────────────────────────────────────────────────────────

export async function overrideEligibility(
  electionId: string,
  memberId: string,
  data: { eligible: boolean; reason: string }
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user || !isSuperAdmin(user)) return { ok: false, error: "Only Super Admin can override eligibility." }
    const parsed = OverrideEligibilitySchema.parse(data)
    const election = await prisma.election.findUnique({ where: { id: electionId }, select: { status: true } })
    if (!election) return { ok: false, error: "Election not found." }
    if (election.status === "VOTING_OPEN" || election.status === "VOTING_CLOSED") {
      return { ok: false, error: "Override is only permitted before voting opens." }
    }
    const existing = await prisma.electionEligibility.findUnique({
      where: { electionId_memberId: { electionId, memberId } },
    })
    const originalEligible = existing?.eligible ?? false

    await prisma.electionEligibilityOverride.upsert({
      where: { electionId_memberId: { electionId, memberId } },
      create: {
        electionId, memberId,
        originalEligible, overriddenEligible: parsed.eligible, reason: parsed.reason,
        overriddenById: user.id,
      },
      update: {
        originalEligible, overriddenEligible: parsed.eligible, reason: parsed.reason,
        overriddenById: user.id, overriddenAt: new Date(),
      },
    })
    // Apply the override to the snapshot row too, so resolveMemberEligibility
    // can short-circuit on the override (which it does) AND the eligibility
    // list reflects the new determination.
    await prisma.electionEligibility.upsert({
      where: { electionId_memberId: { electionId, memberId } },
      create: { electionId, memberId, eligible: parsed.eligible, reason: `Override: ${parsed.reason}` },
      update: { eligible: parsed.eligible, reason: `Override: ${parsed.reason}` },
    })

    await writeElectionAudit({
      electionId, action: "ELIGIBILITY_OVERRIDDEN", performedById: user.id, performedByRole: user.role,
      metadata: { memberId, originalEligible, overriddenEligible: parsed.eligible, reason: parsed.reason },
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to override eligibility." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// CANDIDATE APPROVAL WORKFLOW
// ──────────────────────────────────────────────────────────────────────────────

export async function approveCandidate(electionId: string, candidateId: string): Promise<ActionResult> {
  try {
    const user = await requireElectionReviewer(await getCurrentUser())
    const candidate = await prisma.electionCandidate.findUnique({ where: { id: candidateId }, select: { status: true, memberId: true, positionId: true } })
    if (!candidate) return { ok: false, error: "Candidate not found." }
    if (candidate.status !== "PENDING") {
      return { ok: false, error: `Candidate is already ${candidate.status}.` }
    }
    await prisma.electionCandidate.update({
      where: { id: candidateId },
      data: { status: "APPROVED", approvedAt: new Date(), approvedById: user.id },
    })
    await writeElectionAudit({
      electionId, action: "CANDIDATE_APPROVED", performedById: user.id, performedByRole: user.role,
      metadata: { candidateId, memberId: candidate.memberId, positionId: candidate.positionId },
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to approve candidate." }
  }
}

export async function rejectCandidate(electionId: string, candidateId: string, reason: string): Promise<ActionResult> {
  try {
    const user = await requireElectionReviewer(await getCurrentUser())
    await prisma.electionCandidate.update({
      where: { id: candidateId },
      data: { status: "REJECTED", disqualifiedAt: new Date(), disqualifiedById: user.id, disqualificationReason: reason },
    })
    await writeElectionAudit({
      electionId, action: "CANDIDATE_REJECTED", performedById: user.id, performedByRole: user.role,
      metadata: { candidateId, reason },
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to reject candidate." }
  }
}

export async function disqualifyCandidate(electionId: string, candidateId: string, reason: string): Promise<ActionResult> {
  try {
    const user = await requireElectionReviewer(await getCurrentUser())
    await prisma.electionCandidate.update({
      where: { id: candidateId },
      data: { status: "DISQUALIFIED", disqualifiedAt: new Date(), disqualifiedById: user.id, disqualificationReason: reason },
    })
    await writeElectionAudit({
      electionId, action: "CANDIDATE_DISQUALIFIED", performedById: user.id, performedByRole: user.role,
      metadata: { candidateId, reason },
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to disqualify candidate." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// RUNOFF + TIE RESOLUTION
// ──────────────────────────────────────────────────────────────────────────────

export async function createRunoffElection(
  electionId: string,
  data: { positionId: string; candidateIds: string[]; votingStartAt: Date; votingEndAt: Date }
): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    const parsed = RunoffSchema.parse(data)
    const parent = await prisma.election.findUnique({
      where: { id: electionId },
      select: { id: true, code: true, name: true, termStartDate: true, termEndDate: true, isTestElection: true, ballotStorageMode: true, tieBreakingMethod: true, eligibilityRulesJson: true },
    })
    if (!parent) return { ok: false, error: "Parent election not found." }

    // Max nesting depth (Case 32).
    const maxDepth = Number(process.env.ELECTION_MAX_RUNOFF_DEPTH || 2)
    let depth = 0
    let cursor: typeof parent | null = parent
    while (cursor) {
      const p: any = await prisma.election.findUnique({ where: { id: cursor.id }, select: { parentElectionId: true, isRunoff: true } })
      if (!p || !p.parentElectionId) break
      depth++
      if (depth >= maxDepth) return { ok: false, error: `Maximum runoff nesting depth (${maxDepth}) reached.` }
      cursor = await prisma.election.findUnique({ where: { id: p.parentElectionId }, select: { id: true, code: true, name: true, termStartDate: true, termEndDate: true, isTestElection: true, ballotStorageMode: true, tieBreakingMethod: true, eligibilityRulesJson: true } })
    }

    if (parsed.votingStartAt >= parsed.votingEndAt) {
      return { ok: false, error: "Runoff voting end must be after start." }
    }

    const runoff = await prisma.election.create({
      data: {
        code: `${parent.code}-RUNOFF-${Date.now().toString(36).toUpperCase()}`,
        name: `${parent.name} — Runoff`,
        termStartDate: parent.termStartDate,
        termEndDate: parent.termEndDate,
        nominationStartAt: new Date(),
        nominationEndAt: parsed.votingStartAt,
        votingStartAt: parsed.votingStartAt,
        votingEndAt: parsed.votingEndAt,
        timezone: "Asia/Dhaka",
        isTestElection: parent.isTestElection,
        parentElectionId: parent.id,
        isRunoff: true,
        runoffPositionId: parsed.positionId,
        ballotStorageMode: parent.ballotStorageMode,
        tieBreakingMethod: parent.tieBreakingMethod,
        eligibilityRulesJson: parent.eligibilityRulesJson as any,
        createdById: user.id,
        status: "NOMINATION_OPEN",
        activeKeyId: getActiveKeyId(),
      },
    })

    // Copy the tied candidates into the runoff as approved candidates.
    const tiedCandidates = await prisma.electionCandidate.findMany({
      where: { electionId: parent.id, positionId: parsed.positionId, id: { in: parsed.candidateIds } },
    })
    const runoffPosition = await prisma.electionPosition.create({
      data: {
        electionId: runoff.id,
        name: "Runoff Position",
        code: "RUNOFF",
        seatCount: 1,
        minSelections: 1,
        maxSelections: 1,
        isRequired: true,
        showNOTA: true,
        allowSkip: false,
        uncontestedPolicy: "STILL_REQUIRE_VOTE",
      },
    })
    await prisma.electionCandidate.createMany({
      data: tiedCandidates.map((c) => ({
        electionId: runoff.id,
        positionId: runoffPosition.id,
        memberId: c.memberId,
        status: "APPROVED",
        approvedAt: new Date(),
        approvedById: user.id,
      })),
    })

    // Copy eligibility snapshot from parent.
    const parentEligibility = await prisma.electionEligibility.findMany({
      where: { electionId: parent.id, eligible: true },
      select: { memberId: true, reason: true, snapshotId: true },
    })
    await prisma.electionEligibility.createMany({
      data: parentEligibility.map((e) => ({
        electionId: runoff.id,
        memberId: e.memberId,
        eligible: true,
        reason: e.reason,
        snapshotId: e.snapshotId,
      })),
      skipDuplicates: true,
    })

    // Mark the parent position as requiring runoff.
    await prisma.electionPosition.update({
      where: { id: parsed.positionId },
      data: { runoffRequired: true },
    })

    await writeElectionAudit({
      electionId: parent.id, action: "RUNOFF_CREATED", performedById: user.id, performedByRole: user.role,
      metadata: { runoffElectionId: runoff.id, positionId: parsed.positionId, candidateIds: parsed.candidateIds },
    })
    await dispatchElectionNotification({
      electionId: parent.id, type: "RUNOFF_SCHEDULED", channel: "IN_APP",
      title: "Runoff Election Scheduled", message: "",
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true, id: runoff.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create runoff election." }
  }
}

export async function resolveTieForPosition(
  electionId: string,
  positionId: string,
  data: { method: "RUNOFF_ELECTION" | "COMMITTEE_DECISION" | "LOTTERY_DRAW" | "PREVIOUS_TERM" | "SENIORITY"; winningCandidateId?: string | null; lotterySeed?: string | null; algorithm?: string | null }
): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    const parsed = ResolveTieSchema.parse(data)
    if (parsed.method !== "RUNOFF_ELECTION" && !parsed.winningCandidateId) {
      return { ok: false, error: "winningCandidateId is required for non-runoff tie-break methods." }
    }
    if (parsed.winningCandidateId) {
      await resolveTie(electionId, positionId, parsed.method, parsed.winningCandidateId, {
        lotterySeed: parsed.lotterySeed || undefined,
        algorithm: parsed.algorithm || undefined,
      })
    }
    if (!user) return { ok: false, error: "Authentication required." }
    await writeElectionAudit({
      electionId, action: "TIE_RESOLVED", performedById: user.id, performedByRole: user.role,
      metadata: { positionId, method: parsed.method, winningCandidateId: parsed.winningCandidateId, lotterySeed: parsed.lotterySeed, algorithm: parsed.algorithm },
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to resolve tie." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// COMMITTEE VACANCY
// ──────────────────────────────────────────────────────────────────────────────

export async function manageVacancy(
  committeeId: string,
  data: { positionName: string; vacatedById: string; reason: string; fillMethod: "RUNNER_UP" | "BY_ELECTION" | "APPOINTMENT" | "VACANT"; filledById?: string | null }
): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    const parsed = VacancySchema.parse(data)
    const committee = await prisma.electionCommittee.findUnique({ where: { id: committeeId }, select: { electionId: true } })
    if (!committee) return { ok: false, error: "Committee not found." }

    // Mark the vacating member's committee membership as inactive.
    await prisma.electionCommitteeMember.updateMany({
      where: { committeeId, memberId: parsed.vacatedById, active: true },
      data: { active: false, endDate: new Date() },
    })

    const vacancy = await prisma.electionCommitteeVacancy.create({
      data: {
        committeeId,
        positionName: parsed.positionName,
        vacatedById: parsed.vacatedById,
        reason: parsed.reason,
        fillMethod: parsed.fillMethod,
        filledById: parsed.filledById || null,
        filledAt: parsed.filledById ? new Date() : null,
      },
    })

    if (parsed.filledById && parsed.fillMethod === "APPOINTMENT") {
      await prisma.electionCommitteeMember.create({
        data: {
          committeeId,
          memberId: parsed.filledById,
          positionName: parsed.positionName,
          startDate: new Date(),
          active: true,
          electionMethod: "APPOINTED",
        },
      })
    }
    // RUNNER_UP / BY_ELECTION / VACANT are handled outside this action
    // (RUNNER_UP requires looking up the next-highest result; BY_ELECTION
    // creates a new election; VACANT leaves the seat empty).

    await writeElectionAudit({
      electionId: committee.electionId || "",
      action: "COMMITTEE_VACANCY", performedById: user.id, performedByRole: user.role,
      metadata: { committeeId, vacancyId: vacancy.id, positionName: parsed.positionName, fillMethod: parsed.fillMethod },
    })
    revalidatePath(`/portal/committee/current`)
    return { ok: true, id: vacancy.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to manage vacancy." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// OBSERVERS
// ──────────────────────────────────────────────────────────────────────────────

export async function assignObserver(
  electionId: string,
  data: { userId: string; expiresAt: Date }
): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    const parsed = ObserverSchema.parse(data)
    if (parsed.expiresAt <= new Date()) {
      return { ok: false, error: "Expiration must be in the future." }
    }
    await prisma.electionObserverAssignment.upsert({
      where: { electionId_userId: { electionId, userId: parsed.userId } },
      create: { electionId, userId: parsed.userId, expiresAt: parsed.expiresAt, assignedById: user.id },
      update: { expiresAt: parsed.expiresAt, assignedById: user.id, revokedAt: null },
    })
    await writeElectionAudit({
      electionId, action: "UPDATED", performedById: user.id, performedByRole: user.role,
      metadata: { action: "observer_assigned", userId: parsed.userId, expiresAt: parsed.expiresAt },
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to assign observer." }
  }
}

export async function revokeObserver(electionId: string, assignmentId: string): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    await prisma.electionObserverAssignment.update({
      where: { id: assignmentId },
      data: { revokedAt: new Date() },
    })
    await writeElectionAudit({
      electionId, action: "UPDATED", performedById: user.id, performedByRole: user.role,
      metadata: { action: "observer_revoked", assignmentId },
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to revoke observer." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// RECOUNT
// ──────────────────────────────────────────────────────────────────────────────

export async function requestRecount(electionId: string, reason: string): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    const parsed = RecountSchema.parse({ reason })
    const election = await prisma.election.findUnique({ where: { id: electionId }, select: { status: true, resultHash: true } })
    if (!election) return { ok: false, error: "Election not found." }
    if (!election.resultHash) return { ok: false, error: "Election has not been counted yet." }

    const recount = await prisma.recountRequest.create({
      data: { electionId, requestedById: user.id, reason: parsed.reason, status: "PENDING" },
    })

    // Run the recount immediately (deterministic; should produce the same hash).
    const result = await recountElection(electionId)
    await prisma.recountRequest.update({
      where: { id: recount.id },
      data: {
        status: "COMPLETED",
        resolvedAt: new Date(),
        resultHash: result.resultHash,
        recountResult: { matchesOriginal: result.matchesOriginal, originalHash: result.originalHash, newHash: result.resultHash } as any,
      },
    })

    await writeElectionAudit({
      electionId, action: "RECOUNT_PERFORMED", performedById: user.id, performedByRole: user.role,
      metadata: { recountId: recount.id, matchesOriginal: result.matchesOriginal, originalHash: result.originalHash, newHash: result.resultHash },
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true, data: result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to request recount." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// MEMBER ACTIONS — nomination + voting
// ──────────────────────────────────────────────────────────────────────────────

export async function submitNomination(formData: FormData): Promise<ActionResult> {
  try {
    const memberId = await getCurrentMemberId()
    const electionId = formData.get("electionId") as string
    const positionId = formData.get("positionId") as string

    const election = await prisma.election.findUnique({
      where: { id: electionId },
      select: { status: true, maxPositionsPerCandidate: true, allowSelfNomination: true },
    })
    if (!election) return { ok: false, error: "Election not found." }
    if (election.status !== "NOMINATION_OPEN") {
      return { ok: false, error: "Nominations are not currently open for this election." }
    }
    if (!election.allowSelfNomination) {
      return { ok: false, error: "Self-nomination is not enabled for this election." }
    }

    // Eligibility check (live; snapshot doesn't exist yet at nomination time).
    // Uses the CANDIDATE rule set (stricter than voter rules — e.g. min membership
    // duration, min trust score).
    const { eligible, reason } = await resolveMemberEligibility(electionId, memberId, "candidate")
    if (!eligible) {
      return { ok: false, error: reason ? `You are not eligible to contest this election: ${reason}` : "You are not eligible to contest this election." }
    }

    // Cross-position candidacy rule (spec §9.1).
    const existingNominations = await prisma.electionNomination.count({
      where: {
        electionId,
        memberId,
        status: { in: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED"] },
      },
    })
    if (existingNominations >= election.maxPositionsPerCandidate) {
      return {
        ok: false,
        error: `You may contest at most ${election.maxPositionsPerCandidate} position(s) in this election. Withdraw an existing nomination first.`,
      }
    }

    const statement = sanitizeText(formData.get("statement") as string, 1000)
    const manifesto = sanitizeText(formData.get("manifesto") as string, 3000)
    const experience = sanitizeText(formData.get("experience") as string, 2000)
    const supportingInfo = sanitizeText(formData.get("supportingInfo") as string, 1000)
    const photoUrl = (formData.get("photoUrl") as string) || null
    const declaration = formData.get("declaration") === "true"
    if (!declaration) {
      return { ok: false, error: "You must confirm the declaration." }
    }

    try {
      const nomination = await prisma.electionNomination.create({
        data: {
          electionId, positionId, memberId,
          statement: statement || null,
          manifesto: manifesto || null,
          experience: experience || null,
          supportingInfo: supportingInfo || null,
          photoUrl,
          status: "SUBMITTED",
          submittedAt: new Date(),
        },
      })
      // Auto-create the candidate row (pending approval).
      await prisma.electionCandidate.create({
        data: {
          electionId, positionId, memberId,
          photoUrl,
          status: "PENDING",
        },
      })
      await writeElectionAudit({
        electionId, action: "UPDATED", performedById: null, performedByRole: "MEMBER",
        metadata: { action: "nomination_submitted", nominationId: nomination.id, positionId, memberId },
      })
    } catch (e: any) {
      if (e?.code === "P2002") {
        return { ok: false, error: "You have already submitted a nomination for this position." }
      }
      throw e
    }

    revalidatePath(`/portal/elections/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to submit nomination." }
  }
}

export async function withdrawNomination(electionId: string, nominationId: string): Promise<ActionResult> {
  try {
    const memberId = await getCurrentMemberId()
    const nomination = await prisma.electionNomination.findUnique({ where: { id: nominationId }, select: { memberId: true, status: true, positionId: true } })
    if (!nomination) return { ok: false, error: "Nomination not found." }
    if (nomination.memberId !== memberId) return { ok: false, error: "Not your nomination." }
    if (nomination.status === "WITHDRAWN") return { ok: false, error: "Already withdrawn." }

    await prisma.electionNomination.update({ where: { id: nominationId }, data: { status: "WITHDRAWN" } })
    await prisma.electionCandidate.updateMany({
      where: { electionId, positionId: nomination.positionId, memberId, status: { in: ["PENDING", "APPROVED"] } },
      data: { status: "WITHDRAWN" },
    })
    await writeElectionAudit({
      electionId, action: "CANDIDATE_WITHDRAWN", performedById: null, performedByRole: "MEMBER",
      metadata: { nominationId, positionId: nomination.positionId, memberId },
    })
    revalidatePath(`/portal/elections/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to withdraw nomination." }
  }
}

/**
 * Fetch the member's nominations for an election (for the "My Nominations"
 * view in the portal — lets them see status and withdraw if needed).
 */
export async function getMyNominations(electionId: string) {
  const memberId = await getCurrentMemberId()
  const nominations = await prisma.electionNomination.findMany({
    where: { electionId, memberId },
    include: {
      position: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
  })
  return JSON.parse(JSON.stringify(nominations))
}

/**
 * Fetch election data for the nomination form: positions the member can
 * contest, plus their existing nominations (to enforce cross-position limits
 * and prevent duplicate nominations for the same position).
 */
export async function getNominationContext(electionId: string) {
  const memberId = await getCurrentMemberId()
  const [election, positions, myNominations] = await Promise.all([
    prisma.election.findUnique({
      where: { id: electionId, isTestElection: false },
      select: {
        id: true, name: true, code: true, status: true,
        nominationStartAt: true, nominationEndAt: true,
        allowSelfNomination: true, maxPositionsPerCandidate: true,
      },
    }),
    prisma.electionPosition.findMany({
      where: { electionId, isActive: true },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true, code: true, seatCount: true, description: true },
    }),
    prisma.electionNomination.findMany({
      where: { electionId, memberId, status: { in: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED"] } },
      select: { id: true, positionId: true, status: true, submittedAt: true },
    }),
  ])
  if (!election) throw new Error("Election not found.")
  // Live eligibility check using CANDIDATE rule set (snapshot doesn't exist yet
  // during nomination).
  const { eligible, reason } = await resolveMemberEligibility(electionId, memberId, "candidate")
  return JSON.parse(JSON.stringify({
    election,
    positions,
    myNominations,
    eligible,
    ineligibleReason: reason,
    memberId,
  }))
}

/**
 * Verify the member's confirmation password before ballot submission.
 * Per spec §38: Level 2 = password/PIN confirmation. OTP is deferred.
 */
export async function verifyVoteConfirmation(memberId: string, password: string): Promise<ActionResult> {
  try {
    const account = await prisma.memberAccount.findFirst({ where: { memberId } })
    if (!account) return { ok: false, error: "Account not found." }
    const match = await bcrypt.compare(password, account.passwordHash)
    if (!match) return { ok: false, error: "Incorrect password." }
    return { ok: true }
  } catch {
    return { ok: false, error: "Password verification failed." }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// READS — admin + member
// ──────────────────────────────────────────────────────────────────────────────

export async function listElections(filters?: { status?: string; isTestElection?: boolean }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Authentication required.")
  const result = await prisma.election.findMany({
    where: {
      ...(filters?.status ? { status: filters.status as ElectionStatus } : {}),
      ...(filters?.isTestElection !== undefined ? { isTestElection: filters.isTestElection } : { isTestElection: false }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { positions: true, candidates: true, ballots: true, participation: true } },
      parentElection: { select: { code: true, name: true } },
    },
  })
  return JSON.parse(JSON.stringify(result))
}

export async function getElection(id: string) {
  const election = await prisma.election.findUnique({
    where: { id },
    include: {
      positions: { orderBy: { displayOrder: "asc" }, include: { _count: { select: { candidates: true, nominations: true } } } },
      _count: { select: { ballots: true, participation: true, eligibility: true, auditLogs: true } },
      parentElection: { select: { id: true, code: true, name: true } },
      runoffElections: { select: { id: true, code: true, name: true, status: true } },
    },
  })
  // Serialize to strip Prisma Decimal/DateTime class instances so the object
  // can be passed from Server Components to Client Components without the
  // "Only plain objects can be passed to Client Components" error.
  // (Decimal.prototype.toJSON() returns a string, but the Prisma Proxy wrapper
  // around the result can confuse Next.js's RSC serializer.)
  return election ? JSON.parse(JSON.stringify(election)) : null
}

export async function getElectionAuditLogs(electionId: string, limit = 100) {
  const result = await prisma.electionAuditLog.findMany({
    where: { electionId },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
  return JSON.parse(JSON.stringify(result))
}

export async function getMemberElections() {
  const memberId = await getCurrentMemberId()
  // Members see non-test elections that are NOT in DRAFT status. We don't
  // require an eligibility-snapshot row here, because the snapshot is only
  // generated at candidate-finalization time — so during NOMINATION_OPEN
  // there's no snapshot yet, but members still need to see the election to
  // submit nominations. Per-position eligibility is checked live at action
  // time (submitNomination, getBallot) via resolveMemberEligibility.
  const result = await prisma.election.findMany({
    where: {
      isTestElection: false,
      status: { notIn: ["DRAFT", "CANCELLED"] },
    },
    orderBy: { votingStartAt: "desc" },
    include: {
      participation: { where: { memberId }, select: { voted: true, votedAt: true } },
      nominations: { where: { memberId }, select: { id: true, positionId: true, status: true } },
    },
  })
  return JSON.parse(JSON.stringify(result))
}

export async function getMemberVotingStatus(electionId: string) {
  const memberId = await getCurrentMemberId()
  const [election, participation] = await Promise.all([
    prisma.election.findUnique({ where: { id: electionId }, select: { status: true, votingStartAt: true, votingEndAt: true, isTestElection: true } }),
    prisma.electionParticipation.findUnique({ where: { electionId_memberId: { electionId, memberId } }, select: { voted: true, votedAt: true } }),
  ])
  if (!election) throw new Error("Election not found.")
  const { eligible } = await resolveMemberEligibility(electionId, memberId)
  return JSON.parse(JSON.stringify({
    eligible,
    voted: participation?.voted || false,
    votedAt: participation?.votedAt || null,
    votingOpen: election.status === "VOTING_OPEN",
    votingClosesAt: election.votingEndAt,
    isTestElection: election.isTestElection,
  }))
}

export async function getBallot(electionId: string) {
  const memberId = await getCurrentMemberId()
  const election = await prisma.election.findUnique({
    where: { id: electionId, isTestElection: false },
    select: { id: true, name: true, status: true, votingStartAt: true, votingEndAt: true, showLiveResults: true },
  })
  if (!election) throw new Error("Election not found.")
  if (election.status !== "VOTING_OPEN") throw new Error("Voting is not open.")

  const { eligible } = await resolveMemberEligibility(electionId, memberId)
  if (!eligible) throw new Error("You are not eligible to vote in this election.")

  const participation = await prisma.electionParticipation.findUnique({
    where: { electionId_memberId: { electionId, memberId } },
    select: { voted: true },
  })
  if (participation?.voted) throw new Error("You have already voted.")

  const positions = await prisma.electionPosition.findMany({
    where: { electionId, isActive: true },
    orderBy: { displayOrder: "asc" },
    include: {
      candidates: {
        where: { status: { in: ["APPROVED", "UNCONTESTED_ELECTED"] } },
        include: {
          member: { select: { id: true, fullName: true, memberNo: true, photoUrl: true, membershipDate: true } },
        },
      },
      nominations: {
        where: { status: "APPROVED" },
        select: { memberId: true, statement: true, manifesto: true, experience: true, supportingInfo: true, photoUrl: true },
      },
    },
  })

  // Stitch nomination content onto each candidate (matched by memberId).
  for (const p of positions) {
    const nomByMember = new Map(p.nominations.map((n) => [n.memberId, n]))
    for (const c of p.candidates) {
      ;(c as any).nomination = nomByMember.get(c.memberId) || null
    }
  }

  return JSON.parse(JSON.stringify({ election, positions }))
}

export async function getElectionResults(electionId: string) {
  const election = await prisma.election.findUnique({
    where: { id: electionId },
    select: { id: true, status: true, resultHash: true, name: true, termStartDate: true, termEndDate: true },
  })
  if (!election) throw new Error("Election not found.")
  // Results visible only after publication (or if live results are enabled).
  const isPublished = election.status === "RESULTS_PUBLISHED" || election.status === "COMMITTEE_FORMED" || election.status === "ARCHIVED"
  if (!isPublished) {
    return { election, published: false, positions: [] }
  }
  const positions = await prisma.electionPosition.findMany({
    where: { electionId, isActive: true },
    orderBy: { displayOrder: "asc" },
    include: {
      results: { orderBy: { rank: "asc" } },
    },
  })
  return JSON.parse(JSON.stringify({ election, published: true, positions }))
}

export async function getCurrentCommittee() {
  const result = await prisma.electionCommittee.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { termStartDate: "desc" },
    include: {
      members: {
        where: { active: true },
        include: { member: { select: { id: true, fullName: true, memberNo: true, photoUrl: true } } },
        orderBy: { startDate: "asc" },
      },
      election: { select: { id: true, name: true, code: true } },
    },
  })
  return result ? JSON.parse(JSON.stringify(result)) : null
}

export async function listCommittees() {
  const result = await prisma.electionCommittee.findMany({
    orderBy: { termStartDate: "desc" },
    include: {
      _count: { select: { members: true } },
      election: { select: { id: true, name: true, code: true } },
    },
  })
  return JSON.parse(JSON.stringify(result))
}

// ──────────────────────────────────────────────────────────────────────────────
// VOTING MONITOR (admin)
// ──────────────────────────────────────────────────────────────────────────────

export async function getVotingMonitor(electionId: string) {
  const election = await prisma.election.findUnique({
    where: { id: electionId },
    select: { id: true, status: true, quorumRequired: true, minTurnoutPercentage: true, votingStartAt: true, votingEndAt: true },
  })
  if (!election) throw new Error("Election not found.")
  const [eligible, voted, invalid] = await Promise.all([
    prisma.electionEligibility.count({ where: { electionId, eligible: true } }),
    prisma.electionParticipation.count({ where: { electionId, voted: true } }),
    prisma.electionBallot.count({ where: { electionId, status: "INVALID" } }),
  ])
  const turnout = eligible > 0 ? (voted / eligible) * 100 : 0
  const quorumMet = !election.quorumRequired || turnout >= Number(election.minTurnoutPercentage || 0)
  return {
    eligibleMembers: eligible,
    votesCast: voted,
    remaining: Math.max(0, eligible - voted),
    turnout: Number(turnout.toFixed(2)),
    quorumThreshold: Number(election.minTurnoutPercentage || 0),
    quorumRequired: election.quorumRequired,
    quorumMet,
    invalidBallots: invalid,
    votingStatus: election.status,
    votingClosesAt: election.votingEndAt,
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// ELIGIBILITY RULES — configuration + preview
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Get the eligibility config (voter + candidate rules) for an election.
 * Returns the typed config with defaults applied.
 */
export async function getEligibilityConfig(electionId: string) {
  const election = await prisma.election.findUnique({
    where: { id: electionId },
    select: { eligibilityRulesJson: true },
  })
  if (!election) throw new Error("Election not found.")
  return parseEligibilityConfig(election.eligibilityRulesJson)
}

/**
 * Save the eligibility config (voter + candidate rules). Admin-only.
 * The config is stored as JSON on Election.eligibilityRulesJson.
 * Only editable while election is in DRAFT or NOMINATION_OPEN status.
 */
export async function saveEligibilityConfig(
  electionId: string,
  config: { voter: { rules: any[]; combinator?: "AND" | "OR" }; candidate: { rules: any[]; combinator?: "AND" | "OR" } }
): Promise<ActionResult> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    const election = await prisma.election.findUnique({ where: { id: electionId }, select: { status: true } })
    if (!election) return { ok: false, error: "Election not found." }
    if (!isConfigEditable(election.status)) {
      return { ok: false, error: `Eligibility rules are locked in status ${election.status}.` }
    }
    await prisma.election.update({
      where: { id: electionId },
      data: { eligibilityRulesJson: config as any },
    })
    await writeElectionAudit({
      electionId, action: "UPDATED", performedById: user.id, performedByRole: user.role,
      metadata: { action: "eligibility_config_saved" },
    })
    revalidatePath(`${PATH}/${electionId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save eligibility config." }
  }
}

/**
 * Preview how many members would be eligible under the given rules.
 * Does NOT persist anything — just runs the rules live against the member DB.
 * Useful for the admin to see the impact of a rule before saving it.
 */
export async function previewEligibility(
  electionId: string,
  ruleSet: "voter" | "candidate",
  rules: { rules: any[]; combinator?: "AND" | "OR" }
): Promise<{ eligibleCount: number; ineligibleCount: number; totalChecked: number }> {
  try {
    const user = await requireElectionAdmin(await getCurrentUser())
    void user
    const members = await prisma.member.findMany({
      where: { status: { in: ["ACTIVE", "SUSPENDED"] } },
      select: { id: true },
    })
    let eligibleCount = 0
    let ineligibleCount = 0
    for (const m of members) {
      const det = await determineMemberEligibility(m.id, rules as any)
      if (det.eligible) eligibleCount++
      else ineligibleCount++
    }
    return { eligibleCount, ineligibleCount, totalChecked: members.length }
  } catch (e) {
    throw e
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// CANDIDATES — admin list with full nomination content
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Get all candidates for an election with their nomination content (statement,
 * manifesto, experience, supporting info) + member info. Used by the admin
 * Candidates tab to show full context for each candidate.
 */
export async function getElectionCandidates(electionId: string) {
  const positions = await prisma.electionPosition.findMany({
    where: { electionId, isActive: true },
    orderBy: { displayOrder: "asc" },
    include: {
      candidates: {
        orderBy: { createdAt: "asc" },
        include: {
          member: {
            select: {
              id: true, fullName: true, memberNo: true, photoUrl: true,
              membershipDate: true, status: true, trustScore: true, kycVerified: true,
              dateOfBirth: true,
            },
          },
        },
      },
      nominations: {
        select: {
          memberId: true, statement: true, manifesto: true, experience: true,
          supportingInfo: true, photoUrl: true, status: true, submittedAt: true,
          rejectionReason: true,
        },
      },
    },
  })
  // Stitch nomination content onto each candidate (matched by memberId).
  for (const p of positions) {
    const nomByMember = new Map(p.nominations.map((n) => [n.memberId, n]))
    for (const c of p.candidates) {
      ;(c as any).nomination = nomByMember.get(c.memberId) || null
    }
  }
  return JSON.parse(JSON.stringify(positions))
}

// ──────────────────────────────────────────────────────────────────────────────
// COMMITTEE — landing page sync + bio management
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Sync the current ElectionCommittee members into the SiteContent.management
 * JSON column so they appear on the landing page "Our Management Committee"
 * section. Called automatically after formCommittee(), and can also be
 * triggered manually from the Landing Page Content admin page.
 *
 * Preserves existing bios: if a member already has a bio in the JSON (from
 * a previous sync), it's kept. New members get an empty bio the admin can edit.
 */
export async function syncCommitteeToLandingPage(committeeId?: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: "Authentication required." }

    let committee: any
    if (committeeId) {
      committee = await prisma.electionCommittee.findUnique({
        where: { id: committeeId },
        include: {
          members: {
            where: { active: true },
            include: { member: { select: { id: true, fullName: true, photoUrl: true } } },
            orderBy: { displayOrder: "asc" },
          },
        },
      })
    } else {
      committee = await prisma.electionCommittee.findFirst({
        where: { status: "ACTIVE" },
        orderBy: { termStartDate: "desc" },
        include: {
          members: {
            where: { active: true },
            include: { member: { select: { id: true, fullName: true, photoUrl: true } } },
            orderBy: { displayOrder: "asc" },
          },
        },
      })
    }
    if (!committee) return { ok: false, error: "No active committee found." }

    // Load existing SiteContent.management to preserve any edited bios.
    const existing = await prisma.siteContent.findUnique({
      where: { id: "singleton" },
      select: { management: true },
    })
    const existingManagement: Array<{ name?: string; role?: string; bio?: string; photoUrl?: string }> =
      Array.isArray(existing?.management) ? (existing!.management as any[]) : []

    // Build new management array from committee members.
    const management = committee.members.map((cm: any, idx: number) => {
      // Try to find an existing bio by member name (best-effort preservation).
      const existingEntry = existingManagement.find((m) => m.name === cm.member.fullName)
      return {
        name: cm.member.fullName,
        role: cm.positionName,
        photoUrl: cm.member.photoUrl || existingEntry?.photoUrl || null,
        bio: cm.shortBio || existingEntry?.bio || "",
        // Internal linkage (not rendered on landing page, but useful for sync):
        _committeeMemberId: cm.id,
        _memberId: cm.member.id,
        _displayOrder: idx,
      }
    })

    await prisma.siteContent.upsert({
      where: { id: "singleton" },
      update: { management: management as any },
      create: { management: management as any },
    })

    revalidatePath("/")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to sync committee to landing page." }
  }
}

/**
 * Save committee member bios (edited from the Landing Page Content admin page).
 * Updates both the ElectionCommitteeMember.shortBio field AND the
 * SiteContent.management JSON so the landing page reflects changes.
 */
export async function saveCommitteeBios(
  bios: Array<{ committeeMemberId: string; shortBio: string; displayOrder?: number }>
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: "Authentication required." }

    // Update each committee member's bio + display order.
    for (const b of bios) {
      await prisma.electionCommitteeMember.update({
        where: { id: b.committeeMemberId },
        data: {
          shortBio: b.shortBio || null,
          ...(b.displayOrder !== undefined ? { displayOrder: b.displayOrder } : {}),
        },
      })
    }

    // Re-sync to landing page JSON.
    const firstMember = await prisma.electionCommitteeMember.findUnique({
      where: { id: bios[0]?.committeeMemberId },
      select: { committeeId: true },
    })
    if (firstMember) {
      await syncCommitteeToLandingPage(firstMember.committeeId)
    }

    revalidatePath("/")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save committee bios." }
  }
}

/**
 * Get all committee members with their bios for the Landing Page Content
 * admin editor. Returns active members of the most recent active committee.
 */
export async function getCommitteeForBioEdit() {
  const committee = await prisma.electionCommittee.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { termStartDate: "desc" },
    include: {
      members: {
        where: { active: true },
        include: { member: { select: { id: true, fullName: true, photoUrl: true } } },
        orderBy: { displayOrder: "asc" },
      },
      election: { select: { name: true, code: true } },
    },
  })
  if (!committee) return null
  return JSON.parse(JSON.stringify(committee))
}
