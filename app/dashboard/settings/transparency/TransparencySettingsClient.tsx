"use client"

/**
 * Transparency Settings form.
 *
 * Two sections:
 *   1. Feature toggles — on/off switches for the 4 member-portal transparency
 *      modules. A turned-off module hides its portal nav item AND its page.
 *   2. Bank iBanking credentials — shown to members on the Bank Statement
 *      portal page so they can log in to the somiti's bank portal and view the
 *      statement themselves. The password is AES-256-GCM encrypted at rest;
 *      a blank field on submit preserves the existing ciphertext.
 *
 * Mirrors the MailSettingsClient form pattern (useState + startTransition +
 * FormData + toast).
 */

import { useState, useTransition } from "react"
import { saveTransparencySettings } from "@/app/actions/transparency"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import {
  Save,
  Landmark,
  Gem,
  Briefcase,
  FileText,
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-react"

import PageHeader from "@/components/somiti/PageHeader"
import SectionCard from "@/components/somiti/SectionCard"

export interface TransparencySettingsData {
  showBankStatement: boolean
  showInvestments: boolean
  showProjects: boolean
  showMeetingMinutes: boolean
  bankName: string
  ibankingUrl: string
  ibankingUserId: string
  ibankingPasswordHas: boolean
  bankInstructions: string
}

export default function TransparencySettingsClient({
  settings,
}: {
  settings: TransparencySettingsData
}) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<TransparencySettingsData>(settings)
  const [showPw, setShowPw] = useState(false)

  const set = <K extends keyof TransparencySettingsData>(k: K, v: TransparencySettingsData[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleSave = () => {
    const fd = new FormData()
    fd.append("showBankStatement", form.showBankStatement ? "true" : "false")
    fd.append("showInvestments", form.showInvestments ? "true" : "false")
    fd.append("showProjects", form.showProjects ? "true" : "false")
    fd.append("showMeetingMinutes", form.showMeetingMinutes ? "true" : "false")
    fd.append("bankName", form.bankName)
    fd.append("ibankingUrl", form.ibankingUrl)
    fd.append("ibankingUserId", form.ibankingUserId)
    fd.append("bankInstructions", form.bankInstructions)
    const pw = (document.getElementById("ibankingPassword") as HTMLInputElement)?.value ?? ""
    fd.append("ibankingPassword", pw)

    startTransition(async () => {
      try {
        await saveTransparencySettings(fd)
        toast.success("Transparency settings saved")
        // After saving a NEW password, the "has" flag flips to true. Reflect it
        // locally so the placeholder switches to the "leave blank to keep" hint.
        if (pw.trim() !== "") set("ibankingPasswordHas", true)
      } catch (e) {
        toast.error("Could not save", { description: e instanceof Error ? e.message : undefined })
      }
    })
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Transparency Settings"
        subtitle="Control what members can view in their portal — bank statement access, investments, projects, and meeting minutes."
      />

      {/* ── 1. Feature toggles ──────────────────────────────────────────── */}
      <SectionCard title="Portal Transparency Modules" icon={<ShieldCheck />} accent="violet">
        <p className="t-caption mb-4 text-muted-ink">
          Each module is shown to members by default. Turn a module off to hide its menu item and page in the member portal.
        </p>
        <div className="divide-y divide-[var(--border-base)]">
          <ToggleRow
            icon={<Landmark />}
            title="Bank Statement"
            description="Members see the somiti fund's iBanking credentials and can open the bank portal."
            checked={form.showBankStatement}
            onChange={(v) => set("showBankStatement", v)}
          />
          <ToggleRow
            icon={<Gem />}
            title="Investments"
            description="Members see the somiti's investments list and detail (read-only)."
            checked={form.showInvestments}
            onChange={(v) => set("showInvestments", v)}
          />
          <ToggleRow
            icon={<Briefcase />}
            title="Projects"
            description="Members see the somiti's projects list and detail (read-only)."
            checked={form.showProjects}
            onChange={(v) => set("showProjects", v)}
          />
          <ToggleRow
            icon={<FileText />}
            title="Meeting Minutes"
            description="Members see past meeting minutes and can download them."
            checked={form.showMeetingMinutes}
            onChange={(v) => set("showMeetingMinutes", v)}
          />
        </div>
      </SectionCard>

      {/* ── 2. Bank iBanking credentials ───────────────────────────────── */}
      <SectionCard title="Bank iBanking Access" icon={<Landmark />} accent="emerald">
        <p className="t-caption mb-4 text-muted-ink">
          These credentials are shown to members on the portal&apos;s <strong>Bank Statement</strong> page (only while the Bank Statement module is enabled). The password is encrypted at rest; leave the field blank to keep the existing one.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="bankName">Bank Name</Label>
            <Input
              id="bankName"
              value={form.bankName}
              onChange={(e) => set("bankName", e.target.value)}
              placeholder="e.g. City Bank"
              className="bg-[var(--control-bg)]"
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ibankingUrl">iBanking URL</Label>
            <Input
              id="ibankingUrl"
              type="url"
              value={form.ibankingUrl}
              onChange={(e) => set("ibankingUrl", e.target.value)}
              placeholder="https://ibanking.citybank.com.bd"
              className="bg-[var(--control-bg)]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ibankingUserId">User ID</Label>
            <Input
              id="ibankingUserId"
              value={form.ibankingUserId}
              onChange={(e) => set("ibankingUserId", e.target.value)}
              placeholder="iBanking login user id"
              className="bg-[var(--control-bg)]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ibankingPassword">Password</Label>
            <div className="relative">
              <Input
                id="ibankingPassword"
                type={showPw ? "text" : "password"}
                placeholder={form.ibankingPasswordHas ? "••••••••  (leave blank to keep)" : "Enter iBanking password"}
                className="bg-[var(--control-bg)] pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint-ink hover:text-primary-ink"
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {form.ibankingPasswordHas && (
              <p className="t-caption text-success">A password is already saved. Leave blank to keep it.</p>
            )}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="bankInstructions">Instructions for Members (optional)</Label>
            <Textarea
              id="bankInstructions"
              value={form.bankInstructions}
              onChange={(e) => set("bankInstructions", e.target.value)}
              rows={3}
              placeholder="e.g. Use the savings account view to see the latest transactions. Statement refreshes daily."
              className="bg-[var(--control-bg)]"
            />
          </div>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isPending} className="brand-gradient shadow-brand-glow">
          <Save className="mr-2 h-4 w-4" />
          {isPending ? "Saving…" : "Save Settings"}
        </Button>
      </div>
    </div>
  )
}

// ── Toggle row helper ──────────────────────────────────────────────────────────
function ToggleRow({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode
  title: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-secondary-ink [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="t-body font-medium text-primary-ink">{title}</p>
          <p className="t-caption text-muted-ink">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={(v) => onChange(v === true)} size="sm" />
    </div>
  )
}
