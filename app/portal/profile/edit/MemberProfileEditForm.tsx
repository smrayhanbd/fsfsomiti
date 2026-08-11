"use client"

/* eslint-disable @typescript-eslint/no-explicit-any */
// The `member` prop is a JSON-serialized Prisma record (dates -> strings,
// decimals -> numbers), typed loosely to mirror `components/member/MemberForm.tsx`.

/**
 * MemberProfileEditForm — full self-service profile editor for members.
 *
 * Mirrors the admin `MemberForm` structure (Personal → Contact → Identity →
 * Bank → Residence → Nominees) but excludes admin-only fields (status, KYC,
 * joined/membership date, referredBy, memberNo) and is styled with the
 * Somiti portal design system (`SectionCard`, `inputBase`).
 *
 * IMPORTANT — security model: changes are NOT applied directly. They are
 * uploaded/submitted as a PENDING `ProfileUpdateRequest` and replayed against
 * the member record only once an admin approves (see
 * `submitFullProfileUpdateRequest` / `approveProfileUpdateRequest`).
 *
 * The member shape is a JSON-serialized Prisma record (Dates → ISO strings).
 */
import React, { useState, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  User, Phone, CreditCard, Home, Users, Upload, X, Plus, Trash2,
  CheckCircle, AlertCircle, ChevronRight, Loader2, ArrowLeft, Building,
  Clock,
} from "lucide-react"

import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog"
import SectionCard from "@/components/somiti/SectionCard"
import { submitFullProfileUpdateRequest } from "@/app/actions/portal"

// ─── Types ───────────────────────────────────────────────────────────
type Nominee = {
  id: string
  dbId?: string
  name: string
  relation: string
  share: string
  phone: string
  idType: "nid" | "birthCert" | "passport"
  idNumber: string
  idDocumentFile: File | null
  photo: File | null
  // Nominee signature — optional (members can upload one if available).
  signatureFile: File | null
  existingPhotoUrl?: string | null
  existingIdDocUrl?: string | null
  existingSignatureUrl?: string | null
}

type FormData = {
  firstName: string
  lastName: string
  fatherName: string
  motherName: string
  spouseName: string
  dateOfBirth: string
  gender: "male" | "female" | "other"
  religion: string
  nationality: string
  bloodGroup: string
  profession: string
  maritalStatus: "married" | "unmarried" | "divorced" | "widowed"
  marriageDate: string
  phoneNumber: string
  emailAddress: string
  emergencyContact: string
  emergencyContactName: string
  idType: string
  idNumber: string
  idDocumentFile: File | null
  memberPhoto: File | null
  // Member signature — required, embedded on the Membership Application Form PDF.
  signatureFile: File | null
  accountName: string
  accountNumber: string
  bankName: string
  branch: string
  routingNumber: string
  currentAddress: string
  currentPostOffice: string
  currentDistrict: string
  currentPostCode: string
  permanentAddress: string
  permanentPostOffice: string
  permanentDistrict: string
  permanentPostCode: string
  nominees: Nominee[]
}

// ─── Constants (mirror admin MemberForm) ─────────────────────────────
const bloodGroupOptions = [
  { label: "A+", value: "A_POSITIVE" }, { label: "A-", value: "A_NEGATIVE" },
  { label: "B+", value: "B_POSITIVE" }, { label: "B-", value: "B_NEGATIVE" },
  { label: "AB+", value: "AB_POSITIVE" }, { label: "AB-", value: "AB_NEGATIVE" },
  { label: "O+", value: "O_POSITIVE" }, { label: "O-", value: "O_NEGATIVE" },
]
const religions = ["Islam", "Hinduism", "Christianity", "Buddhism", "Other"]
const genders = ["Male", "Female", "Other"]
const maritalStatuses = ["Married", "Unmarried", "Divorced", "Widowed"]
// Shared constants — all 64 districts + all scheduled banks of Bangladesh.
// Defined once in lib/constants.ts so the admin and portal forms stay in sync.
import { BANGLADESH_DISTRICTS, BANGLADESH_BANKS } from "@/lib/constants"
const districts = [...BANGLADESH_DISTRICTS]
const banks = [...BANGLADESH_BANKS]
const idTypes = ["National ID", "Passport", "Birth Certificate", "Driving License"]

// Required fields for the member's self-service profile edit.
// Mirrors the admin MemberForm's required set MINUS the file-upload fields
// (memberPhoto, idDocumentFile) and bank fields — those are optional on
// self-edit because the member may already have them on file (grace via
// existingUrl) or may not have a bank account yet.
// Bank fields are nullable in the schema; we don't force them here.
const requiredFields: (keyof FormData)[] = [
  "firstName", "dateOfBirth", "gender", "maritalStatus",
  "phoneNumber", "emailAddress", "emergencyContactName",
  "idType", "idNumber",
  "currentAddress", "currentDistrict", "permanentAddress", "permanentDistrict",
]

// Friendlier per-field messages instead of a generic "This field is required".
const requiredFieldMessages: Partial<Record<keyof FormData, string>> = {
  firstName: "First name is required",
  dateOfBirth: "Please select your date of birth",
  gender: "Please select your gender",
  maritalStatus: "Please select your marital status",
  phoneNumber: "Phone number is required (11 digits)",
  emailAddress: "Email address is required",
  emergencyContactName: "Emergency contact person name is required",
  idType: "Please select an ID type",
  idNumber: "ID number is required",
  currentAddress: "Current address is required",
  currentDistrict: "Please select your current district",
  permanentAddress: "Permanent address is required",
  permanentDistrict: "Please select your permanent district",
}

// Shared input class — re-skins to brand tokens via globals.css shim.
const inputBase =
  "w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-colors"

// ─── Helpers ─────────────────────────────────────────────────────────
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

// Load a serialized member record into FormData.
function memberToFormData(member: any): FormData {
  const currentAddr = member.addresses?.find((a: any) => a.addressType === "CURRENT") || {}
  const permanentAddr = member.addresses?.find((a: any) => a.addressType === "PERMANENT") || {}
  const idTypeGuess = member.nidNumber
    ? "National ID"
    : member.passportNumber
    ? "Passport"
    : member.birthCertificateNo
    ? "Birth Certificate"
    : "National ID"

  return {
    firstName: member.firstName || "",
    lastName: member.lastName || "",
    fatherName: member.fatherName || "",
    motherName: member.motherName || "",
    spouseName: member.spouseName || "",
    dateOfBirth: member.dateOfBirth ? new Date(member.dateOfBirth).toISOString().split("T")[0] : "",
    gender: ((member.gender || "male")).toLowerCase() as FormData["gender"],
    religion: member.religion || "",
    nationality: member.nationality || "Bangladeshi",
    bloodGroup: member.bloodGroup || "",
    profession: member.profession || "",
    maritalStatus: ((member.maritalStatus || "unmarried")).toLowerCase() as FormData["maritalStatus"],
    marriageDate: member.marriageDate ? new Date(member.marriageDate).toISOString().split("T")[0] : "",
    phoneNumber: member.phone || "",
    emailAddress: member.email || "",
    emergencyContact: member.emergencyPhone || "",
    emergencyContactName: member.emergencyContactName || "",
    idType: idTypeGuess,
    idNumber: member.nidNumber || member.passportNumber || member.birthCertificateNo || "",
    idDocumentFile: null,
    memberPhoto: null,
    signatureFile: null,
    accountName: member.accountName || "",
    accountNumber: member.accountNumber || "",
    bankName: member.bankName || "",
    branch: member.branch || "",
    routingNumber: member.routingNumber || "",
    currentAddress: currentAddr.village || "",
    currentPostOffice: currentAddr.postOffice || "",
    currentDistrict: currentAddr.district || "",
    currentPostCode: currentAddr.postalCode || "",
    permanentAddress: permanentAddr.village || "",
    permanentPostOffice: permanentAddr.postOffice || "",
    permanentDistrict: permanentAddr.district || "",
    permanentPostCode: permanentAddr.postalCode || "",
    nominees:
      member.nominees?.map((n: any) => ({
        id: `nom-${n.id}`,
        dbId: n.id,
        name: n.name,
        relation: n.relation,
        share: String(n.sharePercentage),
        phone: n.phone || "",
        idType: (n.idType === "birthCert" ? "birthCert" : n.idType === "passport" ? "passport" : "nid") as Nominee["idType"],
        idNumber: n.nidNumber || "",
        idDocumentFile: null,
        photo: null,
        signatureFile: null,
        existingPhotoUrl: n.photoUrl || null,
        existingIdDocUrl: n.idDocumentUrl || null,
        existingSignatureUrl: n.signatureUrl || null,
      })) || [],
  }
}

interface MemberProfileEditFormProps {
  member: any
}

export default function MemberProfileEditForm({ member }: MemberProfileEditFormProps) {
  const router = useRouter()

  const [formData, setFormData] = useState<FormData>(() => memberToFormData(member))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [nomineeIdCounter, setNomineeIdCounter] = useState(formData.nominees.length + 1)
  const [showNomineeModal, setShowNomineeModal] = useState(false)
  const [editingNomineeId, setEditingNomineeId] = useState<string | null>(null)
  const [nomineeForm, setNomineeForm] = useState<Omit<Nominee, "id">>({
    name: "", relation: "", share: "", phone: "", idType: "nid", idNumber: "",
    idDocumentFile: null, photo: null, signatureFile: null,
    existingPhotoUrl: null, existingIdDocUrl: null, existingSignatureUrl: null,
  })
  const [submitting, setSubmitting] = useState(false)

  // ─── Validation helpers ──────────────────────────────────────────
  const validateMobile = (p: string) => p.replace(/\D/g, "").length === 11
  const validateEmail = (e: string) => { if (!e) return true; return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) }
  const validateIdNumber = (idType: string, idNumber: string) => {
    if (!idNumber) return true // optional on member self-edit
    const digits = idNumber.replace(/\D/g, "")
    if (idType === "National ID") return digits.length === 10 || digits.length === 13 || digits.length === 17
    if (idType === "Passport") return idNumber.length >= 6
    if (idType === "Birth Certificate") return digits.length === 17
    if (idType === "Driving License") return idNumber.length > 5
    return true
  }
  const validateNomineeShares = (nominees: Nominee[]): string | null => {
    if (nominees.length === 0) return null
    let total = 0
    for (const n of nominees) {
      const s = parseFloat(n.share)
      if (isNaN(s) || s <= 0) return `Share for "${n.name}" must be a positive number.`
      total += s
    }
    if (total > 100) return `Total nominee shares (${total}%) exceed 100%. Please adjust.`
    return null
  }
  const nomineeError = useMemo(() => validateNomineeShares(formData.nominees) || "", [formData.nominees])

  // ─── Field change handlers ───────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const target = e.target
    const { name, value, type } = target
    if (type === "checkbox") {
      const checked = (target as HTMLInputElement).checked
      setFormData((prev) => ({ ...prev, [name]: checked }))
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }))
    }
    if (errors[name]) setErrors((prev) => { const n = { ...prev }; delete n[name]; return n })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: keyof Pick<FormData, "idDocumentFile" | "memberPhoto" | "signatureFile">) =>
    setFormData((prev) => ({ ...prev, [field]: e.target.files?.[0] || null }))

  const handleNomineeInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setNomineeForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  const handleNomineeFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: "idDocumentFile" | "photo" | "signatureFile") =>
    setNomineeForm((prev) => ({ ...prev, [field]: e.target.files?.[0] || null }))

  // ─── Adult-check helper (for nominee signature requirement) ──────
  // A nominee is considered an adult (signature required) if their DOB is
  // at least 18 years before today. Unknown DOB → default to adult (require).
  const isNomineeAdult = (dob: string | null | undefined): boolean => {
    if (!dob) return true
    const d = new Date(dob)
    if (isNaN(d.getTime())) return true
    const eighteenYearsAgo = new Date()
    eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18)
    return d <= eighteenYearsAgo
  }

  const checkNomineeShare = (editingId: string | null): boolean => {
    const nomineesToCheck = editingId
      ? formData.nominees.map((n) => (n.id === editingId ? { ...n, share: nomineeForm.share } : n))
      : [...formData.nominees, { ...nomineeForm, id: `temp-${Date.now()}` } as Nominee]
    const error = validateNomineeShares(nomineesToCheck)
    if (error) { toast.error("Nominee share invalid", { description: error }); return false }
    return true
  }

  const resetNomineeForm = () => {
    setNomineeForm({
      name: "", relation: "", share: "", phone: "", idType: "nid", idNumber: "",
      idDocumentFile: null, photo: null, signatureFile: null,
      existingPhotoUrl: null, existingIdDocUrl: null, existingSignatureUrl: null,
    })
    setEditingNomineeId(null)
  }

  const addNominee = () => {
    if (!nomineeForm.name || !nomineeForm.relation || !nomineeForm.share) { toast.error("Please fill all required nominee fields."); return }
    if (!checkNomineeShare(null)) return
    // Nominee signature is OPTIONAL (per user request).
    const newNominee: Nominee = { id: `nom-${nomineeIdCounter}`, ...nomineeForm }
    setFormData((prev) => ({ ...prev, nominees: [...prev.nominees, newNominee] }))
    setNomineeIdCounter((prev) => prev + 1)
    resetNomineeForm()
    setShowNomineeModal(false)
  }
  const editNominee = (id: string) => {
    const n = formData.nominees.find((x) => x.id === id)
    if (n) {
      setNomineeForm({
        name: n.name, relation: n.relation, share: n.share, phone: n.phone,
        idType: n.idType, idNumber: n.idNumber,
        idDocumentFile: n.idDocumentFile, photo: n.photo,
        signatureFile: n.signatureFile,
        existingPhotoUrl: n.existingPhotoUrl,
        existingIdDocUrl: n.existingIdDocUrl,
        existingSignatureUrl: n.existingSignatureUrl,
      })
      setEditingNomineeId(id)
      setShowNomineeModal(true)
    }
  }
  const updateNominee = () => {
    if (!nomineeForm.name || !nomineeForm.relation || !nomineeForm.share) { toast.error("Please fill all required nominee fields."); return }
    if (!checkNomineeShare(editingNomineeId)) return
    // Nominee signature is OPTIONAL (per user request).
    setFormData((prev) => ({
      ...prev,
      nominees: prev.nominees.map((n) => (n.id === editingNomineeId ? { ...n, ...nomineeForm } : n)),
    }))
    resetNomineeForm()
    setShowNomineeModal(false)
  }
  const deleteNominee = (id: string) => {
    if (confirm("Remove this nominee?")) {
      const next = formData.nominees.filter((n) => n.id !== id)
      const err = validateNomineeShares(next)
      if (err) { toast.error(err); return }
      setFormData((prev) => ({ ...prev, nominees: next }))
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    requiredFields.forEach((field) => {
      const value = formData[field]
      if (!value || value === "") {
        newErrors[field] = requiredFieldMessages[field] || "This field is required"
      }
    })
    if (formData.phoneNumber && !validateMobile(formData.phoneNumber)) newErrors.phoneNumber = "Must be exactly 11 digits (e.g., 01712345678)"
    if (formData.emergencyContact && !validateMobile(formData.emergencyContact)) newErrors.emergencyContact = "Must be exactly 11 digits"
    if (formData.emailAddress && !validateEmail(formData.emailAddress)) newErrors.emailAddress = "Invalid email format"
    if (formData.idType && formData.idNumber && !validateIdNumber(formData.idType, formData.idNumber)) {
      if (formData.idType === "National ID") newErrors.idNumber = "NID must be 10, 13, or 17 digits"
      else if (formData.idType === "Birth Certificate") newErrors.idNumber = "Birth Cert must be 17 digits"
      else newErrors.idNumber = "Invalid ID number format"
    }
    // Nominee shares must total 100% if any nominees exist.
    // (We don't force "at least 1 nominee" on self-edit because the member
    // might not have one yet — but if they add any, shares must sum to 100%.)
    if (formData.nominees.length > 0) {
      let total = 0
      for (const n of formData.nominees) total += parseFloat(n.share) || 0
      if (total !== 100) newErrors.nominees = `Total nominee shares must equal 100%. Currently at ${total}%.`
    }
    setErrors(newErrors)
    return newErrors
  }

  // Scroll + focus the first field that has an error, so the member is taken
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
      try { focusable.focus({ preventScroll: true }) } catch { focusable.focus() }
    }
  }

  // ─── Completion progress (sidebar) ───────────────────────────────
  // Mirrors the admin MemberForm's completion tracker. File uploads are
  // considered complete if either a NEW file is selected OR an existing
  // file URL is present (member.photoUrl / member.documents[]).
  const existingPhotoUrl = member?.photoUrl
  const existingIdDocUrl = member?.documents?.find((d: any) => d.documentType === formData.idType)?.fileUrl
  const steps = useMemo(() => [
    { name: "Personal Information", complete: !!(formData.firstName && formData.dateOfBirth && formData.gender && formData.maritalStatus) },
    { name: "Contact & ID", complete: !!(formData.phoneNumber && formData.emailAddress && formData.idType && formData.idNumber && formData.emergencyContactName && (formData.memberPhoto || existingPhotoUrl)) },
    { name: "Bank Details", complete: !!(formData.accountName && formData.accountNumber && formData.bankName) },
    { name: "Address Info", complete: !!(formData.currentAddress && formData.currentDistrict && formData.permanentAddress && formData.permanentDistrict) },
    { name: "Documents", complete: !!(formData.idDocumentFile || existingIdDocUrl) },
    { name: "Nominees", complete: formData.nominees.length > 0 },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [formData, existingPhotoUrl, existingIdDocUrl])
  const completedSteps = steps.filter((s) => s.complete).length
  const progress = Math.round((completedSteps / steps.length) * 100)

  // Build a FormData using the same field contract as the admin `updateMember`
  // action so `submitFullProfileUpdateRequest` can parse it.
  const buildPayload = (fd: FormData) => {
    const out = new FormData()
    out.append("firstName", fd.firstName); out.append("lastName", fd.lastName)
    out.append("fatherName", fd.fatherName); out.append("motherName", fd.motherName)
    out.append("spouseName", fd.spouseName)
    out.append("dob", fd.dateOfBirth)
    out.append("gender", fd.gender ? fd.gender.toUpperCase() : "")
    out.append("religion", fd.religion); out.append("nationality", fd.nationality)
    // bloodGroup stored as the Prisma enum (A_POSITIVE …) — already the enum value here.
    out.append("bloodGroup", fd.bloodGroup)
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

    if (fd.memberPhoto) out.append("memberPhoto", fd.memberPhoto)
    if (fd.idDocumentFile) out.append("idDocument", fd.idDocumentFile)
    if (fd.signatureFile) out.append("signature", fd.signatureFile)

    fd.nominees.forEach((nom, idx) => {
      out.append(`nom_${idx}_name`, nom.name)
      out.append(`nom_${idx}_relation`, nom.relation)
      out.append(`nom_${idx}_share`, nom.share)
      out.append(`nom_${idx}_phone`, nom.phone || "")
      out.append(`nom_${idx}_idType`, nom.idType)
      out.append(`nom_${idx}_idNumber`, nom.idNumber)
      if (nom.dbId) out.append(`nom_${idx}_dbId`, nom.dbId)
      if (nom.photo) out.append(`nom_${idx}_photo`, nom.photo)
      if (nom.idDocumentFile) out.append(`nom_${idx}_idDoc`, nom.idDocumentFile)
      if (nom.signatureFile) out.append(`nom_${idx}_signature`, nom.signatureFile)
    })

    return out
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitAttempted(true)
    const formErrors = validateForm()
    if (Object.keys(formErrors).length > 0) {
      // Take the member directly to the first missing required field.
      setTimeout(() => scrollToFirstError(formErrors), 0)
      if (formErrors.nominees) {
        toast.error("Form incomplete", { description: formErrors.nominees })
      } else {
        toast.error("Form incomplete", {
          description: `Only ${progress}% complete. Please fill all required fields highlighted in red before submitting.`,
        })
      }
      return
    }

    const payload = buildPayload(formData)
    setSubmitting(true)
    try {
      const result = await submitFullProfileUpdateRequest(member.id, payload)
      if (result?.error) {
        toast.error("Could not submit update", { description: result.error })
        setSubmitting(false)
        return
      }
      toast.success("Update request submitted", {
        description: result?.success || "It will be sent to admin for approval.",
      })
      router.push("/portal/profile")
    } catch (err: any) {
      // The action may reach navigation via redirect() → NEXT_REDIRECT == success.
      if (err?.message === "NEXT_REDIRECT" || err?.digest?.startsWith("NEXT_REDIRECT")) {
        throw err
      }
      toast.error("Could not submit update", { description: err?.message || "Please try again." })
    } finally {
      setSubmitting(false)
    }
  }

  // ─── File upload renderer ──────────────────────────────────────────
  // Accepts optional `hasError` + `errorText` so the upload box can show a
  // red border + instruction text when the field is required but missing,
  // matching how text inputs render errors via `fieldClass` + `FieldError`.
  const renderFileUpload = (
    file: File | null,
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
    onRemove: () => void,
    label: string,
    existingUrl?: string | null,
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
                <Upload className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="text-sm text-slate-700 dark:text-slate-200 truncate max-w-[160px]">{file.name}</span>
                <span className="text-xs text-slate-400">({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
              <button type="button" onClick={onRemove} className="text-red-500 hover:text-red-700 shrink-0"><X className="w-4 h-4" /></button>
            </div>
          ) : existingUrl ? (
            <div className="flex flex-col items-center justify-center gap-2">
              <a href={existingUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 dark:text-indigo-400 underline flex items-center gap-1.5">
                <Upload className="w-4 h-4" /> View Current File
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

  const fieldClass = (name: string) =>
    `${inputBase} ${errors[name] && submitAttempted ? "border-red-500" : "border-gray-300 dark:border-slate-700"}`

  return (
    <div className="w-full">
      {/* Breadcrumb + back link */}
      <Link
        href="/portal/profile"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors mb-3"
      >
        <ArrowLeft className="h-4 w-4" /> Back to My Profile
      </Link>
      <nav className="flex items-center text-sm text-slate-500 dark:text-slate-400 mb-4">
        <Link href="/portal/profile" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">My Profile</Link>
        <ChevronRight className="h-4 w-4 mx-1 text-slate-400" />
        <span className="text-slate-900 dark:text-white font-medium">Edit Profile</span>
      </nav>

      {/* Header card */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 bg-white dark:bg-slate-900 rounded-xl shadow-md p-6 border-l-4 border-indigo-600">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Edit My Profile</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            Update your details below. Changes are sent to the admin for approval before they take effect.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/portal/profile">
            <button type="button" className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</button>
          </Link>
          <button
            type="submit"
            form="memberProfileForm"
            disabled={submitting}
            className="px-6 py-2 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium shadow-md disabled:opacity-60 disabled:cursor-not-allowed bg-indigo-600 hover:bg-indigo-700"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {submitting ? "Submitting..." : "Submit for Approval"}
          </button>
        </div>
      </div>

      {/* Approval-pending notice */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-4 mb-6">
        <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800 dark:text-amber-200">
          <strong>Approval required.</strong> Your changes will not take effect immediately — they are sent to the
          admin for review. Uploaded files are attached to the request. You can track status under{" "}
          <Link href="/portal/requests" className="underline font-medium">My Requests</Link>.
        </p>
      </div>

      <form id="memberProfileForm" onSubmit={handleSubmit} className="space-y-6">
        {/* Personal + Contact (two-up) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6 items-stretch">
          {/* Personal Information */}
          <SectionCard accent="blue" title="Personal Information" icon={<User className="h-[18px] w-[18px]" />} bodyClassName="p-6">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">First Name <span className="text-red-500">*</span></Label>
                  <input type="text" name="firstName" value={formData.firstName} onChange={handleInputChange} className={fieldClass("firstName")} />
                  <FieldError name="firstName" errors={errors} submitAttempted={submitAttempted} />
                </div>
                <div>
                  <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Last Name</Label>
                  <input type="text" name="lastName" value={formData.lastName} onChange={handleInputChange} className={fieldClass("lastName")} />
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
                  <EnterpriseDatePicker value={formData.dateOfBirth} onChange={(v) => setFormData((p) => ({ ...p, dateOfBirth: v }))} hasError={!!errors.dateOfBirth && submitAttempted} />
                  <FieldError name="dateOfBirth" errors={errors} submitAttempted={submitAttempted} />
                </div>
                <div>
                  <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Gender <span className="text-red-500">*</span></Label>
                  <select name="gender" value={formData.gender} onChange={handleInputChange} className={fieldClass("gender")}>
                    {genders.map((g) => <option key={g} value={g.toLowerCase()}>{g}</option>)}
                  </select>
                  <FieldError name="gender" errors={errors} submitAttempted={submitAttempted} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Marital Status <span className="text-red-500">*</span></Label>
                  <select name="maritalStatus" value={formData.maritalStatus} onChange={handleInputChange} className={fieldClass("maritalStatus")}>
                    {maritalStatuses.map((m) => <option key={m} value={m.toLowerCase()}>{m}</option>)}
                  </select>
                  <FieldError name="maritalStatus" errors={errors} submitAttempted={submitAttempted} />
                </div>
                <div>
                  <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Marriage Date</Label>
                  <EnterpriseDatePicker value={formData.marriageDate} onChange={(v) => setFormData((p) => ({ ...p, marriageDate: v }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Religion</Label>
                  <select name="religion" value={formData.religion} onChange={handleInputChange} className={fieldClass("religion")}>
                    <option value="">Select</option>
                    {religions.map((r) => <option key={r} value={r}>{r}</option>)}
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
                    {bloodGroupOptions.map((bg) => <option key={bg.value} value={bg.value}>{bg.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Profession</Label>
                  <input type="text" name="profession" value={formData.profession} onChange={handleInputChange} placeholder="e.g. Engineer" className={fieldClass("profession")} />
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Contact, Photo & ID */}
          <SectionCard accent="emerald" title="Contact, Photo & ID" icon={<Phone className="h-[18px] w-[18px]" />} bodyClassName="p-6">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div data-field="memberPhoto">
                  <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Member Photo</Label>
                  {renderFileUpload(
                    formData.memberPhoto,
                    (e) => handleFileChange(e, "memberPhoto"),
                    () => setFormData((p) => ({ ...p, memberPhoto: null })),
                    "Upload Member Photo",
                    member?.photoUrl,
                  )}
                </div>
                <div data-field="idDocumentFile">
                  <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">ID Document</Label>
                  {renderFileUpload(
                    formData.idDocumentFile,
                    (e) => handleFileChange(e, "idDocumentFile"),
                    () => setFormData((p) => ({ ...p, idDocumentFile: null })),
                    "Upload ID Document",
                    member?.documents?.find((d: any) => d.documentType === formData.idType)?.fileUrl,
                  )}
                </div>
              </div>
              <div data-field="signatureFile">
                <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Member Signature <span className="text-red-500">*</span></Label>
                {renderFileUpload(
                  formData.signatureFile,
                  (e) => handleFileChange(e, "signatureFile"),
                  () => setFormData((p) => ({ ...p, signatureFile: null })),
                  "Upload Member Signature",
                  member?.signatureUrl,
                )}
                <p className="text-[11px] text-slate-400 mt-1">Signature image (PNG/JPG) on a white background. Required for the Membership Application Form.</p>
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
                    {idTypes.map((id) => <option key={id} value={id}>{id}</option>)}
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

        {/* Bank + Residence (two-up) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6 items-stretch">
          <SectionCard accent="gold" title="Bank Information" icon={<CreditCard className="h-[18px] w-[18px]" />} bodyClassName="p-6">
            <div className="space-y-3">
              <div>
                <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Account Name</Label>
                <input type="text" name="accountName" value={formData.accountName} onChange={handleInputChange} placeholder="Full name as per bank" className={fieldClass("accountName")} />
              </div>
              <div>
                <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Account Number</Label>
                <input type="text" name="accountNumber" value={formData.accountNumber} onChange={handleInputChange} placeholder="Enter account number" className={fieldClass("accountNumber")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Bank Name</Label>
                  <select name="bankName" value={formData.bankName} onChange={handleInputChange} className={fieldClass("bankName")}>
                    <option value="">Select Bank</option>
                    {banks.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
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

          <SectionCard accent="violet" title="Residence Information" icon={<Home className="h-[18px] w-[18px]" />} bodyClassName="p-6">
            <div className="space-y-4">
              <div className="border-b border-slate-200 dark:border-slate-700 pb-3">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5"><Home className="w-4 h-4 text-slate-400" /> Current Residence</h3>
                <div className="space-y-2">
                  <input type="text" name="currentAddress" value={formData.currentAddress} onChange={handleInputChange} placeholder="Address" className={fieldClass("currentAddress")} />
                  <FieldError name="currentAddress" errors={errors} submitAttempted={submitAttempted} />
                  <div className="grid grid-cols-3 gap-2">
                    <input type="text" name="currentPostOffice" value={formData.currentPostOffice} onChange={handleInputChange} placeholder="Post Office" className={fieldClass("currentPostOffice")} />
                    <select name="currentDistrict" value={formData.currentDistrict} onChange={handleInputChange} className={fieldClass("currentDistrict")}>
                      <option value="">District</option>
                      {districts.map((d) => <option key={d} value={d}>{d}</option>)}
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
                  <FieldError name="permanentAddress" errors={errors} submitAttempted={submitAttempted} />
                  <div className="grid grid-cols-3 gap-2">
                    <input type="text" name="permanentPostOffice" value={formData.permanentPostOffice} onChange={handleInputChange} placeholder="Post Office" className={fieldClass("permanentPostOffice")} />
                    <select name="permanentDistrict" value={formData.permanentDistrict} onChange={handleInputChange} className={fieldClass("permanentDistrict")}>
                      <option value="">District</option>
                      {districts.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <input type="text" name="permanentPostCode" value={formData.permanentPostCode} onChange={handleInputChange} placeholder="Post Code" className={fieldClass("permanentPostCode")} />
                  </div>
                  <FieldError name="permanentDistrict" errors={errors} submitAttempted={submitAttempted} />
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Nominees (full width) */}
        <SectionCard accent="crimson" title="Registered Nominees" icon={<Users className="h-[18px] w-[18px]" />} bodyClassName="p-6">
          <div data-field="nominees">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-sm text-slate-500 dark:text-slate-400">If any nominees are added, shares must total 100%</span>
              {nomineeError && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {nomineeError}</p>}
              <FieldError name="nominees" errors={errors} submitAttempted={submitAttempted} />
            </div>
            <button
              type="button"
              onClick={() => { resetNomineeForm(); setShowNomineeModal(true); setEditingNomineeId(null); }}
              className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
            >
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
              {formData.nominees.map((nominee) => (
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

        {/* Footer actions (mirror header) */}
        <div className="flex justify-end gap-3 pt-6 border-t border-slate-200 dark:border-slate-800">
          <Link href="/portal/profile">
            <button type="button" className="px-6 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</button>
          </Link>
          <button type="submit" form="memberProfileForm" disabled={submitting} className="px-6 py-2.5 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium shadow-md disabled:opacity-60 disabled:cursor-not-allowed bg-indigo-600 hover:bg-indigo-700">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {submitting ? "Submitting..." : "Submit for Approval"}
          </button>
        </div>
      </form>

      {/* Nominee modal */}
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
              {renderFileUpload(nomineeForm.photo, (e) => handleNomineeFileChange(e, "photo"), () => setNomineeForm((p) => ({ ...p, photo: null })), "Upload Photo")}
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
              {renderFileUpload(
                nomineeForm.idDocumentFile,
                (e) => handleNomineeFileChange(e, "idDocumentFile"),
                () => setNomineeForm((p) => ({ ...p, idDocumentFile: null })),
                "Upload Nominee ID Document",
                nomineeForm.existingIdDocUrl || undefined,
              )}
            </div>
            <div>
              <Label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Nominee Signature <span className="text-slate-400 text-xs">(optional)</span></Label>
              {renderFileUpload(
                nomineeForm.signatureFile,
                (e) => handleNomineeFileChange(e, "signatureFile"),
                () => setNomineeForm((p) => ({ ...p, signatureFile: null })),
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
    </div>
  )
}
