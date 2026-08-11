"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { Building2, ArrowLeft, Eye, EyeOff, ShieldCheck, Wallet, Users, Mail, Phone, MapPin } from "lucide-react"
import TrustRibbon from "@/components/somiti/TrustRibbon"
import ThemeToggle from "@/components/ThemeToggle"
import OrgLogo from "@/components/somiti/OrgLogo"
import type { OrgInfo } from "@/lib/organization"
import { orgAddressLine } from "@/lib/organization"
import { checkLoginRateLimit } from "@/app/actions/rateLimitActions"

export default function LoginClient({ org }: { org: OrgInfo }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const address = orgAddressLine(org)
  const hasContactLine = Boolean(address || org.email || org.phone)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    const formData = new FormData(e.currentTarget)
    const email = formData.get("email") as string
    const password = formData.get("password") as string

    // Pre-check the per-IP login rate limit BEFORE submitting to NextAuth.
    // The authoritative check still runs server-side inside `authorize()`,
    // so a user with JS disabled can't bypass this — it's just UX: fail
    // fast with a friendly "Too many attempts" message instead of letting
    // them submit and get a generic CredentialsSignin error.
    try {
      const rl = await checkLoginRateLimit()
      if (!rl.ok) {
        setError(
          rl.retryAfter
            ? `Too many attempts, try again in ${rl.retryAfter}.`
            : "Too many attempts, try again in a minute.",
        )
        setLoading(false)
        return
      }
    } catch {
      // If the rate-limit check itself errors (e.g. Redis hiccup), don't
      // block the login attempt — the server-side check still applies.
      // Just log and continue.
      // eslint-disable-next-line no-console
      console.warn("[login] rate-limit pre-check failed; continuing to auth")
    }

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    })

    if (res?.error) {
      setError("Invalid credentials. Please check your Email/Member ID and Password.")
      setLoading(false)
    } else if (res?.ok) {
      // Check if this is an MFA-pending session (step 1 of 2-factor login).
      // The credentials provider returns role="MFA_PENDING" when the user has
      // 2FA enabled; the session callback exposes `mfaPending: true`.
      try {
        const sessionRes = await fetch("/api/auth/session").then((r) => r.json())
        if (sessionRes?.mfaPending && sessionRes?.user?.id) {
          router.push(`/login/mfa?userId=${sessionRes.user.id}`)
          return
        }
      } catch {
        // Session fetch failed — proceed with normal redirect.
      }
      // The middleware (middleware.ts) routes to /dashboard (Admin) or /portal (Member)
      router.push("/dashboard")
      router.refresh()
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-base">
      <TrustRibbon />

      {/* Floating chrome controls (theme) */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        <ThemeToggle />
      </div>

      <div className="grid min-h-[calc(100vh-3px)] flex-1 lg:grid-cols-2">
        {/* Left — Brand hero */}
        <div className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
          {/* Ambient brand glows */}
          <div className="pointer-events-none absolute -left-20 top-1/4 h-96 w-96 rounded-full bg-brand opacity-[0.12] blur-[120px]" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 rounded-full bg-gold opacity-[0.08] blur-[120px]" />
          <div className="pointer-events-none absolute inset-0 bg-brand-gradient opacity-[0.04]" />

          <Link href="/" className="group relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl brand-gradient text-white shadow-brand-glow">
              <OrgLogo logo={org.logo} alt={org.name} className="h-full w-full object-cover">
                <Building2 className="h-6 w-6" />
              </OrgLogo>
            </div>
            <span className="t-h3 text-primary-ink">{org.name}</span>
          </Link>

          <div className="relative mx-auto max-w-md">
            <p className="t-overline mb-4 text-brand">{org.tagline || "Enterprise Somiti Management"}</p>
            <h1 className="t-display text-primary-ink">
              Trust your money to a system built for <span className="text-brand-gradient">transparency</span>.
            </h1>
            <p className="t-body-lg mt-5 text-secondary-ink">
              Securely manage members, track savings, disburse loans, and view real-time
              financial reports — all from one cooperative-grade platform.
            </p>

            <div className="mt-10 space-y-3">
              <Feature icon={ShieldCheck} title="Bank-grade security" desc="Role-based access, KYC, and a full maker–checker audit trail." />
              <Feature icon={Wallet} title="Real-time ledgers" desc="Double-entry accounting with instant financial statements." />
              <Feature icon={Users} title="Admin & member portal" desc="Cashier dashboard and a self-service member experience." />
            </div>

            {hasContactLine && (
              <div className="mt-10 space-y-1.5 border-t border-[var(--border-base)] pt-6">
                {address && (
                  <p className="flex items-center gap-2 t-caption text-muted-ink">
                    <MapPin className="h-3.5 w-3.5 shrink-0" /> {address}
                  </p>
                )}
                {org.email && (
                  <a href={`mailto:${org.email}`} className="flex items-center gap-2 t-caption text-muted-ink transition-colors hover:text-primary-ink">
                    <Mail className="h-3.5 w-3.5 shrink-0" /> {org.email}
                  </a>
                )}
                {org.phone && (
                  <a href={`tel:${org.phone}`} className="flex items-center gap-2 t-caption text-muted-ink transition-colors hover:text-primary-ink">
                    <Phone className="h-3.5 w-3.5 shrink-0" /> {org.phone}
                  </a>
                )}
              </div>
            )}
          </div>

          <p className="relative t-caption text-faint-ink">© {new Date().getFullYear()} {org.name}</p>
        </div>

        {/* Right — Form */}
        <div className="flex items-center justify-center bg-surface p-6 lg:p-12">
          <div className="w-full max-w-sm">
            <div className="mb-6 lg:hidden">
              <Link href="/" className="inline-flex items-center gap-2 text-secondary-ink transition-colors hover:text-primary-ink">
                <ArrowLeft className="h-4 w-4" /> Back to Home
              </Link>
            </div>

            <div className="mb-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl brand-gradient text-white shadow-brand-glow lg:hidden">
                <OrgLogo logo={org.logo} alt={org.name} className="h-full w-full object-cover">
                  <Building2 className="h-6 w-6" />
                </OrgLogo>
              </div>
              <h2 className="t-h1 text-primary-ink">Sign in</h2>
              <p className="t-body mt-1.5 text-muted-ink">Enter your credentials to access your account</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-debit bg-debit-soft p-3 t-body text-debit">
                  <EyeOff className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email" className="t-subheading text-secondary-ink">Email or Member ID</Label>
                <Input
                  id="email"
                  name="email"
                  type="text"
                  placeholder="Email or Member ID"
                  required
                  autoFocus
                  className="h-11 rounded-xl bg-[var(--control-bg)]"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="t-subheading text-secondary-ink">Password</Label>
                  <Link href="/forgot-password" className="t-caption font-semibold text-brand hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    className="h-11 rounded-xl bg-[var(--control-bg)] pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-ink transition-colors hover:text-primary-ink"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="brand-gradient h-11 w-full rounded-xl text-[15px] font-semibold shadow-brand-glow disabled:opacity-60"
              >
                {loading ? "Signing in…" : "Sign In"}
              </Button>
            </form>

            <div className="mt-8 text-center t-body text-muted-ink">
              Are you a new member?{" "}
              <Link href="/register" className="font-semibold text-brand hover:underline">
                Register for an account
              </Link>
            </div>

            <div className="mt-6 hidden text-center lg:block">
              <Link href="/" className="t-caption text-faint-ink transition-colors hover:text-secondary-ink">
                ← Back to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Feature({ icon: Icon, title, desc }: { icon: typeof ShieldCheck; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="t-subheading text-primary-ink">{title}</p>
        <p className="t-caption text-muted-ink">{desc}</p>
      </div>
    </div>
  )
}
