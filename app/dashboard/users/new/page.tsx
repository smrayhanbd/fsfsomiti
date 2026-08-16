import { redirect } from "next/navigation"
import { getCurrentUser, isSuperAdmin } from "@/lib/permissions"
import { getRolesForForm } from "@/app/actions/users"
import UserForm from "./UserForm"
import { guardDashboardPage } from "@/lib/page-guard"

export const dynamic = "force-dynamic"

export default async function NewUserPage() {
  // Page-level permission guard — redirects to /dashboard/unauthorized
  // if the user doesn't have access to this page.
  await guardDashboardPage("System & Settings", "User Control")


  const user = await getCurrentUser()
  if (!user) redirect("/")
  if (!isSuperAdmin(user)) redirect("/dashboard/users")

  // Pre-select the "Treasurer / Cashier" role (a sensible default for a new
  // staff account); the user can change it in the dropdown.
  const { roles } = await getRolesForForm()
  const defaultRoleId =
    roles.find((r) => r.name === "Treasurer / Cashier")?.id ??
    roles.find((r) => !r.isSuperAdmin)?.id ??
    roles[0]?.id ??
    ""

  return <UserForm mode="create" roles={roles} defaultRoleId={defaultRoleId} />
}

