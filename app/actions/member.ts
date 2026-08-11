"use server"

import prisma, { directPrisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { randomBytes } from "crypto"
import { Prisma, Gender, BloodGroup, MaritalStatus, MemberStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { uploadImage } from "@/lib/cloudinary"
import { sendEmail } from "@/lib/email"
import { sendSMS } from "@/lib/sms"
import { recalculateTrustScore } from "@/lib/trustScore"
import {
  getCurrentUser,
  requirePermission,
  PERMISSIONS,
} from "@/lib/permissions"
import { writeRbacAudit } from "@/lib/permissions/api"

/** Nominee payload built from form data before being written via Prisma. */
interface NomineeInput {
  name: string
  relation: string
  phone: string
  sharePercentage: number
  idType: string
  nidNumber: string
  idDocumentUrl: string | null
  photoUrl: string | null
  signatureUrl: string | null
}

/** Narrow an unknown catch value to a Prisma-like error with `.code` / `.meta`. */
function prismaErrorMeta(e: unknown): { code?: string; target?: string[] } {
  if (e && typeof e === "object" && "code" in e) {
    const code = (e as { code: unknown }).code
    const meta = "meta" in e ? (e as { meta?: { target?: unknown } }).meta : undefined
    const target = Array.isArray(meta?.target) ? (meta!.target as string[]) : []
    return { code: typeof code === "string" ? code : undefined, target }
  }
  return {}
}

// --- Add Member Action ---
export async function addMember(formData: FormData, isPublic: boolean = false) {
  // Public self-registration does not require an authed user; admin-side
  // creation does (PERMISSIONS.USER_MANAGE).
  if (!isPublic) {
    await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  }
  // 1. Extract Data
  const firstName = (formData.get("firstName") as string)?.trim() || ""
  const lastName = (formData.get("lastName") as string)?.trim() || ""
  if (!firstName || !lastName) {
    throw new Error("First name and last name are required.")
  }
  const fullName = `${firstName} ${lastName}`
  const fatherName = (formData.get("fatherName") as string) || null
  const motherName = (formData.get("motherName") as string) || null
  const spouseName = (formData.get("spouseName") as string) || null
  const dob = formData.get("dob") as string
  const gender = (formData.get("gender") as string) || undefined
  const religion = (formData.get("religion") as string) || null
  const nationality = (formData.get("nationality") as string) || "Bangladeshi"
  const bloodGroup = formData.get("bloodGroup") as string || undefined
  const profession = (formData.get("profession") as string) || null
  const phone = (formData.get("phone") as string) || ""
  if (!phone) {
    throw new Error("Phone number is required.")
  }
  // Server-side phone validation — 11 digits for Bangladesh mobile numbers.
  // Without this, a request bypassing client-side checks would write a bad row.
  if (phone.replace(/\D/g, "").length !== 11) {
    throw new Error("Phone number must be exactly 11 digits (e.g., 01712345678).")
  }
  const email = ((formData.get("email") as string) || "").trim().toLowerCase() || null
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("Please enter a valid email address.")
  }
  const emergencyPhone = (formData.get("emergencyPhone") as string) || null
  const emergencyContactName = (formData.get("emergencyContactName") as string) || null
  const idType = formData.get("idType") as string
  const idNumber = (formData.get("idNumber") as string) || null
  const maritalStatus = formData.get("maritalStatus") as string || undefined
  const marriageDate = formData.get("marriageDate") as string
  const accountName = (formData.get("accountName") as string) || null
  const accountNumber = (formData.get("accountNumber") as string) || null
  const bankName = (formData.get("bankName") as string) || null
  const branch = (formData.get("branch") as string) || null
  const routingNumber = (formData.get("routingNumber") as string) || null
  const c_village = (formData.get("c_village") as string) || null
  const c_postOffice = (formData.get("c_postOffice") as string) || null
  const c_district = (formData.get("c_district") as string) || null
  const c_postalCode = (formData.get("c_postalCode") as string) || null
  const p_village = (formData.get("p_village") as string) || null
  const p_postOffice = (formData.get("p_postOffice") as string) || null
  const p_district = (formData.get("p_district") as string) || null
  const p_postalCode = (formData.get("p_postalCode") as string) || null

  // Identity: store the idNumber in the field matching the idType. The schema
  // has separate @unique columns per document type; the form's dropdown
  // previously included "Driving License" but the action had no column for
  // it, so the number was silently dropped. We now reject unknown idTypes
  // up-front so the user gets a clear error instead of a silent loss.
  const KNOWN_ID_TYPES = ["National ID", "Passport", "Birth Certificate"]
  if (idType && !KNOWN_ID_TYPES.includes(idType)) {
    throw new Error(`Unsupported ID type "${idType}". Please pick one of: ${KNOWN_ID_TYPES.join(", ")}.`)
  }
  const nidNumber = idType === "National ID" ? idNumber : null
  const passportNumber = idType === "Passport" ? idNumber : null
  const birthCertificateNo = idType === "Birth Certificate" ? idNumber : null

  // Referral: resolve the referrer's memberNo to an id (optional, best-effort).
  const referredByMemberNo = (formData.get("referredByMemberNo") as string)?.trim() || null
  const referredByMemberId = await resolveReferrer(referredByMemberNo)

  // 1b. Duplicate check BEFORE uploads/transaction.
  // `phone` and `email` are intentionally NOT unique in the schema — one person
  // may hold multiple memberships with the same phone/email. Only ID fields
  // (nid/passport/birthCert) are @unique, so we pre-check them to give the user
  // a clear, field-targeted message instead of a generic DB error.
  const dupClauses = [
    ...(nidNumber ? [{ nidNumber }] : []),
    ...(passportNumber ? [{ passportNumber }] : []),
    ...(birthCertificateNo ? [{ birthCertificateNo }] : []),
  ]
  const existing = dupClauses.length
    ? await prisma.member.findFirst({
        where: { OR: dupClauses },
        select: { nidNumber: true, passportNumber: true, birthCertificateNo: true },
      })
    : null

  if (existing) {
    const idClash =
      (!!nidNumber && existing.nidNumber === nidNumber) ||
      (!!passportNumber && existing.passportNumber === passportNumber) ||
      (!!birthCertificateNo && existing.birthCertificateNo === birthCertificateNo)
    if (idClash) throw new Error("DUPLICATE_ID")
  }

  // 2. Handle File Uploads OUTSIDE the transaction to prevent timeout
  const memberPhotoFile = formData.get("memberPhoto") as File
  const memberPhotoUrl = memberPhotoFile?.size > 0 ? await uploadImage(memberPhotoFile) : null

  const idDocFile = formData.get("idDocument") as File
  const idDocUrl = idDocFile?.size > 0 ? await uploadImage(idDocFile) : null

  // Member signature — required by the form, embedded on the PDF.
  const signatureFile = formData.get("signature") as File
  const signatureUrl = signatureFile?.size > 0 ? await uploadImage(signatureFile) : null

  // Upload Additional Docs
  const additionalDocsData: { name: string; fileName: string; fileUrl: string }[] = []
  let docIndex = 0
  while (true) {
    const docName = formData.get(`doc_${docIndex}_name`) as string
    const docFile = formData.get(`doc_${docIndex}_file`) as File
    if (!docName && !docFile) break

    if (docFile?.size > 0) {
      const docUrl = await uploadImage(docFile)
      if (docUrl) {
        additionalDocsData.push({ name: docName || "Additional Document", fileName: docFile.name, fileUrl: docUrl })
      }
    }
    docIndex++
  }

  // Upload Nominees Data
  const nomineesData: NomineeInput[] = []
  let i = 0
  while (true) {
    const nomName = formData.get(`nom_${i}_name`) as string
    if (!nomName) break

    const nomRelation = formData.get(`nom_${i}_relation`) as string
    const nomShare = formData.get(`nom_${i}_share`) as string
    const nomPhone = formData.get(`nom_${i}_phone`) as string
    const nomIdType = formData.get(`nom_${i}_idType`) as string
    const nomIdNumber = formData.get(`nom_${i}_idNumber`) as string

    const nomPhotoFile = formData.get(`nom_${i}_photo`) as File
    const nomPhotoUrl = nomPhotoFile?.size > 0 ? await uploadImage(nomPhotoFile) : null

    const nomIdDocFile = formData.get(`nom_${i}_idDoc`) as File
    const nomIdDocUrl = nomIdDocFile?.size > 0 ? await uploadImage(nomIdDocFile) : null

    // Nominee signature — required for adult nominees, embedded on the PDF.
    const nomSignatureFile = formData.get(`nom_${i}_signature`) as File
    const nomSignatureUrl = nomSignatureFile?.size > 0 ? await uploadImage(nomSignatureFile) : null

    nomineesData.push({
      name: nomName, relation: nomRelation || "Unknown",
      phone: nomPhone, sharePercentage: nomShare ? parseFloat(nomShare) : 0,
      idType: nomIdType, nidNumber: nomIdNumber, idDocumentUrl: nomIdDocUrl, photoUrl: nomPhotoUrl,
      signatureUrl: nomSignatureUrl,
    })
    i++
  }

  // 3. Generate Member No — moved INSIDE the transaction below so the
  // Counter row is incremented atomically with the Member insert (B2: the
  // old `count+1` raced under concurrent registrations and collided on the
  // `memberNo` @unique constraint).
  // 4. Save to Database (Fast transaction with no network uploads inside)
  let member: Prisma.MemberGetPayload<Record<string, never>>
  try {
    member = await directPrisma.$transaction(async (tx) => {
      // B2/B18: atomic Counter increment for memberNo.
      const counter = await tx.counter.upsert({
        where: { id: "member" },
        update: { value: { increment: 1 } },
        create: { id: "member", value: 1 },
      })
      const memberNo = `M${String(counter.value).padStart(4, "0")}`
      const newMember = await tx.member.create({
        data: {
          memberNo, firstName, lastName, fullName, fatherName, motherName, spouseName,
          dateOfBirth: dob ? new Date(dob) : null,
          gender: gender as Gender, religion, nationality,
          bloodGroup: bloodGroup as BloodGroup, profession,
          phone, emergencyPhone, emergencyContactName, email,
          maritalStatus: maritalStatus as MaritalStatus, marriageDate: marriageDate ? new Date(marriageDate) : null,
          nidNumber, passportNumber, birthCertificateNo,
          accountName, accountNumber, bankName, branch, routingNumber,
          photoUrl: memberPhotoUrl,
          signatureUrl: signatureUrl,
          referredByMemberId,
          status: "PENDING",
        },
      })

      if (c_village || c_district) {
        await tx.memberAddress.create({
          data: { memberId: newMember.id, addressType: "CURRENT", village: c_village, postOffice: c_postOffice, district: c_district, postalCode: c_postalCode }
        })
      }
      if (p_village || p_district) {
        await tx.memberAddress.create({
          data: { memberId: newMember.id, addressType: "PERMANENT", village: p_village, postOffice: p_postOffice, district: p_district, postalCode: p_postalCode }
        })
      }

      if (idDocUrl) {
        await tx.memberDocument.create({
          data: { memberId: newMember.id, documentType: idType || "ID", name: "Member ID Document", fileName: idDocFile.name, fileUrl: idDocUrl }
        })
      }

      // Save Additional Docs
      for (const doc of additionalDocsData) {
        await tx.memberDocument.create({
          data: { memberId: newMember.id, documentType: "ADDITIONAL", name: doc.name, fileName: doc.fileName, fileUrl: doc.fileUrl }
        });
      }

      // Save Nominees
      for (const nom of nomineesData) {
        await tx.memberNominee.create({
          data: {
            memberId: newMember.id,
            ...nom
          }
        })
      }

      return newMember
    })
  } catch (error) {
    const { code, target } = prismaErrorMeta(error)
    if (code === 'P2002') {
      // Identify the actual unique field that collided (Prisma gives it in meta.target)
      // Note: email and phone are no longer unique — only ID fields + memberNo can collide.
      if (target?.includes("nidNumber") || target?.includes("passportNumber") || target?.includes("birthCertificateNo")) {
        throw new Error("DUPLICATE_ID")
      }
      // memberNo collisions (auto-generated, extremely rare)
      throw new Error("DUPLICATE_MEMBER_NO")
    }
    console.error("Failed to create member:", error)
    throw error
  }

  // 5. Handle Public Registration Notifications (Thank You)
  if (isPublic && member) {
    if (member.email) {
      try {
        await sendEmail(
          member.email,
          "Registration Received - Future Savings Foundation",
          `<p>Dear ${member.fullName},</p><p>Thank you for registering with Future Savings Foundation. Your application (ID: <strong>${member.memberNo}</strong>) is now pending approval by our management team.</p><p>We will notify you via SMS and Email once your account is approved and activated.</p>`
        )
      } catch (emailError) {
        console.error("Failed to send registration email:", emailError)
      }
    }
    
    if (member.phone) {
      try {
        const smsMsg = `Thank you for registering with Future Savings Foundation! Your application (ID: ${member.memberNo}) is pending approval. You will receive your login credentials once approved.`
        const smsRes = await sendSMS(member.phone, smsMsg)
        if (smsRes.status !== "OK") {
          await prisma.notification.create({
            data: {
              type: "SMS_ERROR",
              title: "Registration SMS Failed",
              message: `Failed to send registration SMS to ${member.fullName} (${member.phone}). Reason: ${smsRes.response}`
            }
          })
        }
      } catch (smsError) {
        console.error("Failed to send registration SMS:", smsError)
      }
    }
    return member
  } else {
    revalidatePath("/dashboard/approvals")
    redirect("/dashboard/approvals")
  }
}

// --- Public Registration Action ---
export async function registerMember(formData: FormData) {
  try {
    await addMember(formData, true)
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    if (code === "DUPLICATE_ID") {
      return {
        error: "A member with this ID number already exists. Please check your ID type and number, or contact support.",
        field: "idNumber",
      }
    }
    if (code === "DUPLICATE_MEMBER_NO") {
      return {
        error: "A system error occurred while generating your member number. Please try again.",
        field: undefined,
      }
    }
    // Fallback: Prisma unique-constraint violation on an ID field
    if (prismaErrorMeta(error).code === 'P2002') {
      return {
        error: "A member with this ID number already exists. Please check your ID type and number, or contact support.",
        field: "idNumber",
      }
    }
    console.error("Registration failed:", error)
    return { error: "Could not submit application. Please try again." }
  }

  return { success: true }
}

// --- Update Member Action ---
export async function updateMember(memberId: string, formData: FormData) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  // 1. Extract Data
const firstName = (formData.get("firstName") as string)?.trim() || ""
const lastName = (formData.get("lastName") as string)?.trim() || ""
if (!firstName) {
  throw new Error("First name is required.")
}
// Last name is optional — fullName collapses to just firstName when blank.
const fullName = lastName ? `${firstName} ${lastName}` : firstName
  const fatherName = (formData.get("fatherName") as string) || null
  const motherName = (formData.get("motherName") as string) || null
  const spouseName = (formData.get("spouseName") as string) || null
  const dob = formData.get("dob") as string
  const gender = (formData.get("gender") as string) || undefined
  const religion = (formData.get("religion") as string) || null
  const nationality = (formData.get("nationality") as string) || "Bangladeshi"
  const bloodGroup = formData.get("bloodGroup") as string || undefined
  const profession = (formData.get("profession") as string) || null
  const phone = (formData.get("phone") as string) || ""
  if (!phone) {
    throw new Error("Phone number is required.")
  }
  if (phone.replace(/\D/g, "").length !== 11) {
    throw new Error("Phone number must be exactly 11 digits (e.g., 01712345678).")
  }
  const email = ((formData.get("email") as string) || "").trim().toLowerCase() || null
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("Please enter a valid email address.")
  }
  const emergencyPhone = (formData.get("emergencyPhone") as string) || null
  const emergencyContactName = (formData.get("emergencyContactName") as string) || null
  const idType = formData.get("idType") as string
  const idNumber = (formData.get("idNumber") as string) || null
  // Mirror the addMember guard: reject unknown idTypes so an idNumber is
  // never silently dropped during edit.
  const KNOWN_ID_TYPES = ["National ID", "Passport", "Birth Certificate"]
  if (idType && !KNOWN_ID_TYPES.includes(idType)) {
    throw new Error(`Unsupported ID type "${idType}". Please pick one of: ${KNOWN_ID_TYPES.join(", ")}.`)
  }
  const maritalStatus = formData.get("maritalStatus") as string || undefined
  const marriageDate = formData.get("marriageDate") as string
  const accountName = (formData.get("accountName") as string) || null
  const accountNumber = (formData.get("accountNumber") as string) || null
  const bankName = (formData.get("bankName") as string) || null
  const branch = (formData.get("branch") as string) || null
  const routingNumber = (formData.get("routingNumber") as string) || null
  const c_village = (formData.get("c_village") as string) || null
  const c_postOffice = (formData.get("c_postOffice") as string) || null
  const c_district = (formData.get("c_district") as string) || null
  const c_postalCode = (formData.get("c_postalCode") as string) || null
  const p_village = (formData.get("p_village") as string) || null
  const p_postOffice = (formData.get("p_postOffice") as string) || null
  const p_district = (formData.get("p_district") as string) || null
  const p_postalCode = (formData.get("p_postalCode") as string) || null

  // Extract Join Date (Membership Date)
  const joinedDate = formData.get("joinedDate") as string
  const kycVerified = formData.get("kycVerified") === "on"

  const nidNumber = idType === "National ID" ? idNumber : null
  const passportNumber = idType === "Passport" ? idNumber : null
  const birthCertificateNo = idType === "Birth Certificate" ? idNumber : null

  // Referral: resolve the referrer's memberNo to an id (optional, best-effort).
  const referredByMemberNo = (formData.get("referredByMemberNo") as string)?.trim() || null
  const referredByMemberId = await resolveReferrer(referredByMemberNo)

  // 2. Fetch existing to preserve files if not updated
  const existingMember = await prisma.member.findUnique({
    where: { id: memberId },
    include: { documents: true, nominees: true }
  })

  const memberPhotoFile = formData.get("memberPhoto") as File
  const memberPhotoUrl = memberPhotoFile?.size > 0 ? await uploadImage(memberPhotoFile) : existingMember?.photoUrl

  const idDocFile = formData.get("idDocument") as File
  const idDocUrl = idDocFile?.size > 0 ? await uploadImage(idDocFile) : existingMember?.documents.find(d => d.documentType === idType)?.fileUrl

  // Member signature — preserve existing URL when no new file is uploaded.
  const signatureFile = formData.get("signature") as File
  const signatureUrl = signatureFile?.size > 0 ? await uploadImage(signatureFile) : existingMember?.signatureUrl

  // Upload Additional Docs
  const additionalDocsData: { name: string; fileName: string; fileUrl: string }[] = []
  let docIndex = 0
  while (true) {
    const docName = formData.get(`doc_${docIndex}_name`) as string
    const docFile = formData.get(`doc_${docIndex}_file`) as File
    if (!docName && !docFile) break

    if (docFile?.size > 0) {
      const docUrl = await uploadImage(docFile)
      if (docUrl) {
        additionalDocsData.push({ name: docName || "Additional Document", fileName: docFile.name, fileUrl: docUrl })
      }
    }
    docIndex++
  }

  // Upload Nominees Data
  const nomineesData: NomineeInput[] = []
  let i = 0
  while (true) {
    const nomName = formData.get(`nom_${i}_name`) as string
    if (!nomName) break

    const nomRelation = formData.get(`nom_${i}_relation`) as string
    const nomShare = formData.get(`nom_${i}_share`) as string
    const nomPhone = formData.get(`nom_${i}_phone`) as string
    const nomIdType = formData.get(`nom_${i}_idType`) as string
    const nomIdNumber = formData.get(`nom_${i}_idNumber`) as string
    
    const nomDbId = formData.get(`nom_${i}_dbId`) as string
    const existingNom = existingMember?.nominees.find(n => n.id === nomDbId)
    
    const nomPhotoFile = formData.get(`nom_${i}_photo`) as File
    const nomPhotoUrl = nomPhotoFile?.size > 0 ? await uploadImage(nomPhotoFile) : existingNom?.photoUrl || null
    
    const nomIdDocFile = formData.get(`nom_${i}_idDoc`) as File
    const nomIdDocUrl = nomIdDocFile?.size > 0 ? await uploadImage(nomIdDocFile) : existingNom?.idDocumentUrl || null

    // Nominee signature — preserve existing URL when no new file is uploaded.
    const nomSignatureFile = formData.get(`nom_${i}_signature`) as File
    const nomSignatureUrl = nomSignatureFile?.size > 0 ? await uploadImage(nomSignatureFile) : existingNom?.signatureUrl || null

    nomineesData.push({
      name: nomName, relation: nomRelation || "Unknown",
      phone: nomPhone, sharePercentage: nomShare ? parseFloat(nomShare) : 0,
      idType: nomIdType, nidNumber: nomIdNumber, idDocumentUrl: nomIdDocUrl, photoUrl: nomPhotoUrl,
      signatureUrl: nomSignatureUrl,
    })
    i++
  }

  // 3. Update Database
  try {
    await directPrisma.$transaction(async (tx) => {
      await tx.member.update({
        where: { id: memberId },
        data: {
          firstName, lastName, fullName, fatherName, motherName, spouseName,
          // Save the joining date and KYC status here:
          membershipDate: joinedDate ? new Date(joinedDate) : undefined,
          kycVerified: kycVerified,
          dateOfBirth: dob ? new Date(dob) : null,
          // ... rest of the fields
          gender: gender as Gender, religion, nationality,
          bloodGroup: bloodGroup as BloodGroup, profession,
          phone, emergencyPhone, emergencyContactName, email,
          maritalStatus: maritalStatus as MaritalStatus, marriageDate: marriageDate ? new Date(marriageDate) : null,
          nidNumber, passportNumber, birthCertificateNo,
          accountName, accountNumber, bankName, branch, routingNumber,
          photoUrl: memberPhotoUrl,
          signatureUrl: signatureUrl,
          referredByMemberId,
          status: ((formData.get("memberStatus") as string) || "ACTIVE").toUpperCase() as MemberStatus,
        },
      })

      // Update Addresses
      await tx.memberAddress.deleteMany({ where: { memberId } })
      if (c_village || c_district) {
        await tx.memberAddress.create({ data: { memberId, addressType: "CURRENT", village: c_village, postOffice: c_postOffice, district: c_district, postalCode: c_postalCode } })
      }
      if (p_village || p_district) {
        await tx.memberAddress.create({ data: { memberId, addressType: "PERMANENT", village: p_village, postOffice: p_postOffice, district: p_district, postalCode: p_postalCode } })
      }

      // Update ID Doc
      if (idDocUrl) {
        await tx.memberDocument.deleteMany({ where: { memberId, documentType: idType } })
        await tx.memberDocument.create({ data: { memberId, documentType: idType || "ID", name: "Member ID Document", fileName: idDocFile?.name || "existing", fileUrl: idDocUrl } })
      }

      // Update Additional Docs
      await tx.memberDocument.deleteMany({ where: { memberId, documentType: "ADDITIONAL" } })
      for (const doc of additionalDocsData) {
        await tx.memberDocument.create({
          data: { memberId, documentType: "ADDITIONAL", name: doc.name, fileName: doc.fileName, fileUrl: doc.fileUrl }
        });
      }

      // Update Nominees
      await tx.memberNominee.deleteMany({ where: { memberId } })
      for (const nom of nomineesData) {
        await tx.memberNominee.create({
          data: {
            memberId, ...nom
          }
        })
      }
    })
  } catch (error) {
    if (prismaErrorMeta(error).code === 'P2002') {
      // Email and phone are no longer unique — only ID fields can collide here.
      throw new Error("A member with this ID number already exists. Please use a different ID.")
    }
    console.error("Failed to update member:", error)
    throw error
  }

  revalidatePath(`/dashboard/members/${memberId}`)
  redirect(`/dashboard/members/${memberId}`)
}

// --- Update Member Status Action (Suspend/Activate) ---
export async function updateMemberStatus(memberId: string, status: "ACTIVE" | "SUSPENDED" | "INACTIVE") {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  // Capture the prior status so we can emit the right Trust Score event.
  const before = await prisma.member.findUnique({
    where: { id: memberId },
    select: { status: true },
  })

  await prisma.member.update({
    where: { id: memberId },
    data: { status },
  })

  // Trust Score event hooks (FRS §8.6 / §9).
  // - Reactivation runs a full recalc and lifts suspension if score clears threshold.
  // - Manual suspension records the event in the audit log.
  try {
    if (status === "ACTIVE" && before?.status === "SUSPENDED") {
      await recalculateTrustScore(memberId, "MEMBER_REACTIVATED", {
        referenceType: "member",
        createdBy: "COMMITTEE",
      })
    } else if (status === "SUSPENDED") {
      await recalculateTrustScore(memberId, "MEMBER_SUSPENDED", {
        referenceType: "member",
        createdBy: "COMMITTEE",
      })
    }
  } catch (e) {
    console.error("[trustScore] updateMemberStatus hook failed:", e)
  }

  revalidatePath(`/dashboard/members/${memberId}`)
  revalidatePath("/dashboard/members")
}

// --- Delete Member Action ---
// Returns an ActionResult so the UI can show a useful error message instead
// of silently failing. Prisma's default `onDelete: Restrict` on Loan.member
// means deleting a member with active loans throws P2003 (foreign-key
// constraint). We pre-check that scenario and return a clear message.
export async function deleteMember(memberId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
    // 1. Guardrails — refuse to delete a member who still has financial
    // entanglements. These exist on `onDelete: Restrict` or `SetNull`
    // relations that would either fail or orphan rows.
    const [activeLoans, pendingTxns, savingsBalance, portalAccount] = await Promise.all([
      prisma.loan.count({
        where: { memberId, status: { in: ["DISBURSED", "DEFAULTED", "PENDING", "APPROVED"] } },
      }),
      prisma.transaction.count({
        where: { memberId, status: { in: ["DRAFT", "PENDING_APPROVAL", "RETURNED"] } },
      }),
      prisma.savings.aggregate({ _sum: { amount: true }, where: { memberId } }),
      // memberId is not @unique on MemberAccount (only username/email are),
      // so findUnique({ where: { memberId } }) is a type error. findFirst is
      // the correct call here — we only need a yes/no on existence.
      prisma.memberAccount.findFirst({ where: { memberId } }),
    ])

    if (activeLoans > 0) {
      return {
        ok: false,
        error: `Cannot delete: this member still has ${activeLoans} active/pending loan(s). Close or write off the loans first.`,
      }
    }
    if (pendingTxns > 0) {
      return {
        ok: false,
        error: `Cannot delete: this member has ${pendingTxns} pending transaction(s). Approve, reject, or delete them first.`,
      }
    }
    const balance = Number(savingsBalance._sum.amount ?? 0)
    if (balance !== 0) {
      return {
        ok: false,
        error: `Cannot delete: this member has a non-zero savings balance (৳${balance.toLocaleString()}). Resolve the ledger first.`,
      }
    }

    // 2. Hard delete — cascading relations (addresses, nominees, documents,
    // savings rows, portal account) are removed by the schema's `onDelete:
    // Cascade`. Audit trail rows on `SetNull` survive with memberId = null.
    await prisma.member.delete({ where: { id: memberId } })

    // 3. If a portal account existed, it was cascade-deleted above; nothing
    // else to do. We only mention it in the success message for clarity.
    revalidatePath("/dashboard/members")
    return {
      ok: true,
      error: portalAccount ? "Member and portal account deleted." : undefined,
    }
  } catch (e) {
    // P2003 = foreign-key constraint failure (a Restrict relation we missed).
    // P2025 = record not found (already deleted). Anything else is unexpected.
    const msg = (e as Error).message || ""
    if (msg.includes("P2003") || msg.includes("foreign key")) {
      return {
        ok: false,
        error: "Cannot delete: this member is referenced by other records (loans, transactions, or audit logs). Resolve those first.",
      }
    }
    if (msg.includes("P2025") || msg.includes("not found")) {
      return { ok: false, error: "Member not found (they may have been already deleted)." }
    }
    return { ok: false, error: msg || "Unexpected error while deleting member." }
  }
}

// --- Toggle KYC Verification ---
export async function setMemberKyc(memberId: string, kycVerified: boolean) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  await prisma.member.update({
    where: { id: memberId },
    data: { kycVerified },
  })

  revalidatePath(`/dashboard/members/${memberId}`)
  revalidatePath("/dashboard/members")
}

// --- Bulk Update Status (Activate / Suspend / Inactive) ---
export async function bulkUpdateMemberStatus(
  memberIds: string[],
  status: "ACTIVE" | "SUSPENDED" | "INACTIVE"
) {
  if (!memberIds.length) return
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)

  await prisma.member.updateMany({
    where: { id: { in: memberIds } },
    data: { status },
  })

  revalidatePath("/dashboard/members")
}

// --- Bulk Delete Members ---
// Per-member deletion now runs through the same guardrails as the single
// delete so bulk ops no longer silently fail on the first member with a
// loan. Returns per-member errors so the UI can show which rows to fix.
export async function bulkDeleteMembers(
  memberIds: string[]
): Promise<{ ok: boolean; errors: Record<string, string> }> {
  if (!memberIds.length) return { ok: true, errors: {} }
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  const errors: Record<string, string> = {}
  let allOk = true

  for (const id of memberIds) {
    const res = await deleteMember(id)
    if (!res.ok) {
      allOk = false
      errors[id] = res.error || "Could not delete this member."
    }
  }

  revalidatePath("/dashboard/members")
  return { ok: allOk, errors }
}

// --- Reject an Application (keep record as history with remark) ---
export async function rejectMemberWithRemark(memberId: string, remark: string) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  await prisma.member.update({
    where: { id: memberId },
    data: {
      status: "REJECTED",
      remarks: remark?.trim() ? remark.trim() : "Application rejected by administrator.",
    },
  })

  revalidatePath("/dashboard/approvals")
  revalidatePath("/dashboard/members")
}

// =====================================================================
// Referral helper — resolves a referrer's memberNo to an id (FRS §5.6).
// Best-effort: a blank or unrecognized memberNo yields null (no referral link),
// so a typo never blocks member creation/editing.
// =====================================================================
async function resolveReferrer(memberNo: string | null): Promise<string | null> {
  if (!memberNo) return null
  const referrer = await prisma.member.findUnique({
    where: { memberNo },
    select: { id: true },
  })
  return referrer?.id ?? null
}

// =====================================================================
// Reset portal credentials + send to member.
//
// Admins had no way to (a) reset a member's portal password or (b) re-send
// login credentials if the member lost them. This action:
//   1. Loads the member (must be ACTIVE).
//   2. Generates a fresh temporary password.
//   3. Upserts the MemberAccount row (creating one if missing) with the
//      new passwordHash. Idempotent on the username (= memberNo).
//   4. Sends the credentials via SMS (always) and Email (if address on file),
//      surfacing notification rows on failure so the admin can see them.
//
// Returns { ok, error?, message? } — never throws raw so the UI can show
// a clean toast on failure.
// =====================================================================
export async function resetMemberCredentials(
  memberId: string
): Promise<{ ok: boolean; error?: string; message?: string }> {
  try {
    const user = await requirePermission(
      await getCurrentUser(),
      PERMISSIONS.USER_MANAGE
    )
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, fullName: true, memberNo: true, phone: true, email: true, status: true },
    })
    if (!member) return { ok: false, error: "Member not found." }
    if (member.status !== "ACTIVE") {
      return { ok: false, error: `Member is ${member.status}. Activate the member before sending credentials.` }
    }

    // S8 fix: use CSPRNG (crypto.randomBytes) instead of Math.random() for
    // temporary passwords. Math.random() is not cryptographically secure —
    // its output is predictable enough that an attacker who can observe a
    // few outputs can recover the internal state and predict future
    // passwords. base64url yields a URL-safe ~8-char password from 6 bytes.
    const tempPassword = randomBytes(6).toString("base64url")
    const passwordHash = await bcrypt.hash(tempPassword, 12)

    // Upsert the portal account. Username is the memberNo (unique).
    await prisma.memberAccount.upsert({
      where: { username: member.memberNo },
      update: { passwordHash, isActive: true },
      create: {
        memberId: member.id,
        username: member.memberNo,
        passwordHash,
        emailVerified: false,
        isActive: true,
      },
    })

    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "https://your-app.vercel.app"

    const emailSent: boolean = !!member.email
    const smsSent: boolean = !!member.phone

    if (member.email) {
      try {
        await sendEmail(
          member.email,
          "Your portal login credentials - Future Savings Foundation",
          `
            <p>Dear ${member.fullName},</p>
            <p>Your member portal credentials have been reset by the administration.</p>
            <p>
              <strong>Username:</strong> ${member.memberNo}<br/>
              <strong>Temporary Password:</strong> ${tempPassword}<br/>
              <strong>Login URL:</strong> ${baseUrl}/login
            </p>
            <p>Please log in and change your password immediately. If you did not request this reset, please contact the office.</p>
          `
        )
      } catch (e) {
        console.error("[resetMemberCredentials] email failed:", e)
        await prisma.notification.create({
          data: {
            type: "EMAIL_ERROR",
            title: "Credential reset email failed",
            message: `Failed to send reset email to ${member.fullName} (${member.email}). Reason: ${(e as Error).message}`,
          },
        })
      }
    }

    if (member.phone) {
      try {
        const smsRes = await sendSMS(
          member.phone,
          `Future Savings Foundation: Your portal login has been reset. Username: ${member.memberNo}, Password: ${tempPassword}. Login: ${baseUrl}/login`
        )
        if (smsRes.status !== "OK") {
          await prisma.notification.create({
            data: {
              type: "SMS_ERROR",
              title: "Credential reset SMS failed",
              message: `Failed to send reset SMS to ${member.fullName} (${member.phone}). Reason: ${smsRes.response}`,
            },
          })
        }
      } catch (e) {
        console.error("[resetMemberCredentials] SMS failed:", e)
        await prisma.notification.create({
          data: {
            type: "SMS_ERROR",
            title: "Credential reset SMS failed",
            message: `Failed to send reset SMS to ${member.fullName} (${member.phone}). Reason: ${(e as Error).message}`,
          },
        })
      }
    }

    const channels = [
      emailSent ? "Email" : null,
      smsSent ? "SMS" : null,
    ].filter(Boolean).join(" + ") || "no contact info on file"

    revalidatePath(`/dashboard/members/${memberId}`)
    revalidatePath("/dashboard/members")
    // Audit log — record who reset whose credentials.
    await writeRbacAudit({
      actorId: user.id,
      targetUserId: member.id,
      action: "MEMBER_CREDENTIALS_RESET",
      details: { memberNo: member.memberNo, channels },
    })
    return {
      ok: true,
      message: `Credentials sent via ${channels}.`,
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Could not reset credentials." }
  }
}

// =====================================================================
// FULL-TEXT SEARCH (Roadmap item 16)
//
// Server-side member search backed by the PostgreSQL `tsvector` column
// `Member.searchVector` (see prisma/migrations/20260811000011_member_fts).
//
// Falls back to a case-insensitive LIKE on the same identity fields when the
// tsvector column doesn't exist yet (the migration hasn't run), so the
// feature works during the rollout window.
//
// Returns up to `limit` (default 50) members ordered by memberNo, each with
// the identity fields a typeahead UI needs to render a result row.
// =====================================================================
export interface MemberSearchHit {
  id: string
  memberNo: string
  fullName: string
  phone: string
  email: string | null
  status: string
  photoUrl: string | null
  kycVerified: boolean
}

export async function searchMembers(
  query: string,
  limit = 50
): Promise<MemberSearchHit[]> {
  const q = query?.trim()
  if (!q) return []

  try {
    // Prefer the index-backed tsvector match. The query is parameterised via
    // $queryRawUnsafe with the user input passed as a bind parameter — no
    // injection surface because Prisma escapes the param value.
    const rows = await prisma.$queryRaw<MemberSearchHit[]>`
      SELECT
        m."id",
        m."memberNo",
        m."fullName",
        m."phone",
        m."email",
        m."status"::text AS "status",
        m."photoUrl",
        m."kycVerified"
      FROM "Member" m
      WHERE m."searchVector" @@ plainto_tsquery('english', ${q})
         OR m."memberNo" ILIKE ${"%" + q + "%"}
         OR m."phone" ILIKE ${"%" + q + "%"}
      ORDER BY m."memberNo" ASC
      LIMIT ${limit}
    `
    return rows
  } catch (e) {
    // Fallback for the migration window — tsvector column missing.
    console.warn("[searchMembers] FTS unavailable, falling back to LIKE:", (e as Error).message)
    const fallback = await prisma.member.findMany({
      where: {
        OR: [
          { memberNo: { contains: q, mode: "insensitive" } },
          { fullName: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
          { nidNumber: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      take: limit,
      orderBy: { memberNo: "asc" },
      select: {
        id: true,
        memberNo: true,
        fullName: true,
        phone: true,
        email: true,
        status: true,
        photoUrl: true,
        kycVerified: true,
      },
    })
    return fallback.map((m) => ({ ...m, status: m.status as string }))
  }
}
