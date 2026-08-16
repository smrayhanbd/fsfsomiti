import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import { isSuperAdminUser } from "@/lib/permissions/resolver"
import { guardDashboardPage } from "@/lib/page-guard"

export const dynamic = "force-dynamic"

// /dashboard/permissions → lands on the Role Manager. Guarded server-side.
export default async function PermissionsIndexPage() {
  // Page-level permission guard — redirects to /dashboard/unauthorized
  // if the user doesn't have access to this page.
  await guardDashboardPage("System & Settings", "Role Permissions")


  const user = await getCurrentUser()
  if (!user) redirect("/")
  const allowed = await isSuperAdminUser(user.id)
  if (!allowed) redirect("/dashboard/unauthorized")
  redirect("/dashboard/permissions/roles")
}
