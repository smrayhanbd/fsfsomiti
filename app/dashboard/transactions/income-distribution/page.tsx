import { redirect } from "next/navigation"
import { guardDashboardPage } from "@/lib/page-guard"

// Superseded by the new Income Distribution system at /dashboard/distributions,
// which distributes investment income, project profit, and general income to
// members pro-rata by their fund share at a snapshot date — with correct GL
// posting (the old path here drifted the ledgers). Kept as a redirect so
// existing links keep working.
export default async function IncomeDistributionPage() {
  // Page-level permission guard — redirects to /dashboard/unauthorized
  // if the user doesn't have access to this page.
  await guardDashboardPage("Transactions", "Distribute Income")


  redirect("/dashboard/distributions")
}
