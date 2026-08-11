// GET /api/elections/:electionId/voting/eligibility
// Returns the member's voting eligibility + status (spec §35).

import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { resolveMemberEligibility } from "@/lib/elections/eligibility"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: { params: Promise<{ electionId: string }> }
) {
  const params = await context.params
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 })
  }
  const memberId = session.user.id

  const [election, participation] = await Promise.all([
    prisma.election.findUnique({
      where: { id: params.electionId },
      select: { status: true, votingEndAt: true, isTestElection: true },
    }),
    prisma.electionParticipation.findUnique({
      where: { electionId_memberId: { electionId: params.electionId, memberId } },
      select: { voted: true, votedAt: true },
    }),
  ])
  if (!election) {
    return NextResponse.json({ success: false, error: "Election not found." }, { status: 404 })
  }

  const { eligible } = await resolveMemberEligibility(params.electionId, memberId)

  return NextResponse.json({
    success: true,
    data: {
      eligible,
      voted: participation?.voted || false,
      votedAt: participation?.votedAt?.toISOString() || null,
      votingOpen: election.status === "VOTING_OPEN",
      votingClosesAt: election.votingEndAt.toISOString(),
    },
  })
}
