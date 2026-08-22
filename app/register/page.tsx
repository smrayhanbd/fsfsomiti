import Link from "next/link"
import RegisterForm from "./RegisterForm"
import ThemeToggle from "@/components/ThemeToggle"
import { Button } from "@/components/ui/button"
import { Building2, ShieldCheck, Lock, Receipt, TrendingUp, FileText, Mail, Phone, MapPin } from "lucide-react"
import TrustRibbon from "@/components/somiti/TrustRibbon"
import OrgLogo from "@/components/somiti/OrgLogo"
import { getOrganization, orgAddressLine } from "@/lib/organization"

export const dynamic = "force-dynamic"

export default async function RegisterPage() {
  const org = await getOrganization()
  const address = orgAddressLine(org)
  const hasContactLine = Boolean(address || org.email || org.phone)

  return (
    <div className="relative flex min-h-screen flex-col bg-base">
      <TrustRibbon />

      <div className="flex min-h-[calc(100vh-3px)] flex-1 lg:flex-row">

      {/* Left Side: Marketing & Trust Info (sticky on Desktop) */}
      <div className="relative hidden w-1/4 flex-col justify-between overflow-hidden p-10 text-white lg:flex sticky top-0 h-screen">
        <div className="absolute inset-0 brand-gradient" />
        <div className="pointer-events-none absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_white,_transparent_70%)]" />

        <div className="relative z-10">
          <Link href="/" className="group mb-10 flex cursor-pointer items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white/20 backdrop-blur-md transition-transform group-hover:scale-105">
              <OrgLogo logo={org.logo} alt={org.name} className="h-full w-full object-cover">
                <Building2 className="h-6 w-6 text-white" />
              </OrgLogo>
            </div>
            <span className="t-h3">{org.name}</span>
          </Link>

          <h1 className="t-display mb-4">
            Secure Your Financial Future Today.
          </h1>
          <p className="t-body-lg text-white/85">
            Join our digital cooperative society. Manage your savings, track transactions, and build wealth together with trust and transparency.
          </p>
        </div>

        <div className="relative z-10 space-y-5">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-white/20 p-2 backdrop-blur-md"><ShieldCheck className="h-5 w-5" /></div>
            <div>
              <h3 className="t-subheading">Bank-Grade Security</h3>
              <p className="t-caption text-white/80">Your data and transactions are encrypted and securely stored.</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-white/20 p-2 backdrop-blur-md"><Receipt className="h-5 w-5" /></div>
            <div>
              <h3 className="t-subheading">Automated Receipts</h3>
              <p className="t-caption text-white/80">Instantly generate digital receipts for every collection and withdrawal.</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-white/20 p-2 backdrop-blur-md"><TrendingUp className="h-5 w-5" /></div>
            <div>
              <h3 className="t-subheading">Transparent Ledgers</h3>
              <p className="t-caption text-white/80">Access your personal portal 24/7 to view balances and history.</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 space-y-3">
          {hasContactLine && (
            <div className="space-y-1.5 border-t border-white/20 pt-4">
              {address && (
                <p className="flex items-start gap-2 t-caption text-white/80">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {address}
                </p>
              )}
              {org.email && (
                <a href={`mailto:${org.email}`} className="flex items-center gap-2 t-caption text-white/80 transition-colors hover:text-white">
                  <Mail className="h-3.5 w-3.5 shrink-0" /> {org.email}
                </a>
              )}
              {org.phone && (
                <a href={`tel:${org.phone}`} className="flex items-center gap-2 t-caption text-white/80 transition-colors hover:text-white">
                  <Phone className="h-3.5 w-3.5 shrink-0" /> {org.phone}
                </a>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Link href="/policy" className="group flex items-center gap-2 t-body text-white/80 transition-colors hover:text-white">
              <FileText className="h-4 w-4" />
              Somiti Policy &amp; Terms
              <span className="opacity-0 transition-opacity group-hover:opacity-100">→</span>
            </Link>
            <div className="t-caption flex items-center gap-2 text-white/70">
              <Lock className="h-3 w-3" /> Encrypted end-to-end · Bank-grade security
            </div>
          </div>
        </div>
      </div>

      {/* Right Side: Form (Scrollable) */}
      <div className="flex-1 bg-surface">
        <div className="mx-auto w-full max-w-7xl p-4 sm:p-8 lg:p-10">
          {/* Header with Title, Toggle, and Back Link */}
          <div className="mb-8 flex items-center justify-between gap-4">
            <div>
              <h2 className="t-h1 text-primary-ink">Member Application Form</h2>
              <p className="t-body mt-1 text-muted-ink">Please fill out all sections accurately. Your application will be reviewed by management.</p>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              {/* Desktop View (Text Link) */}
              <Link href="/login" className="hidden t-body font-medium text-brand hover:underline sm:block">Back to Login</Link>
              {/* Mobile View (Button) */}
              <Link href="/login" className="sm:hidden">
                <Button variant="outline" size="sm">Login</Button>
              </Link>
            </div>
          </div>

          <RegisterForm />
        </div>
      </div>
      </div>
    </div>
  )
}
