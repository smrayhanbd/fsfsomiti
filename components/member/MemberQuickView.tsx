"use client"

import React, { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Eye, Edit, Phone, Mail, Wallet, AlertTriangle, Users, Shield,
    ShieldCheck, ShieldX, PauseCircle, PlayCircle, Loader2, CalendarDays,
    Hash, CreditCard, TrendingUp, Receipt, IdCard,
} from "lucide-react"
import ZoomableImage from "@/components/member/ZoomableImage"
import { updateMemberStatus, setMemberKyc } from "@/app/actions/member"

export interface QuickViewMember {
    id: string
    fullName: string
    memberNo: string
    phone: string
    email: string | null
    gender: "MALE" | "FEMALE" | "OTHER"
    status: string
    kycVerified: boolean
    photoUrl: string | null
    profession: string | null
    membershipDate: string
    createdAt: string
    dueBalance: number
    lateFines: number
    savings: { amount: number }[]
    nomineesCount?: number
}

interface Props {
    member: QuickViewMember | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    ACTIVE: { bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-300", label: "Active" },
    PENDING: { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-300", label: "Pending" },
    SUSPENDED: { bg: "bg-red-500/10", text: "text-red-700 dark:text-red-300", label: "Suspended" },
    INACTIVE: { bg: "bg-slate-500/10", text: "text-slate-700 dark:text-slate-300", label: "Inactive" },
    REJECTED: { bg: "bg-rose-500/10", text: "text-rose-700 dark:text-rose-300", label: "Rejected" },
}

export default function MemberQuickView({ member, open, onOpenChange }: Props) {
    const [pendingStatus, startStatusTransition] = usePendingAction()
    const [pendingKyc, startKycTransition] = usePendingAction()

    if (!member) return null

    const totalSavings = member.savings.reduce((acc, s) => acc + s.amount, 0)
    const initials = member.fullName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
    const avatarColors: Record<string, string> = {
        MALE: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300",
        FEMALE: "bg-pink-100 text-pink-600 dark:bg-pink-900/40 dark:text-pink-300",
        OTHER: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300",
    }
    const st = statusConfig[member.status] || statusConfig.PENDING

    const handleToggleStatus = () => {
        const isSuspended = member.status === "SUSPENDED" || member.status === "INACTIVE"
        const next: "ACTIVE" | "SUSPENDED" | "INACTIVE" = isSuspended ? "ACTIVE" : "SUSPENDED"
        const verb = isSuspended ? "activate" : "suspend"
        if (confirm(`Are you sure you want to ${verb} ${member.fullName}?`)) {
            startStatusTransition(async () => {
                await updateMemberStatus(member.id, next)
                toast.success(`${member.fullName} ${next === "ACTIVE" ? "activated" : "suspended"}.`)
                onOpenChange(false)
            })
        }
    }

    const handleToggleKyc = () => {
        startKycTransition(async () => {
            await setMemberKyc(member.id, !member.kycVerified)
            toast.success(`KYC ${member.kycVerified ? "revoked" : "verified"} for ${member.fullName}.`)
            onOpenChange(false)
        })
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:!max-w-md p-0 overflow-y-auto">
                {/* Header with gradient + avatar */}
                <div className="relative bg-gradient-to-br from-indigo-600 to-violet-700 dark:from-indigo-700 dark:to-violet-900 px-6 pt-8 pb-6 text-white">
                    <SheetHeader className="p-0">
                        <SheetTitle className="sr-only">{member.fullName}</SheetTitle>
                        <SheetDescription className="sr-only">Member quick view</SheetDescription>
                    </SheetHeader>
                    <div className="flex items-center gap-4">
                        {member.photoUrl ? (
                            <ZoomableImage src={member.photoUrl} alt={member.fullName} caption={`${member.fullName} — Photo`} className="w-20 h-20 rounded-2xl object-cover ring-4 ring-white/20 shadow-xl" />
                        ) : (
                            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold ring-4 ring-white/20 shadow-xl ${avatarColors[member.gender]}`}>
                                {initials}
                            </div>
                        )}
                        <div className="min-w-0">
                            <h2 className="text-xl font-bold tracking-tight truncate">{member.fullName}</h2>
                            <p className="text-indigo-100 text-sm font-mono flex items-center gap-1.5 mt-0.5">
                                <Hash className="w-3.5 h-3.5" /> {member.memberNo}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-white/15 backdrop-blur`}>
                                    {st.label}
                                </span>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${member.kycVerified ? "bg-emerald-400/20" : "bg-amber-400/20"}`}>
                                    <Shield className="w-3 h-3" />
                                    {member.kycVerified ? "KYC Verified" : "KYC Pending"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5">
                    {/* Quick stats */}
                    <div className="grid grid-cols-3 gap-3">
                        <StatTile icon={<Wallet className="w-4 h-4" />} label="Savings" value={`৳${totalSavings.toLocaleString()}`} tone="emerald" />
                        <StatTile icon={<AlertTriangle className="w-4 h-4" />} label="Due" value={`৳${member.dueBalance.toLocaleString()}`} tone={member.dueBalance > 0 ? "red" : "slate"} />
                        <StatTile icon={<Users className="w-4 h-4" />} label="Nominees" value={String(member.nomineesCount ?? "—")} tone="indigo" />
                    </div>

                    {/* Contact */}
                    <Section title="Contact">
                        <Row icon={<Phone className="w-4 h-4" />} label="Phone" value={member.phone} />
                        <Row icon={<Mail className="w-4 h-4" />} label="Email" value={member.email || "—"} />
                        <Row icon={<TrendingUp className="w-4 h-4" />} label="Profession" value={member.profession || "—"} />
                        <Row icon={<CalendarDays className="w-4 h-4" />} label="Joined" value={new Date(member.membershipDate).toLocaleDateString()} />
                    </Section>

                    {/* Money snapshot */}
                    <Section title="Financials">
                        <Row icon={<Receipt className="w-4 h-4" />} label="Total Savings" value={`৳${totalSavings.toLocaleString()}`} valueClass="text-emerald-600 dark:text-emerald-400 font-semibold" />
                        <Row icon={<AlertTriangle className="w-4 h-4" />} label="Due Balance" value={`৳${member.dueBalance.toLocaleString()}`} valueClass={member.dueBalance > 0 ? "text-red-600 dark:text-red-400 font-semibold" : "text-slate-600 dark:text-slate-300"} />
                        {member.lateFines > 0 && (
                            <Row icon={<CreditCard className="w-4 h-4" />} label="Late Fines" value={`৳${member.lateFines.toLocaleString()}`} valueClass="text-orange-600 dark:text-orange-400 font-semibold" />
                        )}
                    </Section>

                    {/* Actions */}
                    <div className="grid grid-cols-2 gap-2 pt-2">
                        <Link href={`/dashboard/members/${member.id}`} onClick={() => onOpenChange(false)}>
                            <Button variant="outline" className="w-full h-10">
                                <Eye className="w-4 h-4 mr-1.5" /> Full Profile
                            </Button>
                        </Link>
                        <Link href={`/dashboard/members/${member.id}/edit`} onClick={() => onOpenChange(false)}>
                            <Button variant="outline" className="w-full h-10">
                                <Edit className="w-4 h-4 mr-1.5" /> Edit
                            </Button>
                        </Link>
                        <Button
                            onClick={handleToggleKyc}
                            disabled={pendingKyc}
                            variant="outline"
                            className={`w-full h-10 ${member.kycVerified ? "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30" : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"}`}
                        >
                            {pendingKyc ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : (member.kycVerified ? <ShieldX className="w-4 h-4 mr-1.5" /> : <ShieldCheck className="w-4 h-4 mr-1.5" />)}
                            {member.kycVerified ? "Revoke KYC" : "Verify KYC"}
                        </Button>
                        <Button
                            onClick={handleToggleStatus}
                            disabled={pendingStatus}
                            variant="outline"
                            className={`w-full h-10 ${member.status === "SUSPENDED" ? "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30" : "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"}`}
                        >
                            {pendingStatus ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : (member.status === "SUSPENDED" ? <PlayCircle className="w-4 h-4 mr-1.5" /> : <PauseCircle className="w-4 h-4 mr-1.5" />)}
                            {member.status === "SUSPENDED" ? "Activate" : "Suspend"}
                        </Button>
                    </div>

                    {/* ID Card download — opens in a new tab via the API route. */}
                    <Link href={`/api/members/${member.id}/id-card`} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" className="w-full h-10">
                            <IdCard className="w-4 h-4 mr-1.5" /> Download ID Card
                        </Button>
                    </Link>
                </div>
            </SheetContent>
        </Sheet>
    )
}

// Small inline helpers to keep the drawer tidy
function StatTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "emerald" | "red" | "indigo" | "slate" }) {
    const tones: Record<string, string> = {
        emerald: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
        red: "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400",
        indigo: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400",
        slate: "bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300",
    }
    return (
        <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/60 p-3 text-center">
            <div className={`w-8 h-8 rounded-lg mx-auto flex items-center justify-center mb-1.5 ${tones[tone]}`}>{icon}</div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">{label}</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{value}</p>
        </div>
    )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h3 className="text-[11px] uppercase font-bold tracking-widest text-slate-400 mb-2">{title}</h3>
            <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/60 divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
                {children}
            </div>
        </div>
    )
}

function Row({ icon, label, value, valueClass }: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) {
    return (
        <div className="flex items-center gap-3 px-3.5 py-2.5 bg-white dark:bg-slate-950">
            <span className="text-slate-400">{icon}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 flex-1">{label}</span>
            <span className={`text-sm ${valueClass || "text-slate-800 dark:text-slate-100"} truncate max-w-[60%] text-right`}>{value}</span>
        </div>
    )
}

// Lightweight pending flag without pulling useTransition types around
function usePendingAction() {
    const [pending, setPending] = useState(false)
    const run = async (fn: () => Promise<void>) => {
        setPending(true)
        try { await fn() } finally { setPending(false) }
    }
    const start = (task: () => Promise<void>) => { void run(task) }
    return [pending, start] as const
}
