/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from "next/navigation"
import { getElection, getElectionAuditLogs, getVotingMonitor, getElectionCandidates, getEligibilityConfig } from "@/app/actions/elections"
import { getCurrentUser, hasPermission, PERMISSIONS } from "@/lib/permissions"
import ElectionDetailClient from "./ElectionDetailClient"
import { guardDashboardPage } from "@/lib/page-guard"

export const dynamic = "force-dynamic"

export default async function ElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Page-level permission guard — redirects to /dashboard/unauthorized
  // if the user doesn't have access to this page.
  await guardDashboardPage("Operations & Management", "Election Management")


  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const canManage = await hasPermission(user.id, PERMISSIONS.ELECTION_MANAGE, user)
  const canReview = canManage || (await hasPermission(user.id, PERMISSIONS.ELECTION_REVIEW, user))
  const canView = canReview || (await hasPermission(user.id, PERMISSIONS.ELECTION_VIEW, user))
  if (!canView) redirect("/dashboard/unauthorized")

  const [election, auditLogs, monitor, candidatesByPosition, eligibilityConfig] = await Promise.all([
    getElection(id),
    getElectionAuditLogs(id, 100),
    getVotingMonitor(id).catch(() => null),
    getElectionCandidates(id),
    getEligibilityConfig(id).catch(() => null),
  ])

  if (!election) redirect("/dashboard/elections")

  // All data is already serialized by the action functions (JSON.parse(JSON.stringify))
  // to strip Prisma Decimal/DateTime class instances.
  const data = { election, auditLogs, monitor, candidatesByPosition, eligibilityConfig }

  return <ElectionDetailClient data={data} canManage={canManage} canReview={canReview} />
}
