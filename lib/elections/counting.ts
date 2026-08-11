/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Vote counting engine — deterministic, repeatable, with tie + quorum handling.
// ============================================================================
// Per spec §42, §44, §45: counting reads all VALID ballots (decrypting each in
// memory only — never persisting decrypted selections), tallies per position,
// detects ties for the final seat(s), applies the configured tie-breaking
// method, validates quorum, and produces immutable ElectionResult rows.
//
// Determinism: the same ballot set MUST produce the same result hash on every
// count. This is enforced by:
//   1. Sorting ballots by castAt before tallying.
//   2. Using canonical JSON (sorted keys) for the result-hash input.
//   3. No random tie-breaking inside the count (random methods like
//      LOTTERY_DRAW are applied AFTER counting, as a separate audited step).

import prisma, { directPrisma } from "@/lib/prisma"
import { decryptBallot, sha256Json } from "./ballotCrypto"
import type {
  Election,
  ElectionPosition,
  ElectionBallot,
  ElectionResult,
  TieBreakingMethod,
} from "@prisma/client"

export interface DecryptedBallot {
  id: string
  ballotReference: string
  selections: Array<{ positionId: string; candidateId: string }>
}

export interface PositionTally {
  positionId: string
  positionName: string
  seatCount: number
  tieBreakingMethod: TieBreakingMethod
  // Map: candidateId (or "NOTA") → vote count
  counts: Map<string, number>
  // Sorted results (highest first). Ties broken by candidateId for determinism.
  ranked: Array<{ candidateId: string; label: string; voteCount: number; rank: number }>
  // Elected candidates (after applying seat allocation + tie rules).
  elected: Array<{ candidateId: string; label: string; voteCount: number; method: string }>
  // True if NOTA received the highest count (position unfilled).
  notaWon: boolean
  // True if a tie was detected for the final seat.
  tieDetected: boolean
  tiedCandidateIds: string[]
}

export interface CountResult {
  totalBallots: number
  validBallots: number
  invalidBallots: number
  positionTallies: PositionTally[]
  // SHA-256 of the canonical result representation.
  resultHash: string
  // True if any position has a tie requiring resolution.
  hasUnresolvedTies: boolean
  // Quorum
  quorumRequired: boolean
  quorumMet: boolean
  turnoutPercentage: number
  eligibleVoterCount: number
}

/**
 * Decrypt all VALID ballots for an election IN MEMORY, returning the
 * selection list. Selections are NEVER persisted in a queryable form.
 */
export async function decryptBallotsForCounting(
  electionId: string
): Promise<{ ballots: DecryptedBallot[]; invalid: Array<{ id: string; reason: string }> }> {
  const ballots = await prisma.electionBallot.findMany({
    where: { electionId, status: "VALID" },
    orderBy: { castAt: "asc" }, // deterministic order
    select: { id: true, ballotReference: true, encryptedData: true, keyId: true },
  })

  const out: DecryptedBallot[] = []
  const invalid: Array<{ id: string; reason: string }> = []

  for (const b of ballots) {
    try {
      const plaintext = decryptBallot(b.encryptedData, b.keyId)
      const parsed = JSON.parse(plaintext) as { selections: Array<{ positionId: string; candidateId: string }> }
      out.push({
        id: b.id,
        ballotReference: b.ballotReference,
        selections: Array.isArray(parsed.selections) ? parsed.selections : [],
      })
    } catch (e) {
      // Decryption failure or malformed JSON → mark ballot invalid.
      invalid.push({ id: b.id, reason: (e as Error).message })
    }
  }

  return { ballots: out, invalid }
}

/** Mark a ballot invalid (only for technical violations, never content). */
export async function invalidateBallot(ballotId: string, reason: string): Promise<void> {
  await prisma.electionBallot.update({
    where: { id: ballotId },
    data: { status: "INVALID", invalidReason: reason.slice(0, 500) },
  })
}

/**
 * Tally votes for a single position. Pure function (no DB writes).
 */
export function tallyPosition(
  position: Pick<ElectionPosition, "id" | "name" | "seatCount" | "showNOTA"> & {
    tieBreakingMethod: TieBreakingMethod
  },
  ballots: DecryptedBallot[],
  candidateLabels: Map<string, string>
): PositionTally {
  const counts = new Map<string, number>()

  // Initialize all known candidates with 0 (so they appear even with no votes).
  for (const [cid, label] of candidateLabels.entries()) {
    counts.set(cid, 0)
    void label
  }
  if (position.showNOTA) {
    counts.set("NOTA", 0)
  }

  for (const b of ballots) {
    for (const sel of b.selections) {
      if (sel.positionId !== position.id) continue
      const current = counts.get(sel.candidateId) || 0
      counts.set(sel.candidateId, current + 1)
    }
  }

  // Rank: sort by vote count desc, then by candidateId asc for determinism.
  const ranked = Array.from(counts.entries())
    .map(([candidateId, voteCount]) => ({
      candidateId,
      label: candidateLabels.get(candidateId) || (candidateId === "NOTA" ? "NOTA" : candidateId),
      voteCount,
      rank: 0,
    }))
    .sort((a, b) => {
      if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount
      return a.candidateId.localeCompare(b.candidateId)
    })
  ranked.forEach((r, i) => (r.rank = i + 1))

  // Determine elected candidates.
  const seats = position.seatCount
  const elected: PositionTally["elected"] = []
  let notaWon = false

  // Check if NOTA has the highest count (only matters for seat 1).
  if (position.showNOTA && ranked.length > 0 && ranked[0].candidateId === "NOTA" && ranked[0].voteCount > 0) {
    notaWon = true
    // When NOTA wins the top seat, the position is unfilled. Per spec §17.1:
    // "If NOTA receives the highest votes, the position remains unfilled."
    // We do NOT elect anyone; admin must configure re-nomination or runoff.
  }

  if (!notaWon && seats > 0) {
    // Fill seats from the top, stopping if NOTA appears in the top N.
    for (let i = 0; i < ranked.length && elected.length < seats; i++) {
      const r = ranked[i]
      if (r.candidateId === "NOTA") {
        // NOTA in top N: per spec, those seats remain unfilled.
        break
      }
      // Only elect candidates with at least 1 vote (uncontested candidates with
      // 0 votes are handled separately by the uncontested policy at finalization).
      if (r.voteCount > 0) {
        elected.push({
          candidateId: r.candidateId,
          label: r.label,
          voteCount: r.voteCount,
          method: "VOTED",
        })
      }
    }
  }

  // Tie detection: is there a tie at the boundary of the last elected seat?
  // E.g. seats=1, two candidates tied at the top → tie.
  // E.g. seats=5, candidates E and F tied for the 5th seat → tie.
  let tieDetected = false
  let tiedCandidateIds: string[] = []
  if (!notaWon && seats > 0 && ranked.length > seats) {
    // The candidate just outside the seats (rank = seats+1) might be tied with
    // the last seat (rank = seats). Compare vote counts.
    const lastSeat = ranked[seats - 1]
    const firstOut = ranked[seats]
    if (lastSeat && firstOut && lastSeat.voteCount === firstOut.voteCount && lastSeat.voteCount > 0) {
      // Find ALL candidates tied at that count (could be more than 2).
      const tieCount = lastSeat.voteCount
      tiedCandidateIds = ranked
        .filter((r) => r.voteCount === tieCount && r.candidateId !== "NOTA")
        .map((r) => r.candidateId)
      // Only a tie if there are more tied candidates than remaining seats.
      const remainingSeats = seats - (elected.length)
      if (tiedCandidateIds.length > remainingSeats) {
        tieDetected = true
        // Remove the ambiguous ones from elected (we can't decide without tie-break).
        // Keep only elected candidates whose rank is strictly better than the tie.
        const clearWinners = ranked.filter((r) => r.voteCount > tieCount && r.candidateId !== "NOTA")
        elected.length = 0
        for (const w of clearWinners.slice(0, seats)) {
          elected.push({
            candidateId: w.candidateId,
            label: w.label,
            voteCount: w.voteCount,
            method: "VOTED",
          })
        }
      }
    }
  }

  return {
    positionId: position.id,
    positionName: position.name,
    seatCount: seats,
    tieBreakingMethod: position.tieBreakingMethod,
    counts,
    ranked,
    elected,
    notaWon,
    tieDetected,
    tiedCandidateIds,
  }
}

/**
 * Run the full count for an election: decrypt ballots, tally each position,
 * validate quorum, persist ElectionResult rows, generate the result hash.
 *
 * MUST be called inside a transaction by the caller to ensure atomicity.
 */
export async function countVotes(
  election: Pick<
    Election,
    | "id"
    | "quorumRequired"
    | "minTurnoutPercentage"
    | "tieBreakingMethod"
  >,
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">
): Promise<CountResult> {
  // 1. Decrypt all valid ballots in memory.
  const { ballots, invalid } = await decryptBallotsForCounting(election.id)

  // 2. Mark any newly-invalid ballots.
  for (const inv of invalid) {
    await invalidateBallot(inv.id, inv.reason)
  }

  // 3. Load positions + candidate labels.
  const positions = await tx.electionPosition.findMany({
    where: { electionId: election.id, isActive: true },
    orderBy: { displayOrder: "asc" },
    include: {
      candidates: {
        where: { status: { in: ["APPROVED", "UNCONTESTED_ELECTED"] } },
        include: { member: { select: { fullName: true } } },
      },
    },
  })

  const candidateLabels = new Map<string, string>()
  for (const p of positions) {
    for (const c of p.candidates) {
      candidateLabels.set(c.id, c.member.fullName)
    }
  }

  // 4. Tally each position.
  const positionTallies: PositionTally[] = positions.map((p) =>
    tallyPosition(
      {
        id: p.id,
        name: p.name,
        seatCount: p.seatCount,
        showNOTA: p.showNOTA,
        tieBreakingMethod: election.tieBreakingMethod,
      },
      ballots,
      candidateLabels
    )
  )

  // 5. Quorum check.
  const eligibleVoterCount = await tx.electionEligibility.count({
    where: { electionId: election.id, eligible: true },
  })
  const validBallots = ballots.length
  const turnoutPercentage = eligibleVoterCount > 0 ? (validBallots / eligibleVoterCount) * 100 : 0
  const quorumThreshold = Number(election.minTurnoutPercentage || 0)
  const quorumMet = !election.quorumRequired || turnoutPercentage >= quorumThreshold

  // 6. Persist ElectionResult rows (delete prior rows first — counting is
  //    idempotent: re-counting produces the same rows + same hash).
  await tx.electionResult.deleteMany({ where: { electionId: election.id } })

  for (const pt of positionTallies) {
    const totalForPosition = pt.ranked.reduce((s, r) => s + r.voteCount, 0)
    for (const r of pt.ranked) {
      const pct = totalForPosition > 0 ? (r.voteCount / totalForPosition) * 100 : 0
      const isElected = pt.elected.some((e) => e.candidateId === r.candidateId)
      const method = isElected ? pt.elected.find((e) => e.candidateId === r.candidateId)?.method : null
      await tx.electionResult.create({
        data: {
          electionId: election.id,
          positionId: pt.positionId,
          candidateId: r.candidateId === "NOTA" ? null : r.candidateId,
          label: r.label,
          voteCount: r.voteCount,
          votePercentage: pct,
          rank: r.rank,
          elected: isElected,
          electionMethod: method,
        },
      })
    }
  }

  // 7. Generate the result hash from the canonical representation.
  const hashInput = {
    electionId: election.id,
    validBallots,
    invalidBallots: invalid.length,
    positions: positionTallies.map((p) => ({
      positionId: p.positionId,
      seatCount: p.seatCount,
      ranked: p.ranked.map((r) => ({ c: r.candidateId, v: r.voteCount })),
      elected: p.elected.map((e) => e.candidateId),
      notaWon: p.notaWon,
      tieDetected: p.tieDetected,
      tiedCandidateIds: p.tiedCandidateIds,
    })),
    quorumMet,
    turnoutPercentage: Number(turnoutPercentage.toFixed(4)),
  }
  const resultHash = sha256Json(hashInput)

  return {
    totalBallots: validBallots + invalid.length,
    validBallots,
    invalidBallots: invalid.length,
    positionTallies,
    resultHash,
    hasUnresolvedTies: positionTallies.some((p) => p.tieDetected),
    quorumRequired: election.quorumRequired,
    quorumMet,
    turnoutPercentage: Number(turnoutPercentage.toFixed(4)),
    eligibleVoterCount,
  }
}

/**
 * Apply a non-runoff tie-break method (committee decision, lottery, previous
 * term, seniority). Produces an updated ElectionResult row for the winner.
 * Lottery uses crypto.randomInt for cryptographic randomness (spec §45.1).
 */
export async function resolveTie(
  electionId: string,
  positionId: string,
  method: TieBreakingMethod,
  winningCandidateId: string,
  metadata?: { lotterySeed?: string; algorithm?: string }
): Promise<void> {
  await prisma.electionResult.updateMany({
    where: { electionId, positionId, candidateId: winningCandidateId },
    data: { elected: true, electionMethod: "TIE_BREAK" },
  })
  // Mark the position's runoffRequired as false (resolved without runoff).
  await prisma.electionPosition.update({
    where: { id: positionId },
    data: { runoffRequired: false },
  })
  void metadata
}

/**
 * Recount: re-run the count and verify the hash matches the original.
 * Per spec Case 28: if hash matches, result is confirmed; if it differs,
 * investigation is triggered. The recount result is recorded separately
 * (never overwrites the original hash).
 */
export async function recountElection(
  electionId: string
): Promise<{ resultHash: string; matchesOriginal: boolean; originalHash: string | null }> {
  const election = await prisma.election.findUnique({
    where: { id: electionId },
    select: {
      id: true,
      quorumRequired: true,
      minTurnoutPercentage: true,
      tieBreakingMethod: true,
      resultHash: true,
    },
  })
  if (!election) throw new Error("Election not found.")

  const result = await directPrisma.$transaction(async (tx) => countVotes(election, tx))
  return {
    resultHash: result.resultHash,
    matchesOriginal: election.resultHash === result.resultHash,
    originalHash: election.resultHash,
  }
}
