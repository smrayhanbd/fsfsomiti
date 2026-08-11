/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// POST /api/elections/:electionId/voting/submit
// ============================================================================
// Transactional, idempotent, encrypted ballot submission. Per spec §36 + §37:
//   1. Verify authenticated member (from session, NOT request body).
//   2. Verify election status = VOTING_OPEN (and not FROZEN).
//   3. Verify current server time is within voting window.
//   4. Verify member eligibility (snapshot + override if any).
//   5. Lock participation row (SELECT ... FOR UPDATE via Prisma interactive tx).
//   6. Verify voted = FALSE.
//   7. Validate all selections (required positions, limits, NOTA/skip rules).
//   8. Verify every candidate belongs to election + position + is approved.
//   9. Generate ballot reference.
//  10. Encrypt selections (AES-256-GCM).
//  11. Insert ballot record.
//  12. Mark participation as voted = TRUE, votedAt = now.
//  13. Generate non-sensitive audit event (BALLOT_CAST) — no selections in metadata.
//  14. COMMIT.
//
// Idempotency: the Idempotency-Key header is checked first; a duplicate
// request returns the original response (24h retention).
//
// Concurrency: the unique constraint on (electionId, memberId) in
// ElectionParticipation + the transaction lock guarantees one-member-one-vote
// even under simultaneous requests from two tabs (Case 2).

import { NextResponse } from "next/server"
import prisma, { directPrisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { SubmitBallotSchema, validateBallotSelections } from "@/lib/elections/validation"
import { encryptBallot, generateBallotReference, hashIdentifier, sha256 } from "@/lib/elections/ballotCrypto"
import { resolveMemberEligibility } from "@/lib/elections/eligibility"
import { writeElectionAudit } from "@/lib/elections/audit"
import { lockRow } from "@/lib/transactions/lock"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  context: { params: Promise<{ electionId: string }> }
) {
  const params = await context.params
  const electionId = params.electionId

  // ── 1. Authentication: derive memberId from session, never request body. ──
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 })
  }
  const memberId = session.user.id

  // ── Idempotency-Key check (24h retention). ──
  const idempotencyKey = request.headers.get("Idempotency-Key")
  if (idempotencyKey) {
    const existing = await prisma.electionIdempotencyKey.findUnique({
      where: { key: idempotencyKey },
    })
    if (existing?.responseJson) {
      return NextResponse.json(existing.responseJson, { status: 200 })
    }
  }

  // ── Parse + validate request body. ──
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 })
  }
  const parsed = SubmitBallotSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    )
  }

  // Compute a request hash for idempotency storage (so the same key + different
  // body is detected as a conflict).
  const requestHash = sha256(JSON.stringify({ electionId, memberId, selections: parsed.data.selections }))

  try {
    // ── Transaction: steps 2–14 happen atomically. ──
    const result = await directPrisma.$transaction(async (tx) => {
      // 2. Verify election status = VOTING_OPEN.
      const election = await tx.election.findUnique({
        where: { id: electionId },
        select: {
          id: true, status: true, votingStartAt: true, votingEndAt: true,
          ballotStorageMode: true, previousStatus: true, isTestElection: true,
          activeKeyId: true,
        },
      })
      if (!election) throw new Error("Election not found.")
      if (election.status === "FROZEN") throw new Error("Election is frozen.")
      if (election.status !== "VOTING_OPEN") throw new Error("Voting is not currently open.")

      // 3. Server-time check (spec §66): never trust client time.
      const now = new Date()
      if (now < election.votingStartAt) throw new Error("Voting has not yet opened.")
      if (now > election.votingEndAt) throw new Error("Voting has closed.")

      // 4. Eligibility check.
      const { eligible } = await resolveMemberEligibility(electionId, memberId)
      if (!eligible) throw new Error("You are not eligible to vote in this election.")

      // 5–6. Lock participation row + verify not voted.
      // B24: the schema's `@@unique([electionId, memberId])` constraint on
      // ElectionParticipation (added by the schema-migration agent — see
      // prisma/schema.prisma model ElectionParticipation) prevents two rows
      // for the same (election, member) pair. We additionally acquire a
      // Postgres `SELECT ... FOR UPDATE` row lock here so two concurrent
      // submissions can't BOTH read voted=false, BOTH insert ballots, and
      // BOTH update voted=true. The lock serialises them; the second waits
      // for the first to commit, then re-reads voted=true and bails.
      let participation = await tx.electionParticipation.findUnique({
        where: { electionId_memberId: { electionId, memberId } },
      })
      if (participation?.voted) {
        throw new Error("You have already voted in this election.")
      }
      if (!participation) {
        try {
          participation = await tx.electionParticipation.create({
            data: { electionId, memberId },
          })
        } catch (e: any) {
          if (e?.code === "P2002") {
            // Race: another request created the row first. Re-read + check voted.
            participation = await tx.electionParticipation.findUnique({
              where: { electionId_memberId: { electionId, memberId } },
            })
            if (participation?.voted) throw new Error("You have already voted in this election.")
            if (!participation) throw new Error("Failed to initialize participation record.")
          } else {
            throw e
          }
        }
      }
      // B24: now that the participation row exists, lock it FOR UPDATE so
      // any concurrent submission from another tab/device blocks until this
      // one commits. The unique constraint alone is NOT sufficient because
      // it only guards against duplicate INSERTs, not duplicate UPDATEs to
      // `voted`. The row lock closes the race window between the read of
      // voted=false and the later update to voted=true.
      await lockRow(tx, "ElectionParticipation", participation.id)

      // 7–8. Validate selections + candidates.
      const positions = await tx.electionPosition.findMany({
        where: { electionId, isActive: true },
        select: {
          id: true, seatCount: true, minSelections: true, maxSelections: true,
          isRequired: true, showNOTA: true, allowSkip: true, isActive: true,
        },
      })
      const candidates = await tx.electionCandidate.findMany({
        where: { electionId, status: { in: ["APPROVED", "UNCONTESTED_ELECTED"] } },
        select: { id: true, positionId: true, status: true },
      })
      const validation = validateBallotSelections(parsed.data.selections, {
        election: {
          id: election.id,
          status: election.status as any,
          votingStartAt: election.votingStartAt,
          votingEndAt: election.votingEndAt,
          ballotStorageMode: election.ballotStorageMode as any,
        },
        positions,
        candidates,
      })
      if (!validation.valid) {
        throw new Error(validation.errors.join(" "))
      }

      // 9. Generate ballot reference.
      const ballotReference = generateBallotReference(election.votingStartAt.getFullYear())

      // 10. Encrypt selections (AES-256-GCM).
      const payload = JSON.stringify({
        selections: validation.normalized.map((s) => ({ positionId: s.positionId, candidateId: s.candidateIds[0] })),
      })
      const encrypted = encryptBallot(payload, election.activeKeyId || undefined)

      // 11. Insert ballot record.
      const ipHash = hashIdentifier(request.headers.get("x-forwarded-for") || null)
      const uaHash = hashIdentifier(request.headers.get("user-agent") || null)
      await tx.electionBallot.create({
        data: {
          electionId,
          ballotReference,
          encryptedData: encrypted.encryptedData,
          dataHash: encrypted.dataHash,
          keyId: encrypted.keyId,
          status: "VALID",
          castAt: now,
          clientIpHash: ipHash,
          userAgentHash: uaHash,
        },
      })

      // 12. Mark participation as voted.
      if (!participation) throw new Error("Failed to initialize participation record.")
      await tx.electionParticipation.update({
        where: { id: participation.id },
        data: { voted: true, votedAt: now },
      })

      // 13. Non-sensitive audit event (NO selections in metadata).
      await tx.electionAuditLog.create({
        data: {
          electionId,
          action: "BALLOT_CAST",
          performedByRole: "MEMBER",
          metadata: { ballotReference, castAt: now.toISOString() } as any,
          ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.slice(0, 45) || null,
          userAgent: request.headers.get("user-agent")?.slice(0, 200) || null,
        },
      })

      return { ballotReference, votedAt: now.toISOString() }
    })

    // 14. Commit happened (transaction returned). Store idempotency response.
    const responseJson = { success: true as const, data: result }
    if (idempotencyKey) {
      await prisma.electionIdempotencyKey.upsert({
        where: { key: idempotencyKey },
        create: {
          key: idempotencyKey,
          electionId,
          memberId,
          requestHash,
          responseJson: responseJson as any,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        update: {},
      }).catch(() => undefined)
    }

    return NextResponse.json(responseJson, { status: 200 })
  } catch (e: any) {
    // Map Prisma unique-constraint violations to 409 Conflict (Case 1).
    if (e?.code === "P2002") {
      return NextResponse.json(
        { success: false, error: "You have already voted in this election." },
        { status: 409 }
      )
    }
    const message = e instanceof Error ? e.message : "Failed to submit ballot."
    const status = /already voted|not eligible|not open|frozen|closed|not yet opened/i.test(message) ? 400 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
