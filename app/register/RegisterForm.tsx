"use client"

import { useRouter } from "next/navigation"
import React, { useState, useMemo, useRef } from "react"
import { registerMember } from "@/app/actions/member"
import Link from "next/link"
import { toast } from "sonner"
import {
    User, Phone, Home, CreditCard, FileText, Users, Upload, X, Plus, Trash2,
    CheckCircle, Info, Circle,
} from "lucide-react"

import SectionCard from "@/components/somiti/SectionCard"

type Nominee = { id: string; name: string; relation: string; share: string; phone: string; idType: "nid" | "birthCert" | "passport"; idNumber: string; idDocumentFile: File | null; photo: File | null; signatureFile: File | null; }
type AdditionalDocument = { id: string; name: string; file: File | null; }

type FormData = {
    firstName: string; lastName: string; fatherName: string; motherName: string; spouseName: string;
    dateOfBirth: string; gender: "male" | "female" | "other"; religion: string; nationality: string;
    bloodGroup: string; profession: string; maritalStatus: "married" | "unmarried" | "divorced" | "widowed"; marriageDate: string;
    phoneNumber: string; emailAddress: string; emergencyContact: string; emergencyContactName: string;
    idType: string; idNumber: string; idDocumentFile: File | null; memberPhoto: File | null;
    signatureFile: File | null;
    accountName: string; accountNumber: string; bankName: string; branch: string; routingNumber: string;
    currentAddress: string; currentPostOffice: string; currentDistrict: string; currentPostCode: string;
    permanentAddress: string; permanentPostOffice: string; permanentDistrict: string; permanentPostCode: string;
    additionalDocuments: AdditionalDocument[]; nominees: Nominee[];
}

const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
const religions = ["Islam", "Hinduism", "Christianity", "Buddhism", "Other"]
const genders = ["Male", "Female", "Other"]
const maritalStatuses = ["Married", "Unmarried", "Divorced", "Widowed"]
const idTypes = ["National ID", "Passport", "Birth Certificate", "Driving License"]

// Shared token-driven input / label styles
const inputClass = "w-full rounded-lg border border-[var(--border-base)] bg-[var(--control-bg)] px-3 py-2 t-body text-primary-ink placeholder:text-muted-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklch,var(--brand-primary)_25%,transparent)] transition-colors"
const labelClass = "block t-body font-medium text-secondary-ink mb-1"
const subLabelClass = "block t-caption font-medium text-muted-ink mb-1"

const FORM_ACCENT_VAR: Record<"blue" | "emerald" | "gold" | "violet", string> = {
    blue: "var(--chart-blue)",
    emerald: "var(--chart-emerald)",
    gold: "var(--chart-gold)",
    violet: "var(--chart-violet)",
}

function FormSection({ accent, children, title, icon }: { accent: "blue" | "emerald" | "gold" | "violet", children: React.ReactNode, title: string, icon: React.ReactNode }) {
    const color = FORM_ACCENT_VAR[accent]
    // NOTE: title/icon are intentionally NOT forwarded to SectionCard — we render
    // our own accent-tinted header so each section gets a colorful header + body
    // (and we avoid the duplicated header the old wrapper produced).
    return (
        <SectionCard accent={accent} className="overflow-hidden" bodyClassName="p-0">
            <div
                className="flex items-center gap-3 border-b px-5 py-4"
                style={{
                    backgroundColor: `color-mix(in oklch, ${color} 15%, transparent)`,
                    borderColor: `color-mix(in oklch, ${color} 32%, transparent)`,
                }}
            >
                <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-white [&>svg]:h-[18px] [&>svg]:w-[18px]"
                    style={{ backgroundColor: color }}
                >
                    {icon}
                </span>
                <h2 className="t-h3 text-primary-ink">{title}</h2>
            </div>
            <div
                className="p-5"
                style={{ backgroundColor: `color-mix(in oklch, ${color} 5%, transparent)` }}
            >
                {children}
            </div>
        </SectionCard>
    )
}

function EnterpriseDatePicker({ value, onChange }: { value: string, onChange: (val: string) => void }) {
    return (
        <input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputClass} [color-scheme:light dark:[color-scheme:dark]`}
        />
    )
}

export default function RegisterForm() {
    const [formData, setFormData] = useState<FormData>({
        firstName: "", lastName: "", fatherName: "", motherName: "", spouseName: "",
        dateOfBirth: "", gender: "male", religion: "", nationality: "Bangladeshi",
        bloodGroup: "", profession: "", maritalStatus: "unmarried", marriageDate: "",
        phoneNumber: "", emailAddress: "", emergencyContact: "", emergencyContactName: "",
        idType: "", idNumber: "", idDocumentFile: null, memberPhoto: null,
        signatureFile: null,
        accountName: "", accountNumber: "", bankName: "", branch: "", routingNumber: "",
        currentAddress: "", currentPostOffice: "", currentDistrict: "", currentPostCode: "",
        permanentAddress: "", permanentPostOffice: "", permanentDistrict: "", permanentPostCode: "",
        additionalDocuments: [], nominees: [],
    })

    const [nomineeIdCounter, setNomineeIdCounter] = useState(1)
    const [additionalDocCounter, setAdditionalDocCounter] = useState(1)
    const [showNomineeModal, setShowNomineeModal] = useState(false)
    const [nomineeForm, setNomineeForm] = useState<Omit<Nominee, "id">>({ name: "", relation: "", share: "", phone: "", idType: "nid", idNumber: "", idDocumentFile: null, photo: null, signatureFile: null })
    const [loading, setLoading] = useState(false)
    const router = useRouter()
    const [errors, setErrors] = useState<{ phoneNumber?: string; emailAddress?: string; idNumber?: string }>({})
    const phoneInputRef = useRef<HTMLInputElement>(null)
    const emailInputRef = useRef<HTMLInputElement>(null)
    const idNumberInputRef = useRef<HTMLInputElement>(null)

    const steps = useMemo(() => [
        { name: "Personal Information", complete: !!(formData.firstName && formData.dateOfBirth && formData.gender) },
        { name: "Contact & ID", complete: !!(formData.phoneNumber && formData.emailAddress && formData.idType && formData.idNumber) },
        { name: "Bank Details", complete: !!(formData.accountName && formData.accountNumber && formData.bankName) },
        { name: "Address Info", complete: !!(formData.currentAddress && formData.currentDistrict && formData.permanentAddress && formData.permanentDistrict) },
        { name: "Documents & Signature", complete: !!formData.memberPhoto && !!formData.idDocumentFile && !!formData.signatureFile },
        { name: "Nominees", complete: formData.nominees.length > 0 },
    ], [formData])

    const completedSteps = steps.filter(s => s.complete).length
    const progress = Math.round((completedSteps / steps.length) * 100)

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target
        setFormData((prev) => ({ ...prev, [name]: value }))
        if (name === "phoneNumber" || name === "emailAddress" || name === "idNumber") {
            setErrors((prev) => ({ ...prev, [name]: undefined }))
        }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: keyof Pick<FormData, "idDocumentFile" | "memberPhoto" | "signatureFile">) => setFormData((prev) => ({ ...prev, [field]: e.target.files?.[0] || null }))
    const handleNomineeInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setNomineeForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    const handleNomineeFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: "idDocumentFile" | "photo" | "signatureFile") => setNomineeForm((prev) => ({ ...prev, [field]: e.target.files?.[0] || null }))

    const addAdditionalDocument = () => {
        setFormData((prev) => ({ ...prev, additionalDocuments: [...prev.additionalDocuments, { id: `doc-${additionalDocCounter}`, name: "", file: null }] }))
        setAdditionalDocCounter((prev) => prev + 1)
    }
    const updateAdditionalDocument = (id: string, field: "name" | "file", value: string | File | null) => setFormData((prev) => ({ ...prev, additionalDocuments: prev.additionalDocuments.map((doc) => doc.id === id ? { ...doc, [field]: value } : doc) }))
    const removeAdditionalDocument = (id: string) => setFormData((prev) => ({ ...prev, additionalDocuments: prev.additionalDocuments.filter((doc) => doc.id !== id) }))

    const addNominee = () => {
        if (!nomineeForm.name || !nomineeForm.relation || !nomineeForm.share) { toast.error("Please fill in all required nominee fields."); return; }
        // Nominee signature is OPTIONAL (per user request). Members can still
        // upload one if they have it, but it's no longer required to add a nominee.
        const newNominee: Nominee = { id: `nom-${nomineeIdCounter}`, ...nomineeForm }
        setFormData((prev) => ({ ...prev, nominees: [...prev.nominees, newNominee] }))
        setNomineeIdCounter((prev) => prev + 1)
        setNomineeForm({ name: "", relation: "", share: "", phone: "", idType: "nid", idNumber: "", idDocumentFile: null, photo: null, signatureFile: null })
        setShowNomineeModal(false)
    }

    const deleteNominee = (id: string) => {
        if (confirm("Are you sure you want to remove this nominee?")) {
            setFormData((prev) => ({ ...prev, nominees: prev.nominees.filter((n) => n.id !== id) }))
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        const fd = new FormData()
        fd.append("firstName", formData.firstName); fd.append("lastName", formData.lastName)
        fd.append("fatherName", formData.fatherName); fd.append("motherName", formData.motherName)
        fd.append("spouseName", formData.spouseName); fd.append("dob", formData.dateOfBirth)
        fd.append("gender", formData.gender ? formData.gender.toUpperCase() : "OTHER")
        fd.append("religion", formData.religion); fd.append("nationality", formData.nationality)
        fd.append("bloodGroup", formData.bloodGroup ? formData.bloodGroup.replace("+", "_POSITIVE").replace("-", "_NEGATIVE") : "")
        fd.append("profession", formData.profession)
        fd.append("maritalStatus", formData.maritalStatus ? formData.maritalStatus.toUpperCase() : "")
        fd.append("marriageDate", formData.marriageDate)
        fd.append("phone", formData.phoneNumber); fd.append("email", formData.emailAddress)
        fd.append("emergencyPhone", formData.emergencyContact)
        fd.append("emergencyContactName", formData.emergencyContactName)
        fd.append("idType", formData.idType); fd.append("idNumber", formData.idNumber)
        fd.append("accountName", formData.accountName); fd.append("accountNumber", formData.accountNumber)
        fd.append("bankName", formData.bankName); fd.append("branch", formData.branch)
        fd.append("routingNumber", formData.routingNumber)
        fd.append("c_village", formData.currentAddress); fd.append("c_postOffice", formData.currentPostOffice)
        fd.append("c_district", formData.currentDistrict); fd.append("c_postalCode", formData.currentPostCode)
        fd.append("p_village", formData.permanentAddress); fd.append("p_postOffice", formData.permanentPostOffice)
        fd.append("p_district", formData.permanentDistrict); fd.append("p_postalCode", formData.permanentPostCode)

        if (formData.memberPhoto) fd.append("memberPhoto", formData.memberPhoto)
        if (formData.idDocumentFile) fd.append("idDocument", formData.idDocumentFile)
        if (formData.signatureFile) fd.append("signature", formData.signatureFile)

        formData.additionalDocuments.forEach((doc, i) => { if (doc.name) fd.append(`doc_${i}_name`, doc.name); if (doc.file) fd.append(`doc_${i}_file`, doc.file); })

        formData.nominees.forEach((nom, i) => {
            fd.append(`nom_${i}_name`, nom.name); fd.append(`nom_${i}_relation`, nom.relation)
            fd.append(`nom_${i}_share`, nom.share); fd.append(`nom_${i}_phone`, nom.phone || "")
            fd.append(`nom_${i}_idType`, nom.idType); fd.append(`nom_${i}_idNumber`, nom.idNumber)
            if (nom.idDocumentFile) fd.append(`nom_${i}_idDoc`, nom.idDocumentFile)
            if (nom.photo) fd.append(`nom_${i}_photo`, nom.photo)
            if (nom.signatureFile) fd.append(`nom_${i}_signature`, nom.signatureFile)
        })

        try {
            const result = await registerMember(fd) as
                | { success?: true }
                | { error: string; field?: "email" | "phone" | "both" | "idNumber" }

            if (result && "error" in result && result.error) {
                const field = result.field
                const fieldErrors: { phoneNumber?: string; emailAddress?: string; idNumber?: string } = {}
                if (field === "email" || field === "both") fieldErrors.emailAddress = result.error
                if (field === "phone" || field === "both") fieldErrors.phoneNumber = result.error
                if (field === "idNumber") fieldErrors.idNumber = result.error
                setErrors(fieldErrors)

                const targetRef = fieldErrors.emailAddress
                    ? emailInputRef
                    : fieldErrors.phoneNumber
                        ? phoneInputRef
                        : fieldErrors.idNumber
                            ? idNumberInputRef
                            : null
                if (targetRef?.current) {
                    targetRef.current.focus()
                    targetRef.current.scrollIntoView({ behavior: "smooth", block: "center" })
                }

                toast.error("Registration Failed", { description: result.error })
                setLoading(false)
            } else if (result && "success" in result && result.success) {
                router.push("/register/success")
            }
        } catch {
            toast.error("Registration Failed", { description: "An unexpected error occurred. Please try again." })
            setLoading(false)
        }
    }

    const renderFileUpload = (file: File | null, onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void, onRemove: () => void, label: string) => {
        return (
            <div className="rounded-lg border-2 border-dashed border-[var(--border-strong)] bg-[var(--control-bg)] p-4 transition-colors hover:border-brand">
                {file ? (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-brand" />
                            <span className="t-body truncate max-w-[150px] text-secondary-ink">{file.name}</span>
                        </div>
                        <button type="button" onClick={onRemove} className="text-debit hover:opacity-70"><X className="h-4 w-4" /></button>
                    </div>
                ) : (
                    <label className="flex cursor-pointer flex-col items-center justify-center">
                        <Upload className="mb-1 h-8 w-8 text-faint-ink" />
                        <span className="t-caption text-muted-ink">{label}</span>
                        <input type="file" className="hidden" accept="image/*,.pdf" onChange={onFileChange} />
                    </label>
                )}
            </div>
        )
    }

    return (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-5">

            {/* Left & Middle: Form Sections (4/5 width) */}
            <div className="space-y-5 lg:col-span-4">

                {/* Instruction Guide */}
                <div className="flex gap-4 rounded-xl border border-[var(--border-base)] bg-brand-gradient-soft p-5 t-body text-brand">
                    <Info className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                        <p className="t-subheading mb-2">Registration Guide</p>
                        <ul className="list-disc space-y-1 pl-5">
                            <li>Please use your exact name as it appears on your National ID (NID).</li>
                            <li>Ensure the phone number and email are active for portal login and notifications.</li>
                            <li>Upload a clear photo and a readable copy of your ID document.</li>
                            <li>Nominee share percentage must total exactly 100% if adding multiple nominees.</li>
                        </ul>
                    </div>
                </div>

                <div className="grid grid-cols-1 items-stretch gap-x-6 gap-y-5 lg:grid-cols-2">
                    <FormSection accent="blue" title="Personal Information" icon={<User className="h-4 w-4" />}>
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={labelClass}>First Name <span className="text-debit">*</span></label><input type="text" name="firstName" value={formData.firstName} onChange={handleInputChange} required placeholder="e.g., Md. Rahim" className={inputClass} /></div>
                                <div><label className={labelClass}>Last Name <span className="text-slate-400 text-xs">(optional)</span></label><input type="text" name="lastName" value={formData.lastName} onChange={handleInputChange} placeholder="e.g., Uddin" className={inputClass} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={labelClass}>Father&apos;s Name</label><input type="text" name="fatherName" value={formData.fatherName} onChange={handleInputChange} placeholder="e.g., Md. Karim" className={inputClass} /></div>
                                <div><label className={labelClass}>Mother&apos;s Name</label><input type="text" name="motherName" value={formData.motherName} onChange={handleInputChange} placeholder="e.g., Mrs. Ayesha" className={inputClass} /></div>
                            </div>
                            <div><label className={labelClass}>Spouse Name</label><input type="text" name="spouseName" value={formData.spouseName} onChange={handleInputChange} placeholder="e.g., Mrs. Salma" className={inputClass} /></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={labelClass}>Date of Birth</label><EnterpriseDatePicker value={formData.dateOfBirth} onChange={(val) => setFormData(prev => ({ ...prev, dateOfBirth: val }))} /></div>
                                <div><label className={labelClass}>Gender</label><select name="gender" value={formData.gender} onChange={handleInputChange} className={inputClass}>{genders.map((g) => <option key={g} value={g.toLowerCase()}>{g}</option>)}</select></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={labelClass}>Marital Status</label><select name="maritalStatus" value={formData.maritalStatus} onChange={handleInputChange} className={inputClass}>{maritalStatuses.map((m) => <option key={m} value={m.toLowerCase()}>{m}</option>)}</select></div>
                                <div><label className={labelClass}>Marriage Date</label><EnterpriseDatePicker value={formData.marriageDate} onChange={(val) => setFormData(prev => ({ ...prev, marriageDate: val }))} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={labelClass}>Religion</label><select name="religion" value={formData.religion} onChange={handleInputChange} className={inputClass}><option value="">Select</option>{religions.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
                                <div><label className={labelClass}>Nationality</label><input type="text" name="nationality" value={formData.nationality} onChange={handleInputChange} placeholder="e.g., Bangladeshi" className={inputClass} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={labelClass}>Blood Group</label><select name="bloodGroup" value={formData.bloodGroup} onChange={handleInputChange} className={inputClass}><option value="">Select</option>{bloodGroups.map((bg) => <option key={bg} value={bg}>{bg}</option>)}</select></div>
                                <div><label className={labelClass}>Profession</label><input type="text" name="profession" value={formData.profession} onChange={handleInputChange} placeholder="e.g., Teacher" className={inputClass} /></div>
                            </div>
                        </div>
                    </FormSection>

                    <FormSection accent="emerald" title="Contact, Photo & ID" icon={<Phone className="h-4 w-4" />}>
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={labelClass}>Member Photo <span className="text-debit">*</span></label>{renderFileUpload(formData.memberPhoto, (e) => handleFileChange(e, "memberPhoto"), () => setFormData((prev) => ({ ...prev, memberPhoto: null })), "Upload Photo")}</div>
                                <div><label className={labelClass}>ID Document <span className="text-debit">*</span></label>{renderFileUpload(formData.idDocumentFile, (e) => handleFileChange(e, "idDocumentFile"), () => setFormData((prev) => ({ ...prev, idDocumentFile: null })), "Upload Document")}</div>
                            </div>
                            <div>
                                <label className={labelClass}>Member Signature <span className="text-debit">*</span></label>
                                {renderFileUpload(formData.signatureFile, (e) => handleFileChange(e, "signatureFile"), () => setFormData((prev) => ({ ...prev, signatureFile: null })), "Upload Signature")}
                                <p className="mt-1 t-caption text-muted-ink">Signature image (PNG/JPG) on a white background. Required for the Membership Application Form.</p>
                            </div>
                            <div>
                                <label className={labelClass}>Phone Number <span className="text-debit">*</span></label>
                                <input ref={phoneInputRef} type="tel" name="phoneNumber" value={formData.phoneNumber} onChange={handleInputChange} required placeholder="e.g., 01712345678" className={errors.phoneNumber ? `${inputClass} border-debit focus:ring-[color-mix(in_oklch,var(--status-debit)_25%,transparent)] focus:border-[var(--status-debit)]` : inputClass} />
                                {errors.phoneNumber && <p className="mt-1 t-caption text-debit">{errors.phoneNumber}</p>}
                            </div>
                            <div>
                                <label className={labelClass}>Email Address <span className="text-debit">*</span></label>
                                <input ref={emailInputRef} type="email" name="emailAddress" value={formData.emailAddress} onChange={handleInputChange} required placeholder="e.g., rahim@example.com" className={errors.emailAddress ? `${inputClass} border-debit focus:ring-[color-mix(in_oklch,var(--status-debit)_25%,transparent)] focus:border-[var(--status-debit)]` : inputClass} />
                                {errors.emailAddress && <p className="mt-1 t-caption text-debit">{errors.emailAddress}</p>}
                            </div>
                            <div><label className={labelClass}>Emergency Contact</label><input type="tel" name="emergencyContact" value={formData.emergencyContact} onChange={handleInputChange} placeholder="e.g., 01812345678" className={inputClass} /></div>
                            <div><label className={labelClass}>Emergency Contact Person Name</label><input type="text" name="emergencyContactName" value={formData.emergencyContactName} onChange={handleInputChange} placeholder="e.g., Brother" className={inputClass} /></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={labelClass}>ID Type <span className="text-debit">*</span></label><select name="idType" value={formData.idType} onChange={handleInputChange} required className={inputClass}><option value="">Select</option>{idTypes.map((id) => <option key={id} value={id}>{id}</option>)}</select></div>
                                <div>
                                    <label className={labelClass}>ID Number <span className="text-debit">*</span></label>
                                    <input ref={idNumberInputRef} type="text" name="idNumber" value={formData.idNumber} onChange={handleInputChange} required placeholder="e.g., 1990123456789" className={errors.idNumber ? `${inputClass} border-debit focus:ring-[color-mix(in_oklch,var(--status-debit)_25%,transparent)] focus:border-[var(--status-debit)]` : inputClass} />
                                    {errors.idNumber && <p className="mt-1 t-caption text-debit">{errors.idNumber}</p>}
                                </div>
                            </div>
                        </div>
                    </FormSection>
                </div>

                <div className="grid grid-cols-1 items-stretch gap-x-6 gap-y-5 lg:grid-cols-2">
                    <FormSection accent="gold" title="Bank Information" icon={<CreditCard className="h-4 w-4" />}>
                        <div className="space-y-3">
                            <div><label className={labelClass}>Account Name</label><input type="text" name="accountName" value={formData.accountName} onChange={handleInputChange} placeholder="e.g., Md. Rahim Uddin" className={inputClass} /></div>
                            <div><label className={labelClass}>Account Number</label><input type="text" name="accountNumber" value={formData.accountNumber} onChange={handleInputChange} placeholder="e.g., 1234567890123" className={inputClass} /></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={labelClass}>Bank Name</label><input type="text" name="bankName" value={formData.bankName} onChange={handleInputChange} placeholder="e.g., Dutch-Bangla Bank" className={inputClass} /></div>
                                <div><label className={labelClass}>Branch</label><input type="text" name="branch" value={formData.branch} onChange={handleInputChange} placeholder="e.g., Motijheel" className={inputClass} /></div>
                            </div>
                            <div><label className={labelClass}>Routing Number</label><input type="text" name="routingNumber" value={formData.routingNumber} onChange={handleInputChange} placeholder="e.g., 090123456" className={inputClass} /></div>
                        </div>
                    </FormSection>

                    <FormSection accent="violet" title="Residence Information" icon={<Home className="h-4 w-4" />}>
                        <div className="space-y-4">
                            <div className="space-y-2 border-b border-[var(--border-base)] pb-3">
                                <h3 className="t-body font-medium text-secondary-ink">Current Residence</h3>
                                <div>
                                    <label className={subLabelClass}>Address</label>
                                    <input type="text" name="currentAddress" value={formData.currentAddress} onChange={handleInputChange} placeholder="e.g., House 12, Road 5" className={inputClass} />
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <div><label className={subLabelClass}>Post Office</label><input type="text" name="currentPostOffice" value={formData.currentPostOffice} onChange={handleInputChange} placeholder="e.g., Dhanmondi" className={inputClass} /></div>
                                    <div><label className={subLabelClass}>District</label><input type="text" name="currentDistrict" value={formData.currentDistrict} onChange={handleInputChange} placeholder="e.g., Dhaka" className={inputClass} /></div>
                                    <div><label className={subLabelClass}>Post Code</label><input type="text" name="currentPostCode" value={formData.currentPostCode} onChange={handleInputChange} placeholder="e.g., 1209" className={inputClass} /></div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h3 className="t-body font-medium text-secondary-ink">Permanent Residence</h3>
                                <div>
                                    <label className={subLabelClass}>Address</label>
                                    <input type="text" name="permanentAddress" value={formData.permanentAddress} onChange={handleInputChange} placeholder="e.g., Village: Rampur" className={inputClass} />
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <div><label className={subLabelClass}>Post Office</label><input type="text" name="permanentPostOffice" value={formData.permanentPostOffice} onChange={handleInputChange} placeholder="e.g., Sadar" className={inputClass} /></div>
                                    <div><label className={subLabelClass}>District</label><input type="text" name="permanentDistrict" value={formData.permanentDistrict} onChange={handleInputChange} placeholder="e.g., Faridpur" className={inputClass} /></div>
                                    <div><label className={subLabelClass}>Post Code</label><input type="text" name="permanentPostCode" value={formData.permanentPostCode} onChange={handleInputChange} placeholder="e.g., 7800" className={inputClass} /></div>
                                </div>
                            </div>
                        </div>
                    </FormSection>
                </div>

                {/* Additional Documents */}
                <FormSection accent="blue" title="Additional Documents" icon={<FileText className="h-4 w-4" />}>
                    <div className="mb-4 flex items-center justify-between">
                        <span className="t-body text-muted-ink">Upload supporting documents (e.g., TIN Certificate, Trade Licence)</span>
                        <button type="button" onClick={addAdditionalDocument} className="brand-gradient flex items-center gap-1 rounded-lg px-3 py-1.5 t-body text-white transition-transform hover:-translate-y-0.5"><Plus className="h-4 w-4" /> Add Document</button>
                    </div>
                    {formData.additionalDocuments.length === 0 ? (
                        <div className="py-8 text-center text-faint-ink"><FileText className="mx-auto mb-2 h-12 w-12 opacity-50" /><p className="t-body">No additional documents added</p></div>
                    ) : (
                        <div className="space-y-3">
                            {formData.additionalDocuments.map((doc) => (
                                <div key={doc.id} className="flex flex-wrap items-end gap-3 border-b border-[var(--border-base)] pb-3">
                                    <div className="min-w-[150px] flex-1">
                                        <label className={labelClass}>Document Name</label>
                                        <input type="text" value={doc.name} onChange={(e) => updateAdditionalDocument(doc.id, "name", e.target.value)} placeholder="e.g., TIN Certificate" className={inputClass} />
                                    </div>
                                    <div className="min-w-[200px] flex-1">
                                        <label className={labelClass}>File</label>
                                        {renderFileUpload(doc.file, (e) => updateAdditionalDocument(doc.id, "file", e.target.files?.[0] || null), () => updateAdditionalDocument(doc.id, "file", null), "Upload File")}
                                    </div>
                                    <button type="button" onClick={() => removeAdditionalDocument(doc.id)} className="mt-1 p-1 text-debit"><Trash2 className="h-5 w-5" /></button>
                                </div>
                            ))}
                        </div>
                    )}
                </FormSection>

                {/* Nominees */}
                <FormSection accent="emerald" title="Registered Nominees" icon={<Users className="h-4 w-4" />}>
                    <div className="mb-4 flex items-center justify-between">
                        <span className="t-body text-muted-ink">Add your nominees</span>
                        <button type="button" onClick={() => setShowNomineeModal(true)} className="flex items-center gap-1 rounded-lg bg-[var(--status-success)] px-3 py-1.5 t-body text-white transition-transform hover:-translate-y-0.5"><Plus className="h-4 w-4" /> Add Nominee</button>
                    </div>
                    {formData.nominees.length === 0 ? (
                        <div className="py-8 text-center text-faint-ink"><Users className="mx-auto mb-2 h-12 w-12 opacity-50" /><p className="t-body">No nominees registered</p></div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {formData.nominees.map((nominee) => (
                                <div key={nominee.id} className="rounded-lg border border-[var(--border-base)] bg-surface p-4">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h4 className="t-body font-medium text-primary-ink">{nominee.name}</h4>
                                            <p className="t-caption text-muted-ink">{nominee.relation} ({nominee.share}%)</p>
                                        </div>
                                        <button type="button" onClick={() => deleteNominee(nominee.id)} className="p-1 text-faint-ink hover:text-debit"><Trash2 className="h-4 w-4" /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </FormSection>

                <div className="mt-8 flex flex-col gap-3 border-t border-[var(--border-base)] pt-6 sm:flex-row sm:justify-end">
                    <Link href="/login" className="w-full sm:w-auto">
                        <button type="button" className="w-full rounded-lg border border-[var(--border-base)] px-4 py-2.5 t-body font-medium text-secondary-ink transition-colors hover:bg-subtle hover:text-primary-ink sm:w-auto">Cancel</button>
                    </Link>
                    <button type="submit" disabled={loading} className="brand-gradient flex w-full items-center justify-center gap-2 rounded-lg px-6 py-2.5 t-body font-medium text-white shadow-brand-glow disabled:opacity-50 sm:w-auto">
                        {loading ? "Submitting..." : <><CheckCircle className="h-4 w-4" /> Submit Application</>}
                    </button>
                </div>
            </div>

            {/* Right Column: Completion Status */}
            <div className="lg:col-span-1">
                <div className="card-premium sticky top-8 p-6">
                    <h3 className="t-h3 mb-4 text-primary-ink">Completion Status</h3>
                    <div className="mb-6 flex flex-col items-center justify-center">
                        <div className="relative h-24 w-24">
                            <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                                <path className="text-[var(--border-strong)]" stroke="currentColor" strokeWidth="3" fill="none" d="M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 0 1 0-31" />
                                <path className="text-brand transition-all duration-500" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" strokeDasharray={`${progress}, 100`} d="M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 0 1 0-31" />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="t-h2 t-num text-primary-ink">{progress}%</span>
                            </div>
                        </div>
                        <p className="t-caption mt-2 text-muted-ink">{completedSteps} of {steps.length} steps completed</p>
                    </div>
                    <div className="space-y-3">
                        {steps.map((step, index) => (
                            <div key={index} className="flex items-center gap-3">
                                {step.complete ? (
                                    <CheckCircle className="h-5 w-5 shrink-0 text-success" />
                                ) : (
                                    <Circle className="h-5 w-5 shrink-0 text-faint-ink" />
                                )}
                                <span className={`t-body ${step.complete ? 'font-medium text-primary-ink' : 'text-muted-ink'}`}>{step.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {showNomineeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="card-premium w-full max-w-md p-6 shadow-pop">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="t-h3 text-primary-ink">Add Nominee</h3>
                            <button type="button" onClick={() => setShowNomineeModal(false)} className="text-muted-ink hover:text-primary-ink"><X className="h-5 w-5" /></button>
                        </div>
                        <div className="space-y-3">
                            <div><label className={labelClass}>Full Name *</label><input type="text" name="name" value={nomineeForm.name} onChange={handleNomineeInputChange} placeholder="e.g., Mrs. Salma" className={inputClass} /></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={labelClass}>Relation *</label><input type="text" name="relation" value={nomineeForm.relation} onChange={handleNomineeInputChange} placeholder="e.g., Wife" className={inputClass} /></div>
                                <div><label className={labelClass}>Share % *</label><input type="text" name="share" value={nomineeForm.share} onChange={handleNomineeInputChange} placeholder="e.g., 100" className={inputClass} /></div>
                            </div>
                            <div><label className={labelClass}>Nominee Phone</label><input type="tel" name="phone" value={nomineeForm.phone} onChange={handleNomineeInputChange} placeholder="e.g., 01812345678" className={inputClass} /></div>
                            <div><label className={labelClass}>Nominee Photo</label>{renderFileUpload(nomineeForm.photo, (e) => handleNomineeFileChange(e, "photo"), () => setNomineeForm((prev) => ({ ...prev, photo: null })), "Upload Photo")}</div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><label className={labelClass}>ID Type</label><select name="idType" value={nomineeForm.idType} onChange={handleNomineeInputChange} className={inputClass}><option value="nid">National ID</option><option value="birthCert">Birth Certificate</option><option value="passport">Passport</option></select></div>
                                <div><label className={labelClass}>ID Number</label><input type="text" name="idNumber" value={nomineeForm.idNumber} onChange={handleNomineeInputChange} placeholder="e.g., 1990123456789" className={inputClass} /></div>
                            </div>
                            <div><label className={labelClass}>ID Document (Upload)</label>{renderFileUpload(nomineeForm.idDocumentFile, (e) => handleNomineeFileChange(e, "idDocumentFile"), () => setNomineeForm((prev) => ({ ...prev, idDocumentFile: null })), "Upload Nominee ID Document")}</div>
                            <div>
                                <label className={labelClass}>Nominee Signature <span className="text-slate-400 text-xs">(optional)</span></label>
                                {renderFileUpload(nomineeForm.signatureFile, (e) => handleNomineeFileChange(e, "signatureFile"), () => setNomineeForm((prev) => ({ ...prev, signatureFile: null })), "Upload Nominee Signature")}
                                <p className="mt-1 t-caption text-muted-ink">Signature image on a white background. Optional but recommended for adult nominees.</p>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3 border-t border-[var(--border-base)] pt-4">
                            <button type="button" onClick={() => setShowNomineeModal(false)} className="rounded-lg border border-[var(--border-base)] px-4 py-2 t-body text-secondary-ink">Cancel</button>
                            <button type="button" onClick={addNominee} className="brand-gradient rounded-lg px-4 py-2 t-body text-white">Add Nominee</button>
                        </div>
                    </div>
                </div>
            )}
        </form>
    )
}
