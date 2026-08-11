// GET /api/member/elections/:electionId/ballot/:ballotReference/verify
// Allows a member to verify their ballot was recorded — WITHOUT revealing
// selections. Per spec §35.1: returns { valid, recordedAt, electionClosedAt }.

import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: { params: Promise<{ electionId: string; ballotReference: string }> }
) {
  const params = await context.params
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 })
  }
  const memberId = session.user.id

  const ballot = await prisma.electionBallot.findUnique({
    where: { ballotReference: params.ballotReference },
    select: {
      electionId: true,
      castAt: true,
      status: true,
      election: { select: { votingEndAt: true, status: true } },
    },
  })

  // Never reveal whether the ballot exists to a different voter — return the
  // same shape for "not found" and "not yours". The member's own participation
  // record is the authoritative source of "did I vote?".
  const participation = await prisma.electionParticipation.findUnique({
    where: { electionId_memberId: { electionId: params.electionId, memberId } },
    select: { voted: true, votedAt: true },
  })

  if (!ballot || ballot.electionId !== params.electionId || !participation?.voted) {
    return NextResponse.json({
      success: true,
      data: { valid: false, recordedAt: null, electionClosedAt: null },
    })
  }

  return NextResponse.json({
    success: true,
    data: {
      valid: ballot.status === "VALID",
      recordedAt: ballot.castAt.toISOString(),
      electionClosedAt: ballot.election.votingEndAt.toISOString(),
    },
  })
}
