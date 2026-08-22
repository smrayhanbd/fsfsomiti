"use client"

import { useState } from "react"
import { updateSiteContent } from "@/app/actions/site"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Trash2, Save, ChevronDown, Info, Download, Smartphone, Monitor } from "lucide-react"
import { toast } from "sonner"
import RichTextEditor from "@/components/RichTextEditor"
import CommitteeSyncPanel from "./CommitteeSyncPanel"

/**
 * Names of icons the admin can pick from when adding a pillar / portal feature
 * / facility. Keep in sync with `ICON_REGISTRY` in components/LandingPageClient.tsx.
 */
const ICON_OPTIONS = [
  "Building2", "ShieldCheck", "TrendingUp", "Receipt", "Users", "Vote",
  "FileText", "Wallet", "BellRing", "MessageCircle", "HandCoins", "Home",
  "PiggyBank", "Briefcase", "Rocket", "HeartHandshake", "Landmark",
  "BadgeCheck", "KeyRound", "Cpu", "Eye", "Banknote", "Lock", "Sparkles",
  "CheckCircle2",
]

/** A single dynamic-list row (management, projects, activities, facilities). */
interface ContentItem {
  name?: string
  role?: string
  title?: string
  status?: string
  date?: string
  description?: string
  bio?: string
  photoUrl?: string
  icon?: string
  step?: string | number
  value?: string | number
  label?: string
  suffix?: string
  _file?: File | null
  [key: string]: unknown
}

/** Full site-content document held in form state. */
interface SiteContentData {
  heroTitle: string
  heroSubtitle: string
  heroBadge: string
  heroCtaPrimary: string
  heroCtaSecondary: string
  aboutTitle: string
  aboutContent: string
  visionTitle: string
  visionContent: string
  policyContent: string
  softwareTitle: string
  softwareDescription: string
  androidAppVersion: string
  androidAppUrl: string | null
  androidAppSizeBytes: number | null
  androidAppUpdatedAt: string | null
  windowsAppVersion: string
  windowsAppUrl: string | null
  windowsAppSizeBytes: number | null
  windowsAppUpdatedAt: string | null
  whyJoinUs: ContentItem[]
  howWeRun: ContentItem[]
  howItWorks: ContentItem[]
  stats: ContentItem[]
  facilities: ContentItem[]
  management: ContentItem[]
  activities: ContentItem[]
  projects: ContentItem[]
  [key: string]: unknown
}

/** Human-readable file size for the software-download cards. */
function formatBytes(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Current-upload status line for one platform (Android / Windows). */
function SoftwareFileSummary({
  url,
  version,
  sizeBytes,
  updatedAt,
}: {
  url: string | null
  version: string | null
  sizeBytes: number | null
  updatedAt: string | null
}) {
  if (!url) {
    return (
      <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
        No file uploaded yet — this platform is hidden on the landing page.
      </p>
    )
  }
  const size = formatBytes(sizeBytes)
  const updated = updatedAt ? new Date(updatedAt).toLocaleDateString() : null
  return (
    <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
      <Download className="h-3.5 w-3.5 shrink-0" />
      <span>
        Uploaded{version ? ` ${version}` : ""}
        {size ? ` · ${size}` : ""}
        {updated ? ` · ${updated}` : ""} — uploading a new file replaces it.
      </span>
    </div>
  )
}

interface ActiveMember {
  id: string
  fullName: string
  memberNo: string
}

export default function SiteContentForm({ content, activeMembers = [] }: { content: SiteContentData; activeMembers?: ActiveMember[] }) {
  const [data, setData] = useState<SiteContentData>(content)

  const handleChange = (name: string, value: string) => {
    setData((prev) => ({ ...prev, [name]: value }))
  }

  const handleArrayChange = (arrayName: string, index: number, field: string, value: unknown) => {
    const newArray = [...(data[arrayName] as ContentItem[])]
    newArray[index] = { ...newArray[index], [field]: value }
    setData((prev) => ({ ...prev, [arrayName]: newArray }))
  }

  const addArrayItem = (arrayName: string, fields: string[]) => {
    const newItem = fields.reduce((acc, f) => { acc[f] = ""; return acc }, {} as ContentItem)
    const newArray = [...(data[arrayName] as ContentItem[]), newItem]
    setData((prev) => ({ ...prev, [arrayName]: newArray }))
  }

  const removeArrayItem = (arrayName: string, index: number) => {
    const newArray = (data[arrayName] as ContentItem[]).filter((_, i) => i !== index)
    setData((prev) => ({ ...prev, [arrayName]: newArray }))
  }

  // Helper to remove the temporary _file object before saving JSON
  const cleanArray = (arr?: ContentItem[]) => (arr ?? []).map(({ _file, ...rest }) => rest)

  return (
    <form action={async (formData) => {
      // Append text fields
      formData.append("heroTitle", data.heroTitle || "")
      formData.append("heroSubtitle", data.heroSubtitle || "")
      formData.append("heroBadge", data.heroBadge || "")
      formData.append("heroCtaPrimary", data.heroCtaPrimary || "")
      formData.append("heroCtaSecondary", data.heroCtaSecondary || "")
      formData.append("aboutTitle", data.aboutTitle || "")
      formData.append("aboutContent", data.aboutContent || "")
      formData.append("visionTitle", data.visionTitle || "")
      formData.append("visionContent", data.visionContent || "")
      formData.append("policyContent", data.policyContent || "")
      formData.append("softwareTitle", data.softwareTitle || "")
      formData.append("softwareDescription", data.softwareDescription || "")
      formData.append("androidAppVersion", data.androidAppVersion || "")
      formData.append("windowsAppVersion", data.windowsAppVersion || "")
      // The .apk/.exe file inputs and the remove-* checkboxes are plain named
      // inputs, so they are already part of formData.

      // Append clean JSON arrays (without the File objects)
      formData.append("whyJoinUs", JSON.stringify(cleanArray(data.whyJoinUs)))
      formData.append("howWeRun", JSON.stringify(cleanArray(data.howWeRun)))
      formData.append("howItWorks", JSON.stringify(cleanArray(data.howItWorks)))
      formData.append("stats", JSON.stringify(cleanArray(data.stats)))
      formData.append("facilities", JSON.stringify(cleanArray(data.facilities)))
      formData.append("management", JSON.stringify(cleanArray(data.management)))
      formData.append("activities", JSON.stringify(cleanArray(data.activities)))
      formData.append("projects", JSON.stringify(cleanArray(data.projects)))

      // Manually append File objects from state
      const appendFiles = (arrayName: string, arr: ContentItem[]) => {
        arr.forEach((item, i) => {
          if (item._file) {
            formData.append(`${arrayName}_${i}_photoUrl`, item._file)
          }
        })
      }
      appendFiles("management", data.management)
      appendFiles("projects", data.projects)
      appendFiles("activities", data.activities)

      try {
        await updateSiteContent(formData)
      } catch (err) {
        // Successful saves redirect (which throws NEXT_REDIRECT and is
        // rethrown by Next); anything else is a real save failure (e.g. an
        // oversize .apk) — surface it instead of failing silently.
        if (err && typeof err === "object" && "digest" in err) throw err
        toast.error("Save failed", {
          description: err instanceof Error ? err.message : "Please check your inputs and try again.",
        })
      }
    }} className="space-y-8 pb-20">

      {/* ─── Hero & About Section ─── */}
      <Card className="shadow-sm rounded-xl border-slate-200">
        <CardHeader><CardTitle>Hero & About Sections</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Hero Pill (small badge above title)</Label>
            <Input value={data.heroBadge ?? ""} onChange={(e) => handleChange("heroBadge", e.target.value)} placeholder="e.g. Next-Gen Cooperative Management" />
          </div>
          <div className="space-y-2">
            <Label>Hero Title <span className="text-xs text-slate-500">(HTML allowed — wrap accent words in <code>{"<span class='text-shimmer'>…</span>"}</code>)</span></Label>
            <Input value={data.heroTitle ?? ""} onChange={(e) => handleChange("heroTitle", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Hero Subtitle</Label>
            <RichTextEditor value={data.heroSubtitle ?? ""} onChange={(val) => handleChange("heroSubtitle", val)} />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Hero Primary CTA Label</Label>
              <Input value={data.heroCtaPrimary ?? ""} onChange={(e) => handleChange("heroCtaPrimary", e.target.value)} placeholder="Become a Member" />
            </div>
            <div className="space-y-2">
              <Label>Hero Secondary CTA Label</Label>
              <Input value={data.heroCtaSecondary ?? ""} onChange={(e) => handleChange("heroCtaSecondary", e.target.value)} placeholder="Member Login" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>About Title</Label>
            <Input value={data.aboutTitle ?? ""} onChange={(e) => handleChange("aboutTitle", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>About Content</Label>
            <RichTextEditor value={data.aboutContent ?? ""} onChange={(val) => handleChange("aboutContent", val)} />
          </div>
          <div className="space-y-2 border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
            <Label>Vision Title <span className="text-xs text-slate-500 font-normal">(shown in the About section&apos;s right column)</span></Label>
            <Input value={data.visionTitle ?? ""} onChange={(e) => handleChange("visionTitle", e.target.value)} placeholder="Our Vision & Mission" />
          </div>
          <div className="space-y-2">
            <Label>Vision Content</Label>
            <RichTextEditor value={data.visionContent ?? ""} onChange={(val) => handleChange("visionContent", val)} />
          </div>
        </CardContent>
      </Card>

      {/* ─── Stats Strip ─── */}
      <Card className="shadow-sm rounded-xl border-slate-200">
        <CardHeader>
          <CardTitle>Stats Strip <span className="text-xs text-slate-500 font-normal">(shown directly under the hero)</span></CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-slate-500 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Recommended: 4 items. Examples — Active Members, Total Deposits, Loans Disbursed, Uptime.
          </p>
          <SimpleListEditor
            arrayName="stats"
            items={data.stats}
            fields={["value", "label", "suffix"]}
            labels={["Value (e.g. 500+)", "Label (e.g. Active Members)", "Suffix (optional)"]}
            onAdd={(f) => addArrayItem("stats", f)}
            onRemove={(i) => removeArrayItem("stats", i)}
            onChange={(i, f, v) => handleArrayChange("stats", i, f, v)}
            itemTitleField="label"
          />
        </CardContent>
      </Card>

      {/* ─── Pillars / What We Do ─── */}
      <Card className="shadow-sm rounded-xl border-slate-200">
        <CardHeader>
          <CardTitle>What We Do — Pillars <span className="text-xs text-slate-500 font-normal">(7 community purposes)</span></CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-slate-500 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Suggested pillars: Community Growth, Together Fund Growth, Dream House Building, Member-to-Member Loans, Business Growth, Investments & Projects, Helping People in Need.
          </p>
          <IconPicklistEditor
            arrayName="whyJoinUs"
            items={data.whyJoinUs}
            fields={["icon", "title", "description"]}
            labels={["Icon", "Title", "Description"]}
            onAdd={(f) => addArrayItem("whyJoinUs", f)}
            onRemove={(i) => removeArrayItem("whyJoinUs", i)}
            onChange={(i, f, v) => handleArrayChange("whyJoinUs", i, f, v)}
            itemTitleField="title"
            richTextFields={["description"]}
          />
        </CardContent>
      </Card>

      {/* ─── Member Portal Features ─── */}
      <Card className="shadow-sm rounded-xl border-slate-200">
        <CardHeader>
          <CardTitle>Member Portal Features <span className="text-xs text-slate-500 font-normal">(transparency & member tools)</span></CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-slate-500 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Suggested features: Bank Statements Anytime, Read Meeting Minutes, Withdrawal Requests, SMS & Email Alerts, WhatsApp Community, Vote in Elections.
          </p>
          <IconPicklistEditor
            arrayName="howWeRun"
            items={data.howWeRun}
            fields={["icon", "title", "description"]}
            labels={["Icon", "Title", "Description"]}
            onAdd={(f) => addArrayItem("howWeRun", f)}
            onRemove={(i) => removeArrayItem("howWeRun", i)}
            onChange={(i, f, v) => handleArrayChange("howWeRun", i, f, v)}
            itemTitleField="title"
            richTextFields={["description"]}
          />
        </CardContent>
      </Card>

      {/* ─── Download Software ─── */}
      <Card className="shadow-sm rounded-xl border-slate-200">
        <CardHeader>
          <CardTitle>Download Software <span className="text-xs text-slate-500 font-normal">(Android APK + Windows EXE shown on the landing page)</span></CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-xs text-slate-500 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Upload an .apk and/or .exe (max 100 MB each). A platform card appears on the landing page
            once its file is uploaded; the section is hidden while no file exists.
          </p>
          <div className="space-y-2">
            <Label>Section Title</Label>
            <Input
              value={data.softwareTitle ?? ""}
              onChange={(e) => handleChange("softwareTitle", e.target.value)}
              placeholder="e.g. Take Your Somiti Everywhere"
            />
          </div>
          <div className="space-y-2">
            <Label>Section Description</Label>
            <RichTextEditor
              value={data.softwareDescription ?? ""}
              onChange={(val) => handleChange("softwareDescription", val)}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Android */}
            <div className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <Smartphone className="h-4 w-4 text-emerald-600" /> Android App (.apk)
              </p>
              <SoftwareFileSummary
                url={data.androidAppUrl}
                version={data.androidAppVersion}
                sizeBytes={data.androidAppSizeBytes}
                updatedAt={data.androidAppUpdatedAt}
              />
              <div className="space-y-1">
                <Label className="text-xs uppercase text-slate-500">Version Label</Label>
                <Input
                  name="androidAppVersion"
                  value={data.androidAppVersion ?? ""}
                  onChange={(e) => handleChange("androidAppVersion", e.target.value)}
                  placeholder="e.g. v1.2.0"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase text-slate-500">APK File</Label>
                <Input type="file" name="androidAppFile" accept=".apk" className="max-w-xs" />
              </div>
              {data.androidAppUrl && (
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input type="checkbox" name="removeAndroidApp" className="h-4 w-4 rounded border-slate-300" />
                  Remove the uploaded APK (hides the Android card on the landing page)
                </label>
              )}
            </div>

            {/* Windows */}
            <div className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <Monitor className="h-4 w-4 text-sky-600" /> Windows App (.exe)
              </p>
              <SoftwareFileSummary
                url={data.windowsAppUrl}
                version={data.windowsAppVersion}
                sizeBytes={data.windowsAppSizeBytes}
                updatedAt={data.windowsAppUpdatedAt}
              />
              <div className="space-y-1">
                <Label className="text-xs uppercase text-slate-500">Version Label</Label>
                <Input
                  name="windowsAppVersion"
                  value={data.windowsAppVersion ?? ""}
                  onChange={(e) => handleChange("windowsAppVersion", e.target.value)}
                  placeholder="e.g. v1.2.0"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs uppercase text-slate-500">EXE File</Label>
                <Input type="file" name="windowsAppFile" accept=".exe" className="max-w-xs" />
              </div>
              {data.windowsAppUrl && (
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input type="checkbox" name="removeWindowsApp" className="h-4 w-4 rounded border-slate-300" />
                  Remove the uploaded EXE (hides the Windows card on the landing page)
                </label>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Somiti Policy ─── */}
      <Card className="shadow-sm rounded-xl border-slate-200">
        <CardHeader>
          <CardTitle>Somiti Policy <span className="text-xs text-slate-500 font-normal">(shown at /policy)</span></CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Somiti Policy Content</Label>
            <RichTextEditor value={data.policyContent || ""} onChange={(val) => handleChange("policyContent", val)} />
          </div>
        </CardContent>
      </Card>

      {/* ─── Management Committee ─── */}
      <CommitteeSyncPanel />
      <DynamicListEditor
        title="Management Committee"
        arrayName="management"
        items={data.management}
        fields={["name", "role", "photoUrl", "bio"]}
        labels={["Member", "Role / Designation", "Photo", "Short Bio"]}
        onAdd={(f) => addArrayItem("management", f)}
        onRemove={(i) => removeArrayItem("management", i)}
        onChange={(i, f, v) => handleArrayChange("management", i, f, v)}
        dropdownField="name"
        dropdownOptions={activeMembers.map((m) => ({ value: m.fullName, label: `${m.fullName} (${m.memberNo})` }))}
        dropdownPlaceholder="Select a member…"
      />

      <DynamicListEditor title="Projects" arrayName="projects" items={data.projects} fields={["title", "status", "photoUrl", "description"]} labels={["Project Title", "Status (e.g. Ongoing)", "Project Photo", "Description"]} onAdd={(f) => addArrayItem("projects", f)} onRemove={(i) => removeArrayItem("projects", i)} onChange={(i, f, v) => handleArrayChange("projects", i, f, v)} />

      <DynamicListEditor title="Recent Activities" arrayName="activities" items={data.activities} fields={["title", "date", "photoUrl", "description"]} labels={["Activity Title", "Date", "Activity Photo", "Description"]} onAdd={(f) => addArrayItem("activities", f)} onRemove={(i) => removeArrayItem("activities", i)} onChange={(i, f, v) => handleArrayChange("activities", i, f, v)} />

      {/* Floating Save Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button type="submit" size="lg" className="bg-indigo-600 hover:bg-indigo-700 shadow-2xl rounded-full h-14 w-14 p-0 flex items-center justify-center">
          <Save className="h-6 w-6" />
        </Button>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ *
 * Reusable accordion-based list editor for text-only rows
 * (stats, howItWorks). Same UX as the existing DynamicListEditor but
 * without image uploads and with a simpler header label.
 * ------------------------------------------------------------------ */
interface SimpleListEditorProps {
  arrayName: string
  items?: ContentItem[]
  fields: string[]
  labels: string[]
  onAdd: (fields: string[]) => void
  onRemove: (index: number) => void
  onChange: (index: number, field: string, value: unknown) => void
  itemTitleField: string
}

function SimpleListEditor({ items = [], fields, labels, onAdd, onRemove, onChange, itemTitleField }: SimpleListEditorProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0)
  const handleAdd = () => {
    onAdd(fields)
    setExpandedIndex(items.length)
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button type="button" size="sm" variant="outline" onClick={handleAdd}><Plus className="h-4 w-4 mr-1" /> Add Item</Button>
      </div>
      {items.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No items added yet.</p>}
      {items.map((item, index) => {
        const isExpanded = expandedIndex === index
        const itemTitle = (item[itemTitleField] as string) || `Item ${index + 1}`
        return (
          <div key={index} className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50 dark:bg-slate-900/50">
            <div
              className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              onClick={() => setExpandedIndex(isExpanded ? null : index)}
            >
              <div className="flex items-center gap-2">
                <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                <span className="font-medium text-sm text-slate-700 dark:text-slate-200">{itemTitle}</span>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={(e) => { e.stopPropagation(); onRemove(index) }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {isExpanded && (
              <div className="p-4 pt-2 space-y-3 border-t border-slate-200 dark:border-slate-700">
                {fields.map((field: string, fIndex: number) => (
                  <div key={field} className="space-y-1">
                    <Label className="text-xs uppercase text-slate-500">{labels[fIndex]}</Label>
                    <Input
                      value={(item[field] as string) || ""}
                      onChange={(e) => onChange(index, field, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Reusable accordion-based list editor with an icon picklist.
 * Used for: pillars (whyJoinUs), member-portal features (howWeRun),
 * facilities, securityBadges.
 * ------------------------------------------------------------------ */
interface IconPicklistEditorProps {
  arrayName: string
  items?: ContentItem[]
  fields: string[]
  labels: string[]
  onAdd: (fields: string[]) => void
  onRemove: (index: number) => void
  onChange: (index: number, field: string, value: unknown) => void
  itemTitleField: string
  richTextFields?: string[]
}

function IconPicklistEditor({ items = [], fields, labels, onAdd, onRemove, onChange, itemTitleField, richTextFields = [] }: IconPicklistEditorProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0)
  const handleAdd = () => {
    onAdd(fields)
    setExpandedIndex(items.length)
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button type="button" size="sm" variant="outline" onClick={handleAdd}><Plus className="h-4 w-4 mr-1" /> Add Item</Button>
      </div>
      {items.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No items added yet.</p>}
      {items.map((item, index) => {
        const isExpanded = expandedIndex === index
        const itemTitle = (item[itemTitleField] as string) || `Item ${index + 1}`
        return (
          <div key={index} className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50 dark:bg-slate-900/50">
            <div
              className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              onClick={() => setExpandedIndex(isExpanded ? null : index)}
            >
              <div className="flex items-center gap-2">
                <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                <span className="font-medium text-sm text-slate-700 dark:text-slate-200">{itemTitle}</span>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={(e) => { e.stopPropagation(); onRemove(index) }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {isExpanded && (
              <div className="p-4 pt-2 space-y-3 border-t border-slate-200 dark:border-slate-700">
                {fields.map((field: string, fIndex: number) => (
                  <div key={field} className="space-y-1">
                    <Label className="text-xs uppercase text-slate-500">{labels[fIndex]}</Label>
                    {field === "icon" ? (
                      <select
                        value={(item[field] as string) || ""}
                        onChange={(e) => onChange(index, field, e.target.value)}
                        className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <option value="">— Pick an icon —</option>
                        {ICON_OPTIONS.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    ) : richTextFields.includes(field) ? (
                      <RichTextEditor value={(item[field] as string) || ""} onChange={(val) => onChange(index, field, val)} />
                    ) : (
                      <Input
                        value={(item[field] as string) || ""}
                        onChange={(e) => onChange(index, field, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface DropdownOption {
  value: string
  label: string
}

interface DynamicListEditorProps {
  title: string
  arrayName: string
  items?: ContentItem[]
  fields: string[]
  labels: string[]
  onAdd: (fields: string[]) => void
  onRemove: (index: number) => void
  onChange: (index: number, field: string, value: unknown) => void
  dropdownField?: string
  dropdownOptions?: DropdownOption[]
  dropdownPlaceholder?: string
}

// Reusable List Editor Component with Accordion and State-Managed Files
function DynamicListEditor({ title, items = [], fields, labels, onAdd, onRemove, onChange, dropdownField, dropdownOptions = [], dropdownPlaceholder = "Select…" }: DynamicListEditorProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0)

  const handleAdd = () => {
    onAdd(fields)
    setExpandedIndex(items.length) // Expand the new item
  }

  return (
    <Card className="shadow-sm rounded-xl border-slate-200">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Button type="button" size="sm" variant="outline" onClick={handleAdd}><Plus className="h-4 w-4 mr-1" /> Add Item</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No items added yet.</p>}
        {items.map((item, index) => {
          const isExpanded = expandedIndex === index
          const itemTitle = (item[fields[0]] as string) || `Item ${index + 1}`

          return (
            <div key={index} className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50 dark:bg-slate-900/50">
              {/* Accordion Header */}
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                onClick={() => setExpandedIndex(isExpanded ? null : index)}
              >
                <div className="flex items-center gap-2">
                  <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  <span className="font-medium text-sm text-slate-700 dark:text-slate-200">{itemTitle}</span>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                  onClick={(e) => { e.stopPropagation(); onRemove(index) }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Accordion Content */}
              {isExpanded && (
                <div className="p-4 pt-2 space-y-3 border-t border-slate-200 dark:border-slate-700">
                  {fields.map((field: string, fIndex: number) => (
                    <div key={field} className="space-y-1">
                      <Label className="text-xs uppercase text-slate-500">{labels[fIndex]}</Label>

                      {field === "photoUrl" ? (
                        <div className="flex items-center gap-4 mt-1">
                          {item.photoUrl && <img src={item.photoUrl} alt="Preview" className="w-16 h-16 object-cover rounded-md border border-slate-200" />}
                          <Input
                            type="file"
                            accept="image/*"
                            className="max-w-xs"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null
                              if (file) {
                                // Store file object in state and create a preview URL
                                onChange(index, "photoUrl", URL.createObjectURL(file))
                                onChange(index, "_file", file)
                              } else {
                                onChange(index, "photoUrl", "")
                                onChange(index, "_file", null)
                              }
                            }}
                          />
                        </div>
                      ) : field === dropdownField && dropdownOptions.length > 0 ? (
                        <select
                          value={(item[field] as string) || ""}
                          onChange={(e) => onChange(index, field, e.target.value)}
                          className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                        >
                          <option value="">{dropdownPlaceholder}</option>
                          {dropdownOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      ) : field === "description" || field === "bio" ? (
                        <RichTextEditor value={(item[field] as string) || ""} onChange={(val) => onChange(index, field, val)} />
                      ) : (
                        <Input value={(item[field] as string) || ""} onChange={(e) => onChange(index, field, e.target.value)} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
