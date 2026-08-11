"use client"

import { useState, useTransition } from "react"
import {
  saveSmsSettings,
  sendTestSmsAction,
  saveTemplate,
  deleteTemplate,
  seedTemplatesAction,
} from "@/app/actions/messaging"
import { SMS_PROVIDERS, type SmsProvider } from "@/lib/sms/provider-metadata"
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import {
  MessageSquare,
  CheckCircle2,
  Eye,
  EyeOff,
  Send,
  Save,
  FileText,
  Plus,
  Pencil,
  Trash2,
  Clock,
  ShieldCheck,
} from "lucide-react"

interface SmsSettingsData {
  provider: SmsProvider
  isActive: boolean
  displayName: string
  bulksmsbdUrl: string
  bulksmsbdApiKeyHas: boolean
  bulksmsbdSender: string
  sendmysmsUrl: string
  sendmysmsUser: string
  sendmysmsKeyHas: boolean
  sslSender: string
  sslUrl: string
  sslTokenHas: boolean
  twilioSid: string
  twilioFrom: string
  twilioTokenHas: boolean
  customUrl: string
  customMethod: string
  customAuthType: string
  customAuthValueHas: boolean
  customBodyType: string
  customPhoneParam: string
  customMsgParam: string
  customSenderParam: string
  customApiKeyParam: string
  customSuccessField: string
  customSuccessValue: string
  countryCode: string
  phoneFormat: string
  urlEncode: boolean
  timeoutSec: number
  maxRetry: number
  dailyLimit: number | null
}

interface TemplateRow {
  id: string
  channel: string
  key: string
  name: string
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

export default function SmsSettingsClient({
  settings,
  templates,
  auditLogs,
}: {
  settings: SmsSettingsData
  templates: TemplateRow[]
  auditLogs: AuditRow[]
}) {
  const [isPending, startTransition] = useTransition()
  const [provider, setProvider] = useState<SmsProvider>(settings.provider)
  const [form, setForm] = useState<SmsSettingsData>(settings)
  const [showSecrets, setShowSecrets] = useState(false)

  const set = <K extends keyof SmsSettingsData>(k: K, v: SmsSettingsData[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const buildSaveFormData = () => {
    const fd = new FormData()
    fd.append("provider", provider)
    fd.append("isActive", form.isActive ? "true" : "false")
    fd.append("displayName", form.displayName)
    fd.append("bulksmsbdUrl", form.bulksmsbdUrl)
    fd.append("bulksmsbdSender", form.bulksmsbdSender)
    fd.append("sendmysmsUrl", form.sendmysmsUrl)
    fd.append("sendmysmsUser", form.sendmysmsUser)
    fd.append("sslSender", form.sslSender)
    fd.append("sslUrl", form.sslUrl)
    fd.append("twilioSid", form.twilioSid)
    fd.append("twilioFrom", form.twilioFrom)
    fd.append("customUrl", form.customUrl)
    fd.append("customMethod", form.customMethod)
    fd.append("customAuthType", form.customAuthType)
    fd.append("customBodyType", form.customBodyType)
    fd.append("customPhoneParam", form.customPhoneParam)
    fd.append("customMsgParam", form.customMsgParam)
    fd.append("customSenderParam", form.customSenderParam)
    fd.append("customApiKeyParam", form.customApiKeyParam)
    fd.append("customSuccessField", form.customSuccessField)
    fd.append("customSuccessValue", form.customSuccessValue)
    fd.append("countryCode", form.countryCode)
    fd.append("phoneFormat", form.phoneFormat)
    fd.append("urlEncode", form.urlEncode ? "true" : "false")
    fd.append("timeoutSec", String(form.timeoutSec))
    fd.append("maxRetry", String(form.maxRetry))
    fd.append("dailyLimit", form.dailyLimit === null ? "" : String(form.dailyLimit))
    return fd
  }

  const handleSave = () => {
    const fd = buildSaveFormData()
    const readField = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? ""
    fd.append("bulksmsbdApiKey", readField("bulksmsbdApiKey"))
    fd.append("sendmysmsKey", readField("sendmysmsKey"))
    fd.append("sslToken", readField("sslToken"))
    fd.append("twilioToken", readField("twilioToken"))
    fd.append("customAuthValue", readField("customAuthValue"))
    startTransition(async () => {
      try {
        await saveSmsSettings(fd)
        toast.success("SMS settings saved")
      } catch (e) {
        toast.error("Could not save", { description: e instanceof Error ? e.message : undefined })
      }
    })
  }

  // ── Test SMS ──
  const [testTo, setTestTo] = useState("")
  const [testMessage, setTestMessage] = useState("This is a test SMS from Future Savings Foundation.")

  const handleSendTest = () => {
    if (!testTo.trim()) return toast.error("Recipient number is required.")
    const fd = new FormData()
    fd.append("testTo", testTo)
    fd.append("testMessage", testMessage)
    startTransition(async () => {
      try {
        const r = await sendTestSmsAction(fd)
        if (r.ok) toast.success("SMS sent", { description: `${r.message} (${r.ms} ms)` })
        else toast.error("SMS failed", { description: r.message })
      } catch (e) {
        toast.error("SMS failed", { description: e instanceof Error ? e.message : undefined })
      }
    })
  }

  // ── Templates ──
  const [tplOpen, setTplOpen] = useState(false)
  const [editingTpl, setEditingTpl] = useState<TemplateRow | null>(null)
  const [tplKey, setTplKey] = useState("")
  const [tplName, setTplName] = useState("")
  const [tplBody, setTplBody] = useState("")
  const [tplVariables, setTplVariables] = useState("")

  const openCreateTpl = () => {
    setEditingTpl(null)
    setTplKey(""); setTplName(""); setTplBody(""); setTplVariables("")
    setTplOpen(true)
  }
  const openEditTpl = (t: TemplateRow) => {
    setEditingTpl(t)
    setTplKey(t.key); setTplName(t.name); setTplBody(t.body); setTplVariables(t.variables)
    setTplOpen(true)
  }
  const handleSaveTpl = () => {
    if (!tplKey.trim() || !tplBody.trim()) return toast.error("Key and body are required.")
    const fd = new FormData()
    if (editingTpl) fd.append("id", editingTpl.id)
    fd.append("channel", "SMS")
    fd.append("key", tplKey.trim())
    fd.append("name", tplName.trim() || tplKey.trim())
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
        await seedTemplatesAction("sms")
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
            <MessageSquare className="h-7 w-7 text-indigo-600" /> SMS Service API
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            Configure the SMS gateway. API keys and tokens are encrypted at rest; only the Super Admin can edit these.
          </p>
        </div>
        <Button onClick={handleSave} disabled={isPending} className="bg-indigo-600 hover:bg-indigo-700">
          <Save className="h-4 w-4" /> {isPending ? "Saving…" : "Save"}
        </Button>
      </div>

      {/* Provider picker */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider text-slate-500 flex items-center justify-between">
            <span>Gateway</span>
            <span className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v === true)} size="sm" />
              <span className="text-xs">{form.isActive ? "Enabled" : "Disabled"}</span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {SMS_PROVIDERS.map((p) => {
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
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Provider-specific fields */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
        <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-slate-500">{SMS_PROVIDERS.find((p) => p.value === provider)?.label} Configuration</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Display Name" className="md:col-span-2">
            <Input value={form.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder="Bulk SMS BD" />
          </Field>

          {provider === "bulksmsbd" && (
            <>
              <Field label="API URL"><Input value={form.bulksmsbdUrl} onChange={(e) => set("bulksmsbdUrl", e.target.value)} /></Field>
              <Field label="Sender ID"><Input value={form.bulksmsbdSender} onChange={(e) => set("bulksmsbdSender", e.target.value)} placeholder="8809617614064" /></Field>
              <Field label="API Key" className="md:col-span-2">
                <SecretInput id="bulksmsbdApiKey" has={form.bulksmsbdApiKeyHas} show={showSecrets} toggle={() => setShowSecrets((s) => !s)} />
              </Field>
            </>
          )}

          {provider === "sendmysms" && (
            <>
              <Field label="API Endpoint"><Input value={form.sendmysmsUrl} onChange={(e) => set("sendmysmsUrl", e.target.value)} /></Field>
              <Field label="Username"><Input value={form.sendmysmsUser} onChange={(e) => set("sendmysmsUser", e.target.value)} placeholder="finixmart" /></Field>
              <Field label="API Key" className="md:col-span-2">
                <SecretInput id="sendmysmsKey" has={form.sendmysmsKeyHas} show={showSecrets} toggle={() => setShowSecrets((s) => !s)} />
              </Field>
            </>
          )}

          {provider === "sslwireless" && (
            <>
              <Field label="Endpoint"><Input value={form.sslUrl} onChange={(e) => set("sslUrl", e.target.value)} /></Field>
              <Field label="Sender ID (SID)"><Input value={form.sslSender} onChange={(e) => set("sslSender", e.target.value)} /></Field>
              <Field label="API Token" className="md:col-span-2">
                <SecretInput id="sslToken" has={form.sslTokenHas} show={showSecrets} toggle={() => setShowSecrets((s) => !s)} />
              </Field>
            </>
          )}

          {provider === "twilio" && (
            <>
              <Field label="Account SID"><Input value={form.twilioSid} onChange={(e) => set("twilioSid", e.target.value)} placeholder="ACxxxxxxxxxxxxxxxx" /></Field>
              <Field label="From Number"><Input value={form.twilioFrom} onChange={(e) => set("twilioFrom", e.target.value)} placeholder="+1XXXXXXXXXX" /></Field>
              <Field label="Auth Token" className="md:col-span-2">
                <SecretInput id="twilioToken" has={form.twilioTokenHas} show={showSecrets} toggle={() => setShowSecrets((s) => !s)} />
              </Field>
            </>
          )}

          {provider === "custom" && (
            <>
              <Field label="API URL" className="md:col-span-2"><Input value={form.customUrl} onChange={(e) => set("customUrl", e.target.value)} placeholder="https://gateway.example.com/send" /></Field>
              <Field label="HTTP Method">
                <Select value={form.customMethod} onValueChange={(v) => v && set("customMethod", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="GET">GET</SelectItem><SelectItem value="POST">POST</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field label="Request Body Type">
                <Select value={form.customBodyType} onValueChange={(v) => v && set("customBodyType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="query">Query String</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="form">Form Data</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Authorization">
                <Select value={form.customAuthType} onValueChange={(v) => v && set("customAuthType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="bearer">Bearer Token</SelectItem>
                    <SelectItem value="basic">Basic Auth</SelectItem>
                    <SelectItem value="header">Custom Header</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Auth Value (token / user:pass / Header:Value)">
                <SecretInput id="customAuthValue" has={form.customAuthValueHas} show={showSecrets} toggle={() => setShowSecrets((s) => !s)} />
              </Field>
              <Field label="Phone Parameter"><Input value={form.customPhoneParam} onChange={(e) => set("customPhoneParam", e.target.value)} placeholder="to" /></Field>
              <Field label="Message Parameter"><Input value={form.customMsgParam} onChange={(e) => set("customMsgParam", e.target.value)} placeholder="message" /></Field>
              <Field label="Sender Parameter (optional)"><Input value={form.customSenderParam} onChange={(e) => set("customSenderParam", e.target.value)} placeholder="sender" /></Field>
              <Field label="API Key Parameter (optional)"><Input value={form.customApiKeyParam} onChange={(e) => set("customApiKeyParam", e.target.value)} placeholder="api_key" /></Field>
              <Field label="Success Field (optional JSON path)"><Input value={form.customSuccessField} onChange={(e) => set("customSuccessField", e.target.value)} placeholder="status" /></Field>
              <Field label="Success Value"><Input value={form.customSuccessValue} onChange={(e) => set("customSuccessValue", e.target.value)} placeholder="success" /></Field>
            </>
          )}
        </CardContent>
      </Card>

      {/* Common settings */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
        <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-slate-500">Common Settings</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Country Code"><Input value={form.countryCode} onChange={(e) => set("countryCode", e.target.value)} placeholder="+880" /></Field>
          <Field label="Phone Format"><Input value={form.phoneFormat} onChange={(e) => set("phoneFormat", e.target.value)} placeholder="88017XXXXXXXX" /></Field>
          <Field label="Request Timeout (sec)"><Input type="number" value={form.timeoutSec} onChange={(e) => set("timeoutSec", parseInt(e.target.value || "30", 10))} /></Field>
          <Field label="Max Retry"><Input type="number" value={form.maxRetry} onChange={(e) => set("maxRetry", parseInt(e.target.value || "3", 10))} /></Field>
          <Field label="Daily Limit (blank = ∞)"><Input type="number" value={form.dailyLimit ?? ""} onChange={(e) => set("dailyLimit", e.target.value === "" ? null : parseInt(e.target.value, 10))} /></Field>
          <div className="flex items-center gap-2 self-end pb-2">
            <Switch checked={form.urlEncode} onCheckedChange={(v) => set("urlEncode", v === true)} size="sm" />
            <Label className="font-normal text-sm">URL-encode message</Label>
          </div>
        </CardContent>
      </Card>

      {/* Test SMS */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
        <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-slate-500 flex items-center gap-2"><Send className="h-4 w-4" /> Send Test SMS</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Recipient Number"><Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="01XXXXXXXXX" /></Field>
            <Field label="Provider"><Input disabled value={SMS_PROVIDERS.find((p) => p.value === provider)?.label ?? ""} /></Field>
          </div>
          <Field label="Message"><Textarea value={testMessage} onChange={(e) => setTestMessage(e.target.value)} rows={3} /></Field>
          <div className="flex justify-end">
            <Button onClick={handleSendTest} disabled={isPending} className="bg-indigo-600 hover:bg-indigo-700">
              <Send className="h-4 w-4" /> {isPending ? "Sending…" : "Send Test SMS"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Templates */}
      <Card className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm uppercase tracking-wider text-slate-500 flex items-center gap-2"><FileText className="h-4 w-4" /> SMS Templates</CardTitle>
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
                <TableHead className="px-4 text-xs uppercase">Preview</TableHead>
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
                    <TableCell className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 max-w-sm truncate">{t.body}</TableCell>
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
          <DialogHeader><DialogTitle>{editingTpl ? "Edit SMS Template" : "New SMS Template"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Template Key (unique)"><Input value={tplKey} onChange={(e) => setTplKey(e.target.value)} placeholder="DEPOSIT_RECEIVED_SMS" disabled={!!editingTpl} /></Field>
              <Field label="Display Name"><Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Deposit Received" /></Field>
            </div>
            <Field label="Message Body"><Textarea value={tplBody} onChange={(e) => setTplBody(e.target.value)} rows={5} /></Field>
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

function SecretInput({ id, has, show, toggle }: { id: string; has: boolean; show: boolean; toggle: () => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Input id={id} type={show ? "text" : "password"} placeholder={has ? "•••••••• (saved — leave blank to keep)" : "Enter value"} />
        <Button type="button" variant="outline" size="icon" onClick={toggle}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
      {has && <p className="text-xs text-emerald-600">A value is already stored. Leave blank to keep it.</p>}
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
