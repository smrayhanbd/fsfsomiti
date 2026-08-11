import prisma from "@/lib/prisma"

/**
 * Serializable shape of the org info consumed by receipts, vouchers, ledgers,
 * and emails. Mirrors the Organization model's fields (all nullable except name).
 */
export interface OrgInfo {
  name: string
  logo: string | null
  tagline: string | null
  description: string | null
  email: string | null
  phone: string | null
  website: string | null
  addressLine: string | null
  city: string | null
  district: string | null
  postalCode: string | null
  regNo: string | null
  licenseNo: string | null
  tradeLicenseNo: string | null
  establishedYear: string | null
  facebook: string | null
  whatsapp: string | null
  youtube: string | null
}

/** Fallback used when the singleton row doesn't exist yet. */
export const DEFAULT_ORG: OrgInfo = {
  name: "Future Savings Foundation",
  logo: null,
  tagline: null,
  description: null,
  email: null,
  phone: null,
  website: null,
  addressLine: null,
  city: null,
  district: null,
  postalCode: null,
  regNo: null,
  licenseNo: null,
  tradeLicenseNo: null,
  establishedYear: null,
  facebook: null,
  whatsapp: null,
  youtube: null,
}

/**
 * Read the organization singleton. Returns DEFAULT_ORG when the row is missing
 * OR the DB is unreachable (transient pool error, network blip, build-time
 * invocation without a live DB) so every consumer (receipts, ledgers, emails,
 * generateMetadata) degrades gracefully instead of throwing.
 *
 * Safe to call from server components and server actions.
 */
export async function getOrganization(): Promise<OrgInfo> {
  let org
  try {
    org = await prisma.organization.findUnique({ where: { id: "singleton" } })
  } catch {
    return DEFAULT_ORG
  }
  if (!org) return DEFAULT_ORG
  return {
    name: org.name,
    logo: org.logo,
    tagline: org.tagline,
    description: org.description,
    email: org.email,
    phone: org.phone,
    website: org.website,
    addressLine: org.addressLine,
    city: org.city,
    district: org.district,
    postalCode: org.postalCode,
    regNo: org.regNo,
    licenseNo: org.licenseNo,
    tradeLicenseNo: org.tradeLicenseNo,
    establishedYear: org.establishedYear,
    facebook: org.facebook,
    whatsapp: org.whatsapp,
    youtube: org.youtube,
  }
}

/** Convenience: a single-line address string ("Dhaka, Bangladesh" etc.), or null. */
export function orgAddressLine(org: OrgInfo): string | null {
  const parts = [org.addressLine, org.city, org.district, org.postalCode].filter(Boolean)
  return parts.length ? parts.join(", ") : null
}
