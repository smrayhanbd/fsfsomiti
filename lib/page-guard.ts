/**
 * Page-level permission guard for server components.
 *
 * Usage at the top of any dashboard page's server component:
 *
 *   import { guardDashboardPage } from "@/lib/page-guard"
 *
 *   export default async function MeetingsPage() {
 *     const user = await guardDashboardPage("Operations & Management", "Meeting Management")
 *     // ... page renders only if the user has access ...
 *   }
 *
 * If the user lacks permission, this throws a redirect to /dashboard/unauthorized.
 * Super admins bypass all checks.
 *
 * PERFORMANCE: uses the cached permission resolver, so the DB is hit at most
 * once per request per user (shared with requireAction() calls in server actions).
 *
 * Server-only.
 */
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/permissions"
import { getUserPermissions, permissionGranted } from "@/lib/permissions/resolver"
import { pageKey } from "@/lib/permissions/permission-registry"

/**
 * Guard a dashboard page. Call at the top of a server component.
 *
 *   const user = await guardDashboardPage("Operations & Management", "Meeting Management")
 *
 * Returns the current user on success (for use in the page).
 * Redirects to /dashboard/unauthorized if the user lacks page access.
 * Redirects to /login if not authenticated.
 */
export async function guardDashboardPage(
  menuGroup: string,
  page: string,
): Promise<{ id: string; email: string; role: string }> {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/login")
  }

  // Only admins can access dashboard pages at all (members go to /portal).
  // The middleware already enforces this, but we double-check here for
  // defense-in-depth (e.g. if middleware is misconfigured).
  if (user.role === "MEMBER") {
    redirect("/portal")
  }

  // Super admins bypass all page-level checks.
  if (user.role === "SUPER_ADMIN") {
    return user
  }

  // Check the cached permission set for this user.
  const permSet = await getUserPermissions(user.id)
  const key = pageKey(menuGroup, page)

  if (!permissionGranted(permSet, key)) {
    redirect("/dashboard/unauthorized")
  }

  return user
}

/**
 * Non-throwing version — returns true/false. Use for conditional rendering
 * inside a page (e.g. showing/hiding a tab).
 */
export async function canAccessDashboardPage(
  menuGroup: string,
  page: string,
): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user || user.role === "MEMBER") return false
  if (user.role === "SUPER_ADMIN") return true

  const permSet = await getUserPermissions(user.id)
  const key = pageKey(menuGroup, page)
  return permissionGranted(permSet, key)
}
