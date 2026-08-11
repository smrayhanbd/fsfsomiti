/* eslint-disable @typescript-eslint/no-explicit-any */
// POST /api/elections/scheduled-events/process
// Cron endpoint — processes pending ElectionScheduledEvent rows whose
// scheduledAt has passed. Per spec §31.2 + Case 15: this is a CONVENIENCE
// scheduler; every API independently verifies time/status before mutations,
// so the system is correct even if this cron never runs.
//
// Recommended cron: every 5 minutes via Vercel Cron / external scheduler.
// Auth: CRON_SECRET header (env var) — prevents public invocation.

import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { writeElectionAudit } from "@/lib/elections/audit"
import { dispatchElectionNotification } from "@/lib/elections/notifications"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  // S11 fix: fail-CLOSED when CRON_SECRET is not configured. The previous
  // logic (`if (CRON_SECRET && secret !== CRON_SECRET)`) left the endpoint
  // wide-open in any environment that forgot to set the env var. Refuse to
  // run with a server-error so the misconfiguration is loud and visible.
  const CRON_SECRET = process.env.CRON_SECRET
  if (!CRON_SECRET) {
    console.error("[cron.elections] CRON_SECRET not set — refusing to run. Set it in env.")
    return NextResponse.json(
      { error: "Server misconfigured: CRON_SECRET is not set." },
      { status: 500 }
    )
  }
  const secret =
    request.headers.get("x-cron-secret") ||
    new URL(request.url).searchParams.get("secret") ||
    ""
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  const now = new Date()
  const pending = await prisma.electionScheduledEvent.findMany({
    where: { status: "PENDING", scheduledAt: { lte: now } },
    take: 50,
  })

  let processed = 0
  let failed = 0
  for (const event of pending) {
    try {
      const election = await prisma.election.findUnique({
        where: { id: event.electionId },
        select: { id: true, status: true, votingEndAt: true },
      })
      if (!election) {
        await prisma.electionScheduledEvent.update({
          where: { id: event.id },
          data: { status: "CANCELLED", executedAt: now },
        })
        continue
      }

      switch (event.eventType) {
        case "OPEN_NOMINATION":
          if (election.status === "DRAFT") {
            await prisma.election.update({ where: { id: election.id }, data: { status: "NOMINATION_OPEN" } })
            await writeElectionAudit({ electionId: election.id, action: "NOMINATION_OPENED", performedByRole: "SYSTEM" })
          }
          break
        case "CLOSE_NOMINATION":
          if (election.status === "NOMINATION_OPEN") {
            await prisma.election.update({ where: { id: election.id }, data: { status: "NOMINATION_CLOSED" } })
            await writeElectionAudit({ electionId: election.id, action: "NOMINATION_CLOSED", performedByRole: "SYSTEM" })
          }
          break
        case "OPEN_VOTING":
          if (election.status === "CANDIDATES_FINALIZED" || election.status === "VOTING_SCHEDULED") {
            await prisma.election.update({ where: { id: election.id }, data: { status: "VOTING_OPEN" } })
            await writeElectionAudit({ electionId: election.id, action: "VOTING_OPENED", performedByRole: "SYSTEM" })
            await dispatchElectionNotification({
              electionId: election.id, type: "VOTING_OPENED", channel: "IN_APP", title: "Voting Open", message: "",
            })
          }
          break
        case "CLOSE_VOTING":
          if (election.status === "VOTING_OPEN") {
            await prisma.election.update({ where: { id: election.id }, data: { status: "VOTING_CLOSED" } })
            await writeElectionAudit({ electionId: election.id, action: "VOTING_CLOSED", performedByRole: "SYSTEM" })
            await dispatchElectionNotification({
              electionId: election.id, type: "VOTING_CLOSED", channel: "IN_APP", title: "Voting Closed", message: "",
            })
          }
          break
        case "SEND_REMINDER": {
          // Send a reminder to eligible members who haven't voted.
          const nonVoters = await prisma.electionParticipation.findMany({
            where: { electionId: election.id, voted: false },
            select: { memberId: true },
          })
          await dispatchElectionNotification({
            electionId: election.id, type: "VOTING_REMINDER", channel: "IN_APP",
            title: "Voting Reminder", message: "",
            recipientMemberIds: nonVoters.map((p) => p.memberId),
          })
          break
        }
      }

      await prisma.electionScheduledEvent.update({
        where: { id: event.id },
        data: { status: "EXECUTED", executedAt: now },
      })
      processed++
    } catch (e) {
      await prisma.electionScheduledEvent.update({
        where: { id: event.id },
        data: { status: "FAILED", executedAt: now, metadata: { error: (e as Error).message } as any },
      })
      failed++
    }
  }

  return NextResponse.json({ success: true, data: { processed, failed, remaining: pending.length } })
}
