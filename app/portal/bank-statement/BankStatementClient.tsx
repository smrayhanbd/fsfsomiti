"use client"

/**
 * Bank Statement — member-portal client.
 *
 * Displays the somiti fund's iBanking credentials so the member can log in to
 * the bank portal. The password is shown masked by default with a copy button
 * and an eye toggle; a prominent "Open iBanking Portal" button launches the
 * bank's site in a new tab.
 */

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import {
  Landmark, ExternalLink, Eye, EyeOff, Copy, User, KeyRound, Link2,
  Info, ShieldAlert,
} from "lucide-react"

import SectionCard from "@/components/somiti/SectionCard"

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
          <SectionCard
            title={bankName ? `${bankName} — iBanking Access` : "Bank iBanking Access"}
            icon={<Landmark />}
            accent="emerald"
            action={
              <a href={ibankingUrl!} target="_blank" rel="noreferrer noopener">
                <Button className="brand-gradient shadow-brand-glow">
                  <ExternalLink className="mr-2 h-4 w-4" /> Open iBanking Portal
                </Button>
              </a>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {/* iBanking URL */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="t-overline text-faint-ink">iBanking URL</label>
                <div className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--border-base)] bg-inset px-3 py-2.5">
                    <Link2 className="h-4 w-4 shrink-0 text-faint-ink" />
                    <a
                      href={ibankingUrl!}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="truncate text-sm font-medium text-brand hover:underline"
                    >
                      {ibankingUrl}
                    </a>
                  </div>
                  <Button variant="outline" size="icon" onClick={() => copy("URL", ibankingUrl!)} aria-label="Copy URL">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* User ID */}
              <div className="space-y-1.5">
                <label className="t-overline text-faint-ink">User ID</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint-ink" />
                    <Input readOnly value={ibankingUserId ?? ""} className="bg-inset pl-9 font-mono" />
                  </div>
                  <Button variant="outline" size="icon" onClick={() => copy("User ID", ibankingUserId ?? "")} aria-label="Copy User ID">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="t-overline text-faint-ink">Password</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
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
                  <Button variant="outline" size="icon" onClick={() => copy("Password", ibankingPassword)} aria-label="Copy password">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {bankInstructions && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-inset p-3 text-sm text-secondary-ink">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                <p>{bankInstructions}</p>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  )
}
