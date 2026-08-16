import { redirect } from "next/navigation"
import { guardDashboardPage } from "@/lib/page-guard"

// The Income Distribution feature now ships at /dashboard/distributions.
// Keep this route as a redirect so existing sidebar/bookmark links land there.
export default async function Page() {
  // Page-level permission guard — redirects to /dashboard/unauthorized
  // if the user doesn't have access to this page.
  await guardDashboardPage("Transactions", "Distribute Income")


  redirect("/dashboard/distributions")
}
