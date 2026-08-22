"use client"

/**
 * Bank Statement — member-portal client.
 *
 * The somiti fund's iBanking credentials live in a collapsible section
 * (collapsed by default) — members tap "Show credentials" to reveal the
 * URL / User ID / password with copy buttons and a masked password toggle.
 *
 * The bank's portal is reached through the same-origin relay
 * (/api/ibanking-proxy): the bank resets direct iframe connections
 * ("connection was reset" — its WAF refuses embedded requests) and serves
 * an incomplete TLS chain, both of which the relay handles. The PRIMARY
 * action opens the relayed portal in a new tab (the full login → statement
 * flow is verified working there); an embedded in-panel frame remains as a
 * secondary option, with Reload / New-tab recovery actions.
 */

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import {
  Landmark, ExternalLink, Eye, EyeOff, Copy, User, KeyRound, Link2,
  Info, ShieldAlert, ChevronDown, ChevronUp, RefreshCw, AppWindow,
} from "lucide-react"

import SectionCard from "@/components/somiti/SectionCard"

/** Same-origin relay that serves the bank portal to the embedded frame. */
const PROXY_PREFIX = "/api/ibanking-proxy"

export default function BankStatementClient({
  bankName,
  ibankingUrl,
  ibankingUserId,
  ibankingPassword,
  bankInstructions,
}: {
  bankName: string | null
  ibankingUrl: string | null
  ibankingUserId: string | null
  ibankingPassword: string
  bankInstructions: string | null
}) {
  const [showPw, setShowPw] = useState(false)
  const [showCreds, setShowCreds] = useState(false)
  const [embedOpen, setEmbedOpen] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)

  const copy = async (label: string, value: string) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${label} copied`)
    } catch {
      toast.error("Could not copy")
    }
  }

  const hasCreds = !!(ibankingUrl && ibankingUserId)

  const portalName = bankName ? `${bankName} iBanking portal` : "bank iBanking portal"

  // The embedded frame goes through our same-origin relay. If the configured
  // URL can't be parsed, fall back to the raw URL (direct embed, best effort).
  const embedSrc = (() => {
    if (!ibankingUrl) return null
    try {
      const u = new URL(ibankingUrl)
      return `${PROXY_PREFIX}${u.pathname}${u.search}`
    } catch {
      return ibankingUrl
    }
  })()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Bank Statement
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Log in to the somiti fund&apos;s iBanking portal to view the live bank statement.
        </p>
      </div>

      {/* Confidentiality banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-sm text-amber-800 dark:text-amber-200">
          These credentials are confidential to somiti members only. Please do not share them outside the somiti.
        </p>
      </div>

      {!hasCreds ? (
        <SectionCard title="iBanking Access" icon={<Landmark />} accent="emerald">
          <div className="py-10 text-center">
            <Landmark className="mx-auto mb-3 h-10 w-10 text-faint-ink" />
            <p className="t-body text-muted-ink">
              The management has not configured the bank iBanking details yet.
            </p>
            <p className="t-caption mt-1 text-faint-ink">
              Please check back later or contact the somiti committee.
            </p>
          </div>
        </SectionCard>
      ) : (
        <>
          {/* ── Credentials (collapsible, collapsed by default) ── */}
          <SectionCard
            title={bankName ? `${bankName} — iBanking Access` : "Bank iBanking Access"}
            icon={<Landmark />}
            accent="emerald"
            action={
              <Button variant="outline" size="sm" onClick={() => setShowCreds((s) => !s)}>
                {showCreds ? (
                  <>Hide <ChevronUp className="ml-1 h-4 w-4" /></>
                ) : (
                  <>Show <ChevronDown className="ml-1 h-4 w-4" /></>
                )}
              </Button>
            }
          >
            {/* grid-template-rows 0fr↔1fr transition — smooth height animation
                without measuring content in JS. */}
            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                showCreds ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                {/* grid-cols-1 base is REQUIRED: an implicit auto column is
                    content-sized and lets long values overflow the card. */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* iBanking URL */}
                  <div className="min-w-0 space-y-1.5 sm:col-span-2">
                    <label className="t-overline text-faint-ink">iBanking URL</label>
                    <div className="flex w-full min-w-0 items-center gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--border-base)] bg-inset px-3 py-2.5">
                        <Link2 className="h-4 w-4 shrink-0 text-faint-ink" />
                        <a
                          href={ibankingUrl!}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="min-w-0 truncate text-sm font-medium text-brand hover:underline"
                        >
                          {ibankingUrl}
                        </a>
                      </div>
                      <Button variant="outline" size="icon" className="shrink-0" onClick={() => copy("URL", ibankingUrl!)} aria-label="Copy URL">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* User ID */}
                  <div className="min-w-0 space-y-1.5">
                    <label className="t-overline text-faint-ink">User ID</label>
                    <div className="flex w-full min-w-0 items-center gap-2">
                      <div className="relative min-w-0 flex-1">
                        <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint-ink" />
                        <Input readOnly value={ibankingUserId ?? ""} className="bg-inset pl-9 font-mono" />
                      </div>
                      <Button variant="outline" size="icon" className="shrink-0" onClick={() => copy("User ID", ibankingUserId ?? "")} aria-label="Copy User ID">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Password */}
                  <div className="min-w-0 space-y-1.5">
                    <label className="t-overline text-faint-ink">Password</label>
                    <div className="flex w-full min-w-0 items-center gap-2">
                      <div className="relative min-w-0 flex-1">
                        <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint-ink" />
                        <Input
                          readOnly
                          type={showPw ? "text" : "password"}
                          value={ibankingPassword}
                          className="bg-inset pl-9 pr-9 font-mono"
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
                      <Button variant="outline" size="icon" className="shrink-0" onClick={() => copy("Password", ibankingPassword)} aria-label="Copy password">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {bankInstructions && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg bg-inset p-3 text-sm text-secondary-ink">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                    <p className="min-w-0">{bankInstructions}</p>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* ── iBanking Portal ──
              Loads on demand inside the member panel (top navbar stays
              visible) through the same-origin relay, so the bank cannot
              reset the connection for being embedded. The frame mounts only
              after the member taps "Open here"; Reload re-mounts it and the
              new-tab link is the guaranteed fallback. */}
          <SectionCard
            title="iBanking Portal"
            subtitle={embedOpen ? "Portal loaded inside your member panel" : "Open the portal without leaving your member panel"}
            icon={<Landmark />}
            accent="blue"
            action={
              <a
                href={embedSrc!}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 t-caption font-semibold text-brand hover:underline"
              >
                Open in new tab <ExternalLink className="h-3 w-3" />
              </a>
            }
          >
            {!embedOpen ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border-strong)] px-6 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
                  <AppWindow className="h-6 w-6" />
                </span>
                <p className="t-body text-secondary-ink">
                  Open the {portalName} — in a full browser tab, or right here in the panel.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {/* Primary: the proxied portal in a new tab — the full
                      login → statement flow is served through the somiti
                      server, so the bank cannot reset the connection. */}
                  <a href={embedSrc!} target="_blank" rel="noreferrer noopener">
                    <Button className="brand-gradient shadow-brand-glow">
                      <ExternalLink className="mr-2 h-4 w-4" /> Open Portal
                    </Button>
                  </a>
                  <Button variant="outline" onClick={() => setEmbedOpen(true)}>
                    <AppWindow className="mr-2 h-4 w-4" /> Open here instead
                  </Button>
                </div>
                <p className="t-caption max-w-md text-muted-ink">
                  Both options load through the somiti server, so the bank cannot block them.
                  The new tab is recommended — some banks restrict what can be done from inside
                  an embedded panel.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="t-caption text-muted-ink">
                    {portalName} — log in below.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setIframeKey((k) => k + 1)}>
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reload
                    </Button>
                    <a href={embedSrc!} target="_blank" rel="noreferrer noopener">
                      <Button variant="outline" size="sm">
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> New tab
                      </Button>
                    </a>
                  </div>
                </div>
                {/* key re-mounts the frame on Reload, bypassing a cached error page. */}
                <iframe
                  key={iframeKey}
                  src={embedSrc!}
                  title={`${portalName} — embedded`}
                  className="h-[70vh] min-h-[480px] w-full rounded-xl border border-[var(--border-base)] bg-white"
                />
                <p className="t-caption mt-2 flex items-start gap-1.5 text-muted-ink">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Bank security layers can stop the login step inside an embedded panel. If the
                  frame freezes or misbehaves, tap <span className="font-semibold">Reload</span>,
                  or use <span className="font-semibold">New tab</span> — the full statement flow
                  always works there.
                </p>
              </>
            )}
          </SectionCard>
        </>
      )}
    </div>
  )
}
