"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Building2, ShieldCheck, TrendingUp, Receipt, ArrowRight, CheckCircle2,
  Lock, Sparkles, ChevronDown, Users, Mail, Phone, Globe, MapPin, Menu,
  Vote, FileText, Wallet, BellRing, MessageCircle, HandCoins, Home,
  PiggyBank, Briefcase, Rocket, HeartHandshake, Landmark, BadgeCheck,
  KeyRound, Cpu, Eye, Banknote, Smartphone, Monitor, ArrowDownToLine,
} from "lucide-react"
import { useMounted } from "@/lib/useMounted"
import { useTheme } from "next-themes"
import { Sun, Moon } from "lucide-react"
import TrustRibbon from "@/components/somiti/TrustRibbon"
import OrgLogo from "@/components/somiti/OrgLogo"
import type { OrgInfo } from "@/lib/organization"
import { orgAddressLine } from "@/lib/organization"

/** Landing-page content item rendered in the facilities/projects/etc. lists. */
interface LandingContentItem {
  title?: string
  name?: string
  role?: string
  status?: string
  date?: string
  description?: string
  bio?: string
  photoUrl?: string
  icon?: string
  step?: string | number
  [key: string]: unknown
}

/** Stat strip item. */
interface StatItem {
  value?: string | number
  label?: string
  suffix?: string
}

/** One downloadable platform (Android APK / Windows EXE). */
export interface SoftwarePlatform {
  url?: string | null
  version?: string | null
  sizeBytes?: number | null
  updatedAt?: string | Date | null
}

/** Shape of the SiteContent document consumed by the landing page. */
export interface LandingContent {
  heroTitle?: string
  heroSubtitle?: string
  heroBadge?: string | null
  heroCtaPrimary?: string | null
  heroCtaSecondary?: string | null
  aboutTitle?: string
  aboutContent?: string
  visionTitle?: string
  visionContent?: string
  /** 7 community pillars */
  whyJoinUs?: LandingContentItem[]
  /** Member-portal transparency features */
  howWeRun?: LandingContentItem[]
  /** Numbered onboarding steps */
  howItWorks?: LandingContentItem[]
  /** Top-of-page stat strip */
  stats?: StatItem[]
  facilities?: LandingContentItem[]
  management?: LandingContentItem[]
  projects?: LandingContentItem[]
  activities?: LandingContentItem[]
  /** Download Software section (hidden until an installer URL exists) */
  softwareTitle?: string | null
  softwareDescription?: string | null
  androidApp?: SoftwarePlatform | null
  windowsApp?: SoftwarePlatform | null
}

/* ------------------------------------------------------------------ *
 * Icon registry — lets admins pick an icon by name (string) without
 * needing to ship React components through the database. Add new
 * icons here as needed.
 * ------------------------------------------------------------------ */
const ICON_REGISTRY: Record<string, React.ComponentType<{ className?: string }>> = {
  Building2, ShieldCheck, TrendingUp, Receipt, Users, Vote, FileText, Wallet,
  BellRing, MessageCircle, HandCoins, Home, PiggyBank, Briefcase, Rocket,
  HeartHandshake, Landmark, BadgeCheck, KeyRound, Cpu, Eye, Banknote,
  Lock, Sparkles, CheckCircle2,
}
function NamedIcon({ name, className }: { name?: string; className?: string }) {
  const Cmp = (name && ICON_REGISTRY[name]) || CheckCircle2
  return <Cmp className={className} />
}

// Staggered reveal variants — kept subtle (≤2 micro-interactions per screen).
const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
}
const item = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] as const } },
}

function ThemeButton() {
  const mounted = useMounted()
  const { theme, setTheme } = useTheme()
  if (!mounted) return null
  return (
    <button
      aria-label="Toggle theme"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-secondary-ink transition-colors hover:bg-subtle hover:text-primary-ink"
    >
      {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  )
}

/* ------------------------------------------------------------------ *
 * Download card — one platform (Android APK / Windows EXE) in the
 * "Download Software" section. Rendered only when the admin has
 * uploaded that platform's installer from the site-content settings.
 * ------------------------------------------------------------------ */
function DownloadCard({
  platform,
  fileLabel,
  fileBase,
  ext,
  url,
  version,
  sizeBytes,
  updatedAt,
  icon: Icon,
  iconClass,
}: {
  platform: string
  fileLabel: string
  fileBase: string
  ext: string
  url: string
  version?: string | null
  sizeBytes?: number | null
  updatedAt?: string | Date | null
  icon: React.ComponentType<{ className?: string }>
  iconClass: string
}) {
  const size =
    sizeBytes && sizeBytes > 0
      ? sizeBytes / (1024 * 1024) >= 1
        ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(sizeBytes / 1024))} KB`
      : null
  const updated = updatedAt ? new Date(updatedAt).toLocaleDateString() : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: false, amount: 0.3 }}
      transition={{ duration: 0.5 }}
      className="card-premium card-premium-hover w-full max-w-sm p-6 text-center sm:p-8"
    >
      <div className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl ${iconClass}`}>
        <Icon className="h-8 w-8" />
      </div>
      <h3 className="t-h2 text-primary-ink">{platform}</h3>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 t-caption text-muted-ink">
        {version && (
          <span className="rounded-full bg-brand-gradient-soft px-2.5 py-0.5 font-bold text-brand">{version}</span>
        )}
        {size && <span>{size}</span>}
        {updated && <span>· Updated {updated}</span>}
      </div>
      <a href={url} download className="mt-6 block no-underline hover:no-underline">
        <Button size="lg" className="brand-gradient h-12 w-full text-base shadow-brand-glow">
          <ArrowDownToLine className="mr-2 h-5 w-5" /> Download {fileLabel}
        </Button>
      </a>
      <p className="mt-3 t-caption text-muted-ink">
        Free download · {fileLabel} file · saves as {fileBase}.{ext}
      </p>
    </motion.div>
  )
}

export default function LandingPageClient({ content, org }: { content: LandingContent, org: OrgInfo }) {
  const address = orgAddressLine(org)
  const hasContact = Boolean(address || org.email || org.phone || org.website || org.facebook || org.whatsapp || org.youtube)

  // --- Defaults: if the admin hasn't populated a section, fall back to a
  // sensible curated list so the page is never empty. These are the same
  // defaults used by app/page.tsx but kept here so re-renders stay stable.
  const heroBadge = content.heroBadge || "Next-Gen Cooperative Management"
  const heroCtaPrimary = content.heroCtaPrimary || "Become a Member"
  const heroCtaSecondary = content.heroCtaSecondary || "Member Login"

  const stats: StatItem[] = (content.stats && content.stats.length)
    ? content.stats
    : [
        { value: "500+", label: "Active Members" },
        { value: "৳12 Cr+", label: "Total Deposits" },
        { value: "120+", label: "Loans Disbursed" },
        { value: "99.9%", label: "Uptime" },
      ]

  const pillars: LandingContentItem[] = (content.whyJoinUs && content.whyJoinUs.length)
    ? content.whyJoinUs
    : [
        { icon: "Users", title: "Community Growth", description: "A trusted circle of like-minded members pooling resources, sharing knowledge, and growing together — one cooperative decision at a time." },
        { icon: "PiggyBank", title: "Together Fund Growth", description: "Our collective fund compounds month after month, generating returns that flow back to every member through dividends and profit-sharing." },
        { icon: "Home", title: "Dream House Building", description: "Member-driven housing plans turn the dream of owning a home into a realistic, achievable milestone — backed by the community, not the bank." },
        { icon: "HandCoins", title: "Member-to-Member Loans", description: "Solve urgent financial needs with low-interest loans funded by the somiti itself. Fair terms, transparent repayment schedules, no hidden charges." },
        { icon: "Rocket", title: "Business Growth Together", description: "Capital, mentorship, and a built-in customer base — members lift each other's ventures through coordinated investment and referral networks." },
        { icon: "Briefcase", title: "Investments & Projects", description: "Curated, vetted investment opportunities in land, agriculture, and small businesses — accessible to every member at transparent valuations." },
        { icon: "HeartHandshake", title: "Helping People in Need", description: "A portion of our fund supports members and families facing hardship — medical bills, education, emergencies — no questions asked, no interest charged." },
      ]

  const portalFeatures: LandingContentItem[] = (content.howWeRun && content.howWeRun.length)
    ? content.howWeRun
    : [
        { icon: "FileText", title: "Bank Statements, Anytime", description: "View real-time somiti bank statements directly from your member portal. Every deposit, withdrawal, and charge is auditable 24/7." },
        { icon: "Receipt", title: "Read Meeting Minutes", description: "Every general meeting and committee decision is published as minutes in the portal — searchable, dated, and signed off by the secretary." },
        { icon: "Wallet", title: "Withdrawal Requests", description: "Submit and track withdrawal requests from your phone. Multi-level approval workflow keeps funds safe and auditable." },
        { icon: "BellRing", title: "SMS & Email Alerts", description: "Get instant SMS and email notifications on every deposit, withdrawal, due date, and approval — never miss a transaction." },
        { icon: "MessageCircle", title: "WhatsApp Community", description: "Join our large, active WhatsApp community for daily updates, support, and discussions with fellow members and the management team." },
        { icon: "Vote", title: "Vote in Elections", description: "Management is elected by you. Cast your vote on candidates, motions, and policy changes — securely, from your own portal, anytime." },
      ]

  const howItWorks: LandingContentItem[] = (content.howItWorks && content.howItWorks.length)
    ? content.howItWorks
    : [
        { step: 1, title: "Register Online", description: "Submit your application, KYC documents, and nominee details through the secure registration portal." },
        { step: 2, title: "Get Approved", description: "Our committee reviews your application. Approved members receive login credentials and a member ID." },
        { step: 3, title: "Start Saving", description: "Choose your savings plan and begin monthly deposits. Watch your balance grow with real-time updates." },
        { step: 4, title: "Vote & Withdraw", description: "Participate in elections, request withdrawals, apply for loans — all from your member portal." },
        { step: 5, title: "Grow Together", description: "Earn dividends, access community-funded loans, and help your somiti build wealth for everyone." },
      ]

  return (
    <div className="relative min-h-screen bg-base text-primary-ink transition-colors duration-300">
      <TrustRibbon />

      {/* ─── Navbar ─── */}
      <header className="glass sticky top-0 z-50 w-full">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="group flex min-w-0 shrink-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl brand-gradient text-white shadow-brand-glow transition-transform group-hover:scale-105">
              <OrgLogo logo={org.logo} alt={org.name} className="h-full w-full object-cover">
                <Building2 className="h-5 w-5" />
              </OrgLogo>
            </div>
            <span className="truncate text-sm font-bold text-primary-ink sm:max-w-[160px] md:max-w-[240px] lg:max-w-[300px]" title={org.name}>{org.name}</span>
          </Link>

          {/* Desktop nav — only on lg+ where there's room for all links + buttons */}
          <nav className="hidden items-center gap-6 lg:flex">
            <Link href="#about" className="t-body whitespace-nowrap font-medium text-secondary-ink transition-colors hover:text-primary-ink">About Us</Link>
            <Link href="#pillars" className="t-body whitespace-nowrap font-medium text-secondary-ink transition-colors hover:text-primary-ink">What We Do</Link>
            <Link href="#portal" className="t-body whitespace-nowrap font-medium text-secondary-ink transition-colors hover:text-primary-ink">Transparency</Link>
            <Link href="#management" className="t-body whitespace-nowrap font-medium text-secondary-ink transition-colors hover:text-primary-ink">Management</Link>
            <Link href="#activities" className="t-body whitespace-nowrap font-medium text-secondary-ink transition-colors hover:text-primary-ink">Activities</Link>
            <Link href="#download" className="t-body whitespace-nowrap font-medium text-secondary-ink transition-colors hover:text-primary-ink">Download</Link>
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ThemeButton />

            {/* Desktop auth buttons — shown from sm so the row never overflows */}
            <div className="hidden items-center gap-2 sm:flex">
              <Link href="/login"><Button variant="ghost" className="t-body whitespace-nowrap font-medium">{heroCtaSecondary}</Button></Link>
              <Link href="/register">
                <Button className="brand-gradient shadow-brand-glow t-body whitespace-nowrap font-medium">
                  <span className="hidden md:hidden">{heroCtaPrimary}</span><span className="md:inline">Join Us</span> <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </Link>
            </div>

            {/* Mobile dropdown — covers both nav and auth below lg */}
            <div className="lg:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger className="brand-gradient inline-flex h-9 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-3 text-sm font-medium text-white shadow-brand-glow outline-none">
                  <Menu className="mr-1 h-4 w-4" /> Menu <ChevronDown className="ml-1 h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem render={<Link href="#about" className="flex w-full cursor-pointer items-center p-2" />}>About</DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="#pillars" className="flex w-full cursor-pointer items-center p-2" />}>What We Do</DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="#portal" className="flex w-full cursor-pointer items-center p-2" />}>Member Portal</DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="#management" className="flex w-full cursor-pointer items-center p-2" />}>Management</DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="#activities" className="flex w-full cursor-pointer items-center p-2" />}>Activities</DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="#download" className="flex w-full cursor-pointer items-center p-2" />}>Download App</DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/policy" className="flex w-full cursor-pointer items-center p-2" />}>Policy</DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/login" className="flex w-full cursor-pointer items-center p-2" />}>Login</DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/register" className="flex w-full cursor-pointer items-center p-2" />}>Register</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden">
        {/* Ambient brand aurora glows */}
        <div className="pointer-events-none absolute inset-0 bg-brand-gradient opacity-[0.05]" />
        <div className="aurora-glow" style={{ background: "var(--brand-primary)", top: "-100px", left: "10%", width: "420px", height: "420px" }} />
        <div className="aurora-glow" style={{ background: "var(--brand-violet)", top: "40px", right: "5%", width: "360px", height: "360px", animationDelay: "3s" }} />
        <div className="aurora-glow" style={{ background: "var(--brand-gold)", bottom: "-80px", left: "40%", width: "320px", height: "320px", animationDelay: "6s" }} />

        <div className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-20 md:py-28 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
            {/* Left: copy + CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--border-base)] bg-surface px-3 py-1.5 t-body font-medium text-brand shadow-sm sm:mb-6 sm:px-4">
                <Sparkles className="h-4 w-4" /> {heroBadge}
              </div>
              <h1 className="t-display-xl text-primary-ink break-words">
                {content.heroTitle ? (
                  <span dangerouslySetInnerHTML={{ __html: content.heroTitle }} />
                ) : (
                  <>Save smarter. <span className="text-shimmer">Grow together.</span> Borrow fairly.</>
                )}
              </h1>
              {content.heroSubtitle && (
                <div className="prose prose-lg mt-4 max-w-none text-lg leading-relaxed text-justify text-secondary-ink dark:prose-invert sm:mt-6" dangerouslySetInnerHTML={{ __html: content.heroSubtitle }} />
              )}
              <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:mt-10">
                <Link href="/register">
                  <Button size="lg" className="brand-gradient h-12 w-full px-6 text-base shadow-brand-glow sm:w-auto sm:px-8">
     {/*               {heroCtaPrimary} <ArrowRight className="ml-2 h-5 w-5" />  */}
                    <span className="hidden md:inline">{heroCtaPrimary}</span><span className="md:hidden">Become a Member</span> <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/login">
                  <Button size="lg" variant="outline" className="h-12 w-full bg-surface px-6 text-base shadow-sm sm:w-auto sm:px-8">
                    <Lock className="mr-2 h-4 w-4" /> {heroCtaSecondary}
                  </Button>
                </Link>
              </div>

              {/* Trust indicators under CTAs */}
              <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 t-caption text-muted-ink sm:mt-8 sm:gap-x-6">
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" /> Bank-Grade Security</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" /> 100% Transparent Ledger</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" /> SMS + Email Alerts</span>
              </div>
            </motion.div>

            {/* Right: floating hero card mockup (decorative portal preview) */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.15 }}
              className="relative hidden lg:block"
            >
              <div className="float-y relative">
                <div className="card-premium shadow-pop overflow-hidden p-6">
                  {/* mock browser bar */}
                  <div className="mb-4 flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--status-debit)]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--status-warning)]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--status-success)]" />
                    <span className="ml-3 t-caption text-muted-ink">members.future-savings.org</span>
                  </div>

                  {/* mock balance card */}
                  <div className="brand-gradient relative overflow-hidden rounded-xl p-5 text-white shadow-brand-glow">
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.25),_transparent_60%)]" />
                    <p className="relative t-caption uppercase tracking-wider text-white/80">Total Savings</p>
                    <p className="relative mt-1 text-3xl font-bold t-num">৳ 4,82,500</p>
                    <div className="relative mt-3 flex items-center justify-between t-caption text-white/80">
                      <span>Member #FS-0247</span>
                      <span className="flex items-center gap-1 text-emerald-200"><TrendingUp className="h-3 w-3" /> +12.4% YTD</span>
                    </div>
                  </div>

                  {/* mock quick actions */}
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[
                      { icon: Wallet, label: "Withdraw" },
                      { icon: Vote, label: "Vote" },
                      { icon: FileText, label: "Statements" },
                    ].map((a, i) => (
                      <div key={i} className="rounded-lg border border-[var(--border-base)] bg-subtle/40 p-3 text-center">
                        <a.icon className="mx-auto h-4 w-4 text-brand" />
                        <p className="mt-1 t-caption text-secondary-ink">{a.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* mock notifications */}
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 rounded-lg border border-[var(--border-base)] bg-surface p-2.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-success-soft text-success"><CheckCircle2 className="h-4 w-4" /></span>
                      <div className="flex-1">
                        <p className="t-caption font-medium text-primary-ink">Deposit confirmed</p>
                        <p className="text-[11px] text-muted-ink">৳ 5,000 • 2 min ago</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-[var(--border-base)] bg-surface p-2.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-info-soft text-info"><BellRing className="h-4 w-4" /></span>
                      <div className="flex-1">
                        <p className="t-caption font-medium text-primary-ink">Election open: Vote now</p>
                        <p className="text-[11px] text-muted-ink">Closes in 2 days</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* floating badge: 256-bit */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5, duration: 0.5 }}
                  className="card-premium absolute -right-4 -top-4 flex items-center gap-2 px-3 py-2 shadow-pop"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient-soft text-brand"><KeyRound className="h-4 w-4" /></span>
                  <div>
                    <p className="t-caption font-bold text-primary-ink">256-bit</p>
                    <p className="text-[10px] text-muted-ink">Encrypted</p>
                  </div>
                </motion.div>

                {/* floating badge: members */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7, duration: 0.5 }}
                  className="card-premium absolute -left-6 bottom-12 flex items-center gap-2 px-3 py-2 shadow-pop"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success-soft text-success"><Users className="h-4 w-4" /></span>
                  <div>
                    <p className="t-caption font-bold text-primary-ink">500+ members</p>
                    <p className="text-[10px] text-muted-ink">Trusted community</p>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── Stats strip ─── */}
      {stats.length > 0 && (
        <section className="relative overflow-hidden border-y border-[var(--border-base)] py-12">
        <div className="pointer-events-none absolute inset-0 brand-gradient opacity-[0.04]" />
        <div className="pointer-events-none absolute top-0 left-1/2 h-32 w-2/3 -translate-x-1/2 rounded-full bg-brand-gradient opacity-[0.08] blur-2xl" />
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              {stats.map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: false, amount: 0.3 }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  className="text-center"
                >
                  <p className="t-display text-brand-gradient">
                    {s.value}{s.suffix || ""}
                  </p>
                  <p className="mt-1 t-body font-medium text-secondary-ink">{s.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── About Us + Vision (side by side) ─── */}
      <section id="about" className="section-tint-blue relative overflow-hidden py-12 sm:py-20 lg:py-24">
        <span id="vision" className="absolute -top-16" />
        <div className="pointer-events-none absolute top-20 right-0 h-96 w-96 rounded-full bg-[var(--brand-gold)] opacity-[0.08] blur-3xl" />
        <div className="pointer-events-none absolute bottom-10 left-10 h-72 w-72 rounded-full bg-[#3b82f6] opacity-[0.06] blur-3xl" />
        <div className="mx-auto grid max-w-7xl items-start gap-8 px-4 sm:gap-12 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: false, amount: 0.2 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <p className="t-overline mb-3 text-brand">About Us</p>
            <h2 className="t-display mb-6 text-primary-ink">
              {content.aboutTitle || "A cooperative built on trust, transparency, and shared growth"}
            </h2>
            {content.aboutContent && (
              <div className="prose prose-lg max-w-none text-justify text-secondary-ink dark:prose-invert" dangerouslySetInnerHTML={{ __html: content.aboutContent }} />
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: false, amount: 0.2 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <div className="card-premium h-full overflow-hidden p-8">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl brand-gradient text-white shadow-brand-glow">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <p className="t-overline mb-2 text-brand">Our Vision</p>
              <h3 className="t-h2 mb-4 text-primary-ink">
                {content.visionTitle || "Our Vision & Mission"}
              </h3>
              {content.visionContent ? (
                <div className="prose prose-lg max-w-none text-justify text-secondary-ink dark:prose-invert" dangerouslySetInnerHTML={{ __html: content.visionContent }} />
              ) : (
                <p className="t-body-lg text-justify text-muted-ink">
                  To build a financially resilient community where every member has access to transparent,
                  fair, and modern financial services — fostering growth, dignity, and prosperity for all.
                </p>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Pillars / What We Do ─── */}
      <section id="pillars" className="section-tint-blue-rev relative overflow-hidden py-12 sm:py-20 lg:py-24">
        <div className="pointer-events-none absolute -top-20 right-10 h-72 w-72 rounded-full bg-[#3b82f6] opacity-[0.08] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-10 h-72 w-72 rounded-full bg-[#8b5cf6] opacity-[0.07] blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="mx-auto mb-8 max-w-2xl text-center sm:mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.3 }}
            transition={{ duration: 0.5 }}
          >
            <p className="t-overline mb-3 text-brand">What We Do</p>
            <h2 className="t-display mb-4 text-primary-ink">Seven pillars. One community.</h2>
            <p className="t-body-lg text-justify text-muted-ink">
              Our somiti exists to grow wealth, solve financial needs, and lift every member — together.
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
            variants={container}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: false, amount: 0.1 }}
          >
            {pillars.map((p, i) => (
              <motion.div
                key={i}
                variants={item}
                className="card-premium card-premium-hover group relative h-full overflow-hidden p-5 sm:p-7"
              >
                {/* corner number */}
                <span className="absolute right-5 top-4 t-display text-[var(--bg-subtle)] opacity-80 select-none">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient-soft text-brand transition-transform group-hover:scale-110">
                  <NamedIcon name={p.icon} className="h-7 w-7" />
                </div>
                <h3 className="t-h3 mb-2 text-primary-ink">{p.title}</h3>
                {p.description && (
                  <div className="prose max-w-none t-body text-justify text-muted-ink dark:prose-invert" dangerouslySetInnerHTML={{ __html: p.description }} />
                )}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── Member Portal Features ─── */}
      <section id="portal" className="section-tint-peach relative overflow-hidden py-12 sm:py-20 lg:py-24">
        <div className="pointer-events-none absolute top-0 left-1/2 h-px w-2/3 -translate-x-1/2 bg-[linear-gradient(90deg,transparent,#f59e0b,transparent)] opacity-40" />
        <div className="pointer-events-none absolute top-1/4 right-0 h-72 w-72 rounded-full bg-[#fb923c] opacity-[0.08] blur-3xl" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="mx-auto mb-8 max-w-2xl text-center sm:mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.3 }}
            transition={{ duration: 0.5 }}
          >
            <p className="t-overline mb-3 text-brand">Your Member Portal</p>
            <h2 className="t-display mb-4 text-primary-ink">Everything you need, in one secure portal</h2>
            <p className="t-body-lg text-justify text-muted-ink">
              Total transparency. Real-time control. From your phone, your laptop, anywhere.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {portalFeatures.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false, amount: 0.2 }}
                transition={{ duration: 0.4, delay: (i % 3) * 0.05 }}
                className="card-premium card-premium-hover flex h-full items-start gap-4 p-4 sm:p-6"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
                  <NamedIcon name={f.icon} className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="t-h3 mb-2 text-primary-ink">{f.title}</h3>
                  {f.description && (
                    <div className="prose max-w-none t-body text-justify text-muted-ink dark:prose-invert" dangerouslySetInnerHTML={{ __html: f.description }} />
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {/* CTA under portal features */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.3 }}
            transition={{ duration: 0.5 }}
            className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link href="/register">
              <Button size="lg" className="brand-gradient h-12 px-8 text-base shadow-brand-glow">
                Open Your Portal <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="h-12 bg-surface px-8 text-base">Already a member? Login</Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ─── Download Software ─── */}
      {(content.androidApp?.url || content.windowsApp?.url) && (
        <section id="download" className="section-tint-blue relative overflow-hidden py-12 sm:py-20 lg:py-24">
          <div className="pointer-events-none absolute top-10 left-1/4 h-72 w-72 rounded-full bg-[var(--brand-primary)] opacity-[0.06] blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 right-1/4 h-72 w-72 rounded-full bg-[var(--brand-violet)] opacity-[0.06] blur-3xl" />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              className="mx-auto mb-8 max-w-2xl text-center sm:mb-14"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              // No `amount` threshold: the rich-text description can be taller
              // than the viewport, which would make a 0.3 requirement unreachable.
              viewport={{ once: false }}
              transition={{ duration: 0.5 }}
            >
              <p className="t-overline mb-3 text-brand">Get the App</p>
              <h2 className="t-display mb-4 text-primary-ink">
                {content.softwareTitle || "Take your somiti everywhere"}
              </h2>
              {content.softwareDescription ? (
                <div className="prose prose-lg max-w-none text-justify text-secondary-ink dark:prose-invert" dangerouslySetInnerHTML={{ __html: content.softwareDescription }} />
              ) : (
                <p className="t-body-lg text-justify text-muted-ink">
                  Manage your savings, requests, and statements from your phone or PC — download the official app.
                </p>
              )}
            </motion.div>

            <div className="mx-auto flex max-w-3xl flex-col items-center justify-center gap-6 sm:flex-row">
              {content.androidApp?.url && (
                <DownloadCard
                  platform="Android App"
                  fileLabel="APK"
                  fileBase="SomitiMS-Android"
                  ext="apk"
                  url="/api/downloads/android"
                  version={content.androidApp.version}
                  sizeBytes={content.androidApp.sizeBytes}
                  updatedAt={content.androidApp.updatedAt}
                  icon={Smartphone}
                  iconClass="bg-success-soft text-success"
                />
              )}
              {content.windowsApp?.url && (
                <DownloadCard
                  platform="Windows App"
                  fileLabel="EXE"
                  fileBase="SomitiMS-Setup"
                  ext="exe"
                  url="/api/downloads/windows"
                  version={content.windowsApp.version}
                  sizeBytes={content.windowsApp.sizeBytes}
                  updatedAt={content.windowsApp.updatedAt}
                  icon={Monitor}
                  iconClass="bg-info-soft text-info"
                />
              )}
            </div>
          </div>
        </section>
      )}

      {/* ─── Management Committee ─── */}
      <section id="management" className="section-tint-amber relative overflow-hidden py-12 sm:py-20 lg:py-24">
        <div className="pointer-events-none absolute top-10 right-1/4 h-64 w-64 rounded-full bg-[#f59e0b] opacity-[0.1] blur-3xl" />
        <div className="pointer-events-none absolute bottom-10 left-1/4 h-64 w-64 rounded-full bg-[#ef4444] opacity-[0.05] blur-3xl" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="mx-auto mb-8 max-w-2xl text-center sm:mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.3 }}
            transition={{ duration: 0.5 }}
          >
            <p className="t-overline mb-3 text-brand">Leadership</p>
            <h2 className="t-display mb-4 text-primary-ink">Our Management Committee</h2>
            <p className="t-body-lg text-justify text-muted-ink">
              Elected by members, accountable to members. Meet the team running your somiti.
            </p>
          </motion.div>

          {(content.management ?? []).length > 0 ? (
            <motion.div
              className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4"
              variants={container}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: false, amount: 0.1 }}
            >
              {(content.management ?? []).map((member, i) => (
                <motion.div key={i} variants={item} className="w-full">
                  <div className="card-premium card-premium-hover h-full overflow-hidden p-5 text-center sm:p-8">
                    <div className="mx-auto mb-6 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-subtle shadow-md ring-4 ring-[var(--glass-border)]">
                      {member.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={member.photoUrl} alt={member.name} className="h-full w-full object-cover" />
                      ) : (
                        <Users className="h-12 w-12 text-faint-ink" />
                      )}
                    </div>
                    <h3 className="t-h3 text-primary-ink">{member.name}</h3>
                    <p className="t-body mt-1 mb-4 font-medium text-brand">{member.role}</p>
                    {member.bio && (
                      member.bio.includes("<") && member.bio.includes(">") ? (
                        <div className="prose max-w-none text-left t-body text-muted-ink dark:prose-invert" dangerouslySetInnerHTML={{ __html: member.bio }} />
                      ) : (
                        <p className="text-justify t-body text-muted-ink line-clamp-4">{member.bio}</p>
                      )
                    )}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <p className="text-center t-body text-muted-ink">Committee members will appear here once published by the admin.</p>
          )}
        </div>
      </section>

      {/* ─── Projects & Activities ─── */}
      <section id="activities" className="relative overflow-hidden bg-surface py-12 sm:py-20 lg:py-24">
        <div className="pointer-events-none absolute top-0 right-0 h-80 w-80 rounded-full bg-[var(--brand-violet)] opacity-[0.05] blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-80 w-80 rounded-full bg-[var(--brand-gold)] opacity-[0.04] blur-3xl" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="mx-auto mb-8 max-w-2xl text-center sm:mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.3 }}
            transition={{ duration: 0.5 }}
          >
            <p className="t-overline mb-3 text-brand">Community</p>
            <h2 className="t-display mb-4 text-primary-ink">Our Activities &amp; Projects</h2>
            <p className="t-body-lg text-justify text-muted-ink">See what we are doing to grow our community&apos;s wealth and well-being.</p>
          </motion.div>

          <div className="grid gap-8 sm:gap-12 lg:grid-cols-2 lg:gap-16">
            {/* Projects */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: false, amount: 0.2 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <h3 className="t-h2 mb-8 flex items-center gap-3 text-primary-ink">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand"><TrendingUp className="h-5 w-5" /></span>
                Ongoing Projects
              </h3>
              {(content.projects ?? []).length > 0 ? (
                <div className="space-y-6">
                  {(content.projects ?? []).map((proj, i) => (
                    <div key={i} className="card-premium card-premium-hover overflow-hidden p-4 sm:p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
                        {proj.photoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={proj.photoUrl} alt={proj.title} className="h-28 w-full rounded-xl object-cover shadow-sm sm:w-28" />
                        )}
                        <div className="flex-1">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <h4 className="t-h3 text-primary-ink">{proj.title}</h4>
                            {proj.status && (
                              <span className="rounded-full bg-brand-gradient-soft px-3 py-1 t-caption font-bold text-brand">{proj.status}</span>
                            )}
                          </div>
                          {proj.description && (
                            <div className="prose max-w-none t-body text-justify text-muted-ink dark:prose-invert" dangerouslySetInnerHTML={{ __html: proj.description }} />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="t-body text-muted-ink">Active projects will be listed here soon.</p>
              )}
            </motion.div>

            {/* Activities */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: false, amount: 0.2 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <h3 className="t-h2 mb-8 flex items-center gap-3 text-primary-ink">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-success-soft text-success"><Receipt className="h-5 w-5" /></span>
                Recent Activities
              </h3>
              {(content.activities ?? []).length > 0 ? (
                <div className="space-y-6">
                  {(content.activities ?? []).map((act, i) => (
                    <div key={i} className="card-premium card-premium-hover overflow-hidden p-4 sm:p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
                        {act.photoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={act.photoUrl} alt={act.title} className="h-28 w-full rounded-xl object-cover shadow-sm sm:w-28" />
                        )}
                        <div className="flex-1">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <h4 className="t-h3 text-primary-ink">{act.title}</h4>
                            {act.date && <span className="rounded-full bg-subtle px-3 py-1 t-caption font-medium text-muted-ink">{act.date}</span>}
                          </div>
                          {act.description && (
                            <div className="prose max-w-none t-body text-justify text-muted-ink dark:prose-invert" dangerouslySetInnerHTML={{ __html: act.description }} />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="t-body text-muted-ink">Recent activities will be listed here soon.</p>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="relative overflow-hidden py-12 sm:py-20 lg:py-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,var(--bg-subtle),transparent_70%)]" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            className="relative mx-auto max-w-5xl overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] brand-gradient p-6 text-center shadow-pop sm:p-10 md:p-16"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: false, amount: 0.3 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <div className="pointer-events-none absolute inset-0 h-full w-full opacity-20 bg-[radial-gradient(circle_at_top_right,_white,_transparent_60%)]" />
            <h2 className="relative z-10 t-display text-white">Ready to join our community?</h2>
            <p className="relative z-10 mx-auto mt-4 max-w-2xl t-body-lg text-justify text-white/90">
              Register your account today and become part of a growing, transparent, and secure financial family.
            </p>
            <div className="relative z-10 mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/register">
                <Button size="lg" variant="secondary" className="h-12 w-full bg-white px-6 text-base text-brand shadow-lg hover:bg-white/90 sm:w-auto sm:px-10">
                  {heroCtaPrimary} <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline" className="h-12 w-full border-white/40 bg-white/10 px-6 text-base text-white backdrop-blur hover:bg-white/20 hover:text-white sm:w-auto sm:px-10">
                  {heroCtaSecondary}
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-[var(--border-base)] bg-surface py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {hasContact ? (
            <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3">
              {/* Brand + address */}
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg brand-gradient text-white">
                    <OrgLogo logo={org.logo} alt={org.name} className="h-full w-full object-cover">
                      <Building2 className="h-4 w-4" />
                    </OrgLogo>
                  </div>
                  <span className="t-subheading text-primary-ink">{org.name}</span>
                </div>
                {org.tagline && <p className="t-caption text-muted-ink">{org.tagline}</p>}
                {address && (
                  <p className="flex items-start gap-2 t-caption text-muted-ink">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {address}
                  </p>
                )}
              </div>

              {/* Contact lines */}
              <div className="space-y-2">
                <p className="t-overline text-faint-ink">Contact</p>
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
                {org.website && (
                  <a href={org.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 t-caption text-muted-ink transition-colors hover:text-primary-ink">
                    <Globe className="h-3.5 w-3.5 shrink-0" /> {org.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>

              {/* Social + links */}
              <div className="space-y-3">
                {(org.facebook || org.whatsapp || org.youtube) && (
                  <>
                    <p className="t-overline text-faint-ink">Follow us</p>
                    <div className="flex items-center gap-3">
                      {org.facebook && (
                        <a href={org.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="flex h-8 w-8 items-center justify-center rounded-lg bg-subtle text-secondary-ink transition-colors hover:bg-brand-gradient-soft hover:text-brand">
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        </a>
                      )}
                      {org.whatsapp && (
                        <a href={org.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="flex h-8 w-8 items-center justify-center rounded-lg bg-subtle text-secondary-ink transition-colors hover:bg-brand-gradient-soft hover:text-brand">
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.515 5.26l-.999 3.648 3.973-1.607zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.29.173-1.414z"/></svg>
                        </a>
                      )}
                      {org.youtube && (
                        <a href={org.youtube} target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="flex h-8 w-8 items-center justify-center rounded-lg bg-subtle text-secondary-ink transition-colors hover:bg-brand-gradient-soft hover:text-brand">
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                        </a>
                      )}
                    </div>
                  </>
                )}
                <div className="flex flex-wrap gap-4 t-caption text-muted-ink">
                  <Link href="/login" className="hover:text-primary-ink">Login</Link>
                  <Link href="/register" className="hover:text-primary-ink">Register</Link>
                  <Link href="/policy" className="hover:text-primary-ink">Privacy Policy</Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg brand-gradient text-white">
                  <OrgLogo logo={org.logo} alt={org.name} className="h-full w-full object-cover">
                    <Building2 className="h-4 w-4" />
                  </OrgLogo>
                </div>
                <span className="t-subheading text-primary-ink">{org.name}</span>
              </div>
              <div className="flex gap-6 t-caption text-muted-ink">
                <Link href="/login" className="hover:text-primary-ink">Login</Link>
                <Link href="/register" className="hover:text-primary-ink">Register</Link>
                <Link href="/policy" className="hover:text-primary-ink">Privacy Policy</Link>
              </div>
            </div>
          )}

          <div className="mt-8 border-t border-[var(--border-base)] pt-6">
            <p className="text-center t-caption text-muted-ink">© {new Date().getFullYear()} {org.name}. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
