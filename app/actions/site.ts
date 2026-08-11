"use server"

import { uploadImage } from "@/lib/cloudinary"
import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import {
  getCurrentUser,
  requirePermission,
  PERMISSIONS,
} from "@/lib/permissions"

/** A parsed site-content array item (why-join, how-we-run, facilities, etc.). */
interface SiteContentItem {
  title?: string
  description?: string
  photoUrl?: string
  [key: string]: unknown
}

// Strict schema for the structured JSON arrays posted by the Site Content form.
// The previous implementation called JSON.parse on raw FormData values and
// trusted whatever the client sent — malformed shapes were silently stored
// and later crashed the landing-page render. We now parse every array through
// a Zod schema so any drift between the form and the persistence shape is
// rejected up-front instead of corrupting the singleton row.
const SiteContentArrayItemSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  photoUrl: z.string().url().nullable().optional(),
})

// Allow loose extra keys (icon, link, name, etc.) — these are rendered by the
// landing page but not every variant shares the same shape. Extra keys are
// preserved so existing landing-page renderers do not break.
const LooseSiteContentArrayItemSchema = SiteContentArrayItemSchema.catchall(z.unknown())
const LooseSiteContentArraySchema = z.array(LooseSiteContentArrayItemSchema).default([])

/**
 * Parse a hidden-input JSON array through the strict Zod schema.
 *
 * Returns `any` (not `SiteContentItem[]`) so the result slots into Prisma's
 * `InputJsonValue` for the `prisma.siteContent.upsert` call below — Prisma's
 * JSON column type does not accept TypeScript interfaces with an
 * `[key: string]: unknown` index signature, even though the runtime shape is
 * identical. The Zod parse guarantees the shape at runtime; the `any` only
 * silences the static mismatch.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseSiteArray(raw: string | null | undefined, field: string): any {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Invalid JSON for ${field}: expected an array.`)
  }
  const result = LooseSiteContentArraySchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `Invalid ${field} payload: ${result.error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; ')}`
    )
  }
  return result.data
}

export async function updateSiteContent(formData: FormData) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  const heroTitle = formData.get("heroTitle") as string
  const heroSubtitle = formData.get("heroSubtitle") as string
  const heroBadge = (formData.get("heroBadge") as string) || null
  const heroCtaPrimary = (formData.get("heroCtaPrimary") as string) || null
  const heroCtaSecondary = (formData.get("heroCtaSecondary") as string) || null
  const aboutTitle = formData.get("aboutTitle") as string
  const aboutContent = formData.get("aboutContent") as string
  const visionTitle = formData.get("visionTitle") as string
  const visionContent = formData.get("visionContent") as string
  const transparency = formData.get("transparency") as string
  const policyContent = (formData.get("policyContent") as string) || null

  // Parse JSON arrays from hidden inputs through Zod so malformed payloads
  // are rejected up-front instead of being stored and crashing the landing
  // page render later.
  const whyJoinUs = parseSiteArray(formData.get("whyJoinUs") as string, "whyJoinUs")
  const howWeRun = parseSiteArray(formData.get("howWeRun") as string, "howWeRun")
  const howItWorks = parseSiteArray(formData.get("howItWorks") as string, "howItWorks")
  const stats = parseSiteArray(formData.get("stats") as string, "stats")
  const securityBadges = parseSiteArray(formData.get("securityBadges") as string, "securityBadges")
  const facilities = parseSiteArray(formData.get("facilities") as string, "facilities")
  const management = parseSiteArray(formData.get("management") as string, "management")
  const activities = parseSiteArray(formData.get("activities") as string, "activities")
  const projects = parseSiteArray(formData.get("projects") as string, "projects")

  // Helper function to handle file uploads for arrays
  const processArrayImages = async (arrayName: string, array: SiteContentItem[]) => {
    for (let i = 0; i < array.length; i++) {
      const file = formData.get(`${arrayName}_${i}_photoUrl`) as File
      if (file && file.size > 0) {
        const url = await uploadImage(file)
        if (url) array[i].photoUrl = url
      }
      // If no new file, it keeps the existing photoUrl from the JSON string
    }
    return array
  }

  // Process images for each category (mutates arrays in place)
  await processArrayImages("management", management)
  await processArrayImages("activities", activities)
  await processArrayImages("projects", projects)

  await prisma.siteContent.upsert({
    where: { id: "singleton" },
    update: {
      heroTitle, heroSubtitle, heroBadge, heroCtaPrimary, heroCtaSecondary,
      aboutTitle, aboutContent, visionTitle, visionContent, transparency,
      policyContent,
      whyJoinUs, howWeRun, howItWorks, stats, securityBadges,
      facilities, management, activities, projects
    },
    create: {
      id: "singleton",
      heroTitle, heroSubtitle, heroBadge, heroCtaPrimary, heroCtaSecondary,
      aboutTitle, aboutContent, visionTitle, visionContent, transparency,
      policyContent,
      whyJoinUs, howWeRun, howItWorks, stats, securityBadges,
      facilities, management, activities, projects
    }
  })

  revalidatePath("/")
  redirect("/dashboard/settings/site-content")
}
