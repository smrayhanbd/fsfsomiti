"use client"

import { useState } from "react"
import { updateSiteContent } from "@/app/actions/site"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Trash2, Save, ChevronDown, Info } from "lucide-react"
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
  transparency: string
  policyContent: string
  whyJoinUs: ContentItem[]
  howWeRun: ContentItem[]
  howItWorks: ContentItem[]
  stats: ContentItem[]
  securityBadges: ContentItem[]
  facilities: ContentItem[]
  management: ContentItem[]
  activities: ContentItem[]
  projects: ContentItem[]
  [key: string]: unknown
}

export default function SiteContentForm({ content }: { content: SiteContentData }) {
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
    <form action={(formData) => {
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
      formData.append("transparency", data.transparency || "")
      formData.append("policyContent", data.policyContent || "")

      // Append clean JSON arrays (without the File objects)
      formData.append("whyJoinUs", JSON.stringify(cleanArray(data.whyJoinUs)))
      formData.append("howWeRun", JSON.stringify(cleanArray(data.howWeRun)))
      formData.append("howItWorks", JSON.stringify(cleanArray(data.howItWorks)))
      formData.append("stats", JSON.stringify(cleanArray(data.stats)))
      formData.append("securityBadges", JSON.stringify(cleanArray(data.securityBadges)))
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

      updateSiteContent(formData)
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
          <div className="space-y-2">
            <Label>Vision Title</Label>
            <Input value={data.visionTitle ?? ""} onChange={(e) => handleChange("visionTitle", e.target.value)} />
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

      {/* ─── Security Marquee ─── */}
      <Card className="shadow-sm rounded-xl border-slate-200">
        <CardHeader>
          <CardTitle>Security Marquee <span className="text-xs text-slate-500 font-normal">(horizontal scrolling trust badges)</span></CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-slate-500 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Pick an icon name and a short label. Defaults: 256-bit Encrypted Data, Trusted by Huge Members, Automated Payouts, A Group of Trusted People, Transparent Ledger, Bank-Grade Security.
          </p>
          <IconPicklistEditor
            arrayName="securityBadges"
            items={data.securityBadges}
            fields={["icon", "label"]}
            labels={["Icon", "Label"]}
            onAdd={(f) => addArrayItem("securityBadges", f)}
            onRemove={(i) => removeArrayItem("securityBadges", i)}
            onChange={(i, f, v) => handleArrayChange("securityBadges", i, f, v)}
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

      {/* ─── How It Works ─── */}
      <Card className="shadow-sm rounded-xl border-slate-200">
        <CardHeader>
          <CardTitle>How It Works <span className="text-xs text-slate-500 font-normal">(numbered onboarding steps)</span></CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-slate-500 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Steps render as numbered circles. Recommended: 5 steps (Register → Get Approved → Start Saving → Vote & Withdraw → Grow Together).
          </p>
          <SimpleListEditor
            arrayName="howItWorks"
            items={data.howItWorks}
            fields={["step", "title", "description"]}
            labels={["Step # (e.g. 1)", "Title", "Description"]}
            onAdd={(f) => addArrayItem("howItWorks", f)}
            onRemove={(i) => removeArrayItem("howItWorks", i)}
            onChange={(i, f, v) => handleArrayChange("howItWorks", i, f, v)}
            itemTitleField="title"
          />
        </CardContent>
      </Card>

      {/* ─── Transparency & Policy ─── */}
      <Card className="shadow-sm rounded-xl border-slate-200">
        <CardHeader><CardTitle>Transparency & Policy</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Transparency Text</Label>
            <RichTextEditor value={data.transparency ?? ""} onChange={(val) => handleChange("transparency", val)} />
          </div>
          <div className="space-y-2">
            <Label>Somiti Policy Content</Label>
            <RichTextEditor value={data.policyContent || ""} onChange={(val) => handleChange("policyContent", val)} />
          </div>
        </CardContent>
      </Card>

      {/* ─── About-section facility cards ─── */}
      <Card className="shadow-sm rounded-xl border-slate-200">
        <CardHeader>
          <CardTitle>About — Highlight Cards <span className="text-xs text-slate-500 font-normal">(right-side cards in About section)</span></CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-slate-500 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Recommended: 4 cards. Examples — Bank-Grade Security, Real-Time Transparency, Democratic Governance, Instant Notifications.
          </p>
          <IconPicklistEditor
            arrayName="facilities"
            items={data.facilities}
            fields={["icon", "title", "description"]}
            labels={["Icon", "Title", "Description"]}
            onAdd={(f) => addArrayItem("facilities", f)}
            onRemove={(i) => removeArrayItem("facilities", i)}
            onChange={(i, f, v) => handleArrayChange("facilities", i, f, v)}
            itemTitleField="title"
            richTextFields={["description"]}
          />
        </CardContent>
      </Card>

      {/* ─── Existing dynamic lists ─── */}
      <CommitteeSyncPanel />
      <DynamicListEditor title="Management Committee" arrayName="management" items={data.management} fields={["name", "role", "photoUrl", "bio"]} labels={["Name", "Role", "Photo", "Short Bio"]} onAdd={(f) => addArrayItem("management", f)} onRemove={(i) => removeArrayItem("management", i)} onChange={(i, f, v) => handleArrayChange("management", i, f, v)} />

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

interface DynamicListEditorProps {
  title: string
  arrayName: string
  items?: ContentItem[]
  fields: string[]
  labels: string[]
  onAdd: (fields: string[]) => void
  onRemove: (index: number) => void
  onChange: (index: number, field: string, value: unknown) => void
}

// Reusable List Editor Component with Accordion and State-Managed Files
function DynamicListEditor({ title, items = [], fields, labels, onAdd, onRemove, onChange }: DynamicListEditorProps) {
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
