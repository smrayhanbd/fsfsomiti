 
// ============================================================================
// Election validation — date rules, position config, ballot selections.
// ============================================================================

import { z } from "zod"
import type { Election, ElectionPosition, ElectionCandidate } from "@prisma/client"

// ── Date validation (spec §7.1) ─────────────────────────────────────────────

export interface DateValidationError {
  field: string
  message: string
}

export function validateElectionDates(input: {
  termStartDate: Date
  termEndDate: Date
  nominationStartAt: Date
  nominationEndAt: Date
  votingStartAt: Date
  votingEndAt: Date
  isUpdate?: boolean
}): DateValidationError[] {
  const errors: DateValidationError[] = []
  const now = new Date()

  if (input.termStartDate >= input.termEndDate) {
    errors.push({ field: "termEndDate", message: "Term end date must be after term start date." })
  }
  if (input.nominationStartAt >= input.nominationEndAt) {
    errors.push({ field: "nominationEndAt", message: "Nomination end date must be after nomination start date." })
  }
  if (input.votingStartAt >= input.votingEndAt) {
    errors.push({ field: "votingEndAt", message: "Voting end date must be after voting start date." })
  }
  if (input.nominationEndAt > input.votingStartAt) {
    errors.push({ field: "votingStartAt", message: "Nomination end date must be before or equal to voting start date." })
  }
  if (input.votingEndAt > input.termStartDate) {
    errors.push({ field: "votingEndAt", message: "Voting must complete before the committee term begins." })
  }
  // New elections must not have past nomination starts.
  if (!input.isUpdate && input.nominationStartAt < now) {
    errors.push({ field: "nominationStartAt", message: "Nomination start date cannot be in the past for a new election." })
  }
  return errors
}

// ── Position validation (spec §8, Case 20) ──────────────────────────────────

export function validatePosition(input: {
  name: string
  code: string
  seatCount: number
  minSelections: number
  maxSelections: number
}): DateValidationError[] {
  const errors: DateValidationError[] = []
  if (input.seatCount < 1) {
    errors.push({ field: "seatCount", message: "Position must have at least 1 seat." })
  }
  if (input.maxSelections < 1) {
    errors.push({ field: "maxSelections", message: "Maximum selections must be at least 1." })
  }
  if (input.minSelections < 0) {
    errors.push({ field: "minSelections", message: "Minimum selections cannot be negative." })
  }
  if (input.minSelections > input.maxSelections) {
    errors.push({ field: "minSelections", message: "Minimum selections cannot exceed maximum selections." })
  }
  if (input.maxSelections > input.seatCount && input.seatCount > 0) {
    errors.push({ field: "maxSelections", message: "Maximum selections cannot exceed seat count." })
  }
  if (!input.code.trim()) {
    errors.push({ field: "code", message: "Position code is required." })
  }
  return errors
}

// ── Ballot selection validation (spec §17, §36) ─────────────────────────────

export interface BallotSelection {
  positionId: string
  candidateIds: string[] // "NOTA" is a reserved sentinel
}

export interface BallotValidationContext {
  election: Pick<Election, "id" | "status" | "votingStartAt" | "votingEndAt" | "ballotStorageMode">
  positions: Array<
    Pick<ElectionPosition, "id" | "seatCount" | "minSelections" | "maxSelections" | "isRequired" | "showNOTA" | "allowSkip" | "isActive">
  >
  candidates: Array<Pick<ElectionCandidate, "id" | "positionId" | "status">>
}

export interface BallotValidationResult {
  valid: boolean
  errors: string[]
  // Normalized selections (deduped, "NOTA" honored).
  normalized: BallotSelection[]
}

export function validateBallotSelections(
  selections: BallotSelection[],
  ctx: BallotValidationContext
): BallotValidationResult {
  const errors: string[] = []
  const normalized: BallotSelection[] = []

  // Election must be open at vote time (server-side re-check, not client trust).
  if (ctx.election.status !== "VOTING_OPEN") {
    errors.push("Election is not currently open for voting.")
  }

  // Index positions + candidates by ID for O(1) lookup.
  const positionMap = new Map(ctx.positions.filter((p) => p.isActive).map((p) => [p.id, p]))
  const candidatesByPosition = new Map<string, Set<string>>()
  for (const c of ctx.candidates) {
    if (c.status !== "APPROVED" && c.status !== "UNCONTESTED_ELECTED") continue
    let set = candidatesByPosition.get(c.positionId)
    if (!set) {
      set = new Set()
      candidatesByPosition.set(c.positionId, set)
    }
    set.add(c.id)
  }

  const seenPositions = new Set<string>()

  for (const sel of selections) {
    const pos = positionMap.get(sel.positionId)
    if (!pos) {
      errors.push(`Unknown position: ${sel.positionId}`)
      continue
    }
    if (seenPositions.has(sel.positionId)) {
      // Duplicate position entry — merge rather than reject, taking the union.
      const existing = normalized.find((n) => n.positionId === sel.positionId)
      if (existing) {
        for (const cid of sel.candidateIds) {
          if (!existing.candidateIds.includes(cid)) existing.candidateIds.push(cid)
        }
      }
      continue
    }
    seenPositions.add(sel.positionId)

    const deduped = Array.from(new Set(sel.candidateIds))
    const hasNOTA = deduped.includes("NOTA")
    const realCandidateIds = deduped.filter((c) => c !== "NOTA")

    // If NOTA is selected, ignore real candidates for this position (NOTA wins).
    const finalIds = hasNOTA ? ["NOTA"] : deduped

    // Validate NOTA availability.
    if (hasNOTA && !pos.showNOTA) {
      errors.push(`NOTA is not available for this position.`)
    }

    // Validate each real candidate belongs to this position + is approved.
    const validCandidates = candidatesByPosition.get(sel.positionId) || new Set<string>()
    for (const cid of realCandidateIds) {
      if (!validCandidates.has(cid)) {
        errors.push(`Invalid candidate for position ${sel.positionId}: ${cid}`)
      }
    }

    // Selection limit: if NOTA, count is 1. Otherwise count real selections.
    const selectionCount = finalIds.length
    if (!hasNOTA) {
      if (selectionCount > pos.maxSelections) {
        errors.push(`Too many selections for a position (max ${pos.maxSelections}).`)
      }
      if (selectionCount < pos.minSelections) {
        errors.push(`Too few selections for a position (min ${pos.minSelections}).`)
      }
    }

    // Required position with empty selection: reject unless NOTA or skip allowed.
    if (pos.isRequired && finalIds.length === 0) {
      if (!pos.allowSkip) {
        errors.push(`A required position has no selection.`)
      }
    }

    normalized.push({ positionId: sel.positionId, candidateIds: finalIds })
  }

  // Required positions that the member didn't include at all.
  for (const pos of ctx.positions) {
    if (!pos.isActive) continue
    if (pos.isRequired && !seenPositions.has(pos.id)) {
      if (!pos.allowSkip) {
        errors.push(`Required position has no selection: ${pos.id}`)
      }
    }
  }

  return { valid: errors.length === 0, errors, normalized }
}

// ── Zod schemas for API request bodies ──────────────────────────────────────

export const SubmitBallotSchema = z.object({
  selections: z.array(
    z.object({
      positionId: z.string().min(1),
      candidateIds: z.array(z.string().min(1)).min(0),
    })
  ),
  confirmationToken: z.string().min(1),
})

export const CreateElectionSchema = z.object({
  code: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(200),
  description: z.string().max(5000).optional().nullable(),
  termStartDate: z.coerce.date(),
  termEndDate: z.coerce.date(),
  nominationStartAt: z.coerce.date(),
  nominationEndAt: z.coerce.date(),
  votingStartAt: z.coerce.date(),
  votingEndAt: z.coerce.date(),
  timezone: z.string().default("Asia/Dhaka"),
  allowSelfNomination: z.boolean().default(true),
  allowMemberNomination: z.boolean().default(false),
  secretBallot: z.boolean().default(true),
  showLiveResults: z.boolean().default(false),
  maxPositionsPerCandidate: z.coerce.number().int().min(1).max(20).default(1),
  minTurnoutPercentage: z.coerce.number().min(0).max(100).optional().nullable(),
  quorumRequired: z.boolean().default(false),
  allowTermOverlap: z.boolean().default(false),
  ballotStorageMode: z.enum(["RELATIONAL", "ENCRYPTED"]).default("ENCRYPTED"),
  tieBreakingMethod: z
    .enum(["RUNOFF_ELECTION", "COMMITTEE_DECISION", "LOTTERY_DRAW", "PREVIOUS_TERM", "SENIORITY"])
    .default("RUNOFF_ELECTION"),
  isTestElection: z.boolean().default(false),
  eligibilityRulesJson: z.any().optional().nullable(),
})

export const PositionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(60),
  description: z.string().max(2000).optional().nullable(),
  displayOrder: z.coerce.number().int().min(0).default(0),
  seatCount: z.coerce.number().int().min(1).max(50),
  minSelections: z.coerce.number().int().min(0).max(50),
  maxSelections: z.coerce.number().int().min(1).max(50),
  isRequired: z.boolean().default(true),
  isActive: z.boolean().default(true),
  showNOTA: z.boolean().default(true),
  allowSkip: z.boolean().default(false),
  uncontestedPolicy: z.enum(["AUTO_ELECT", "STILL_REQUIRE_VOTE"]).default("AUTO_ELECT"),
})

export const NominationSchema = z.object({
  electionId: z.string().min(1),
  positionId: z.string().min(1),
  statement: z.string().max(1000).optional().nullable(),
  manifesto: z.string().max(3000).optional().nullable(),
  experience: z.string().max(2000).optional().nullable(),
  supportingInfo: z.string().max(1000).optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
  declaration: z.literal(true, { message: "You must confirm the declaration." }),
})

export const OverrideEligibilitySchema = z.object({
  eligible: z.boolean(),
  reason: z.string().trim().min(5, "Reason is required (min 5 characters).").max(500),
})

export const ResolveTieSchema = z.object({
  method: z.enum(["RUNOFF_ELECTION", "COMMITTEE_DECISION", "LOTTERY_DRAW", "PREVIOUS_TERM", "SENIORITY"]),
  winningCandidateId: z.string().optional().nullable(),
  lotterySeed: z.string().optional().nullable(),
  algorithm: z.string().optional().nullable(),
})

export const RunoffSchema = z.object({
  positionId: z.string().min(1),
  candidateIds: z.array(z.string().min(1)).min(2),
  votingStartAt: z.coerce.date(),
  votingEndAt: z.coerce.date(),
})

export const VacancySchema = z.object({
  positionName: z.string().min(1),
  vacatedById: z.string().min(1),
  reason: z.string().min(3).max(500),
  fillMethod: z.enum(["RUNNER_UP", "BY_ELECTION", "APPOINTMENT", "VACANT"]),
  filledById: z.string().optional().nullable(),
})

export const CancelSchema = z.object({
  reason: z.string().min(5).max(1000),
})

export const RecountSchema = z.object({
  reason: z.string().min(5).max(1000),
})

export const ObserverSchema = z.object({
  userId: z.string().min(1),
  expiresAt: z.coerce.date(),
})

// ── Sanitization (spec §12.1, §68.1) ────────────────────────────────────────

/** Strip HTML tags, null bytes, and excessively long strings. */
export function sanitizeText(input: string | null | undefined, maxLength: number): string {
  if (!input) return ""
  let s = input.replace(/\0/g, "") // null bytes
  s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // scripts
  s = s.replace(/<[^>]*>/g, "") // all HTML tags
  s = s.slice(0, maxLength)
  return s.trim()
}
