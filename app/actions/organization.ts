"use server"

import { uploadImage } from "@/lib/cloudinary"
import prisma from "@/lib/prisma"
import { DEFAULT_ORG } from "@/lib/organization"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import {
  getCurrentUser,
  requirePermission,
  PERMISSIONS,
} from "@/lib/permissions"

/**
 * Upsert the Organization singleton. Mirrors the updateSiteContent pattern —
 * reads fields from FormData, uploads the logo file via Cloudinary if one was
 * provided, then upserts the singleton row.
 *
 * revalidates every page that consumes org info (receipts, ledgers, landing,
 * login/register/policy, dashboard + portal chrome, and the root layout which
 * drives the dynamic browser-tab title).
 */
export async function updateOrganization(formData: FormData) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  const name = (formData.get("name") as string)?.trim() || DEFAULT_ORG.name
  const tagline = ((formData.get("tagline") as string) || "").trim() || null
  const description = ((formData.get("description") as string) || "").trim() || null
  const email = ((formData.get("email") as string) || "").trim() || null
  const phone = ((formData.get("phone") as string) || "").trim() || null
  const website = ((formData.get("website") as string) || "").trim() || null
  const addressLine = ((formData.get("addressLine") as string) || "").trim() || null
  const city = ((formData.get("city") as string) || "").trim() || null
  const district = ((formData.get("district") as string) || "").trim() || null
  const postalCode = ((formData.get("postalCode") as string) || "").trim() || null
  const regNo = ((formData.get("regNo") as string) || "").trim() || null
  const licenseNo = ((formData.get("licenseNo") as string) || "").trim() || null
  const tradeLicenseNo = ((formData.get("tradeLicenseNo") as string) || "").trim() || null
  const establishedYear = ((formData.get("establishedYear") as string) || "").trim() || null
  const facebook = ((formData.get("facebook") as string) || "").trim() || null
  const whatsapp = ((formData.get("whatsapp") as string) || "").trim() || null
  const youtube = ((formData.get("youtube") as string) || "").trim() || null

  // Logo upload — only if a new file was provided. Otherwise keep the existing.
  const logoFile = formData.get("logo") as File
  let logo: string | null | undefined = undefined // undefined = don't touch
  if (logoFile && logoFile.size > 0) {
    logo = await uploadImage(logoFile)
  }

  // Pull the existing row so we know whether to preserve the logo on update.
  const existing = await prisma.organization.findUnique({ where: { id: "singleton" } })

  const data = {
    name,
    tagline,
    description,
    email,
    phone,
    website,
    addressLine,
    city,
    district,
    postalCode,
    regNo,
    licenseNo,
    tradeLicenseNo,
    establishedYear,
    facebook,
    whatsapp,
    youtube,
    // Only overwrite the logo when a new one was uploaded; otherwise preserve.
    logo: logo !== undefined ? logo : existing?.logo ?? null,
  }

  await prisma.organization.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  })

  // Org info appears on receipts, vouchers, ledgers, landing, and emails.
  revalidatePath("/dashboard/settings/organization")
  revalidatePath("/dashboard/receipts")
  revalidatePath("/dashboard/member-ledger")
  revalidatePath("/dashboard/account-ledger")
  revalidatePath("/")
  // Org identity (name/logo/contact) now drives the nav chrome across the
  // dashboard, member portal, auth pages, and the root layout's metadata.
  // Revalidating the root layout segment invalidates all nested layouts and
  // pages beneath it in one shot.
  revalidatePath("/", "layout")
  redirect("/dashboard/settings/organization")
}
