import { loadMembersWithDues } from "@/lib/membersWithDues"
import PageHeader from "@/components/somiti/PageHeader"
import DueListClient from "./DueListClient"
import { guardDashboardPage } from "@/lib/page-guard"

export const dynamic = 'force-dynamic'

export default async function DueListPage() {
  // Page-level permission guard — redirects to /dashboard/unauthorized
  // if the user doesn't have access to this page.
  await guardDashboardPage("Transactions", "Members Due List")

  // PERFORMANCE: dues (members + fee setups + per-member savings sums) are
  // loaded in one parallel batch — the old version pulled every member's full
  // savings history into JS just to sum it. See lib/membersWithDues.ts.
  const { members } = await loadMembersWithDues(
    { status: "ACTIVE" },
    [{ firstName: "asc" }],
  )

  // Calculate dues for each member and filter out those with 0 due
  const dueMembers = members.map(m => ({
    id: m.id,
    fullName: m.fullName,
    memberNo: m.memberNo,
    phone: m.phone,
    email: m.email,
    totalExpected: m.dues.totalExpected,
    totalFines: m.dues.totalFines,
    totalPaid: m.dues.totalPaid,
    totalDue: m.dues.totalDue,
  })).filter(m => m.totalDue > 0) // Only keep members who actually owe money

  return (
    <div className="space-y-8">
      <PageHeader
        title="Due List & Reminders"
        subtitle="Automatically calculated based on historical charge setups and late fines."
      />
      <DueListClient members={dueMembers} />
    </div>
  )
}
