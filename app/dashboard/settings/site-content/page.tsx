import prisma from "@/lib/prisma"
import SiteContentForm from "./SiteContentForm"
import { guardDashboardPage } from "@/lib/page-guard"

export const dynamic = 'force-dynamic'

/**
 * Normalise nullable text columns to empty strings before they cross the
 * Server→Client boundary. Several SiteContent fields are `String?` in the
 * Prisma schema (heroBadge, heroCtaPrimary, heroCtaSecondary, policyContent),
 * so a saved row can legitimately hold `null`. React refuses `null` for the
 * `value` prop on `<input>`/`<textarea>` controlled components and prints the
 * console warning:
 *
 *   `value` prop on `input` should not be null. Consider using an empty
 *    string to clear the component or `undefined` for uncontrolled components.
 *
 * Coercing every nullable field here keeps the form component fully
 * controlled, so the form code can use `value={data.x}` safely.
 */
function normalizeContent(c: NonNullable<Awaited<ReturnType<typeof prisma.siteContent.findUnique>>>) {
  return {
    id: c.id,
    heroTitle: c.heroTitle ?? "",
    heroSubtitle: c.heroSubtitle ?? "",
    heroBadge: c.heroBadge ?? "",
    heroCtaPrimary: c.heroCtaPrimary ?? "",
    heroCtaSecondary: c.heroCtaSecondary ?? "",
    aboutTitle: c.aboutTitle ?? "",
    aboutContent: c.aboutContent ?? "",
    visionTitle: c.visionTitle ?? "",
    visionContent: c.visionContent ?? "",
    policyContent: c.policyContent ?? "",
    // Download Software section — dates cross the Server→Client boundary as
    // ISO strings; sizes stay as raw bytes (formatted client-side).
    softwareTitle: c.softwareTitle ?? "",
    softwareDescription: c.softwareDescription ?? "",
    androidAppVersion: c.androidAppVersion ?? "",
    androidAppUrl: c.androidAppUrl ?? null,
    androidAppSizeBytes: c.androidAppSizeBytes ?? null,
    androidAppUpdatedAt: c.androidAppUpdatedAt ? c.androidAppUpdatedAt.toISOString() : null,
    windowsAppVersion: c.windowsAppVersion ?? "",
    windowsAppUrl: c.windowsAppUrl ?? null,
    windowsAppSizeBytes: c.windowsAppSizeBytes ?? null,
    windowsAppUpdatedAt: c.windowsAppUpdatedAt ? c.windowsAppUpdatedAt.toISOString() : null,
    // Json columns come back as Prisma.JsonValue (which includes primitive
    // types). The schema documents these as arrays of objects, but the type
    // system can't see that — so we coerce defensively: a non-array value
    // becomes an empty array rather than crashing the form.
    whyJoinUs: Array.isArray(c.whyJoinUs) ? (c.whyJoinUs as unknown[]) : [],
    howWeRun: Array.isArray(c.howWeRun) ? (c.howWeRun as unknown[]) : [],
    howItWorks: Array.isArray(c.howItWorks) ? (c.howItWorks as unknown[]) : [],
    stats: Array.isArray(c.stats) ? (c.stats as unknown[]) : [],
    facilities: Array.isArray(c.facilities) ? (c.facilities as unknown[]) : [],
    management: Array.isArray(c.management) ? (c.management as unknown[]) : [],
    activities: Array.isArray(c.activities) ? (c.activities as unknown[]) : [],
    projects: Array.isArray(c.projects) ? (c.projects as unknown[]) : [],
    updatedAt: c.updatedAt,
  }
}

export default async function ManageSiteContentPage() {
  // Page-level permission guard — redirects to /dashboard/unauthorized
  // if the user doesn't have access to this page.
  await guardDashboardPage("System & Settings", "Landing Page Content")


  const row = await prisma.siteContent.findUnique({ where: { id: "singleton" } })

  // Fallback to an empty structure if no content exists yet — every field
  // is a plain string/array so the form never receives `null`/`undefined`.
  const content = row
    ? normalizeContent(row)
    : {
        id: "singleton" as const,
        heroTitle: "", heroSubtitle: "", heroBadge: "", heroCtaPrimary: "", heroCtaSecondary: "",
        aboutTitle: "", aboutContent: "", visionTitle: "", visionContent: "",
        policyContent: "",
        softwareTitle: "", softwareDescription: "",
        androidAppVersion: "", androidAppUrl: null, androidAppSizeBytes: null, androidAppUpdatedAt: null,
        windowsAppVersion: "", windowsAppUrl: null, windowsAppSizeBytes: null, windowsAppUpdatedAt: null,
        whyJoinUs: [] as unknown[], howWeRun: [] as unknown[], howItWorks: [] as unknown[],
        stats: [] as unknown[],
        facilities: [] as unknown[], management: [] as unknown[],
        activities: [] as unknown[], projects: [] as unknown[],
        updatedAt: new Date(),
      }

  // Fetch active members for the Management Committee dropdown
  const activeMembers = await prisma.member.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, fullName: true, memberNo: true, phone: true, email: true },
    orderBy: { fullName: "asc" },
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Landing Page Content</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Manage every section of your public website — hero, stats, pillars, member-portal features,
          software downloads, somiti policy, management committee, projects, and activities.
        </p>
      </div>
      {/*
        Cast through ComponentProps so we don't have to re-declare the
        SiteContentData / ContentItem types here (they're internal to the
        form file). The shape is structurally identical — the cast only
        erases Prisma's `Json` widening on the array fields.
      */}
      <SiteContentForm
        content={content as React.ComponentProps<typeof SiteContentForm>["content"]}
        activeMembers={activeMembers.map((m) => ({ id: m.id, fullName: m.fullName, memberNo: m.memberNo }))}
      />
    </div>
  )
}
