import MemberForm from "@/components/member/MemberForm"
import { guardDashboardPage } from "@/lib/page-guard"

export const dynamic = 'force-dynamic'

export default async function MemberAddPage() {
  // Page-level permission guard — redirects to /dashboard/unauthorized
  // if the user doesn't have access to this page.
  await guardDashboardPage("Member Management", "Member Panel")


    return <MemberForm mode="add" />
}
