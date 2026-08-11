"use client"

import { useState, useTransition } from "react"
import {
  saveMailSettings,
  testMailSettings,
  sendTestMailAction,
  saveTemplate,
  deleteTemplate,
  seedTemplatesAction,
} from "@/app/actions/messaging"
import { MAIL_PROVIDERS, type MailProvider } from "@/lib/mail/provider-metadata"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import RichTextEditor from "@/components/RichTextEditor"
import { toast } from "sonner"
import {
  Mail,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Plug,
  Send,
  Save,
  FileText,
  Plus,
  Pencil,
  Trash2,
  Clock,
  ShieldCheck,
} from "lucide-react"

interface MailSettingsData {
  provider: MailProvider
  isActive: boolean
  displayName: string
  fromEmail: string
  replyTo: string
  smtpHost: string
  smtpPort: number
  encryption: string
  smtpUsername: string
  smtpPasswordHas: boolean
  sesRegion: string
  sesConfigSet: string
  sesSandbox: boolean
  apiDomain: string
  apiRegion: string
  apiKeyHas: boolean
  maxRetry: number
  retryIntervalMin: number
  timeoutSec: number
  dailyLimit: number | null
  perMinuteLimit: number | null
}

interface TemplateRow {
  id: string
  channel: string
  key: string
  name: string
  subject: string
  body: string
  variables: string
  updatedAt: string
}

interface AuditRow {
  id: string
  action: string
  summary: string
  userEmail: string
  createdAt: string
}

export default function MailSettingsClient({
  settings,
  templates,
  auditLogs,
}: {
  settings: MailSettingsData
  templates: TemplateRow[]
  auditLogs: AuditRow[]
}) {
  const [isPending, startTransition] = useTransition()
  const [provider, setProvider] = useState<MailProvider>(settings.provider)
  const [form, setForm] = useState<MailSettingsData>(settings)
  const [showPw, setShowPw] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  const set = <K extends keyof MailSettingsData>(k: K, v: MailSettingsData[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const isSmtpType = MAIL_PROVIDERS.find((p) => p.value === provider)?.type === "smtp"

  const buildSaveFormData = () => {
    const fd = new FormData()
    fd.append("provider", provider)
    fd.append("isActive", form.isActive ? "true" : "false")
    fd.append("displayName", form.displayName)
    fd.append("fromEmail", form.fromEmail)
    fd.append("replyTo", form.replyTo)
    fd.append("smtpHost", form.smtpHost)
    fd.append("smtpPort", String(form.smtpPort))
    fd.append("encryption", form.encryption)
    fd.append("smtpUsername", form.smtpUsername)
    fd.append("sesRegion", form.sesRegion)
    fd.append("sesConfigSet", form.sesConfigSet)
    fd.append("sesSandbox", form.sesSandbox ? "true" : "false")
    fd.append("apiDomain", form.apiDomain)
    fd.append("apiRegion", form.apiRegion)
    fd.append("maxRetry", String(form.maxRetry))
    fd.append("retryIntervalMin", String(form.retryIntervalMin))
    fd.append("timeoutSec", String(form.timeoutSec))
    fd.append("dailyLimit", form.dailyLimit === null ? "" : String(form.dailyLimit))
    fd.append("perMinuteLimit", form.perMinuteLimit === null ? "" : String(form.perMinuteLimit))
    return fd
  }

  const handleSave = () => {
    const fd = buildSaveFormData()
    const pw = (document.getElementById("smtpPassword") as HTMLInputElement)?.value ?? ""
    const apiKey = (document.getElementById("apiKey") as HTMLInputElement)?.value ?? ""
    fd.append("smtpPassword", pw)
    fd.append("apiKey", apiKey)
    startTransition(async () => {
      try {
        await saveMailSettings(fd)
        toast.success("Mail settings saved")
      } catch (e) {
        toast.error("Could not save", { description: e instanceof Error ? e.message : undefined })
      }
    })
  }

  const handleTest = () => {
    startTransition(async () => {
      try {
        const r = await testMailSettings()
        if (r.ok) toast.success("Connection verified", { description: r.message })
        else toast.error("Connection failed", { description: r.message })
      } catch (e) {
        toast.error("Connection failed", { description: e instanceof Error ? e.message : undefined })
      }
    })
  }

  // ── Test email ──
  const [testTo, setTestTo] = useState("")
  const [testSubject, setTestSubject] = useState("Test Email from Future Savings")
  const [testMessage, setTestMessage] = useState("<p>This is a test email from your Mail settings.</p>")

  const handleSendTest = () => {
    if (!testTo.trim()) return toast.error("Recipient email is required.")
    const fd = new FormData()
    fd.append("testTo", testTo)
    fd.append("testSubject", testSubject)
    fd.append("testMessage", testMessage)
    startTransition(async () => {
      try {
        const r = await sendTestMailAction(fd)
        if (r.ok) toast.success("Email sent", { description: `${r.message} (${r.ms} ms)` })
        else toast.error("Email failed", { description: r.message })
      } catch (e) {
        toast.error("Email failed", { description: e instanceof Error ? e.message : undefined })
      }
    })
  }

  // ── Templates ──
  const [tplOpen, setTplOpen] = useState(false)
  const [editingTpl, setEditingTpl] = useState<TemplateRow | null>(null)
  const [tplKey, setTplKey] = useState("")
  const [tplName, setTplName] = useState("")
  const [tplSubject, setTplSubject] = useState("")
  const [tplBody, setTplBody] = useState("")
  const [tplVariables, setTplVariables] = useState("")

  const openCreateTpl = () => {
    setEditingTpl(null)
    setTplKey("")
    setTplName("")
    setTplSubject("")
    setTplBody("")
    setTplVariables("")
    setTplOpen(true)
  }
  const openEditTpl = (t: TemplateRow) => {
    setEditingTpl(t)
    setTplKey(t.key)
    setTplName(t.name)
    setTplSubject(t.subject)
    setTplBody(t.body)
    setTplVariables(t.variables)
    setTplOpen(true)
  }
  const handleSaveTpl = () => {
    if (!tplKey.trim() || !tplBody.trim()) return toast.error("Key and body are required.")
    const fd = new FormData()
    if (editingTpl) fd.append("id", editingTpl.id)
    fd.append("channel", "EMAIL")
    fd.append("key", tplKey.trim())
    fd.append("name", tplName.trim() || tplKey.trim())
    fd.append("subject", tplSubject)
    fd.append("body", tplBody)
    fd.append("variables", tplVariables)
    startTransition(async () => {
      try {
        await saveTemplate(fd)
        toast.success("Template saved")
        setTplOpen(false)
      } catch (e) {
        toast.error("Could not save template", { description: e instanceof Error ? e.message : undefined })
      }
    })
  }
  const handleDeleteTpl = (t: TemplateRow) => {
    if (!confirm(`Delete template "${t.name}"? This cannot be undone.`)) return
    startTransition(async () => {
      try {
        await deleteTemplate(t.id)
        toast.success("Template deleted")
      } catch (e) {
        toast.error("Failed", { description: e instanceof Error ? e.message : undefined })
      }
    })
  }
  const handleSeed = () => {
    if (!confirm("Add any missing default templates? Existing templates are not overwritten.")) return
    startTransition(async () => {
      try {
        await seedTemplatesAction()
        toast.success("Default templates seeded")
      } catch (e) {
        toast.error("Failed", { description: e instanceof Error ? e.message : undefined })
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Mail className="h-7 w-7 text-indigo-600" /> Mail Server Setup
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            Configure the outgoing email provider. Secrets are encrypted at rest; only the Super Admin can edit these.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleTest} disabled={isPending}>
            <Plug className="h-4 w-4" /> Test Connection
          </Button>
          <Button onClick={handleSave} disabled={isPending} className="bg-indigo-600 hover:bg-indigo-700">
            <Save className="h-4 w-4" /> {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* Status + provider picker */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider text-slate-500 flex items-center justify-between">
            <span>Provider</span>
            <span className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v === true)} size="sm" />
              <span className="text-xs">{form.isActive ? "Enabled" : "Disabled"}</span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {MAIL_PROVIDERS.map((p) => {
              const active = provider === p.value
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setProvider(p.value)}
                  className={`text-left rounded-xl border p-3 transition-all cursor-pointer ${
                    active
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/30"
                      : "border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-slate-900 dark:text-white">{p.label}</span>
                    {active && <CheckCircle2 className="h-4 w-4 text-indigo-600" />}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{p.description}</p>
                  <Badge variant="secondary" className="mt-2 text-[10px] uppercase">{p.type}</Badge>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Provider-specific fields */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider text-slate-500">
            {MAIL_PROVIDERS.find((p) => p.value === provider)?.label} Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Common */}
          <Field label="Display Name">
            <Input value={form.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder="Future Savings Foundation" />
          </Field>
          <Field label="From Email">
            <Input value={form.fromEmail} onChange={(e) => set("fromEmail", e.target.value)} placeholder="noreply@example.com" />
          </Field>
          <Field label="Reply-To Email" className="md:col-span-2">
            <Input value={form.replyTo} onChange={(e) => set("replyTo", e.target.value)} placeholder="support@example.com" />
          </Field>

          {/* SMTP-type providers */}
          {isSmtpType && (
            <>
              <Field label="SMTP Host">
                <Input value={form.smtpHost} onChange={(e) => set("smtpHost", e.target.value)} placeholder={provider === "gmail" ? "smtp.gmail.com" : provider === "m365" ? "smtp.office365.com" : "smtp.example.com"} />
              </Field>
              <Field label="SMTP Port">
                <Input type="number" value={form.smtpPort} onChange={(e) => set("smtpPort", parseInt(e.target.value || "587", 10))} />
              </Field>
              <Field label="Encryption">
                <Select value={form.encryption} onValueChange={(v) => v && set("encryption", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="ssl">SSL</SelectItem>
                    <SelectItem value="tls">TLS</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Username">
                <Input value={form.smtpUsername} onChange={(e) => set("smtpUsername", e.target.value)} placeholder="user@example.com" />
              </Field>
              <Field label={provider === "gmail" ? "App Password" : "SMTP Password"} className="md:col-span-2">
                <div className="flex items-center gap-2">
                  <Input id="smtpPassword" type={showPw ? "text" : "password"} placeholder={form.smtpPasswordHas ? "•••••••• (saved — leave blank to keep)" : "Enter password"} />
                  <Button type="button" variant="outline" size="icon" onClick={() => setShowPw((s) => !s)}>
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {form.smtpPasswordHas && <p className="text-xs text-emerald-600 mt-1">A password is already stored. Leave blank to keep it.</p>}
              </Field>
            </>
          )}

          {/* SES extras */}
          {provider === "ses" && (
            <>
              <Field label="SES Region">
                <Input value={form.sesRegion} onChange={(e) => set("sesRegion", e.target.value)} placeholder="us-east-1" />
              </Field>
              <Field label="Configuration Set (optional)">
                <Input value={form.sesConfigSet} onChange={(e) => set("sesConfigSet", e.target.value)} />
              </Field>
              <div className="md:col-span-2 flex items-center gap-2">
                <Switch checked={form.sesSandbox} onCheckedChange={(v) => set("sesSandbox", v === true)} size="sm" />
                <Label className="font-normal text-sm">Sandbox mode (sends only to verified addresses)</Label>
              </div>
            </>
          )}

          {/* API-key providers: resend / mailgun / brevo */}
          {!isSmtpType && (
            <>
              <Field label="API Key" className="md:col-span-2">
                <div className="flex items-center gap-2">
                  <Input id="apiKey" type={showApiKey ? "text" : "password"} placeholder={form.apiKeyHas ? "•••••••• (saved — leave blank to keep)" : "Enter API key"} />
                  <Button type="button" variant="outline" size="icon" onClick={() => setShowApiKey((s) => !s)}>
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {form.apiKeyHas && <p className="text-xs text-emerald-600 mt-1">An API key is already stored. Leave blank to keep it.</p>}
              </Field>
              {(provider === "resend" || provider === "mailgun") && (
                <Field label="Sender Domain">
                  <Input value={form.apiDomain} onChange={(e) => set("apiDomain", e.target.value)} placeholder="example.com" />
                </Field>
              )}
              {provider === "mailgun" && (
                <Field label="Region">
                  <Select value={form.apiRegion} onValueChange={(v) => v && set("apiRegion", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="US">US</SelectItem>
                      <SelectItem value="EU">EU</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Common settings */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
        <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-slate-500">Common Settings & Limits</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Max Retry"><Input type="number" value={form.maxRetry} onChange={(e) => set("maxRetry", parseInt(e.target.value || "3", 10))} /></Field>
          <Field label="Retry Interval (min)"><Input type="number" value={form.retryIntervalMin} onChange={(e) => set("retryIntervalMin", parseInt(e.target.value || "5", 10))} /></Field>
          <Field label="Connection Timeout (sec)"><Input type="number" value={form.timeoutSec} onChange={(e) => set("timeoutSec", parseInt(e.target.value || "30", 10))} /></Field>
          <Field label="Daily Limit (blank = ∞)"><Input type="number" value={form.dailyLimit ?? ""} onChange={(e) => set("dailyLimit", e.target.value === "" ? null : parseInt(e.target.value, 10))} /></Field>
          <Field label="Max Emails / Minute"><Input type="number" value={form.perMinuteLimit ?? ""} onChange={(e) => set("perMinuteLimit", e.target.value === "" ? null : parseInt(e.target.value, 10))} /></Field>
        </CardContent>
      </Card>

      {/* Test email */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
        <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-slate-500 flex items-center gap-2"><Send className="h-4 w-4" /> Send Test Email</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Recipient Email"><Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" /></Field>
            <Field label="Subject"><Input value={testSubject} onChange={(e) => setTestSubject(e.target.value)} /></Field>
          </div>
          <Field label="Message (HTML)">
            <RichTextEditor value={testMessage} onChange={setTestMessage} />
          </Field>
          <div className="flex justify-end">
            <Button onClick={handleSendTest} disabled={isPending} className="bg-indigo-600 hover:bg-indigo-700">
              <Send className="h-4 w-4" /> {isPending ? "Sending…" : "Send Test Email"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Templates */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm uppercase tracking-wider text-slate-500 flex items-center gap-2"><FileText className="h-4 w-4" /> Email Templates</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSeed} disabled={isPending}>Seed Defaults</Button>
            <Button size="sm" onClick={openCreateTpl} className="bg-indigo-600 hover:bg-indigo-700"><Plus className="h-4 w-4" /> New</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                <TableHead className="px-4 text-xs uppercase">Name</TableHead>
                <TableHead className="px-4 text-xs uppercase">Key</TableHead>
                <TableHead className="px-4 text-xs uppercase">Subject</TableHead>
                <TableHead className="px-4 text-xs uppercase">Variables</TableHead>
                <TableHead className="px-4 text-xs uppercase text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No templates yet. Click &ldquo;Seed Defaults&rdquo; to load the starter set.</TableCell></TableRow>
              ) : (
                templates.map((t) => (
                  <TableRow key={t.id} className="border-b border-slate-100 dark:border-slate-800">
                    <TableCell className="px-4 py-3 font-medium text-slate-900 dark:text-white">{t.name}</TableCell>
                    <TableCell className="px-4 py-3 font-mono text-xs text-slate-500">{t.key}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 max-w-xs truncate">{t.subject || "—"}</TableCell>
                    <TableCell className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">{t.variables || "—"}</TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditTpl(t)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => handleDeleteTpl(t)} title="Delete"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Audit log */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
        <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-slate-500 flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Settings Audit Log</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                <TableHead className="px-4 text-xs uppercase">When</TableHead>
                <TableHead className="px-4 text-xs uppercase">Action</TableHead>
                <TableHead className="px-4 text-xs uppercase">Summary</TableHead>
                <TableHead className="px-4 text-xs uppercase">By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLogs.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-slate-500">No changes recorded yet.</TableCell></TableRow>
              ) : (
                auditLogs.map((a) => (
                  <TableRow key={a.id} className="border-b border-slate-100 dark:border-slate-800">
                    <TableCell className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap"><Clock className="h-3 w-3 inline mr-1" />{new Date(a.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="px-4 py-3"><Badge variant="secondary" className="text-[10px]">{a.action}</Badge></TableCell>
                    <TableCell className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{a.summary}</TableCell>
                    <TableCell className="px-4 py-3 text-xs text-slate-500">{a.userEmail}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Template editor dialog */}
      <Dialog open={tplOpen} onOpenChange={(o) => setTplOpen(o)}>
        <DialogContent className="max-w-2xl bg-white dark:bg-slate-950 rounded-2xl">
          <DialogHeader><DialogTitle>{editingTpl ? "Edit Template" : "New Email Template"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Template Key (unique)"><Input value={tplKey} onChange={(e) => setTplKey(e.target.value)} placeholder="DEPOSIT_RECEIVED" disabled={!!editingTpl} /></Field>
              <Field label="Display Name"><Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Deposit Received" /></Field>
            </div>
            <Field label="Subject"><Input value={tplSubject} onChange={(e) => setTplSubject(e.target.value)} placeholder="Deposit Received — ৳{{amount}}" /></Field>
            <Field label="Body (HTML)"><RichTextEditor value={tplBody} onChange={setTplBody} /></Field>
            <Field label="Available Variables (comma list, for reference)"><Input value={tplVariables} onChange={(e) => setTplVariables(e.target.value)} placeholder="memberName, amount, balance" /></Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setTplOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTpl} disabled={isPending} className="bg-indigo-600 hover:bg-indigo-700"><Save className="h-4 w-4" /> {isPending ? "Saving…" : "Save Template"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs uppercase tracking-wide text-slate-500">{label}</Label>
      {children}
    </div>
  )
}
