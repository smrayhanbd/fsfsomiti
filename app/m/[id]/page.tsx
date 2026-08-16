import prisma from "@/lib/prisma"
import { getOrganization } from "@/lib/organization"
import { notFound } from "next/navigation"
import { CheckCircle2, XCircle, ShieldCheck, Calendar } from "lucide-react"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const member = await prisma.member.findUnique({
    where: { id },
    select: { fullName: true, memberNo: true },
  })
  if (!member) return { title: "Member Not Found" }
  return {
    title: `${member.fullName} — Member Verification`,
    description: `Verify membership status of ${member.fullName} (${member.memberNo})`,
  }
}

/**
 * Public member verification page — accessible at /m/[id].
 *
 * Reached by scanning the QR code on a member's ID card. This page is
 * PUBLIC (no login required) so anyone can verify a member's status.
 *
 * PRIVACY: Only verification-relevant information is shown:
 *   - Full name
 *   - Member number
 *   - Membership status (Active / Suspended / etc.)
 *   - KYC verification status
 *   - Membership date
 *   - Photo (if uploaded — helps confirm identity visually)
 *
 * NO personal contact information (phone, email, profession, address)
 * is displayed on this public page.
 */
export default async function PublicMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [member, org] = await Promise.all([
    prisma.member.findUnique({
      where: { id },
      select: {
        id: true,
        memberNo: true,
        fullName: true,
        firstName: true,
        status: true,
        kycVerified: true,
        membershipDate: true,
        photoUrl: true,
        // NOTE: phone, email, profession, address are intentionally
        // NOT selected — this is a public page.
      },
    }),
    getOrganization(),
  ])

  if (!member) {
    notFound()
  }

  const isActive = member.status === "ACTIVE"

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Org header */}
        <div className="text-center mb-6">
          {org.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logo} alt={org.name} className="h-12 w-12 object-contain rounded-lg mx-auto mb-2" />
          ) : (
            <div className="h-12 w-12 rounded-lg brand-gradient mx-auto mb-2 flex items-center justify-center text-white font-bold text-lg">
              {org.name?.charAt(0) || "S"}
            </div>
          )}
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">{org.name}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Member Verification</p>
        </div>

        {/* Member card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* Photo + status banner */}
          <div className="relative h-24 brand-gradient">
            <div className="absolute -bottom-12 left-6">
              {member.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={member.photoUrl}
                  alt={member.fullName}
                  className="w-24 h-24 rounded-xl border-4 border-white dark:border-slate-800 object-cover shadow-lg"
                />
              ) : (
                <div className="w-24 h-24 rounded-xl border-4 border-white dark:border-slate-800 bg-slate-200 dark:bg-slate-700 flex items-center justify-center shadow-lg">
                  <span className="text-3xl font-bold text-slate-400">
                    {member.firstName?.charAt(0) || member.fullName?.charAt(0) || "?"}
                  </span>
                </div>
              )}
            </div>
            {/* Status badge */}
            <div className="absolute top-3 right-3">
              {isActive ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500 text-white shadow">
                  <CheckCircle2 className="h-3 w-3" /> Active Member
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500 text-white shadow">
                  <XCircle className="h-3 w-3" /> {member.status}
                </span>
              )}
            </div>
          </div>

          {/* Member info — verification data only, no personal contact info */}
          <div className="pt-14 px-6 pb-6 space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{member.fullName}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Member No: <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">{member.memberNo}</span>
              </p>
            </div>

            {/* KYC badge */}
            <div className="flex items-center gap-2">
              {member.kycVerified ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <ShieldCheck className="h-3.5 w-3.5" /> KYC Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  KYC Pending
                </span>
              )}
            </div>

            {/* Membership date — public info, helps verify tenure */}
            {member.membershipDate && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  <span>Member since {new Date(member.membershipDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
                </div>
              </div>
            )}

            {/* Verification note */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
              <p className="text-[11px] text-slate-400 text-center">
                This is a verified member of {org.name}. Scanned via QR code on the member ID card.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-4">
          Powered by {org.name} · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
