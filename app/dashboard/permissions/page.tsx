import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import { isSuperAdminUser } from "@/lib/permissions/resolver"

export const dynamic = "force-dynamic"

// /dashboard/permissions → lands on the Role Manager. Guarded server-side.
export default async function PermissionsIndexPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  const allowed = await isSuperAdminUser(user.id)
  if (!allowed) redirect("/dashboard/unauthorized")
  redirect("/dashboard/permissions/roles")
}
