import prisma from "@/lib/prisma"
import { getOrganization } from "@/lib/organization"
import LandingPageClient, { type LandingContent } from "@/components/LandingPageClient"

export const dynamic = 'force-dynamic'

export default async function LandingPage() {
  // Fetch dynamic content + org identity in parallel. Org feeds the navbar,
  // footer (name/logo/contact), and brand text across the page.
  const [content, org] = await Promise.all([
    prisma.siteContent.findUnique({ where: { id: "singleton" } }),
    getOrganization(),
  ])

  // Fallback defaults if admin hasn't set content yet. Only the fields the
  // landing page renders are required, so we project down to LandingContent.
  const fallback: LandingContent = {
    heroTitle: "Save smarter. <span class='text-shimmer'>Grow together.</span> Borrow fairly.",
    heroSubtitle:
      "<p>Future Savings Foundation Somiti is a community-driven cooperative where members pool savings, fund each other's dreams, and share every Taka of profit — with bank-grade security and total transparency.</p>",
    heroBadge: "Next-Gen Cooperative Management",
    heroCtaPrimary: "Register",
    heroCtaSecondary: "Login",
    aboutTitle: "A cooperative built on trust, transparency, and shared growth",
    aboutContent:
      "<p>We are Future Savings Foundation Somiti — a member-owned cooperative society dedicated to empowering our community financially. Founded on the principles of trust, mutual support, and complete transparency, we provide a secure, modern platform for savings, member-to-member loans, investments, and collective wealth-building.</p><p>Every Taka that moves through our somiti is recorded in a real-time ledger that any member can audit. Every decision our committee makes is published as signed meeting minutes. Every election is decided by your vote — cast securely from your own member portal.</p>",
    visionTitle: "Our Vision & Mission",
    visionContent:
      "<p>To build a financially resilient community where every member has access to transparent, secure, and modern financial services — fostering growth, dignity, and prosperity for all.</p>",
    transparency:
      "<p>100% Transparency in Somiti Management. All transactions are recorded in real-time ledgers. Members have 24/7 access to their balances, the somiti's bank statements, and signed meeting minutes — and automated receipts ensure accountability for every Taka.</p>",
    // 7 community pillars
    whyJoinUs: [
      { icon: "Users", title: "Community Growth", description: "<p>A trusted circle of like-minded members pooling resources, sharing knowledge, and growing together — one cooperative decision at a time.</p>" },
      { icon: "PiggyBank", title: "Together Fund Growth", description: "<p>Our collective fund compounds month after month, generating returns that flow back to every member through dividends and profit-sharing.</p>" },
      { icon: "Home", title: "Dream House Building", description: "<p>Member-driven housing plans turn the dream of owning a home into a realistic, achievable milestone — backed by the community, not the bank.</p>" },
      { icon: "HandCoins", title: "Member-to-Member Loans", description: "<p>Solve urgent financial needs with low-interest loans funded by the somiti itself. Fair terms, transparent repayment schedules, no hidden charges.</p>" },
      { icon: "Rocket", title: "Business Growth Together", description: "<p>Capital, mentorship, and a built-in customer base — members lift each other's ventures through coordinated investment and referral networks.</p>" },
      { icon: "Briefcase", title: "Investments & Projects", description: "<p>Curated, vetted investment opportunities in land, agriculture, and small businesses — accessible to every member at transparent valuations.</p>" },
      { icon: "HeartHandshake", title: "Helping People in Need", description: "<p>A portion of our fund supports members and families facing hardship — medical bills, education, emergencies — no questions asked, no interest charged.</p>" },
    ],
    // Member-portal transparency features
    howWeRun: [
      { icon: "FileText", title: "Bank Statements, Anytime", description: "<p>View real-time somiti bank statements directly from your member portal. Every deposit, withdrawal, and charge is auditable 24/7.</p>" },
      { icon: "Receipt", title: "Read Meeting Minutes", description: "<p>Every general meeting and committee decision is published as minutes in the portal — searchable, dated, and signed off by the secretary.</p>" },
      { icon: "Wallet", title: "Withdrawal Requests", description: "<p>Submit and track withdrawal requests from your phone. Multi-level approval workflow keeps funds safe and auditable.</p>" },
      { icon: "BellRing", title: "SMS & Email Alerts", description: "<p>Get instant SMS and email notifications on every deposit, withdrawal, due date, and approval — never miss a transaction.</p>" },
      { icon: "MessageCircle", title: "WhatsApp Community", description: "<p>Join our large, active WhatsApp community for daily updates, support, and discussions with fellow members and the management team.</p>" },
      { icon: "Vote", title: "Vote in Elections", description: "<p>Management is elected by you. Cast your vote on candidates, motions, and policy changes — securely, from your own portal, anytime.</p>" },
    ],
    // Numbered onboarding steps
    howItWorks: [
      { step: 1, title: "Register Online", description: "Submit your application, KYC documents, and nominee details through the secure registration portal." },
      { step: 2, title: "Get Approved", description: "Our committee reviews your application. Approved members receive login credentials and a member ID." },
      { step: 3, title: "Start Saving", description: "Choose your savings plan and begin monthly deposits. Watch your balance grow with real-time updates." },
      { step: 4, title: "Vote & Withdraw", description: "Participate in elections, request withdrawals, apply for loans — all from your member portal." },
      { step: 5, title: "Grow Together", description: "Earn dividends, access community-funded loans, and help your somiti build wealth for everyone." },
    ],
    // Top-of-page stat strip
    stats: [
      { value: "500+", label: "Active Members" },
      { value: "৳12 Cr+", label: "Total Deposits" },
      { value: "120+", label: "Loans Disbursed" },
      { value: "99.9%", label: "Uptime" },
    ],
    // Horizontal scrolling security/trust badges
    securityBadges: [
      { label: "256-bit Encrypted Data", icon: "KeyRound" },
      { label: "Trusted by Huge Members", icon: "Users" },
      { label: "Automated Payouts", icon: "Banknote" },
      { label: "A Group of Trusted People", icon: "ShieldCheck" },
      { label: "Transparent Ledger", icon: "Eye" },
      { label: "Bank-Grade Security", icon: "Landmark" },
    ],
    facilities: [
      { icon: "Landmark", title: "Bank-Grade Security", description: "<p>AES-256 encryption, audit trails, and dual-control approvals on every transaction.</p>" },
      { icon: "Eye", title: "Real-Time Transparency", description: "<p>Live ledger, public bank statements, and signed meeting minutes — always.</p>" },
      { icon: "Vote", title: "Democratic Governance", description: "<p>Members elect the management committee through secure online voting.</p>" },
      { icon: "BellRing", title: "Instant Notifications", description: "<p>SMS + email alerts on every deposit, withdrawal, and approval event.</p>" },
    ],
    management: [],
    activities: [],
    projects: [],
  }

  // Pass the content to the Client Component. The Prisma Json fields are
  // structurally arrays of items but typed as JsonValue, so cast through the
  // landing-content shape (the fields are only ever read, never mutated).
  const landingContent: LandingContent = (content as unknown as LandingContent) ?? fallback

  return <LandingPageClient content={landingContent} org={org} />
}
