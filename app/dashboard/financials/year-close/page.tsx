import prisma from "@/lib/prisma"
import { getCurrentUser, isSuperAdmin } from "@/lib/permissions"
import { redirect } from "next/navigation"
import { formatBDT, formatDate } from "@/lib/accounting"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import YearCloseButton from "./YearCloseButton"
import { guardDashboardPage } from "@/lib/page-guard"

export const dynamic = "force-dynamic"

/**
 * Financial Year Close UI (Roadmap item 24).
 *
 * A simple list of FinancialYear rows, each showing its date range + status +
 * (when closed) who closed it and when. The "Close Year" button is shown
 * only for OPEN years whose endDate has passed, and is wired to the
 * /api/financial-year/close endpoint via the client component.
 *
 * Restricted to SUPER_ADMIN — the API route also enforces this, but we
 * short-circuit at the page load so non-super-admins never even see the UI.
 */
export default async function FinancialYearClosePage() {
  // Page-level permission guard — redirects to /dashboard/unauthorized
  // if the user doesn't have access to this page.
  await guardDashboardPage("Finance & Accounting", "Trial Balance")


  const user = await getCurrentUser()
  if (!user) redirect("/")
  if (!isSuperAdmin(user)) {
    redirect("/dashboard/unauthorized")
  }

  const years = await prisma.financialYear.findMany({
    orderBy: { startDate: "desc" },
    include: { closedBy: { select: { email: true } } },
  })

  const now = new Date()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Financial Year Close
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
          Close an OPEN financial year whose end date has passed. The close
          posts a year-end JournalEntry that zeroes out every income / expense
          account and posts the net income to Retained Earnings.
        </p>
      </div>

      {years.length === 0 ? (
        <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
          <CardContent className="p-12 text-center">
            <p className="text-slate-500 dark:text-slate-400">
              No financial years are configured yet. Create one in the
              financials settings first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {years.map((y) => {
            const pastEnd = y.endDate.getTime() < now.getTime()
            const closeable = y.status === "OPEN" && pastEnd
            return (
              <Card
                key={y.id}
                className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl"
              >
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                          {y.name}
                        </h3>
                        <Badge
                          className={`text-xs ${
                            y.status === "OPEN"
                              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                              : y.status === "CLOSING"
                                ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                                : "bg-slate-500/10 text-slate-600 border border-slate-500/20"
                          }`}
                        >
                          {y.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        {formatDate(y.startDate)} → {formatDate(y.endDate)}
                      </p>
                      {y.closedBy && y.closedAt && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          Closed by {y.closedBy.email} on {formatDate(y.closedAt)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {closeable ? (
                        <YearCloseButton yearId={y.id} yearName={y.name} />
                      ) : y.status === "OPEN" && !pastEnd ? (
                        <span className="text-xs text-amber-600 dark:text-amber-400">
                          End date not yet reached
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Keep `formatBDT` referenced so the import doesn't get tree-shaken —
// the helper is used by the client component's result toast.
export { formatBDT }
