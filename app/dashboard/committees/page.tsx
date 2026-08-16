import Link from "next/link"
import { Button } from "@/components/ui/button"
import { listCommittees, listStaffForSelect } from "@/app/actions/committee"
import CommitteeManager, { type CommitteeRow, type StaffOption } from "./CommitteeManager"
import { Users, ArrowLeft } from "lucide-react"
import { guardDashboardPage } from "@/lib/page-guard"

export const dynamic = "force-dynamic"

export default async function CommitteesPage() {
  // Page-level permission guard — redirects to /dashboard/unauthorized
  // if the user doesn't have access to this page.
  await guardDashboardPage("Operations & Management", "Committees")


  const [committees, staff] = await Promise.all([listCommittees(), listStaffForSelect()])

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
        <Link href="/dashboard/tasks">
          <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="h-6 w-6 text-indigo-600" /> Committees
            </h1>
            <p className="text-sm text-slate-500">Manage groups you can assign tasks to.</p>
          </div>
        </div>
      </div>

      <CommitteeManager committees={committees as CommitteeRow[]} staff={staff as StaffOption[]} />
    </div>
  )
}
