import { redirect } from "next/navigation"

// The Income Distribution feature now ships at /dashboard/distributions.
// Keep this route as a redirect so existing sidebar/bookmark links land there.
export default function Page() {
  redirect("/dashboard/distributions")
}
