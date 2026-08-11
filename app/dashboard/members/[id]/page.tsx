import prisma from "@/lib/prisma"
import { notFound } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import StatusToggleButton from "@/components/StatusToggleButton"
import KycToggleButton from "@/components/KycToggleButton"
import ZoomableImage from "@/components/member/ZoomableImage"
import { calculateDues } from "@/lib/dueCalculator"
import { resetMemberCredentials } from "@/app/actions/member"
import {
  ArrowLeft, Edit, Printer, User, Phone, Mail, Home, Building,
  Banknote, CreditCard, FileText, Users, Wallet, CalendarDays,
  Heart, Globe, Droplet, Briefcase, MapPin, ExternalLink, Scale, Hash,
  TrendingUp, TrendingDown, Landmark, AlertTriangle, Shield, CheckCircle2, Lock, KeyRound, PenLine
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export const dynamic = 'force-dynamic'

const formatEnum = (val: string | null | undefined) => {
  if (!val) return "N/A"
  if (val.includes("_POSITIVE")) return val.replace("_POSITIVE", "+")
  if (val.includes("_NEGATIVE")) return val.replace("_NEGATIVE", "-")
  return val.charAt(0) + val.slice(1).toLowerCase().replace("_", " ")
}

// ─── Section header component with colored gradient ──────────────────
function SectionHeader({ icon: Icon, title, gradient }: { icon: LucideIcon, title: string, gradient: string }) {
  return (
    <div className={`flex items-center gap-2 px-5 py-2.5 rounded-t-2xl ${gradient}`}>
      <Icon className="h-4 w-4 text-white" />
      <h3 className="text-sm font-bold text-white tracking-tight">{title}</h3>
    </div>
  )
}

// ─── Info field component ────────────────────────────────────────────
function InfoField({ icon: Icon, label, value }: { icon: LucideIcon, label: string, value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/50 mt-0.5 shrink-0">
        <Icon className="h-3 w-3 text-slate-500 dark:text-slate-400" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">{label}</p>
        <p className="text-[13px] text-slate-800 dark:text-slate-100 font-semibold mt-0.5">{value || "N/A"}</p>
      </div>
    </div>
  )
}

// ─── Address display component ───────────────────────────────────────
function AddressBlock({ title, icon: Icon, address }: { title: string, icon: LucideIcon, address: { village?: string | null; postOffice?: string | null; district?: string | null; postalCode?: string | null } | null | undefined }) {
  return (
    <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800/50">
      <h4 className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 flex items-center gap-1.5 tracking-wider">
        <Icon className="h-3 w-3" /> {title}
      </h4>
      <div>
        <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Address</p>
        <p className="text-slate-700 dark:text-slate-200 mt-0.5 text-xs font-medium">{address?.village || "N/A"}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Post Office</p>
          <p className="text-slate-700 dark:text-slate-200 mt-0.5 text-xs font-medium">{address?.postOffice || "N/A"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">District</p>
          <p className="text-slate-700 dark:text-slate-200 mt-0.5 text-xs font-medium">{address?.district || "N/A"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Post Code</p>
          <p className="text-slate-700 dark:text-slate-200 mt-0.5 text-xs font-medium">{address?.postalCode || "N/A"}</p>
        </div>
      </div>
    </div>
  )
}

export default async function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const member = await prisma.member.findUnique({
    where: { id },
    include: {
      addresses: true,
      nominees: true,
      documents: true,
      savings: true,
      loans: { include: { product: true }, orderBy: { applicationDate: "desc" } },
    },
  })

  if (!member) notFound()

  // Financial stats
  const totalDeposit = member.savings.filter(s => !["WITHDRAWAL", "FINE", "PENALTY", "LOAN_PAYMENT"].includes(s.type)).reduce((acc, s) => acc + Number(s.amount), 0)
  const totalWithdrawal = member.savings.filter(s => s.type === "WITHDRAWAL").reduce((acc, s) => acc + Number(s.amount), 0)
  const loanAmount = member.loans.filter(l => ["DISBURSED", "DEFAULTED", "REPAID"].includes(l.status)).reduce((acc, l) => acc + Number(l.principal), 0)
  const feeSetups = await prisma.feeSetup.findMany()
  const joinDate = member.membershipDate || member.createdAt
  const dues = calculateDues(member.id, joinDate, feeSetups, member.savings)

  const currentAddress = member.addresses.find((a) => a.addressType === "CURRENT")
  const permanentAddress = member.addresses.find((a) => a.addressType === "PERMANENT")
  const idType = member.nidNumber ? "National ID" : member.passportNumber ? "Passport" : member.birthCertificateNo ? "Birth Certificate" : "ID"
  const idNumber = member.nidNumber || member.passportNumber || member.birthCertificateNo || "N/A"

  const stats = [
    { label: "Total Deposit", value: `৳ ${totalDeposit.toLocaleString()}`, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/50", border: "border-emerald-200/50 dark:border-emerald-900/50" },
    { label: "Withdrawal", value: `৳ ${totalWithdrawal.toLocaleString()}`, icon: TrendingDown, color: "text-rose-600", bg: "bg-rose-50 dark:bg-rose-950/50", border: "border-rose-200/50 dark:border-rose-900/50" },
    { label: "Loan Amount", value: `৳ ${loanAmount.toLocaleString()}`, icon: Landmark, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/50", border: "border-blue-200/50 dark:border-blue-900/50" },
    { label: "Due Balance", value: `৳ ${dues.totalDue.toLocaleString()}`, icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/50", border: "border-amber-200/50 dark:border-amber-900/50" },
  ]

  return (
    <div className="space-y-6">
      {/* ─── Sticky Action Bar ─── */}
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-white dark:bg-slate-950 border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <Link href="/dashboard/members">
            <Button variant="outline" size="sm" className="rounded-xl shadow-sm hover:shadow-md transition-all bg-slate-50 dark:bg-slate-900">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Members
            </Button>
          </Link>
          <div className="flex gap-2">
            <KycToggleButton memberId={member.id} kycVerified={member.kycVerified} />
            <StatusToggleButton memberId={member.id} status={member.status} />
            <Button variant="outline" size="sm" nativeButton={false} className="rounded-xl shadow-sm hover:shadow-md transition-all bg-slate-50 dark:bg-slate-900"
              render={<Link href={`/api/members/${member.id}/print-form`} target="_blank" rel="noopener noreferrer" />}
            >
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            {member.status === "ACTIVE" && (
              <form action={async () => {
                "use server"
                const res = await resetMemberCredentials(member.id)
                if (!res.ok) throw new Error(res.error || "Could not send credentials.")
              }}>
                <Button type="submit" variant="outline" size="sm" className="rounded-xl shadow-sm hover:shadow-md transition-all bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/50 hover:bg-amber-100 dark:hover:bg-amber-900/50">
                  <KeyRound className="mr-2 h-4 w-4" /> Reset Credentials
                </Button>
              </form>
            )}
            <Link href={`/dashboard/members/${member.id}/edit`}>
              <Button size="sm" className="rounded-xl shadow-md hover:shadow-lg hover:bg-indigo-500 transition-all bg-indigo-600"><Edit className="mr-2 h-4 w-4" /> Edit Profile</Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ─── Financial Summary Cards ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card key={index} className={`bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border ${stat.border} ${stat.bg} shadow-sm hover:shadow-lg hover:-translate-y-1 rounded-2xl overflow-hidden transition-all duration-300`}>
            <CardContent className="p-3 flex flex-row items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 dark:text-slate-400">{stat.label}</span>
                <h3 className={`text-lg font-extrabold tracking-tight ${stat.color}`}>{stat.value}</h3>
              </div>
              <stat.icon className={`h-8 w-8 ${stat.color} opacity-80`} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ─── Main Layout: Left (1/4) + Right (3/4) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">

        {/* ═══ LEFT COLUMN: Profile + Signature (1/4) ═══ */}
        <div className="lg:col-span-1 space-y-4">
          {/* Profile Card */}
          <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-xl rounded-2xl overflow-hidden">
            <CardContent className="flex flex-col items-center text-center pt-6 pb-4 px-4">
              {member.photoUrl ? (
                <ZoomableImage src={member.photoUrl} alt="Member Photo" caption={`${member.fullName} — Photo`} className="w-24 h-24 rounded-full object-cover ring-4 ring-white dark:ring-slate-900 shadow-xl" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-3xl font-bold text-indigo-600 ring-4 ring-white dark:ring-slate-900 shadow-xl">
                  {member.fullName.charAt(0)}
                </div>
              )}
              <h2 className="mt-3 text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">{member.fullName}</h2>
              <p className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">{member.memberNo}</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <Badge variant={member.status === "ACTIVE" ? "default" : "secondary"} className={`uppercase text-[10px] px-2.5 py-1 rounded-full font-bold ${member.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" : "bg-amber-500/10 text-amber-600 border border-amber-500/20"}`}>
                  {member.status}
                </Badge>
                <Badge variant="outline" className={`uppercase text-[10px] px-2.5 py-1 rounded-full font-bold ${member.kycVerified ? "bg-cyan-500/10 text-cyan-600 border border-cyan-500/20" : "bg-amber-500/10 text-amber-600 border border-amber-500/20"}`}>
                  {member.kycVerified ? <Shield className="w-3 h-3 mr-1 inline" /> : <AlertTriangle className="w-3 h-3 mr-1 inline" />}
                  {member.kycVerified ? "KYC Verified" : "KYC Pending"}
                </Badge>
              </div>
              <div className="mt-2">
                <StatusToggleButton memberId={member.id} status={member.status} />
              </div>
            </CardContent>
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                  <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Joined</p>
                  <p className="text-slate-700 dark:text-slate-200 font-bold text-xs">{new Date(member.membershipDate).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                  <CreditCard className="h-3.5 w-3.5 text-slate-500" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{idType}</p>
                  <p className="text-slate-700 dark:text-slate-200 font-bold text-xs">{idNumber}</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Member Signature Card */}
          <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-xl rounded-2xl overflow-hidden">
            <SectionHeader icon={PenLine} title="Member Signature" gradient="bg-gradient-to-r from-blue-500 to-blue-600" />
            <CardContent className="pt-3 px-5 pb-4">
              {member.signatureUrl ? (
                <div className="flex items-center justify-center bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                  <ZoomableImage src={member.signatureUrl} alt="Member Signature" caption={`${member.fullName} — Signature`} className="max-h-20 object-contain" />
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-6">No signature uploaded.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ═══ RIGHT SIDE (3/4) ═══ */}
        <div className="lg:col-span-3 space-y-4">

          {/* ─── Row 1: Personal Info (2/3) + Contact + Documents (1/3) ─── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Personal Information */}
            <Card className="md:col-span-2 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-xl rounded-2xl overflow-hidden">
              <SectionHeader icon={User} title="Personal Information" gradient="bg-gradient-to-r from-blue-500 to-blue-600" />
              <CardContent className="grid gap-4 sm:grid-cols-3 pt-4 px-5 pb-4">
                <InfoField icon={User} label="First Name" value={member.firstName} />
                <InfoField icon={User} label="Last Name" value={member.lastName} />
                <InfoField icon={Heart} label="Spouse Name" value={member.spouseName} />
                <InfoField icon={CalendarDays} label="Date of Birth" value={member.dateOfBirth ? new Date(member.dateOfBirth).toLocaleDateString() : null} />
                <InfoField icon={User} label="Gender" value={formatEnum(member.gender)} />
                <InfoField icon={Heart} label="Marital Status" value={formatEnum(member.maritalStatus)} />
                <InfoField icon={CalendarDays} label="Marriage Date" value={member.marriageDate ? new Date(member.marriageDate).toLocaleDateString() : null} />
                <InfoField icon={Globe} label="Religion" value={member.religion} />
                <InfoField icon={Globe} label="Nationality" value={member.nationality} />
                <InfoField icon={Droplet} label="Blood Group" value={formatEnum(member.bloodGroup)} />
                <InfoField icon={Briefcase} label="Profession" value={member.profession} />
                <InfoField icon={CreditCard} label="National ID" value={member.nidNumber} />
              </CardContent>
            </Card>

            {/* Contact + Documents (stacked) */}
            <div className="space-y-4">
              {/* Contact Information */}
              <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-xl rounded-2xl overflow-hidden">
                <SectionHeader icon={Phone} title="Contact Information" gradient="bg-gradient-to-r from-emerald-500 to-emerald-600" />
                <CardContent className="space-y-3 pt-4 px-5 pb-4">
                  <InfoField icon={Phone} label="Phone Number" value={member.phone} />
                  <InfoField icon={Mail} label="Email Address" value={member.email} />
                  <InfoField icon={Phone} label="Emergency Contact" value={member.emergencyPhone} />
                  <InfoField icon={User} label="Emergency Person" value={member.emergencyContactName} />
                </CardContent>
              </Card>

              {/* Documents */}
              <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-xl rounded-2xl overflow-hidden">
                <SectionHeader icon={FileText} title="Documents" gradient="bg-gradient-to-r from-blue-500 to-blue-600" />
                <CardContent className="pt-3 px-5 pb-3 space-y-2">
                  {member.documents.length > 0 ? (
                    member.documents.map((doc) => (
                      <a key={doc.id} href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <FileText className="h-4 w-4 text-slate-500 shrink-0" />
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate flex-1">{doc.name || doc.documentType}</span>
                        <ExternalLink className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      </a>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500 text-center py-4">No documents uploaded.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ─── Row 2: Residence (3/5) + Bank Details (2/5) ─── */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Residence Information */}
            <Card className="md:col-span-3 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-xl rounded-2xl overflow-hidden">
              <SectionHeader icon={Home} title="Residence Information" gradient="bg-gradient-to-r from-slate-500 to-slate-600" />
              <CardContent className="grid gap-4 md:grid-cols-2 pt-4 px-5 pb-4">
                <AddressBlock title="Current Address" icon={MapPin} address={currentAddress} />
                <AddressBlock title="Permanent Address" icon={Building} address={permanentAddress} />
              </CardContent>
            </Card>

            {/* Bank Details */}
            <Card className="md:col-span-2 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-xl rounded-2xl overflow-hidden">
              <SectionHeader icon={CreditCard} title="Bank Details" gradient="bg-gradient-to-r from-amber-500 to-amber-600" />
              <CardContent className="space-y-3 pt-4 px-5 pb-4">
                <InfoField icon={User} label="Account Name" value={member.accountName} />
                <InfoField icon={CreditCard} label="Account Number" value={member.accountNumber} />
                <InfoField icon={Building} label="Bank Name" value={member.bankName} />
                <InfoField icon={MapPin} label="Branch" value={member.branch} />
                <InfoField icon={Hash} label="Routing Number" value={member.routingNumber} />
              </CardContent>
            </Card>
          </div>

          {/* ─── Row 3: Nominees (full width) ─── */}
          <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-xl rounded-2xl overflow-hidden">
            <SectionHeader icon={Users} title="Nominees" gradient="bg-gradient-to-r from-purple-500 to-purple-600" />
            <CardContent className="pt-4 px-5 pb-4">
              {member.nominees.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {member.nominees.map((nom) => (
                    <div key={nom.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                      {nom.photoUrl ? (
                        <ZoomableImage src={nom.photoUrl} alt={`${nom.name} Photo`} caption={`${nom.name} — Nominee Photo`} className="w-10 h-10 rounded-full object-cover ring-2 ring-white dark:ring-slate-800 shadow-sm shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 font-bold text-xs ring-2 ring-white dark:ring-slate-800 shrink-0">
                          {nom.name.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{nom.name}</p>
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{nom.relation} | {nom.phone || "No Phone"}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900 text-[10px] px-2 py-0.5 rounded-full font-bold">
                            <Scale className="h-3 w-3 mr-1" /> {Number(nom.sharePercentage)}%
                          </Badge>
                          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider truncate">{nom.idType || "NID"}: {nom.nidNumber || "N/A"}</span>
                        </div>
                        {nom.signatureUrl && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <PenLine className="h-3 w-3 text-slate-400 shrink-0" />
                            <div className="bg-white dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800 px-2 py-0.5">
                              <ZoomableImage src={nom.signatureUrl} alt={`${nom.name} Signature`} caption={`${nom.name} — Nominee Signature`} className="max-h-10 object-contain" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-6">No nominees registered.</p>
              )}
            </CardContent>
          </Card>

          {/* ─── Row 4: Recent Financial Activity (full width) ─── */}
          <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-xl rounded-2xl overflow-hidden">
            <SectionHeader icon={Wallet} title="Recent Financial Activity" gradient="bg-gradient-to-r from-emerald-500 to-emerald-600" />
            <CardContent className="pt-3 px-5">
              {member.savings.length > 0 ? (
                <div className="space-y-2">
                  {member.savings.slice(0, 5).map((sav) => (
                    <div key={sav.id} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Wallet className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-bold text-xs text-slate-900 dark:text-white">{sav.type}</p>
                          <p className="text-[11px] font-medium text-slate-500">{new Date(sav.date).toLocaleDateString()} via {sav.method}</p>
                        </div>
                      </div>
                      <span className="font-bold text-emerald-600 text-xs">+ ৳ {Number(sav.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-6">No recent transactions.</p>
              )}
            </CardContent>
          </Card>

          {/* ─── Row 5: Loans (full width) ─── */}
          <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-xl rounded-2xl overflow-hidden">
            <SectionHeader icon={Landmark} title="Loans" gradient="bg-gradient-to-r from-blue-500 to-blue-600" />
            <CardContent className="pt-3 px-5">
              {member.loans.length > 0 ? (
                <div className="overflow-x-auto -mx-5">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                        <th className="text-left font-bold px-5 py-2">Loan No</th>
                        <th className="text-left font-bold px-3 py-2">Product</th>
                        <th className="text-right font-bold px-3 py-2">Principal</th>
                        <th className="text-right font-bold px-3 py-2">Outstanding</th>
                        <th className="text-center font-bold px-3 py-2">Status</th>
                        <th className="text-right font-bold px-5 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {member.loans.map((loan) => (
                        <tr key={loan.id} className="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="px-5 py-3 font-mono text-xs text-slate-500">{loan.loanNo}</td>
                          <td className="px-3 py-3 text-slate-700 dark:text-slate-200">{loan.product.name}</td>
                          <td className="px-3 py-3 text-right font-semibold text-slate-900 dark:text-white">৳ {Number(loan.principal).toLocaleString()}</td>
                          <td className="px-3 py-3 text-right font-bold text-amber-600">৳ {Number(loan.outstandingBalance).toLocaleString()}</td>
                          <td className="px-3 py-3 text-center">
                            <Badge variant="outline" className={`uppercase text-[10px] px-2 py-0.5 rounded-full font-bold ${
                              loan.status === "DISBURSED" ? "bg-indigo-500/10 text-indigo-600 border-indigo-500/20" :
                              loan.status === "REPAID" || loan.status === "CLOSED" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                              loan.status === "PENDING" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                              "bg-slate-500/10 text-slate-600 border-slate-500/20"
                            }`}>
                              {loan.status.replace("_", " ")}
                            </Badge>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <Link href={`/dashboard/loans/${loan.id}`} className="text-xs font-semibold text-indigo-600 hover:underline">View →</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-6">No loans for this member.</p>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  )
}
