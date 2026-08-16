/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { listElections } from "@/app/actions/elections"
import { getCurrentUser, hasPermission, PERMISSIONS } from "@/lib/permissions"
import { ArrowLeft, Plus, Vote, Copy, Eye } from "lucide-react"
import { redirect } from "next/navigation"
import { guardDashboardPage } from "@/lib/page-guard"

export const dynamic = "force-dynamic"

const STATUS_TONES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-slate-300",
  NOMINATION_OPEN: "bg-blue-50 text-blue-700 border-blue-300",
  NOMINATION_CLOSED: "bg-amber-50 text-amber-700 border-amber-300",
  CANDIDATES_FINALIZED: "bg-purple-50 text-purple-700 border-purple-300",
  VOTING_SCHEDULED: "bg-cyan-50 text-cyan-700 border-cyan-300",
  VOTING_OPEN: "bg-emerald-50 text-emerald-700 border-emerald-300",
  VOTING_CLOSED: "bg-orange-50 text-orange-700 border-orange-300",
  COUNTING: "bg-yellow-50 text-yellow-700 border-yellow-300",
  RESULTS_READY: "bg-teal-50 text-teal-700 border-teal-300",
  RUNOFF_REQUIRED: "bg-rose-50 text-rose-700 border-rose-300",
  RESULTS_PUBLISHED: "bg-green-50 text-green-700 border-green-300",
  COMMITTEE_FORMED: "bg-indigo-50 text-indigo-700 border-indigo-300",
  ARCHIVED: "bg-slate-50 text-slate-500 border-slate-300",
  CANCELLED: "bg-red-50 text-red-700 border-red-300",
  FROZEN: "bg-gray-100 text-gray-700 border-gray-400",
}

export default async function ElectionsListPage() {
  // Page-level permission guard — redirects to /dashboard/unauthorized
  // if the user doesn't have access to this page.
  await guardDashboardPage("Operations & Management", "Election Management")


  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const canManage = await hasPermission(user.id, PERMISSIONS.ELECTION_MANAGE, user)
  const canView = canManage || (await hasPermission(user.id, PERMISSIONS.ELECTION_VIEW, user))
  if (!canView) redirect("/dashboard/unauthorized")

  const elections = (await listElections()) as any[]

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link href="/dashboard">
            <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Vote className="h-6 w-6 text-indigo-600" /> Election Management
            </h1>
            <p className="text-sm text-slate-500">Create, configure, and administer Executive Committee elections.</p>
          </div>
        </div>
        {canManage && (
          <Link href="/dashboard/elections/create">
            <Button><Plus className="h-4 w-4 mr-2" /> New Election</Button>
          </Link>
        )}
      </div>

      {elections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <Vote className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No elections yet. Create your first election to get started.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Code</th>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Term</th>
                <th className="text-left px-4 py-3 font-medium">Positions</th>
                <th className="text-left px-4 py-3 font-medium">Votes</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {elections.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">{e.code}{e.isTestElection && <span className="ml-1 text-amber-600">🧪</span>}</td>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/elections/${e.id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                      {e.name}
                    </Link>
                    {e.parentElection && (
                      <span className="block text-xs text-slate-400">Runoff of {e.parentElection.code}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={STATUS_TONES[e.status] || "bg-slate-50 text-slate-600"}>
                      {e.status.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(e.termStartDate).toLocaleDateString()} → {new Date(e.termEndDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-center">{e._count?.positions || 0}</td>
                  <td className="px-4 py-3 text-center">{e._count?.ballots || 0}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/dashboard/elections/${e.id}`}>
                      <Button size="sm" variant="ghost"><Eye className="h-4 w-4" /></Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
