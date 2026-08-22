"use server"

import { uploadImage } from "@/lib/cloudinary"
import { saveUploadedFile } from "@/lib/upload"
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
  const policyContent = (formData.get("policyContent") as string) || null

  // Parse JSON arrays from hidden inputs through Zod so malformed payloads
  // are rejected up-front instead of being stored and crashing the landing
  // page render later.
  const whyJoinUs = parseSiteArray(formData.get("whyJoinUs") as string, "whyJoinUs")
  const howWeRun = parseSiteArray(formData.get("howWeRun") as string, "howWeRun")
  const howItWorks = parseSiteArray(formData.get("howItWorks") as string, "howItWorks")
  const stats = parseSiteArray(formData.get("stats") as string, "stats")
  const facilities = parseSiteArray(formData.get("facilities") as string, "facilities")
  const management = parseSiteArray(formData.get("management") as string, "management")
  const activities = parseSiteArray(formData.get("activities") as string, "activities")
  const projects = parseSiteArray(formData.get("projects") as string, "projects")

  // ── Download Software section ─────────────────────────────────────────
  // Admin uploads .apk / .exe installers from the Landing Page Content form.
  // URL / size / updatedAt are only rewritten when a NEW file is uploaded (or
  // explicitly cleared via the remove checkbox); `undefined` keys below mean
  // "keep the stored value" in the Prisma update and "null" in the create.
  const SOFTWARE_MAX_BYTES = 100 * 1024 * 1024
  const VersionSchema = z.string().max(50)

  const softwareTitle = (formData.get("softwareTitle") as string) || null
  const softwareDescription = (formData.get("softwareDescription") as string) || null
  const androidVersionRaw = ((formData.get("androidAppVersion") as string) || "").trim()
  const windowsVersionRaw = ((formData.get("windowsAppVersion") as string) || "").trim()
  for (const v of [androidVersionRaw, windowsVersionRaw]) {
    const parsed = VersionSchema.safeParse(v)
    if (!parsed.success) {
      throw new Error("App version labels must be 50 characters or fewer.")
    }
  }

  const software: {
    softwareTitle: string | null
    softwareDescription: string | null
    androidAppVersion: string | null
    windowsAppVersion: string | null
    androidAppUrl?: string | null
    androidAppSizeBytes?: number | null
    androidAppUpdatedAt?: Date | null
    windowsAppUrl?: string | null
    windowsAppSizeBytes?: number | null
    windowsAppUpdatedAt?: Date | null
  } = {
    softwareTitle,
    softwareDescription,
    androidAppVersion: androidVersionRaw || null,
    windowsAppVersion: windowsVersionRaw || null,
  }

  const androidFile = formData.get("androidAppFile")
  if (androidFile instanceof File && androidFile.size > 0) {
    const saved = await saveUploadedFile(androidFile, "software-downloads", {
      maxBytes: SOFTWARE_MAX_BYTES,
      allowedExtensions: ["apk"],
      // "raw" — Cloudinary's "auto" rejects unknown binary extensions.
      resourceType: "raw",
    })
    software.androidAppUrl = saved.url
    software.androidAppSizeBytes = androidFile.size
    software.androidAppUpdatedAt = new Date()
  } else if (formData.get("removeAndroidApp") === "on") {
    software.androidAppUrl = null
    software.androidAppSizeBytes = null
    software.androidAppUpdatedAt = null
  }

  const windowsFile = formData.get("windowsAppFile")
  if (windowsFile instanceof File && windowsFile.size > 0) {
    const saved = await saveUploadedFile(windowsFile, "software-downloads", {
      maxBytes: SOFTWARE_MAX_BYTES,
      allowedExtensions: ["exe"],
      // "raw" — Cloudinary's "auto" rejects unknown binary extensions.
      resourceType: "raw",
    })
    software.windowsAppUrl = saved.url
    software.windowsAppSizeBytes = windowsFile.size
    software.windowsAppUpdatedAt = new Date()
  } else if (formData.get("removeWindowsApp") === "on") {
    software.windowsAppUrl = null
    software.windowsAppSizeBytes = null
    software.windowsAppUpdatedAt = null
  }

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
      aboutTitle, aboutContent, visionTitle, visionContent,
      policyContent,
      whyJoinUs, howWeRun, howItWorks, stats,
      facilities, management, activities, projects,
      ...software,
    },
    create: {
      id: "singleton",
      heroTitle, heroSubtitle, heroBadge, heroCtaPrimary, heroCtaSecondary,
      aboutTitle, aboutContent, visionTitle, visionContent,
      policyContent,
      whyJoinUs, howWeRun, howItWorks, stats,
      facilities, management, activities, projects,
      ...software,
    }
  })

  revalidatePath("/")
  redirect("/dashboard/settings/site-content")
}
