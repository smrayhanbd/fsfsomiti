"use client"

/**
 * ProfileClient — premium Member Portal → My Profile experience.
 *
 * Built entirely on the Somiti MS design system: Trust Ribbon, glassmorphism,
 * design tokens (`card-premium`, `text-primary-ink`, `brand-gradient`, …),
 * bilingual labels via `useLanguage()`, and reusable Somiti primitives
 * (SectionCard, StatCard, StatusBadge, Money). Replaces the legacy generic
 * admin layout with a fintech-grade, WCAG-AA accessible interface.
 *
 * All data arrives pre-serialized from the server component (plain objects
 * only — no Prisma Decimal/Date instances).
 */
import React from "react"
import Link from "next/link"
import { useLanguage } from "@/components/somiti/LanguageProvider"
import SectionCard from "@/components/somiti/SectionCard"
import StatCard from "@/components/somiti/StatCard"
import StatusBadge from "@/components/somiti/StatusBadge"
import Money from "@/components/somiti/Money"
import PhotoUploadDialog from "./PhotoUploadDialog"
import ZoomableImage from "@/components/member/ZoomableImage"
import type { ScoreView } from "@/lib/trustScore"
import {
  ShieldCheck, Camera, Pencil, Clock, BadgeCheck, Star, TrendingUp,
  TrendingDown, Activity, FileText, ExternalLink, Scale, Users,
  CalendarDays, Heart, Globe, Droplet, Briefcase, User as UserIcon,
  Phone, Mail, Home, Building, Banknote, CreditCard, MapPin, Hash,
  Download, Sparkles, Printer, PenLine, IdCard,
} from "lucide-react"

/** A recent savings row (already plain-serialized). */
interface SavingsRow {
  id: string
  type: string
  amount: number
  date: string
  receiptNo: string | null
}

/** The member shape handed from the server (plain — Decimals→number, Dates→ISO). */
interface MemberData {
  id: string
  memberNo: string
  fullName: string
  firstName: string
  lastName: string
  phone: string
  email: string | null
  photoUrl: string | null
  status: string
  kycVerified: boolean
  trustScore: number
  badgeLevel: string
  riskLevel: string
  scoreLastUpdated: string | null
  membershipDate: string
  joiningDate: string | null
  gender: string | null
  dateOfBirth: string | null
  maritalStatus: string | null
  marriageDate: string | null
  religion: string | null
  nationality: string | null
  bloodGroup: string | null
  profession: string | null
  fatherName: string | null
  motherName: string | null
  spouseName: string | null
  emergencyPhone: string | null
  emergencyContactName: string | null
  nidNumber: string | null
  passportNumber: string | null
  birthCertificateNo: string | null
  accountName: string | null
  accountNumber: string | null
  bankName: string | null
  branch: string | null
  routingNumber: string | null
  // Member signature — uploaded at registration, embedded on the PDF.
  signatureUrl: string | null
  addresses: Array<{
    id: string
    addressType: string
    village: string | null
    postOffice: string | null
    policeStation: string | null
    district: string | null
    division: string | null
    postalCode: string | null
    country: string | null
  }>
  nominees: Array<{
    id: string
    name: string
    relation: string
    phone: string | null
    idType: string | null
    nidNumber: string | null
    sharePercentage: number
    photoUrl: string | null
    idDocumentUrl: string | null
    // Nominee signature — required for adults, embedded on the PDF.
    signatureUrl: string | null
  }>
  documents: Array<{
    id: string
    documentType: string
    name: string | null
    fileUrl: string
  }>
}

interface ProfileClientProps {
  member: MemberData
  scoreView: ScoreView | null
  recentSavings: SavingsRow[]
  pendingPhoto: boolean
  completion: number
}

export default function ProfileClient({
  member, scoreView, recentSavings, pendingPhoto, completion,
}: ProfileClientProps) {
  const { t } = useLanguage()

  const currentAddress = member.addresses.find((a) => a.addressType === "CURRENT")
  const permanentAddress = member.addresses.find((a) => a.addressType === "PERMANENT")

  const idType = member.nidNumber
    ? "National ID"
    : member.passportNumber
      ? "Passport"
      : member.birthCertificateNo
        ? "Birth Certificate"
        : "ID"
  const idNumber = member.nidNumber || member.passportNumber || member.birthCertificateNo || t("notProvided")
  const idDoc = member.documents.find((d) => d.documentType === idType)

  const tenure = formatTenure(member.membershipDate)
  const trustScore = scoreView?.member.trustScore ?? member.trustScore

  // Build a merged activity timeline (trust-score events + recent savings).
  const activity = buildTimeline(scoreView, recentSavings)

  return (
    <div className="space-y-6">
      {/* ────────────────────────────────────────────────────────────────
          HERO HEADER — glass surface, trust gradient glow, avatar + actions
         ──────────────────────────────────────────────────────────────── */}
      <section className="card-premium relative overflow-hidden">
        {/* Gradient glow backdrop */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(120% 90% at 100% 0%, color-mix(in oklch, var(--gradient-violet) 22%, transparent) 0%, transparent 55%)," +
              "radial-gradient(100% 80% at 0% 0%, color-mix(in oklch, var(--gradient-blue) 20%, transparent) 0%, transparent 50%)",
          }}
        />
        <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          {/* Identity cluster */}
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="relative shrink-0">
              <Avatar member={member} />
              {pendingPhoto && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-warning px-2 py-0.5 text-[10px] font-bold text-[#1a1205] shadow-lift whitespace-nowrap">
                  <Clock className="h-2.5 w-2.5" /> Pending
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="t-h1 text-primary-ink">{member.fullName}</h1>
                <StatusBadge status={member.status} />
              </div>
              <p className="t-num mt-1 font-mono text-[13px] text-muted-ink">
                {member.memberNo} · {member.phone}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {member.kycVerified && (
                  <Chip tone="success" icon={<ShieldCheck className="h-3 w-3" />}>
                    {t("kycVerified")}
                  </Chip>
                )}
                <Chip tone="gold" icon={<BadgeCheck className="h-3 w-3" />}>
                  {scoreView?.badgeEmoji ? `${scoreView.badgeEmoji} ` : "🏅 "}
                  {member.badgeLevel}
                </Chip>
                <Chip tone="info" icon={<CalendarDays className="h-3 w-3" />}>
                  {t("memberSince")} {new Date(member.membershipDate).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </Chip>
              </div>
            </div>
          </div>

          {/* Trust score ring + quick actions */}
          <div className="flex flex-col items-center gap-4 sm:flex-row lg:items-end lg:gap-6">
            <TrustScoreRing score={trustScore} risk={member.riskLevel} />
            <div className="flex flex-wrap items-center justify-center gap-2">
              <PhotoUploadDialog memberId={member.id} />
              <Link
                href="/portal/profile/edit"
                className="inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 border border-[var(--border-base)] bg-[var(--control-bg)] text-secondary-ink hover:border-brand hover:text-primary-ink px-3 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit Profile
              </Link>
              <Link
                href="/portal/savings"
                className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-[var(--border-base)] bg-[var(--control-bg)] px-3 text-sm font-medium text-secondary-ink transition-colors hover:border-brand hover:text-primary-ink focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <Download className="h-3.5 w-3.5" /> {t("downloadStatement")}
              </Link>
              <Link
                href={`/api/members/${member.id}/print-form`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-brand px-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <Printer className="h-3.5 w-3.5" /> Print Form
              </Link>
              <Link
                href={`/api/members/${member.id}/id-card`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-brand px-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <IdCard className="h-3.5 w-3.5" /> ID Card
              </Link>
            </div>
          </div>
        </div>

        {/* Completion bar across the foot of the hero */}
        <div className="relative border-t border-[var(--border-base)] px-6 py-3 sm:px-8">
          <CompletionBar percent={completion} label={t("profileCompletion")} />
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────────────
          STAT STRIP
         ──────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label={t("trustScoreLabel")}
          value={<span className="t-num">{trustScore}</span>}
          icon={Star}
          accent="gold"
          hint={member.riskLevel}
        />
        <StatCard
          label={t("profileCompletion")}
          value={<span className="t-num">{completion}%</span>}
          icon={Sparkles}
          accent={completion >= 80 ? "emerald" : "amber"}
          trend={undefined}
        />
        <StatCard
          label={t("membershipTenure")}
          value={<span className="t-h3">{tenure}</span>}
          icon={CalendarDays}
          accent="violet"
        />
      </div>

      {/* ────────────────────────────────────────────────────────────────
          MAIN GRID — 2/3 info (left) + 1/3 financial/verification (right)
         ──────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* LEFT */}
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title={t("personalInfo")} icon={<UserIcon />} accent="blue">
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              <InfoRow icon={CalendarDays} label={t("dob")} value={fmtDate(member.dateOfBirth)} />
              <InfoRow icon={UserIcon} label={t("gender")} value={fmtEnum(member.gender)} />
              <InfoRow icon={Heart} label={t("maritalStatus")} value={fmtEnum(member.maritalStatus)} />
              <InfoRow icon={CalendarDays} label={t("marriageDate")} value={fmtDate(member.marriageDate)} />
              <InfoRow icon={Globe} label={t("religion")} value={fmtVal(member.religion)} />
              <InfoRow icon={Globe} label={t("nationality")} value={fmtVal(member.nationality)} />
              <InfoRow icon={Droplet} label={t("bloodGroup")} value={fmtBlood(member.bloodGroup)} />
              <InfoRow icon={Briefcase} label={t("profession")} value={fmtVal(member.profession)} />
              <InfoRow icon={UserIcon} label={t("fathersName")} value={fmtVal(member.fatherName)} />
              <InfoRow icon={UserIcon} label={t("mothersName")} value={fmtVal(member.motherName)} />
              <InfoRow icon={Heart} label={t("spouseName")} value={fmtVal(member.spouseName)} />
            </div>
          </SectionCard>

          <SectionCard title={t("contactEmergency")} icon={<Phone />} accent="emerald">
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              <InfoRow icon={Phone} label={t("phone")} value={member.phone} />
              <InfoRow icon={Mail} label={t("email")} value={fmtVal(member.email)} />
              <InfoRow icon={Phone} label={t("emergencyContact")} value={fmtVal(member.emergencyPhone)} />
              <InfoRow icon={UserIcon} label={t("emergencyPerson")} value={fmtVal(member.emergencyContactName)} />
            </div>
          </SectionCard>

          <SectionCard title={t("residence")} icon={<Home />} accent="violet">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <AddressCard title={t("currentAddress")} icon={MapPin} address={currentAddress} />
              <AddressCard title={t("permanentAddress")} icon={Building} address={permanentAddress} />
            </div>
          </SectionCard>
        </div>

        {/* RIGHT */}
        <div className="space-y-6">
          <SectionCard title={t("bankDetails")} icon={<Banknote />} accent="gold">
            <div className="space-y-5">
              <InfoRow icon={UserIcon} label={t("accountName")} value={fmtVal(member.accountName)} />
              <InfoRow icon={CreditCard} label={t("accountNumber")} value={fmtVal(member.accountNumber)} mono />
              <InfoRow icon={Building} label={t("bankName")} value={fmtVal(member.bankName)} />
              <InfoRow icon={MapPin} label={t("branch")} value={fmtVal(member.branch)} />
              <InfoRow icon={Hash} label={t("routingNumber")} value={fmtVal(member.routingNumber)} mono />
            </div>
          </SectionCard>

          <SectionCard title={t("verificationDocs")} icon={<ShieldCheck />} accent="blue">
            <div className="space-y-3">
              {/* KYC status row */}
              <div className="flex items-center justify-between rounded-xl border border-[var(--border-base)] bg-inset p-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-success-soft text-success">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="t-subheading text-primary-ink">KYC Verification</p>
                    <p className="t-caption text-muted-ink">{member.kycVerified ? "Approved" : "Pending review"}</p>
                  </div>
                </div>
                <StatusBadge status={member.kycVerified ? "VERIFIED" : "PENDING"} />
              </div>

              {/* Primary ID document */}
              <DocumentRow label={idType} value={idNumber} href={idDoc?.fileUrl} />
              {/* Additional documents */}
              {member.documents
                .filter((d) => d.documentType === "ADDITIONAL")
                .map((doc) => (
                  <DocumentRow key={doc.id} label={doc.name || "Additional Document"} value="" href={doc.fileUrl} />
                ))}

              {/* Member signature */}
              {member.signatureUrl && (
                <div className="flex items-center justify-between rounded-xl border border-[var(--border-base)] bg-inset p-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand-gradient-soft text-brand">
                      <PenLine className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="t-subheading text-primary-ink">Member Signature</p>
                      <p className="t-caption text-muted-ink">On file — embedded on the Membership Form</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[var(--border-base)] bg-[var(--control-bg)] px-3 py-1">
                    <ZoomableImage src={member.signatureUrl} alt="Member Signature" caption={`${member.fullName} — Signature`} className="max-h-12 object-contain" />
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {scoreView && (
            <SectionCard title={t("scoreBreakdown")} icon={<Star />} accent="gold">
              <div className="space-y-3.5">
                {scoreView.breakdown
                  .filter((b) => b.applicable)
                  .map((b) => (
                    <ScoreBar key={b.code} code={b.code} score={b.score} max={b.max} />
                  ))}
              </div>
            </SectionCard>
          )}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────
          NOMINEES (full width)
         ──────────────────────────────────────────────────────────────── */}
      <SectionCard title={t("nominees")} icon={<Users />} accent="blue" bodyClassName="p-0">
        {member.nominees.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Users className="mx-auto mb-2 h-8 w-8 text-faint-ink" />
            <p className="t-body text-muted-ink">No nominees registered.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 lg:grid-cols-3">
            {member.nominees.map((nom) => (
              <NomineeCard key={nom.id} nominee={nom} />
            ))}
          </div>
        )}
      </SectionCard>

      {/* ────────────────────────────────────────────────────────────────
          ACTIVITY TIMELINE (full width)
         ──────────────────────────────────────────────────────────────── */}
      <SectionCard title={t("activityTimeline")} icon={<Activity />} accent="violet" bodyClassName="p-0">
        {activity.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Activity className="mx-auto mb-2 h-8 w-8 text-faint-ink" />
            <p className="t-body text-muted-ink">No recent activity to show.</p>
          </div>
        ) : (
          <ol className="divide-y divide-[var(--border-base)]">
            {activity.slice(0, 8).map((item) => (
              <TimelineItem key={item.id} item={item} />
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  )
}

/* =====================================================================
   SUB-COMPONENTS
   ===================================================================== */

function Avatar({ member }: { member: MemberData }) {
  return (
    <div className="relative h-[88px] w-[88px] shrink-0">
      <div className="absolute inset-0 rounded-[22px] brand-gradient opacity-30 blur-md" aria-hidden="true" />
      {member.photoUrl ? (
        <ZoomableImage
          src={member.photoUrl}
          alt={member.fullName}
          caption={`${member.fullName} — Photo`}
          className="relative h-[88px] w-[88px] rounded-[22px] object-cover ring-2 ring-[var(--glass-border)] shadow-lift"
        />
      ) : (
        <div className="relative flex h-[88px] w-[88px] items-center justify-center rounded-[22px] brand-gradient text-3xl font-bold text-white shadow-brand-glow">
          {member.fullName.charAt(0)}
        </div>
      )}
    </div>
  )
}

function Chip({ tone, icon, children }: { tone: "success" | "gold" | "info" | "neutral"; icon?: React.ReactNode; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    success: "bg-success-soft text-success border border-success",
    gold: "bg-[color-mix(in_oklch,var(--brand-gold)_16%,transparent)] text-gold border border-[color-mix(in_oklch,var(--brand-gold)_38%,transparent)]",
    info: "bg-info-soft text-info border border-info",
    neutral: "bg-subtle text-secondary-ink border border-[var(--border-base)]",
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${tones[tone]}`}>
      {icon}
      {children}
    </span>
  )
}

/** Circular Trust Score gauge (SVG, gradient stroke, reduced-motion safe). */
function TrustScoreRing({ score, risk }: { score: number; risk: string }) {
  const clamped = Math.max(0, Math.min(100, score))
  const r = 34
  const circ = 2 * Math.PI * r
  const offset = circ - (clamped / 100) * circ
  const tone = clamped >= 80 ? "var(--chart-emerald)" : clamped >= 60 ? "var(--chart-gold)" : "var(--chart-crimson)"
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[88px] w-[88px]">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="var(--bg-inset)" strokeWidth="7" />
          <circle
            cx="40" cy="40" r={r} fill="none" stroke={tone} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 600ms var(--ease-standard)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="t-h2 t-num text-primary-ink">{clamped}</span>
          <span className="t-overline text-faint-ink">/ 100</span>
        </div>
      </div>
      <span className="t-caption mt-1 font-semibold text-muted-ink">{risk}</span>
    </div>
  )
}

function CompletionBar({ percent, label }: { percent: number; label: string }) {
  const tone = percent >= 80 ? "var(--chart-emerald)" : percent >= 50 ? "var(--chart-gold)" : "var(--chart-crimson)"
  return (
    <div className="flex items-center gap-3">
      <span className="t-overline shrink-0 text-muted-ink">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-inset">
        <div
          className="h-full rounded-full"
          style={{ width: `${percent}%`, backgroundColor: tone, transition: "width 600ms var(--ease-standard)" }}
        />
      </div>
      <span className="t-num t-subheading shrink-0 text-primary-ink">{percent}%</span>
    </div>
  )
}

function InfoRow({
  icon: Icon, label, value, vertical, mono,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  vertical?: boolean
  mono?: boolean
}) {
  return (
    <div className={`flex ${vertical ? "flex-col gap-1.5" : "items-start gap-3"}`}>
      {!vertical && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-inset text-muted-ink">
          <Icon className="h-3.5 w-3.5" />
        </div>
      )}
      <div className="min-w-0">
        {vertical && <Icon className="mb-1 h-3.5 w-3.5 text-faint-ink" />}
        <p className="t-overline text-faint-ink">{label}</p>
        <p className={`mt-0.5 truncate t-body font-medium text-primary-ink ${mono ? "font-mono t-num" : ""}`}>{value}</p>
      </div>
    </div>
  )
}

function AddressCard({
  title, icon: Icon, address,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  address: MemberData["addresses"][number] | undefined
}) {
  const { t } = useLanguage()
  return (
    <div className="rounded-xl border border-[var(--border-base)] bg-inset p-4">
      <h4 className="t-overline mb-3 flex items-center gap-1.5 text-muted-ink">
        <Icon className="h-3 w-3" /> {title}
      </h4>
      {!address ? (
        <p className="t-caption italic text-faint-ink">{t("notProvided")}</p>
      ) : (
        <div className="space-y-2.5">
          <Field label="Address" value={address.village} />
          <div className="grid grid-cols-3 gap-2">
            <Field label="Post Office" value={address.postOffice} />
            <Field label="District" value={address.district} />
            <Field label="Post Code" value={address.postalCode} />
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-faint-ink">{label}</p>
      <p className="mt-0.5 t-caption text-secondary-ink">{value || "N/A"}</p>
    </div>
  )
}

function DocumentRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[var(--border-base)] bg-inset p-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-subtle text-muted-ink">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="t-subheading truncate text-primary-ink">{label}</p>
          {value && <p className="t-num t-caption truncate font-mono text-muted-ink">{value}</p>}
        </div>
      </div>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${label}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-brand transition-colors hover:bg-brand-gradient-soft"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </div>
  )
}

function ScoreBar({ code, score, max }: { code: string; score: number; max: number }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0
  const labels: Record<string, string> = {
    DEPOSIT: "Savings", LOAN: "Loans", ATTEND: "Attendance", FINE: "Fines", REFERRAL: "Referrals",
  }
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="t-caption font-semibold text-secondary-ink">{labels[code] ?? code}</span>
        <span className="t-num t-caption text-muted-ink">{score}/{max}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-inset">
        <div className="h-full rounded-full brand-gradient" style={{ width: `${Math.max(pct, 3)}%`, transition: "width 600ms var(--ease-standard)" }} />
      </div>
    </div>
  )
}

interface TimelineEntry {
  id: string
  title: string
  detail: string
  amount?: number
  scoreChange?: number
  date: string
  tone: "success" | "debit" | "info" | "gold"
}

function TimelineItem({ item }: { item: TimelineEntry }) {
  const toneMap = {
    success: { dot: "bg-[var(--status-success)]", icon: <TrendingUp className="h-3.5 w-3.5" /> },
    debit: { dot: "bg-[var(--status-debit)]", icon: <TrendingDown className="h-3.5 w-3.5" /> },
    info: { dot: "bg-[var(--status-info)]", icon: <Activity className="h-3.5 w-3.5" /> },
    gold: { dot: "bg-[var(--brand-gold)]", icon: <Star className="h-3.5 w-3.5" /> },
  }[item.tone]
  const toneText = {
    success: "text-success", debit: "text-debit", info: "text-info", gold: "text-gold",
  }[item.tone]

  return (
    <li className="flex items-start gap-3 px-6 py-3.5">
      <div className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center">
        <span className={`absolute inset-0 rounded-full ${toneMap.dot} opacity-15`} aria-hidden="true" />
        <span className={`relative ${toneText}`}>{toneMap.icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <p className="t-subheading text-primary-ink">{item.title}</p>
          <span className="t-caption text-faint-ink">{relativeTime(item.date)}</span>
        </div>
        <p className="t-caption text-muted-ink">{item.detail}</p>
      </div>
      <div className="shrink-0 text-right">
        {item.amount !== undefined && (
          <Money amount={item.amount} className="t-subheading block" signed />
        )}
        {item.scoreChange !== undefined && item.scoreChange !== 0 && (
          <span className={`t-num t-caption font-bold ${item.scoreChange > 0 ? "text-success" : "text-debit"}`}>
            {item.scoreChange > 0 ? "+" : ""}{item.scoreChange}
          </span>
        )}
      </div>
    </li>
  )
}

function NomineeCard({ nominee }: { nominee: MemberData["nominees"][number] }) {
  const { t } = useLanguage()
  return (
    <div className="card-premium card-premium-hover flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        {nominee.photoUrl ? (
          <ZoomableImage src={nominee.photoUrl} alt={`${nominee.name} Photo`} caption={`${nominee.name} — Nominee Photo`} className="h-12 w-12 rounded-full object-cover ring-2 ring-[var(--border-base)]" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--brand-violet)_18%,transparent)] text-lg font-bold text-violet-brand">
            {nominee.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="t-subheading truncate text-primary-ink">{nominee.name}</h3>
          <p className="t-caption text-brand">{nominee.relation}</p>
        </div>
      </div>
      <div className="space-y-1 t-caption text-muted-ink">
        <p><span className="font-medium text-secondary-ink">{t("phone")}:</span> {nominee.phone || "N/A"}</p>
        <p><span className="font-medium text-secondary-ink">ID:</span> {nominee.idType || "N/A"} {nominee.nidNumber ? `· ${nominee.nidNumber}` : ""}</p>
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-[var(--border-base)] pt-2.5">
        <Chip tone="gold" icon={<Scale className="h-3 w-3" />}>{t("sharePercent")}: {nominee.sharePercentage}%</Chip>
        {nominee.idDocumentUrl && (
          <a href={nominee.idDocumentUrl} target="_blank" rel="noopener noreferrer" className="t-caption flex items-center gap-1 font-medium text-brand hover:underline">
            {t("viewIdDoc")} <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {nominee.signatureUrl && (
        <div className="flex items-center gap-2 border-t border-[var(--border-base)] pt-2.5">
          <PenLine className="h-3.5 w-3.5 text-muted-ink shrink-0" />
          <div className="rounded-lg border border-[var(--border-base)] bg-[var(--control-bg)] px-2 py-1">
            <ZoomableImage src={nominee.signatureUrl} alt={`${nominee.name} Signature`} caption={`${nominee.name} — Nominee Signature`} className="max-h-10 object-contain" />
          </div>
        </div>
      )}
    </div>
  )
}

/* =====================================================================
   HELPERS
   ===================================================================== */

function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "N/A"
}

function fmtEnum(v: string | null): string {
  if (!v) return "N/A"
  return v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ")
}

function fmtVal(v: string | null): string {
  return v && v.trim() ? v : "N/A"
}

function fmtBlood(v: string | null): string {
  if (!v) return "N/A"
  return v.replace("_POSITIVE", "+").replace("_NEGATIVE", "-")
}

function formatTenure(iso: string): string {
  const start = new Date(iso).getTime()
  const now = Date.now()
  const months = Math.max(0, Math.round((now - start) / (1000 * 60 * 60 * 24 * 30.44)))
  if (months < 12) return `${months} mo`
  const years = Math.floor(months / 12)
  const rem = months % 12
  return rem ? `${years}y ${rem}m` : `${years}y`
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

function buildTimeline(scoreView: ScoreView | null, savings: SavingsRow[]): TimelineEntry[] {
  const entries: TimelineEntry[] = []

  for (const s of scoreView?.history ?? []) {
    entries.push({
      id: s.id,
      title: titleCase(s.eventType.replace(/_/g, " ")),
      detail: s.remarks || `${s.kpiAffected ? titleCase(s.kpiAffected) : "Score"} updated`,
      scoreChange: s.scoreChange,
      date: s.createdAt,
      tone: s.scoreChange >= 0 ? "success" : "debit",
    })
  }

  for (const s of savings) {
    const isOut = s.type === "WITHDRAWAL"
    entries.push({
      id: s.id,
      title: titleCase(s.type.replace(/_/g, " ")),
      detail: s.receiptNo ? `Receipt ${s.receiptNo}` : "Transaction",
      amount: isOut ? -Math.abs(s.amount) : Math.abs(s.amount),
      date: s.date,
      tone: isOut ? "debit" : "success",
    })
  }

  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase()
}
