"use client"

/* eslint-disable @typescript-eslint/no-explicit-any */
// The `member` prop is a JSON-serialized Prisma record (dates -> strings, decimals -> numbers),
// which the rest of this codebase types loosely. Mirrors the original EditMemberForm/ApprovalForm.

import React, { useState, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    User, Calendar as CalendarIcon, Phone, MapPin, Home, Building,
    CreditCard, FileText, Users, Upload, X, Plus, Trash2,
    CheckCircle, AlertCircle, ChevronRight, Circle, ShieldCheck, ShieldX, Loader2,
} from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog"

import { addMember, updateMember } from "@/app/actions/member"
import { approveApplication, rejectMemberWithRemark } from "@/app/actions/approval"

// ─── Types ───────────────────────────────────────────────────────────
type Nominee = {
    id: string; dbId?: string; name: string; relation: string; share: string
    phone: string; idType: "nid" | "birthCert" | "passport"; idNumber: string
    idDocumentFile: File | null; photo: File | null
    // Nominee signature — optional (admins can upload one if available).
    signatureFile: File | null
    // Existing signature URL (edit/review mode) — when set, the field is
    // considered satisfied even if no new File is selected.
    existingSignatureUrl?: string | null
    // Existing photo / ID doc URLs (used by edit/review mode + PDF).
    existingPhotoUrl?: string | null
    existingIdDocUrl?: string | null
}
type AdditionalDocument = { id: string; name: string; file: File | null }

type FormData = {
    memberStatus: "active" | "inactive"; memberNo: string; joinedDate: string; kycVerified: boolean
    firstName: string; lastName: string; fatherName: string; motherName: string; spouseName: string
    dateOfBirth: string; gender: "male" | "female" | "other"; religion: string; nationality: string
    bloodGroup: string; profession: string
    referredByMemberNo: string
    maritalStatus: "married" | "unmarried" | "divorced" | "widowed"; marriageDate: string
    phoneNumber: string; emailAddress: string; emergencyContact: string; emergencyContactName: string
    idType: string; idNumber: string; idDocumentFile: File | null; memberPhoto: File | null
    // Member signature — required for all members (embedded on the PDF).
    signatureFile: File | null
    accountName: string; accountNumber: string; bankName: string; branch: string; routingNumber: string
    currentAddress: string; currentPostOffice: string; currentDistrict: string; currentPostCode: string
    permanentAddress: string; permanentPostOffice: string; permanentDistrict: string; permanentPostCode: string
    additionalDocuments: AdditionalDocument[]; nominees: Nominee[]
}

export type MemberFormMode = "add" | "edit" | "review"

interface MemberFormProps {
    mode: MemberFormMode
    member?: any
}

// ─── Constants ───────────────────────────────────────────────────────
const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
const religions = ["Islam", "Hinduism", "Christianity", "Buddhism", "Other"]
const genders = ["Male", "Female", "Other"]
const maritalStatuses = ["Married", "Unmarried", "Divorced", "Widowed"]
// Shared constants — all 64 districts + all scheduled banks of Bangladesh.
// Defined once in lib/constants.ts so the admin and portal forms stay in sync.
import { BANGLADESH_DISTRICTS, BANGLADESH_BANKS } from "@/lib/constants"
const districts = [...BANGLADESH_DISTRICTS]
const banks = [...BANGLADESH_BANKS]
const idTypes = ["National ID", "Passport", "Birth Certificate"]

// Required fields per the schema constraints AND the completion-progress sidebar.
// The sidebar (`steps` below) tracks 6 sections; this list must cover every
// field those sections check, otherwise the form could be submitted at <100%
// completion. Bank fields are included because the sidebar marks "Bank Details"
// incomplete without them, and the user's requirement is that Save must not
// fire until the sidebar reads 100%.
//
// NOTE: `signatureFile` is a File | null, but it's in this list so the
// validator flags it when missing. The actual "is satisfied" check lives in
// `validateForm()` because it also accepts an existing signature URL
// (edit/review mode).
const requiredFields: (keyof FormData)[] = [
    "firstName", "dateOfBirth", "gender", "maritalStatus",
    "phoneNumber", "emailAddress", "emergencyContactName",
    "idType", "idNumber", "memberPhoto", "idDocumentFile",
    "signatureFile",
    "accountName", "accountNumber", "bankName",
    "currentAddress", "currentDistrict", "permanentAddress", "permanentDistrict",
]

// Friendlier per-field messages instead of a generic "This field is required".
// Falls back to the generic message for any field not listed here.
const requiredFieldMessages: Partial<Record<keyof FormData, string>> = {
    firstName: "First name is required",
    dateOfBirth: "Please select the date of birth",
    gender: "Please select a gender",
    maritalStatus: "Please select a marital status",
    phoneNumber: "Phone number is required (11 digits)",
    emailAddress: "Email address is required",
    emergencyContactName: "Emergency contact person name is required",
    idType: "Please select an ID type",
    idNumber: "ID number is required",
    memberPhoto: "Please upload a member photo",
    idDocumentFile: "Please upload the ID document",
    signatureFile: "Please upload the member's signature",
    accountName: "Bank account name is required",
    accountNumber: "Bank account number is required",
    bankName: "Please select a bank",
    currentAddress: "Current address is required",
    currentDistrict: "Please select the current district",
    permanentAddress: "Permanent address is required",
    permanentDistrict: "Please select the permanent district",
}

// Premium dark-mode-aware section cards. Each section has its own accent color.
const sectionColors = {
    personal: { bg: "bg-blue-50 dark:bg-slate-900/40", border: "border-blue-200 dark:border-slate-700/50", header: "bg-blue-600", topBorder: "border-t-blue-600" },
    contact: { bg: "bg-green-50 dark:bg-slate-900/40", border: "border-green-200 dark:border-slate-700/50", header: "bg-green-600", topBorder: "border-t-green-600" },
    bank: { bg: "bg-yellow-50 dark:bg-slate-900/40", border: "border-yellow-200 dark:border-slate-700/50", header: "bg-yellow-600", topBorder: "border-t-yellow-600" },
    residence: { bg: "bg-gray-50 dark:bg-slate-900/40", border: "border-gray-300 dark:border-slate-700/50", header: "bg-gray-600", topBorder: "border-t-gray-600" },
    docs: { bg: "bg-blue-50 dark:bg-slate-900/40", border: "border-blue-200 dark:border-slate-700/50", header: "bg-blue-500", topBorder: "border-t-blue-500" },
    nominees: { bg: "bg-green-50 dark:bg-slate-900/40", border: "border-green-200 dark:border-slate-700/50", header: "bg-green-500", topBorder: "border-t-green-500" },
} as const

// Shared input class — dark-mode native, indigo focus ring, optional error border.
const inputBase = "w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-colors"

function SectionCard({ color, children, title, icon }: {
    color: { bg: string; border: string; header: string; topBorder: string }
    children: React.ReactNode
    title: string
    icon: React.ReactNode
}) {
    return (
        <div className={`rounded-xl shadow-md border ${color.bg} ${color.border} border-t-4 ${color.topBorder} h-full flex flex-col`}>
            <div className={`${color.header} text-white px-6 py-3 rounded-t-xl flex items-center gap-2 shrink-0`}>
                {icon}<h2 className="text-base font-semibold">{title}</h2>
            </div>
            <div className="p-6 flex-grow">{children}</div>
        </div>
    )
}

function EnterpriseDatePicker({ value, onChange, hasError }: {
    value: string; onChange: (val: string) => void; hasError?: boolean
}) {
    return (
        <input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputBase} ${hasError ? "border-red-500" : "border-gray-300 dark:border-slate-700"}`}
        />
    )
}

// Module-level helper hoisted out of the component so the React Compiler
// doesn't flag it as a "component created during render". Takes the state
// it needs as explicit props. (`fieldClass` stays in-component — it returns
// a string, so the rule doesn't apply to it.)
type ErrorMap = Record<string, string>

function FieldError({ name, errors, submitAttempted }: {
    name: string; errors: ErrorMap; submitAttempted: boolean
}) {
    if (!errors[name] || !submitAttempted) return null
    return (
        <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {errors[name]}
        </p>
    )
}


// ─── Helpers to load member record into FormData (edit/review modes) ─
function memberToFormData(member: any): FormData {
    const currentAddr = member.addresses?.find((a: any) => a.addressType === "CURRENT") || {}
    const permanentAddr = member.addresses?.find((a: any) => a.addressType === "PERMANENT") || {}
    const idTypeGuess = member.nidNumber ? "National ID" : member.passportNumber ? "Passport" : member.birthCertificateNo ? "Birth Certificate" : "National ID"

    return {
        memberStatus: (member.status?.toLowerCase() === "inactive" ? "inactive" : "active") as "active" | "inactive",
        memberNo: member.memberNo || "",
        joinedDate: member.membershipDate ? new Date(member.membershipDate).toISOString().split("T")[0] : "",
        kycVerified: !!member.kycVerified,
        firstName: member.firstName || "", lastName: member.lastName || "",
        fatherName: member.fatherName || "", motherName: member.motherName || "", spouseName: member.spouseName || "",
        dateOfBirth: member.dateOfBirth ? new Date(member.dateOfBirth).toISOString().split("T")[0] : "",
        gender: ((member.gender || "male")).toLowerCase() as any,
        religion: member.religion || "", nationality: member.nationality || "Bangladeshi",
        bloodGroup: member.bloodGroup || "", profession: member.profession || "",
        // referredByMemberId is resolved server-side; the form shows the referrer's memberNo.
        referredByMemberNo: member.referredByMemberNo || "",
        maritalStatus: ((member.maritalStatus || "unmarried")).toLowerCase() as any,
        marriageDate: member.marriageDate ? new Date(member.marriageDate).toISOString().split("T")[0] : "",
        phoneNumber: member.phone || "", emailAddress: member.email || "",
        emergencyContact: member.emergencyPhone || "", emergencyContactName: member.emergencyContactName || "",
        idType: idTypeGuess,
        idNumber: member.nidNumber || member.passportNumber || member.birthCertificateNo || "",
        idDocumentFile: null, memberPhoto: null,
        signatureFile: null,
        accountName: member.accountName || "", accountNumber: member.accountNumber || "",
        bankName: member.bankName || "", branch: member.branch || "", routingNumber: member.routingNumber || "",
        currentAddress: currentAddr.village || "", currentPostOffice: currentAddr.postOffice || "",
        currentDistrict: currentAddr.district || "", currentPostCode: currentAddr.postalCode || "",
        permanentAddress: permanentAddr.village || "", permanentPostOffice: permanentAddr.postOffice || "",
        permanentDistrict: permanentAddr.district || "", permanentPostCode: permanentAddr.postalCode || "",
        additionalDocuments: [],
        nominees: member.nominees?.map((n: any) => ({
            id: `nom-${n.id}`, dbId: n.id, name: n.name, relation: n.relation,
            share: String(n.sharePercentage), phone: n.phone || "",
            idType: (n.idType || "nid") as "nid" | "birthCert" | "passport",
            idNumber: n.nidNumber || "", idDocumentFile: null, photo: null,
            signatureFile: null,
            existingSignatureUrl: n.signatureUrl || null,
            existingPhotoUrl: n.photoUrl || null,
            existingIdDocUrl: n.idDocumentUrl || null,
        })) || [],
    }
}

const emptyFormData: FormData = {
    memberStatus: "active", memberNo: "", joinedDate: "", kycVerified: false,
    firstName: "", lastName: "", fatherName: "", motherName: "", spouseName: "",
    dateOfBirth: "", gender: "male", religion: "", nationality: "Bangladeshi",
    bloodGroup: "", profession: "", referredByMemberNo: "", maritalStatus: "unmarried", marriageDate: "",
    phoneNumber: "", emailAddress: "", emergencyContact: "", emergencyContactName: "",
    idType: "", idNumber: "", idDocumentFile: null, memberPhoto: null,
    signatureFile: null,
    accountName: "", accountNumber: "", bankName: "", branch: "", routingNumber: "",
    currentAddress: "", currentPostOffice: "", currentDistrict: "", currentPostCode: "",
    permanentAddress: "", permanentPostOffice: "", permanentDistrict: "", permanentPostCode: "",
    additionalDocuments: [], nominees: [],
}

// ─── Build FormData payload shared by all 3 modes ────────────────────
function buildPayload(fd: FormData) {
    const out = new FormData()
    out.append("firstName", fd.firstName); out.append("lastName", fd.lastName)
    out.append("fatherName", fd.fatherName); out.append("motherName", fd.motherName)
    out.append("spouseName", fd.spouseName); out.append("dob", fd.dateOfBirth)
    out.append("gender", fd.gender ? fd.gender.toUpperCase() : "OTHER")
    out.append("religion", fd.religion); out.append("nationality", fd.nationality)
    out.append("bloodGroup", fd.bloodGroup ? fd.bloodGroup.replace("+", "_POSITIVE").replace("-", "_NEGATIVE") : "")
    out.append("profession", fd.profession)
    out.append("maritalStatus", fd.maritalStatus ? fd.maritalStatus.toUpperCase() : "")
    out.append("marriageDate", fd.marriageDate)
    out.append("phone", fd.phoneNumber); out.append("email", fd.emailAddress)
    out.append("emergencyPhone", fd.emergencyContact)
    out.append("emergencyContactName", fd.emergencyContactName)
    out.append("idType", fd.idType); out.append("idNumber", fd.idNumber)
    out.append("accountName", fd.accountName); out.append("accountNumber", fd.accountNumber)
    out.append("bankName", fd.bankName); out.append("branch", fd.branch)
    out.append("routingNumber", fd.routingNumber)
    out.append("c_village", fd.currentAddress); out.append("c_postOffice", fd.currentPostOffice)
    out.append("c_district", fd.currentDistrict); out.append("c_postalCode", fd.currentPostCode)
    out.append("p_village", fd.permanentAddress); out.append("p_postOffice", fd.permanentPostOffice)
    out.append("p_district", fd.permanentDistrict); out.append("p_postalCode", fd.permanentPostCode)

    out.append("joinedDate", fd.joinedDate)
    out.append("memberStatus", fd.memberStatus)
    out.append("kycVerified", fd.kycVerified ? "on" : "off")

    if (fd.memberPhoto) out.append("memberPhoto", fd.memberPhoto)
    if (fd.idDocumentFile) out.append("idDocument", fd.idDocumentFile)
    if (fd.signatureFile) out.append("signature", fd.signatureFile)

    fd.additionalDocuments.forEach((doc, i) => {
        if (doc.name) out.append(`doc_${i}_name`, doc.name)
        if (doc.file) out.append(`doc_${i}_file`, doc.file)
    })

    fd.nominees.forEach((nom, i) => {
        out.append(`nom_${i}_name`, nom.name); out.append(`nom_${i}_relation`, nom.relation)
        out.append(`nom_${i}_share`, nom.share); out.append(`nom_${i}_phone`, nom.phone || "")
        out.append(`nom_${i}_idType`, nom.idType); out.append(`nom_${i}_idNumber`, nom.idNumber)
        if (nom.dbId) out.append(`nom_${i}_dbId`, nom.dbId)
        if (nom.idDocumentFile) out.append(`nom_${i}_idDoc`, nom.idDocumentFile)
        if (nom.photo) out.append(`nom_${i}_photo`, nom.photo)
        if (nom.signatureFile) out.append(`nom_${i}_signature`, nom.signatureFile)
    })

    return out
}

// ═════════════════════════════════════════════════════════════════════
// Main component
// ═════════════════════════════════════════════════════════════════════
export default function MemberForm({ mode, member }: MemberFormProps) {
    const router = useRouter()
    const isEdit = mode === "edit"
    const isReview = mode === "review"

    const [formData, setFormData] = useState<FormData>(
        (isEdit || isReview) && member ? memberToFormData(member) : emptyFormData
    )
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [submitAttempted, setSubmitAttempted] = useState(false)
    const [nomineeIdCounter, setNomineeIdCounter] = useState(formData.nominees.length + 1)
    const [additionalDocCounter, setAdditionalDocCounter] = useState(1)
    const [showNomineeModal, setShowNomineeModal] = useState(false)
    const [editingNomineeId, setEditingNomineeId] = useState<string | null>(null)
    const [nomineeForm, setNomineeForm] = useState<Omit<Nominee, "id">>({
        name: "", relation: "", share: "", phone: "", idType: "nid", idNumber: "",
        idDocumentFile: null, photo: null, signatureFile: null,
        existingSignatureUrl: null, existingPhotoUrl: null, existingIdDocUrl: null,
    })
    const [submitting, setSubmitting] = useState(false)
    const [showRejectDialog, setShowRejectDialog] = useState(false)
    const [rejectRemark, setRejectRemark] = useState("")
    const [rejectPending, setRejectPending] = useState(false)

    // ─── Validation helpers ──────────────────────────────────────────
    const validateMobile = (p: string) => p.replace(/\D/g, "").length === 11
    const validateEmail = (e: string) => { if (!e) return true; return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) }
    const validateIdNumber = (idType: string, idNumber: string) => {
        if (!idNumber) return false
        const digits = idNumber.replace(/\D/g, "")
        if (idType === "National ID") return digits.length === 10 || digits.length === 13 || digits.length === 17
        if (idType === "Passport") return idNumber.length >= 6
        if (idType === "Birth Certificate") return digits.length === 17
        // Unknown idType — accept anything non-empty (defensive default).
        return true
    }
    const validateNomineeShares = (nominees: Nominee[]): string | null => {
        if (nominees.length === 0) return null
        let total = 0
        for (const n of nominees) {
            const s = parseFloat(n.share); if (isNaN(s) || s <= 0) return `Share for "${n.name}" must be a positive number.`
            total += s
        }
        if (total > 100) return `Total nominee shares (${total}%) exceed 100%. Please adjust.`
        return null
    }

    // Nominee share validation is derived from state — no effect needed.
    const nomineeError = useMemo(
        () => validateNomineeShares(formData.nominees) || "",
        [formData.nominees]
    )

    // ─── Completion progress (sidebar) ───────────────────────────────
    // Shown in ALL three modes (add / edit / review) so the admin can see at
    // a glance what's still missing. For edit/review, file-upload steps are
    // considered complete if either a NEW file is selected OR an existing
    // file URL is present on the member record (otherwise editing a member
    // who already has files would always show <100%).
    const existingPhotoUrl = member?.photoUrl
    const existingIdDocUrl = member?.documents?.find((d: any) => d.documentType === formData.idType)?.fileUrl
    const existingSignatureUrl = member?.signatureUrl
    const steps = useMemo(() => [
        { name: "Personal Information", complete: !!(formData.firstName && formData.dateOfBirth && formData.gender && formData.maritalStatus) },
        { name: "Contact & ID", complete: !!(formData.phoneNumber && formData.emailAddress && formData.idType && formData.idNumber && formData.emergencyContactName && (formData.memberPhoto || existingPhotoUrl)) },
        { name: "Bank Details", complete: !!(formData.accountName && formData.accountNumber && formData.bankName) },
        { name: "Address Info", complete: !!(formData.currentAddress && formData.currentDistrict && formData.permanentAddress && formData.permanentDistrict) },
        { name: "Documents & Signature", complete: !!(formData.idDocumentFile || existingIdDocUrl) && !!(formData.signatureFile || existingSignatureUrl) },
        { name: "Nominees", complete: formData.nominees.length > 0 },
         
    ], [formData, existingPhotoUrl, existingIdDocUrl, existingSignatureUrl])
    const completedSteps = steps.filter(s => s.complete).length
    const progress = Math.round((completedSteps / steps.length) * 100)

    // ─── Field change handlers ───────────────────────────────────────
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const target = e.target
        const { name, value, type } = target
        if (type === "checkbox") {
            const checked = (target as HTMLInputElement).checked
            setFormData(prev => ({ ...prev, [name]: checked }))
        } else {
            setFormData(prev => ({ ...prev, [name]: value }))
        }
        if (errors[name]) setErrors(prev => { const n = { ...prev }; delete n[name]; return n })
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: keyof Pick<FormData, "idDocumentFile" | "memberPhoto" | "signatureFile">) =>
        setFormData(prev => ({ ...prev, [field]: e.target.files?.[0] || null }))

    const handleNomineeInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setNomineeForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    const handleNomineeFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: "idDocumentFile" | "photo" | "signatureFile") =>
        setNomineeForm(prev => ({ ...prev, [field]: e.target.files?.[0] || null }))

    // ─── Adult-check helper (for nominee signature requirement) ──────
    // A nominee is considered an adult (signature required) if their DOB is
    // at least 18 years before today. Returns true when the nominee is an
    // adult, false when minor, and true when DOB is unknown (we default to
    // "require" so the operator consciously decides — safer than allowing
    // a missing signature on a potentially-adult nominee).
    const isNomineeAdult = (dob: string | null | undefined): boolean => {
        if (!dob) return true // unknown DOB → default to adult (require signature)
        const d = new Date(dob)
        if (isNaN(d.getTime())) return true
        const eighteenYearsAgo = new Date()
        eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18)
        return d <= eighteenYearsAgo
    }

    const addAdditionalDocument = () => {
        setFormData(prev => ({ ...prev, additionalDocuments: [...prev.additionalDocuments, { id: `doc-${additionalDocCounter}`, name: "", file: null }] }))
        setAdditionalDocCounter(prev => prev + 1)
    }
    const updateAdditionalDocument = (id: string, field: "name" | "file", value: string | File | null) =>
        setFormData(prev => ({ ...prev, additionalDocuments: prev.additionalDocuments.map(d => d.id === id ? { ...d, [field]: value } : d) }))
    const removeAdditionalDocument = (id: string) =>
        setFormData(prev => ({ ...prev, additionalDocuments: prev.additionalDocuments.filter(d => d.id !== id) }))

    const checkNomineeShare = (newNominees: Nominee[], editingId: string | null): boolean => {
        const nomineesToCheck = editingId
            ? newNominees.map(n => n.id === editingId ? { ...n, share: nomineeForm.share } : n)
            : [...newNominees, { ...nomineeForm, id: `temp-${Date.now()}` } as Nominee]
        const error = validateNomineeShares(nomineesToCheck)
        if (error) { toast.error("Nominee share invalid", { description: error }); return false }
        return true
    }

    const resetNomineeForm = () => {
        setNomineeForm({
            name: "", relation: "", share: "", phone: "", idType: "nid", idNumber: "",
            idDocumentFile: null, photo: null, signatureFile: null,
            existingSignatureUrl: null, existingPhotoUrl: null, existingIdDocUrl: null,
        })
        setEditingNomineeId(null)
    }

    const addNominee = () => {
        if (!nomineeForm.name || !nomineeForm.relation || !nomineeForm.share) { toast.error("Please fill all required nominee fields."); return }
        if (!checkNomineeShare(formData.nominees, null)) return
        // Nominee signature is OPTIONAL (per user request — was previously
        // required for adult nominees). Admins can still upload one if available.
        const newNominee: Nominee = { id: `nom-${nomineeIdCounter}`, ...nomineeForm }
        setFormData(prev => ({ ...prev, nominees: [...prev.nominees, newNominee] }))
        setNomineeIdCounter(prev => prev + 1); resetNomineeForm(); setShowNomineeModal(false)
    }
    const editNominee = (id: string) => {
        const n = formData.nominees.find(x => x.id === id)
        if (n) {
            setNomineeForm({
                name: n.name, relation: n.relation, share: n.share, phone: n.phone,
                idType: n.idType, idNumber: n.idNumber,
                idDocumentFile: n.idDocumentFile, photo: n.photo,
                signatureFile: n.signatureFile,
                existingSignatureUrl: n.existingSignatureUrl,
                existingPhotoUrl: n.existingPhotoUrl,
                existingIdDocUrl: n.existingIdDocUrl,
            })
            setEditingNomineeId(id); setShowNomineeModal(true)
        }
    }
    const updateNominee = () => {
        if (!nomineeForm.name || !nomineeForm.relation || !nomineeForm.share) { toast.error("Please fill all required nominee fields."); return }
        if (!checkNomineeShare(formData.nominees, editingNomineeId)) return
        // Nominee signature is OPTIONAL (per user request).
        setFormData(prev => ({ ...prev, nominees: prev.nominees.map(n => n.id === editingNomineeId ? { ...n, ...nomineeForm } : n) }))
        resetNomineeForm(); setShowNomineeModal(false)
    }
    const deleteNominee = (id: string) => {
        if (confirm("Remove this nominee?")) {
            const next = formData.nominees.filter(n => n.id !== id)
            const err = validateNomineeShares(next)
            if (err) { toast.error(err); return }
            setFormData(prev => ({ ...prev, nominees: next }))
        }
    }

    const validateForm = () => {
        const newErrors: Record<string, string> = {}
        // `existingPhotoUrl`, `existingIdDocUrl`, `existingSignatureUrl` are
        // computed at component scope (used by both the completion sidebar and
        // this validator). For edit/review mode, file-upload fields are
        // considered satisfied if either a NEW file is selected OR an existing
        // file URL is present.
        const existingSignatureUrl = member?.signatureUrl
        requiredFields.forEach((field) => {
            const value = formData[field]
            if (!value || value === "") {
                // File-upload grace: skip the required check if an existing file is on record.
                if (field === "memberPhoto" && existingPhotoUrl) return
                if (field === "idDocumentFile" && existingIdDocUrl) return
                if (field === "signatureFile" && existingSignatureUrl) return
                newErrors[field] = requiredFieldMessages[field] || "This field is required"
            }
        })
        if (formData.phoneNumber && !validateMobile(formData.phoneNumber)) newErrors.phoneNumber = "Must be exactly 11 digits (e.g., 01712345678)"
        if (formData.emergencyContact && !validateMobile(formData.emergencyContact)) newErrors.emergencyContact = "Must be exactly 11 digits"
        if (formData.emailAddress && !validateEmail(formData.emailAddress)) newErrors.emailAddress = "Invalid email format"
        if (formData.idType && formData.idNumber && !validateIdNumber(formData.idType, formData.idNumber)) {
            if (formData.idType === "National ID") newErrors.idNumber = "NID must be 10, 13, or 17 digits"
            else if (formData.idType === "Birth Certificate") newErrors.idNumber = "Birth Cert must be 17 digits"
            else if (formData.idType === "Passport") newErrors.idNumber = "Passport number must be at least 6 characters"
            else newErrors.idNumber = "Invalid ID number format"
        }
        // Require at least one nominee — the completion sidebar counts this as
        // a step, and the user's requirement is "Save must not fire until 100%".
        if (formData.nominees.length === 0) {
            newErrors.nominees = "At least one nominee is required. Click \"Add Nominee\" to register one."
        } else {
            let total = 0; for (const n of formData.nominees) total += parseFloat(n.share) || 0
            if (total !== 100) newErrors.nominees = `Total nominee shares must equal 100%. Currently at ${total}%.`
            // Also verify each adult nominee has a signature (new file OR existing URL).
            // Minors are exempt; unknown DOB defaults to adult (require signature).
            for (let i = 0; i < formData.nominees.length; i++) {
                const n = formData.nominees[i]
                // nomineeForm has no DOB; we treat all nominees as adults here.
                if (!n.signatureFile && !n.existingSignatureUrl) {
                    newErrors.nominees = `Nominee #${i + 1} (${n.name || "unnamed"}) is missing a signature. Adult nominees must sign — open the nominee and upload a signature.`
                    break
                }
            }
        }
        setErrors(newErrors)
        return newErrors
    }

    // Scroll + focus the first field that has an error, so the user is taken
    // directly to the missing required field instead of having to hunt for it.
    // Uses `[data-field="..."]` for wrappers that don't have a `name` attribute
    // (file uploads, the date picker, the nominees section), and falls back to
    // `[name="..."]` for regular inputs/selects.
    const scrollToFirstError = (errs: Record<string, string>) => {
        const firstKey = Object.keys(errs)[0]
        if (!firstKey) return
        let el: HTMLElement | null = document.querySelector(`[data-field="${firstKey}"]`)
        if (!el) el = document.querySelector(`[name="${firstKey}"]`) as HTMLElement | null
        if (!el) return
        el.scrollIntoView({ behavior: "smooth", block: "center" })
        const focusable = el.matches("input, select, textarea")
            ? el
            : el.querySelector("input, select, textarea, button") as HTMLElement | null
        if (focusable) {
            // preventScroll so the smooth scroll above isn't interrupted.
            try { focusable.focus({ preventScroll: true }) } catch { focusable.focus() }
        }
    }

    // ─── Submit dispatch based on mode ───────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitAttempted(true)
        const formErrors = validateForm()
        if (Object.keys(formErrors).length > 0) {
            // Take the user directly to the first missing required field.
            // Slight defer so the error state has painted before we scroll,
            // otherwise scrollIntoView may target a stale position.
            setTimeout(() => scrollToFirstError(formErrors), 0)
            if (formErrors.nominees) {
                toast.error("Form incomplete", { description: `${formErrors.nominees}` })
            } else {
                toast.error("Form incomplete", {
                    description: `Only ${progress}% complete. Please fill all required fields highlighted in red before saving.`,
                })
            }
            return
        }

        const fd = buildPayload(formData)
        setSubmitting(true)
        try {
            if (mode === "add") {
                await addMember(fd)
                toast.success("Member registered", { description: "Application submitted successfully." })
            } else if (mode === "edit" && member) {
                await updateMember(member.id, fd)
                toast.success("Member updated", { description: "Changes saved successfully." })
            } else if (mode === "review" && member) {
                await approveApplication(member.id, fd)
                toast.success("Application approved", { description: "Member activated and credentials sent." })
            }
        } catch (err: any) {
            // Server actions reach navigation by calling redirect(), which
            // throws a NEXT_REDIRECT control-flow error. The action only gets
            // that far after the DB write succeeds, so reaching redirect ==
            // success. Surface the success toast and re-throw so Next.js can
            // perform the navigation; swallowing it would both break navigation
            // and wrongly report a save failure.
            if (err?.message === "NEXT_REDIRECT" || err?.digest?.startsWith("NEXT_REDIRECT")) {
                if (mode === "add") {
                    toast.success("Member registered", { description: "Application submitted successfully." })
                } else if (mode === "edit") {
                    toast.success("Member updated", { description: "Changes saved successfully." })
                } else if (mode === "review") {
                    toast.success("Application approved", { description: "Member activated and credentials sent." })
                }
                throw err
            }
            const code = err?.message || ""
            const map: Record<string, string> = {
                DUPLICATE_BOTH: "A member with this email & phone already exists.",
                DUPLICATE_EMAIL: "A member with this email already exists.",
                DUPLICATE_PHONE: "A member with this phone number already exists.",
                DUPLICATE_ID: "A member with this ID number already exists.",
            }
            toast.error("Could not save member", { description: map[code] || err?.message || "Please try again." })
        } finally {
            setSubmitting(false)
        }
    }

    const handleReject = async () => {
        if (!member) return
        setRejectPending(true)
        try {
            await rejectMemberWithRemark(member.id, rejectRemark)
            toast.success("Application rejected", { description: "The record has been marked as rejected." })
            router.push("/dashboard/approvals")
        } catch (err: any) {
            // rejectMemberWithRemark also calls redirect() on success, which
            // throws NEXT_REDIRECT — treat that as success, not a failure.
            if (err?.message === "NEXT_REDIRECT" || err?.digest?.startsWith("NEXT_REDIRECT")) {
                toast.success("Application rejected", { description: "The record has been marked as rejected." })
                throw err
            }
            toast.error("Could not reject application", { description: err?.message || "Please try again." })
            setRejectPending(false)
        }
    }

    // ─── File upload renderer with existing-file viewer ──────────────
    // Accepts optional `hasError` + `errorText` so the upload box can show a
    // red border + instruction text when the field is required but missing,
    // matching how text inputs render errors via `fieldClass` + `FieldError`.
    const renderFileUpload = (
        file: File | null,
        onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
        onRemove: () => void,
        label: string,
        existingUrl?: string,
        hasError?: boolean,
        errorText?: string,
    ) => {
        return (
            <div>
                <div className={`border-2 border-dashed rounded-lg p-4 transition-colors bg-white dark:bg-slate-950 ${
                    hasError
                        ? "border-red-500"
                        : "border-gray-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500"
                }`}>
                    {file ? (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                                <span className="text-sm text-slate-700 dark:text-slate-200 truncate max-w-[160px]">{file.name}</span>
                                <span className="text-xs text-slate-400">({(file.size / 1024).toFixed(1)} KB)</span>
                            </div>
                            <button type="button" onClick={onRemove} className="text-red-500 hover:text-red-700 shrink-0"><X className="w-4 h-4" /></button>
                        </div>
                    ) : existingUrl ? (
                        <div className="flex flex-col items-center justify-center gap-2">
                            <a href={existingUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 dark:text-indigo-400 underline flex items-center gap-1.5">
                                <FileText className="w-4 h-4" /> View Current File
                            </a>
                            <label className="cursor-pointer text-sm text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1.5">
                                <Upload className="w-3.5 h-3.5" /> Replace File
                                <input type="file" className="hidden" accept="image/*,.pdf" onChange={onFileChange} />
                            </label>
                        </div>
                    ) : (
                        <label className="flex flex-col items-center justify-center cursor-pointer">
                            <Upload className="w-8 h-8 text-slate-400 mb-1" />
                            <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
                            <span className="text-xs text-slate-400">Click to upload</span>
                            <input type="file" className="hidden" accept="image/*,.pdf" onChange={onFileChange} />
                        </label>
                    )}
                </div>
                {hasError && errorText && (
                    <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {errorText}
                    </p>
                )}
            </div>
        )
    }

    // `fieldClass` is an in-component helper (returns a string, not JSX, so the
    // React Compiler rule doesn't apply). `FieldError` is the module-level
    // component above and receives `errors`/`submitAttempted` as explicit props.
    const fieldClass = (name: string) =>
        `${inputBase} ${errors[name] && submitAttempted ? "border-red-500" : "border-gray-300 dark:border-slate-700"}`

    // ─── Breadcrumb / header / submit button per mode ────────────────
    const headerConfig = {
        add: { title: "Add New Member", subtitle: "Complete all required fields to register a new member. Progress is tracked on the right.", submitLabel: "Save Member" },
        edit: { title: "Edit Member Details", subtitle: "Update the fields below. Only uploaded files will replace existing ones.", submitLabel: "Save Changes" },
        review: { title: "Review Application", subtitle: "Verify all details before approving. You can edit any field. Click Approve to activate the member.", submitLabel: "Approve & Activate" },
    }[mode]

    const submitButtonClass = isReview
        ? "bg-emerald-600 hover:bg-emerald-700"
        : "bg-indigo-600 hover:bg-indigo-700"

    const SubmitIcon = isReview ? ShieldCheck : CheckCircle

    return (
        <div className="w-full">
            {/* Breadcrumb */}
            <nav className="flex items-center text-sm text-slate-500 dark:text-slate-400 mb-4">
                <Link href="/dashboard" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Dashboard</Link>
                <ChevronRight className="h-4 w-4 mx-1 text-slate-400" />
                <Link href={isReview ? "/dashboard/approvals" : "/dashboard/members"} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                    {isReview ? "Pending Approvals" : "Member Panel"}
                </Link>
                {isEdit && (
                    <>
                        <ChevronRight className="h-4 w-4 mx-1 text-slate-400" />
                        <Link href={`/dashboard/members/${member?.id}`} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Profile</Link>
                    </>
                )}
                <ChevronRight className="h-4 w-4 mx-1 text-slate-400" />
                <span className="text-slate-900 dark:text-white font-medium">
                    {mode === "add" ? "Add Member" : mode === "edit" ? "Edit Member" : "Review Application"}
                </span>
            </nav>

            {/* Header card */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 bg-white dark:bg-slate-900 rounded-xl shadow-md p-6 border-l-4 border-indigo-600">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{headerConfig.title}</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">{headerConfig.subtitle}</p>
                </div>
                <div className="flex gap-2">
                    {isReview ? (
                        <button
                            type="button"
                            onClick={() => setShowRejectDialog(true)}
                            className="px-4 py-2 border border-red-300 dark:border-red-900/60 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-sm font-medium flex items-center gap-2"
                        >
                            <ShieldX className="w-4 h-4" /> Reject
                        </button>
                    ) : (
                        <Link href={isEdit ? `/dashboard/members/${member?.id}` : isReview ? "/dashboard/approvals" : "/dashboard/members"}>
                            <button type="button" className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</button>
                        </Link>
                    )}
                    <button
                        type="submit"
                        form="memberForm"
                        disabled={submitting}
                        className={`px-6 py-2 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium shadow-md disabled:opacity-60 disabled:cursor-not-allowed ${submitButtonClass}`}
                    >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <SubmitIcon className="w-4 h-4" />}
                        {submitting ? "Saving..." : headerConfig.submitLabel}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-12 gap-y-6">
                {/* LEFT: form */}
                <div className="lg:col-span-9 space-y-6">
                    <form id="memberForm" onSubmit={handleSubmit} className="space-y-6">
                        {/* Status / Joined / KYC */}
                        <Card className="bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800">
                            <CardContent className="p-6">
                                <div className="flex flex-wrap items-center gap-6">
                                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                                        <span className="w-16">Status</span>
                                        <select
                                            name="memberStatus"
                                            value={formData.memberStatus}
                                            onChange={handleInputChange}
                                            className={`${inputBase} border-gray-300 dark:border-slate-700 w-32 py-1.5`}
                                        >
                                            <option value="active">Active</option>
                                            <option value="inactive">Inactive</option>
                                        </select>
                                    </label>
                                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                                        <CalendarIcon className="w-4 h-4 text-slate-400" />
                                        <span className="w-14">Joined</span>
                                        <div className="w-40"><EnterpriseDatePicker value={formData.joinedDate} onChange={v => setFormData(p => ({ ...p, joinedDate: v }))} /></div>
                                    </label>
                                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                                        <Checkbox
                                            name="kycVerified"
                                            checked={formData.kycVerified}
                                            onCheckedChange={(c) => setFormData(p => ({ ...p, kycVerified: c === true }))}
                                        />
                                        KYC Verified
                                    </label>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-6 items-stretch">
                            {/* Personal Information */}
                            <SectionCard color={sectionColors.personal} title="Personal Information" icon={<User className="w-5 h-5" />}>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">First Name <span className="text-red-500">*</span></Label>
                                            <input type="text" name="firstName" value={formData.firstName} onChange={handleInputChange} placeholder="Ariful" className={fieldClass("firstName")} />
                                            <FieldError name="firstName" errors={errors} submitAttempted={submitAttempted} />
                                        </div>
                                        <div>
                                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Last Name</Label>
                                            <input type="text" name="lastName" value={formData.lastName} onChange={handleInputChange} placeholder="Chowdhury" className={fieldClass("lastName")} />
                                            <FieldError name="lastName" errors={errors} submitAttempted={submitAttempted} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Father&apos;s Name</Label>
                                            <input type="text" name="fatherName" value={formData.fatherName} onChange={handleInputChange} placeholder="Father's full name" className={fieldClass("fatherName")} />
                                        </div>
                                        <div>
                                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Mother&apos;s Name</Label>
                                            <input type="text" name="motherName" value={formData.motherName} onChange={handleInputChange} placeholder="Mother's full name" className={fieldClass("motherName")} />
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Spouse Name</Label>
                                        <input type="text" name="spouseName" value={formData.spouseName} onChange={handleInputChange} placeholder="Spouse's full name" className={fieldClass("spouseName")} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div data-field="dateOfBirth">
                                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Date of Birth <span className="text-red-500">*</span></Label>
                                            <EnterpriseDatePicker value={formData.dateOfBirth} onChange={v => setFormData(p => ({ ...p, dateOfBirth: v }))} hasError={!!errors.dateOfBirth && submitAttempted} />
                                            <FieldError name="dateOfBirth" errors={errors} submitAttempted={submitAttempted} />
                                        </div>
                                        <div>
                                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Gender <span className="text-red-500">*</span></Label>
                                            <select name="gender" value={formData.gender} onChange={handleInputChange} className={fieldClass("gender")}>
                                                {genders.map(g => <option key={g} value={g.toLowerCase()}>{g}</option>)}
                                            </select>
                                            <FieldError name="gender" errors={errors} submitAttempted={submitAttempted} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Marital Status <span className="text-red-500">*</span></Label>
                                            <select name="maritalStatus" value={formData.maritalStatus} onChange={handleInputChange} className={fieldClass("maritalStatus")}>
                                                {maritalStatuses.map(m => <option key={m} value={m.toLowerCase()}>{m}</option>)}
                                            </select>
                                            <FieldError name="maritalStatus" errors={errors} submitAttempted={submitAttempted} />
                                        </div>
                                        <div>
                                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Marriage Date</Label>
                                            <EnterpriseDatePicker value={formData.marriageDate} onChange={v => setFormData(p => ({ ...p, marriageDate: v }))} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Religion</Label>
                                            <select name="religion" value={formData.religion} onChange={handleInputChange} className={fieldClass("religion")}>
                                                <option value="">Select</option>
                                                {religions.map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Nationality</Label>
                                            <input type="text" name="nationality" value={formData.nationality} onChange={handleInputChange} className={fieldClass("nationality")} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Blood Group</Label>
                                            <select name="bloodGroup" value={formData.bloodGroup} onChange={handleInputChange} className={fieldClass("bloodGroup")}>
                                                <option value="">Select</option>
                                                {bloodGroups.map(bg => <option key={bg} value={bg}>{bg}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Profession</Label>
                                            <input type="text" name="profession" value={formData.profession} onChange={handleInputChange} placeholder="e.g. Engineer" className={fieldClass("profession")} />
                                        </div>
                                        <div>
                                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Referred By (Member No)</Label>
                                            <input type="text" name="referredByMemberNo" value={formData.referredByMemberNo} onChange={handleInputChange} placeholder="e.g. M0007 (optional)" className={fieldClass("referredByMemberNo")} />
                                            <p className="text-[11px] text-slate-400 mt-1">The existing member who referred this applicant. Feeds the referrer&apos;s Referral Trust Score.</p>
                                        </div>
                                    </div>
                                </div>
                            </SectionCard>

                            {/* Contact, Photo & ID */}
                            <SectionCard color={sectionColors.contact} title="Contact, Photo & ID" icon={<Phone className="w-5 h-5" />}>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div data-field="memberPhoto">
                                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Member Photo <span className="text-red-500">*</span></Label>
                                            {renderFileUpload(
                                                formData.memberPhoto,
                                                e => handleFileChange(e, "memberPhoto"),
                                                () => setFormData(p => ({ ...p, memberPhoto: null })),
                                                "Upload Member Photo",
                                                member?.photoUrl,
                                                !!errors.memberPhoto && submitAttempted,
                                                errors.memberPhoto,
                                            )}
                                        </div>
                                        <div data-field="idDocumentFile">
                                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">ID Document <span className="text-red-500">*</span></Label>
                                            {renderFileUpload(
                                                formData.idDocumentFile,
                                                e => handleFileChange(e, "idDocumentFile"),
                                                () => setFormData(p => ({ ...p, idDocumentFile: null })),
                                                "Upload ID Document",
                                                member?.documents?.find((d: any) => d.documentType === formData.idType)?.fileUrl,
                                                !!errors.idDocumentFile && submitAttempted,
                                                errors.idDocumentFile,
                                            )}
                                        </div>
                                    </div>
                                    <div data-field="signatureFile">
                                        <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Member Signature <span className="text-red-500">*</span></Label>
                                        {renderFileUpload(
                                            formData.signatureFile,
                                            e => handleFileChange(e, "signatureFile"),
                                            () => setFormData(p => ({ ...p, signatureFile: null })),
                                            "Upload Member Signature",
                                            member?.signatureUrl,
                                            !!errors.signatureFile && submitAttempted,
                                            errors.signatureFile,
                                        )}
                                        <p className="text-[11px] text-slate-400 mt-1">Signature image (PNG/JPG) on a white background. Embedded on the Membership Application Form PDF.</p>
                                    </div>
                                    <div>
                                        <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Phone Number <span className="text-red-500">*</span></Label>
                                        <input type="tel" name="phoneNumber" value={formData.phoneNumber} onChange={handleInputChange} placeholder="01712345678" className={fieldClass("phoneNumber")} />
                                        <FieldError name="phoneNumber" errors={errors} submitAttempted={submitAttempted} />
                                    </div>
                                    <div>
                                        <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Email Address <span className="text-red-500">*</span></Label>
                                        <input type="email" name="emailAddress" value={formData.emailAddress} onChange={handleInputChange} placeholder="member@example.com" className={fieldClass("emailAddress")} />
                                        <FieldError name="emailAddress" errors={errors} submitAttempted={submitAttempted} />
                                    </div>
                                    <div>
                                        <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Emergency Contact</Label>
                                        <input type="tel" name="emergencyContact" value={formData.emergencyContact} onChange={handleInputChange} placeholder="01812345678" className={fieldClass("emergencyContact")} />
                                        <FieldError name="emergencyContact" errors={errors} submitAttempted={submitAttempted} />
                                    </div>
                                    <div>
                                        <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Emergency Contact Person Name <span className="text-red-500">*</span></Label>
                                        <input type="text" name="emergencyContactName" value={formData.emergencyContactName} onChange={handleInputChange} placeholder="Person Name" className={fieldClass("emergencyContactName")} />
                                        <FieldError name="emergencyContactName" errors={errors} submitAttempted={submitAttempted} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">ID Type <span className="text-red-500">*</span></Label>
                                            <select name="idType" value={formData.idType} onChange={handleInputChange} className={fieldClass("idType")}>
                                                <option value="">Select</option>
                                                {idTypes.map(id => <option key={id} value={id}>{id}</option>)}
                                            </select>
                                            <FieldError name="idType" errors={errors} submitAttempted={submitAttempted} />
                                        </div>
                                        <div>
                                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">ID Number <span className="text-red-500">*</span></Label>
                                            <input type="text" name="idNumber" value={formData.idNumber} onChange={handleInputChange} placeholder="Enter ID" className={fieldClass("idNumber")} />
                                            <FieldError name="idNumber" errors={errors} submitAttempted={submitAttempted} />
                                        </div>
                                    </div>
                                </div>
                            </SectionCard>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-6 items-stretch">
                            <SectionCard color={sectionColors.bank} title="Bank Information" icon={<CreditCard className="w-5 h-5" />}>
                                <div className="space-y-3">
                                    <div>
                                        <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Account Name <span className="text-red-500">*</span></Label>
                                        <input type="text" name="accountName" value={formData.accountName} onChange={handleInputChange} placeholder="Full name as per bank" className={fieldClass("accountName")} />
                                        <FieldError name="accountName" errors={errors} submitAttempted={submitAttempted} />
                                    </div>
                                    <div>
                                        <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Account Number <span className="text-red-500">*</span></Label>
                                        <input type="text" name="accountNumber" value={formData.accountNumber} onChange={handleInputChange} placeholder="Enter account number" className={fieldClass("accountNumber")} />
                                        <FieldError name="accountNumber" errors={errors} submitAttempted={submitAttempted} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Bank Name <span className="text-red-500">*</span></Label>
                                            <select name="bankName" value={formData.bankName} onChange={handleInputChange} className={fieldClass("bankName")}>
                                                <option value="">Select Bank</option>
                                                {banks.map(b => <option key={b} value={b}>{b}</option>)}
                                            </select>
                                            <FieldError name="bankName" errors={errors} submitAttempted={submitAttempted} />
                                        </div>
                                        <div>
                                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Branch</Label>
                                            <input type="text" name="branch" value={formData.branch} onChange={handleInputChange} placeholder="Branch name" className={fieldClass("branch")} />
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Routing Number</Label>
                                        <input type="text" name="routingNumber" value={formData.routingNumber} onChange={handleInputChange} placeholder="Routing number" className={fieldClass("routingNumber")} />
                                    </div>
                                </div>
                            </SectionCard>

                            <SectionCard color={sectionColors.residence} title="Residence Information" icon={<Home className="w-5 h-5" />}>
                                <div className="space-y-4">
                                    <div className="border-b border-slate-200 dark:border-slate-700 pb-3">
                                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5"><MapPin className="w-4 h-4 text-slate-400" /> Current Residence</h3>
                                        <div className="space-y-2">
                                            <input type="text" name="currentAddress" value={formData.currentAddress} onChange={handleInputChange} placeholder="Address" className={fieldClass("currentAddress")} />
                                            <div className="grid grid-cols-3 gap-2">
                                                <input type="text" name="currentPostOffice" value={formData.currentPostOffice} onChange={handleInputChange} placeholder="Post Office" className={fieldClass("currentPostOffice")} />
                                                <select name="currentDistrict" value={formData.currentDistrict} onChange={handleInputChange} className={fieldClass("currentDistrict")}>
                                                    <option value="">District</option>
                                                    {districts.map(d => <option key={d} value={d}>{d}</option>)}
                                                </select>
                                                <input type="text" name="currentPostCode" value={formData.currentPostCode} onChange={handleInputChange} placeholder="Post Code" className={fieldClass("currentPostCode")} />
                                            </div>
                                            <FieldError name="currentDistrict" errors={errors} submitAttempted={submitAttempted} />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5"><Building className="w-4 h-4 text-slate-400" /> Permanent Residence</h3>
                                        <div className="space-y-2">
                                            <input type="text" name="permanentAddress" value={formData.permanentAddress} onChange={handleInputChange} placeholder="Address" className={fieldClass("permanentAddress")} />
                                            <div className="grid grid-cols-3 gap-2">
                                                <input type="text" name="permanentPostOffice" value={formData.permanentPostOffice} onChange={handleInputChange} placeholder="Post Office" className={fieldClass("permanentPostOffice")} />
                                                <select name="permanentDistrict" value={formData.permanentDistrict} onChange={handleInputChange} className={fieldClass("permanentDistrict")}>
                                                    <option value="">District</option>
                                                    {districts.map(d => <option key={d} value={d}>{d}</option>)}
                                                </select>
                                                <input type="text" name="permanentPostCode" value={formData.permanentPostCode} onChange={handleInputChange} placeholder="Post Code" className={fieldClass("permanentPostCode")} />
                                            </div>
                                            <FieldError name="permanentDistrict" errors={errors} submitAttempted={submitAttempted} />
                                        </div>
                                    </div>
                                </div>
                            </SectionCard>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-6 items-stretch">
                            <SectionCard color={sectionColors.docs} title="Additional Documents" icon={<FileText className="w-5 h-5" />}>
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-sm text-slate-500 dark:text-slate-400">Upload supporting documents</span>
                                    <button type="button" onClick={addAdditionalDocument} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
                                        <Plus className="w-4 h-4" /> Add Document
                                    </button>
                                </div>
                                {formData.additionalDocuments.length === 0 ? (
                                    <div className="text-center py-8 text-slate-400">
                                        <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                        <p>No additional documents added</p>
                                        <p className="text-sm">Click &quot;Add Document&quot; to upload a file (e.g., TIN Certificate)</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {formData.additionalDocuments.map(doc => (
                                            <div key={doc.id} className="flex flex-wrap items-end gap-3 border-b border-slate-200 dark:border-slate-700 pb-3">
                                                <div className="flex-1 min-w-[150px]">
                                                    <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Document Name</Label>
                                                    <input type="text" value={doc.name} onChange={e => updateAdditionalDocument(doc.id, "name", e.target.value)} placeholder="e.g. TIN Certificate" className={inputBase} />
                                                </div>
                                                <div className="flex-1 min-w-[200px]">
                                                    <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">File</Label>
                                                    {renderFileUpload(doc.file, e => updateAdditionalDocument(doc.id, "file", e.target.files?.[0] || null), () => updateAdditionalDocument(doc.id, "file", null), "Upload File")}
                                                </div>
                                                <button type="button" onClick={() => removeAdditionalDocument(doc.id)} className="text-red-500 hover:text-red-700 transition-colors p-1 mt-1"><Trash2 className="w-5 h-5" /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </SectionCard>

                            <SectionCard color={sectionColors.nominees} title="Registered Nominees" icon={<Users className="w-5 h-5" />}>
                                <div data-field="nominees">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <span className="text-sm text-slate-500 dark:text-slate-400">At least one nominee required · share must total 100%</span>
                                        {nomineeError && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {nomineeError}</p>}
                                        <FieldError name="nominees" errors={errors} submitAttempted={submitAttempted} />
                                    </div>
                                    <button type="button" onClick={() => { resetNomineeForm(); setShowNomineeModal(true); setEditingNomineeId(null); }} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors">
                                        <Plus className="w-4 h-4" /> Add Nominee
                                    </button>
                                </div>
                                {formData.nominees.length === 0 ? (
                                    <div className="text-center py-8 text-slate-400">
                                        <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                        <p>No nominees registered yet</p>
                                        <p className="text-sm">Click &quot;Add Nominee&quot; to register one</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {formData.nominees.map(nominee => (
                                            <div key={nominee.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:shadow-md transition-shadow bg-white dark:bg-slate-950">
                                                <div className="flex items-start justify-between">
                                                    <div className="min-w-0">
                                                        <h4 className="font-medium text-slate-900 dark:text-white truncate">{nominee.name}</h4>
                                                        <p className="text-sm text-slate-500 dark:text-slate-400">{nominee.relation}</p>
                                                        <div className="flex flex-wrap items-center gap-2 mt-1 text-sm">
                                                            <span className="text-indigo-600 dark:text-indigo-400 font-medium">{nominee.share}% Share</span>
                                                            {nominee.phone && <><span className="text-slate-300">|</span><span className="text-slate-400 text-xs">Ph: {nominee.phone}</span></>}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button type="button" onClick={() => editNominee(nominee.id)} className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1">
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                        </button>
                                                        <button type="button" onClick={() => deleteNominee(nominee.id)} className="text-slate-400 hover:text-red-500 transition-colors p-1"><Trash2 className="w-4 h-4" /></button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                </div>
                            </SectionCard>
                        </div>
                    </form>

                    {/* Footer actions for edit/review (mirrors header) */}
                    <div className="flex justify-end gap-3 pt-6 border-t border-slate-200 dark:border-slate-800">
                        {isReview ? (
                            <button type="button" onClick={() => setShowRejectDialog(true)} className="px-6 py-2.5 border border-red-300 dark:border-red-900/60 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex items-center gap-2 text-sm font-medium">
                                <ShieldX className="w-4 h-4" /> Reject Application
                            </button>
                        ) : (
                            <Link href={isEdit ? `/dashboard/members/${member?.id}` : "/dashboard/members"}>
                                <button type="button" className="px-6 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</button>
                            </Link>
                        )}
                        <button type="submit" form="memberForm" disabled={submitting} className={`px-6 py-2.5 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium shadow-md disabled:opacity-60 disabled:cursor-not-allowed ${submitButtonClass}`}>
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <SubmitIcon className="w-4 h-4" />}
                            {submitting ? "Saving..." : headerConfig.submitLabel}
                        </button>
                    </div>
                </div>

                {/* RIGHT: completion sidebar (all modes) */}
                <div className="lg:col-span-3">
                    <div className="sticky top-24 space-y-6">
                        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-md border border-slate-200 dark:border-slate-800 p-6">
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Completion Status</h2>
                            <div className="flex flex-col items-center justify-center mb-6">
                                <div className="relative w-24 h-24">
                                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                        <path className="text-slate-200 dark:text-slate-700" stroke="currentColor" strokeWidth="3" fill="none" d="M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 0 1 0-31" />
                                        <path
                                            className={isReview ? "text-emerald-600" : "text-indigo-600"}
                                            style={{ transitionProperty: "stroke-dasharray", transitionDuration: "500ms" }}
                                            stroke="currentColor"
                                            strokeWidth="3"
                                            strokeLinecap="round"
                                            fill="none"
                                            strokeDasharray={`${progress}, 100`}
                                            d="M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 0 1 0-31"
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-2xl font-bold text-slate-900 dark:text-white">{progress}%</span>
                                    </div>
                                </div>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{completedSteps} of {steps.length} sections complete</p>
                                {progress < 100 && (
                                    <p className="text-xs text-red-500 mt-1 text-center">
                                        {isReview
                                            ? "All sections must be complete before approving."
                                            : isEdit
                                            ? "All sections must be complete before saving."
                                            : "All sections must be complete before saving."}
                                    </p>
                                )}
                            </div>
                            <div className="space-y-3">
                                {steps.map((step, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        {step.complete ? <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" /> : <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600 shrink-0" />}
                                        <span className={`text-sm ${step.complete ? "text-slate-900 dark:text-white font-medium" : "text-slate-500 dark:text-slate-400"}`}>{step.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Nominee modal (shadcn Dialog) */}
            <Dialog open={showNomineeModal} onOpenChange={(o) => { setShowNomineeModal(o); if (!o) resetNomineeForm() }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                            {editingNomineeId ? "Edit Nominee" : "Add Nominee"}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Full Name *</Label>
                            <input type="text" name="name" value={nomineeForm.name} onChange={handleNomineeInputChange} placeholder="Nominee full name" className={inputBase} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Relation *</Label>
                                <input type="text" name="relation" value={nomineeForm.relation} onChange={handleNomineeInputChange} placeholder="e.g. Spouse" className={inputBase} />
                            </div>
                            <div>
                                <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Share % *</Label>
                                <input type="text" name="share" value={nomineeForm.share} onChange={handleNomineeInputChange} placeholder="e.g. 50" className={inputBase} />
                            </div>
                        </div>
                        <div>
                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Nominee Phone</Label>
                            <input type="tel" name="phone" value={nomineeForm.phone} onChange={handleNomineeInputChange} placeholder="01712345678" className={inputBase} />
                        </div>
                        <div>
                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Nominee Photo</Label>
                            {renderFileUpload(nomineeForm.photo, e => handleNomineeFileChange(e, "photo"), () => setNomineeForm(p => ({ ...p, photo: null })), "Upload Photo")}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">ID Type</Label>
                                <select name="idType" value={nomineeForm.idType} onChange={handleNomineeInputChange} className={inputBase}>
                                    <option value="nid">National ID</option>
                                    <option value="birthCert">Birth Certificate</option>
                                    <option value="passport">Passport</option>
                                </select>
                            </div>
                            <div>
                                <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">ID Number</Label>
                                <input type="text" name="idNumber" value={nomineeForm.idNumber} onChange={handleNomineeInputChange} placeholder="Enter ID" className={inputBase} />
                            </div>
                        </div>
                        <div>
                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">ID Document (Upload)</Label>
                            {renderFileUpload(nomineeForm.idDocumentFile, e => handleNomineeFileChange(e, "idDocumentFile"), () => setNomineeForm(p => ({ ...p, idDocumentFile: null })), "Upload Nominee ID Document", nomineeForm.existingIdDocUrl || undefined)}
                        </div>
                        <div>
                            <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Nominee Signature <span className="text-slate-400 text-xs">(optional)</span></Label>
                            {renderFileUpload(
                                nomineeForm.signatureFile,
                                e => handleNomineeFileChange(e, "signatureFile"),
                                () => setNomineeForm(p => ({ ...p, signatureFile: null })),
                                "Upload Nominee Signature",
                                nomineeForm.existingSignatureUrl || undefined,
                            )}
                            <p className="text-[11px] text-slate-400 mt-1">Required for adult nominees (18+). Signature image on a white background.</p>
                        </div>
                    </div>
                      <DialogFooter>
                        <DialogClose
                          render={<button type="button" className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm" />}
                        >
                          Cancel
                        </DialogClose>
                        <button type="button" onClick={editingNomineeId ? updateNominee : addNominee} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">
                            {editingNomineeId ? "Update Nominee" : "Add Nominee"}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reject dialog (review mode) */}
            <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <ShieldX className="w-5 h-5 text-red-600" /> Reject Application
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            The member record will be marked as <strong className="text-slate-700 dark:text-slate-200">Rejected</strong> and retained for audit history. Provide an optional reason:
                        </p>
                        <textarea
                            value={rejectRemark}
                            onChange={e => setRejectRemark(e.target.value)}
                            rows={4}
                            placeholder="e.g. Documents not verifiable. Please reapply with valid ID."
                            className={`${inputBase} resize-none`}
                        />
                    </div>
                      <DialogFooter>
                        <DialogClose
                          render={<button type="button" className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm" />}
                        >
                          Cancel
                        </DialogClose>
                        <button type="button" onClick={handleReject} disabled={rejectPending} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm flex items-center gap-2 disabled:opacity-60">
                            {rejectPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldX className="w-4 h-4" />}
                            {rejectPending ? "Rejecting..." : "Confirm Reject"}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
