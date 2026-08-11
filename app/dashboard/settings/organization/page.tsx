import { redirect } from "next/navigation"
import { getCurrentUser, isSuperAdmin } from "@/lib/permissions"
import { getOrganization } from "@/lib/organization"
import OrganizationForm from "./OrganizationForm"

export const dynamic = "force-dynamic"

/**
 * Somiti Settings → Organization Info.
 *
 * Backs the singleton Organization row. Its fields (name, logo, contact,
 * legal, social) appear on every money receipt, voucher, and ledger, and
 * across all nav chrome + public pages.
 */
export default async function OrganizationInfoPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  if (!isSuperAdmin(user)) redirect("/dashboard")

  // getOrganization() returns DEFAULT_ORG when the row is missing, so the
  // form always has a complete initial state without inline literal fallbacks.
  const org = await getOrganization()

  return (
    <OrganizationForm
      initial={{
        name: org.name,
        logo: org.logo ?? null,
        tagline: org.tagline ?? "",
        description: org.description ?? "",
        email: org.email ?? "",
        phone: org.phone ?? "",
        website: org.website ?? "",
        addressLine: org.addressLine ?? "",
        city: org.city ?? "",
        district: org.district ?? "",
        postalCode: org.postalCode ?? "",
        regNo: org.regNo ?? "",
        licenseNo: org.licenseNo ?? "",
        tradeLicenseNo: org.tradeLicenseNo ?? "",
        establishedYear: org.establishedYear ?? "",
        facebook: org.facebook ?? "",
        whatsapp: org.whatsapp ?? "",
        youtube: org.youtube ?? "",
      }}
    />
  )
}
