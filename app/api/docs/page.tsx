import { getCurrentUser, requirePermission, PERMISSIONS } from "@/lib/permissions"
import { createElement } from "react"

export const dynamic = "force-dynamic"

// Stoplight Elements docs page — admin-only.
// Uses createElement for the `elements-api` web component because it's not
// in the JSX intrinsic elements type map (Stoplight Elements is a custom element).
export default async function ApiDocsPage() {
  const user = await getCurrentUser()
  if (!user) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-semibold">Sign in required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The API docs are restricted to authenticated admins.
        </p>
      </div>
    )
  }
  // Allow any signed-in user to view docs (read-only). For tighter control,
  // uncomment the requirePermission line:
  // await requirePermission(user, PERMISSIONS.USER_MANAGE)

  const ElementsApi = createElement("elements-api", {
    apiDescriptionUrl: "/api/openapi.json",
    router: "hash",
    layout: "sidebar",
  })

  return (
    <div style={{ height: "100vh" }}>
      <link
        rel="stylesheet"
        href="https://unpkg.com/@stoplight/elements/styles.min.css"
      />
      <script
        src="https://unpkg.com/@stoplight/elements/web-components.min.js"
        async
      />
      {ElementsApi}
    </div>
  )
}
