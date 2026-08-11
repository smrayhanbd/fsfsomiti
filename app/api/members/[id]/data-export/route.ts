/**
 * GET /api/members/[id]/data-export
 *
 * GDPR Article 20 — "Right to data portability". Exports every row linked
 * to the given memberId across every relevant table as a single JSON
 * document. The response is a streaming attachment so it can be saved
 * locally and reviewed by the data subject.
 *
 * Auth rules (mirror /api/members/[id]/print-form):
 *   - 401 — not signed in
 *   - 403 — signed-in MEMBER trying to export someone else's data; only
 *           SUPER_ADMIN / ADMIN / users holding USER_MANAGE may do that
 *   - 404 — memberId not found
 *
 * Output: a single JSON object of shape:
 *   {
 *     "_meta": {
 *       "memberId": "...",
 *       "memberNo": "...",
 *       "exportedAt": "ISO",
 *       "version": 1,
 *       "tables": ["Member", "MemberAddress", ...]
 *     },
 *     "Member":             {...},
 *     "MemberAddress":      [{...}, ...],
 *     "MemberNominee":      [{...}, ...],
 *     ... (every table with a memberId FK)
 *   }
 *
 * Decimals → strings, Dates → ISO, BigInts → strings (reuses the same
 * serializer the backup module uses, for consistency).
 */
import { NextResponse, type NextRequest } from "next/server"
import { Prisma } from "@prisma/client"

import prisma from "@/lib/prisma"
import { getCurrentUser, hasPermission, PERMISSIONS } from "@/lib/permissions"

export const dynamic = "force-dynamic"

// ── Row serializer ───────────────────────────────────────────────────────
// Walks a single row from any Prisma model and converts any non-JSON-serializable
// value into a JSON-safe representation. Mirrors lib/backup/index.ts's
// serializeRow but is self-contained so this route can be lifted into its
// own service if/when the backup module is refactored.
function serializeRow(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (value instanceof Prisma.Decimal) return value.toString()
  if (typeof value === "bigint") return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return value.toString("base64")
  if (Array.isArray(value)) return value.map(serializeRow)
  if (typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeRow(v)
    }
    return out
  }
  return value
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Auth gate ──────────────────────────────────────────────────────────
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: "Missing member id" }, { status: 400 })
  }

  // Members may export only their own data. Admins / super-admins / users
  // with USER_MANAGE may export anyone.
  if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
    if (user.role === "MEMBER") {
      if (user.id !== id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    } else {
      const allowed = await hasPermission(user.id, PERMISSIONS.USER_MANAGE, user).catch(
        () => false,
      )
      if (!allowed) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }
  }

  try {
    // ── Verify the member exists ──────────────────────────────────────────
    const member = await prisma.member.findUnique({
      where: { id },
      select: { id: true, memberNo: true, fullName: true },
    })
    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 })
    }

    // ── Pull every related table in parallel ──────────────────────────────
    // Each query selects only rows WHERE "memberId" = id. ElectionBallot has
    // no memberId column (it links via ElectionParticipation) — skip per the
    // spec. We use findMany for collections; findUnique for the Member row.
    const [
      memberFull,
      addresses,
      nominees,
      documents,
      accounts,
      savings,
      ledgerEntries,
      loans,
      loanRepayments,
      loanGuarantors,
      transactions,
      journalEntries,
      wishLogs,
      trustScoreHistory,
      achievementBadges,
      fines,
      meetingAttendances,
      memberNotifications,
      notificationDismissals,
      distributionShares,
      electionEligibility,
      electionEligibilityOverrides,
      electionNominations,
      electionCandidates,
      electionParticipation,
      electionNotificationRecipients,
      electionCommitteeMemberships,
      committeeVacanciesVacated,
      committeeVacanciesFilled,
      taskAssignees,
      taskComments,
      taskTimeLogs,
      taskAuditLogs,
      committeeMemberships,
      profileRequests,
      requests,
    ] = await Promise.all([
      prisma.member.findUnique({ where: { id } }),
      prisma.memberAddress.findMany({ where: { memberId: id } }),
      prisma.memberNominee.findMany({ where: { memberId: id } }),
      prisma.memberDocument.findMany({ where: { memberId: id } }),
      prisma.memberAccount.findMany({ where: { memberId: id } }),
      prisma.savings.findMany({ where: { memberId: id } }),
      prisma.ledgerEntry.findMany({ where: { memberId: id } }),
      prisma.loan.findMany({ where: { memberId: id } }),
      prisma.loanRepayment.findMany({ where: { memberId: id } }),
      prisma.loanGuarantor.findMany({ where: { memberId: id } }),
      prisma.transaction.findMany({ where: { memberId: id } }),
      prisma.journalEntry.findMany({ where: { memberId: id } }),
      prisma.specialWishLog.findMany({ where: { memberId: id } }),
      prisma.trustScoreHistory.findMany({ where: { memberId: id } }),
      prisma.achievementBadge.findMany({ where: { memberId: id } }),
      prisma.fine.findMany({ where: { memberId: id } }),
      prisma.meetingAttendance.findMany({ where: { memberId: id } }),
      prisma.memberNotification.findMany({ where: { memberId: id } }),
      prisma.memberNotificationDismissal.findMany({ where: { memberId: id } }),
      prisma.distributionShare.findMany({ where: { memberId: id } }),
      prisma.electionEligibility.findMany({ where: { memberId: id } }),
      prisma.electionEligibilityOverride.findMany({ where: { memberId: id } }),
      prisma.electionNomination.findMany({ where: { memberId: id } }),
      prisma.electionCandidate.findMany({ where: { memberId: id } }),
      prisma.electionParticipation.findMany({ where: { memberId: id } }),
      prisma.electionNotificationRecipient.findMany({ where: { memberId: id } }),
      prisma.electionCommitteeMember.findMany({ where: { memberId: id } }),
      prisma.electionCommitteeVacancy.findMany({ where: { vacatedById: id } }),
      prisma.electionCommitteeVacancy.findMany({ where: { filledById: id } }),
      prisma.taskAssignee.findMany({ where: { memberId: id } }),
      prisma.taskComment.findMany({ where: { authorMemberId: id } }),
      prisma.taskTimeLog.findMany({ where: { memberId: id } }),
      prisma.taskAuditLog.findMany({ where: { actorMemberId: id } }),
      prisma.committeeMember.findMany({ where: { memberId: id } }),
      prisma.profileUpdateRequest.findMany({ where: { memberId: id } }),
      prisma.memberRequest.findMany({ where: { memberId: id } }),
    ])

    // ── Loan schedules — pulled per-loan since there's no direct memberId ──
    const loanIds = loans.map((l) => l.id)
    const loanSchedules = loanIds.length
      ? await prisma.loanSchedule.findMany({ where: { loanId: { in: loanIds } } })
      : []

    const payload = {
      _meta: {
        version: 1,
        memberId: id,
        memberNo: member.memberNo,
        fullName: member.fullName,
        exportedAt: new Date().toISOString(),
        tables: [
          "Member",
          "MemberAddress",
          "MemberNominee",
          "MemberDocument",
          "MemberAccount",
          "Savings",
          "LedgerEntry",
          "Loan",
          "LoanSchedule",
          "LoanRepayment",
          "LoanGuarantor",
          "Transaction",
          "JournalEntry",
          "SpecialWishLog",
          "TrustScoreHistory",
          "AchievementBadge",
          "Fine",
          "MeetingAttendance",
          "MemberNotification",
          "MemberNotificationDismissal",
          "DistributionShare",
          "ElectionEligibility",
          "ElectionEligibilityOverride",
          "ElectionNomination",
          "ElectionCandidate",
          "ElectionParticipation",
          "ElectionNotificationRecipient",
          "ElectionCommitteeMember",
          "ElectionCommitteeVacancy (vacatedBy)",
          "ElectionCommitteeVacancy (filledBy)",
          "TaskAssignee",
          "TaskComment",
          "TaskTimeLog",
          "TaskAuditLog",
          "CommitteeMember",
          "ProfileUpdateRequest",
          "MemberRequest",
        ],
      },
      Member: serializeRow(memberFull),
      MemberAddress: serializeRow(addresses),
      MemberNominee: serializeRow(nominees),
      MemberDocument: serializeRow(documents),
      MemberAccount: serializeRow(accounts),
      Savings: serializeRow(savings),
      LedgerEntry: serializeRow(ledgerEntries),
      Loan: serializeRow(loans),
      LoanSchedule: serializeRow(loanSchedules),
      LoanRepayment: serializeRow(loanRepayments),
      LoanGuarantor: serializeRow(loanGuarantors),
      Transaction: serializeRow(transactions),
      JournalEntry: serializeRow(journalEntries),
      SpecialWishLog: serializeRow(wishLogs),
      TrustScoreHistory: serializeRow(trustScoreHistory),
      AchievementBadge: serializeRow(achievementBadges),
      Fine: serializeRow(fines),
      MeetingAttendance: serializeRow(meetingAttendances),
      MemberNotification: serializeRow(memberNotifications),
      MemberNotificationDismissal: serializeRow(notificationDismissals),
      DistributionShare: serializeRow(distributionShares),
      ElectionEligibility: serializeRow(electionEligibility),
      ElectionEligibilityOverride: serializeRow(electionEligibilityOverrides),
      ElectionNomination: serializeRow(electionNominations),
      ElectionCandidate: serializeRow(electionCandidates),
      ElectionParticipation: serializeRow(electionParticipation),
      ElectionNotificationRecipient: serializeRow(electionNotificationRecipients),
      ElectionCommitteeMember: serializeRow(electionCommitteeMemberships),
      ElectionCommitteeVacancyVacated: serializeRow(committeeVacanciesVacated),
      ElectionCommitteeVacancyFilled: serializeRow(committeeVacanciesFilled),
      TaskAssignee: serializeRow(taskAssignees),
      TaskComment: serializeRow(taskComments),
      TaskTimeLog: serializeRow(taskTimeLogs),
      TaskAuditLog: serializeRow(taskAuditLogs),
      CommitteeMember: serializeRow(committeeMemberships),
      ProfileUpdateRequest: serializeRow(profileRequests),
      MemberRequest: serializeRow(requests),
    }

    const body = JSON.stringify(payload, null, 2)

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // Triggers "Save As..." in the browser. The filename follows the same
        // convention as the backup module for consistency.
        "Content-Disposition": `attachment; filename="member-data-${member.memberNo}.json"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[/api/members/[id]/data-export] failed:", err)
    return NextResponse.json(
      { error: "Failed to export member data." },
      { status: 500 },
    )
  }
}
