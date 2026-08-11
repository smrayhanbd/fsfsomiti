import { getOrganization } from "@/lib/organization"
import LoginClient from "./LoginClient"

export const dynamic = "force-dynamic"

export default async function LoginPage() {
  // Fetch the org singleton so the brand panel renders the live name/logo.
  const org = await getOrganization()
  return <LoginClient org={org} />
}
