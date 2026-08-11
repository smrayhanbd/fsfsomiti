"use server"

import { sendEmail } from "@/lib/email"
import { sendSMS } from "@/lib/sms"
import bcrypt from "bcryptjs"
import { randomBytes } from "crypto"
import prisma, { directPrisma } from "@/lib/prisma"
import { Prisma, Gender, BloodGroup, MaritalStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { uploadImage } from "@/lib/cloudinary"
import { recalculateTrustScore } from "@/lib/trustScore"
import { spawnTask } from "@/lib/tasks/spawn"
import {
  getCurrentUser,
  requirePermission,
  PERMISSIONS,
} from "@/lib/permissions"

// --- Helper Function to Generate Credentials & Send Email/SMS ---
async function generateAndSendCredentials(memberId: string) {
  const member = await prisma.member.findUnique({ where: { id: memberId } })

  if (!member) return

  // 1. Check if account already exists to prevent duplicate errors
  const existingAccount = await prisma.memberAccount.findUnique({
    where: { username: member.memberNo }
  })

  if (!existingAccount) {
    const username = member.memberNo
    // S8 fix: use CSPRNG (crypto.randomBytes) instead of Math.random() for
    // temporary passwords. Math.random() is not cryptographically secure —
    // its output is predictable enough that an attacker who can observe a
    // few outputs can recover the internal state and predict future
    // passwords. base64url yields a URL-safe ~8-char password from 6 bytes.
    const tempPassword = randomBytes(6).toString("base64url")
    const hashedPassword = await bcrypt.hash(tempPassword, 12)

    // 2. Save to MemberAccount table
    await prisma.memberAccount.create({
      data: {
        memberId: member.id,
        username: username,
        passwordHash: hashedPassword,
        emailVerified: false,
        isActive: true,
      }
    })

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"

    // 3. Send Email with Credentials
    if (member.email) {
      try {
        await sendEmail(
          member.email,
          "Membership Approved! Welcome to the Portal",
          `
            <p>Dear ${member.fullName},</p>
            <p>Congratulations! Your membership has been approved by the management.</p>
            <p>Your Member ID is: <strong>${member.memberNo}</strong></p>
            <p>You can now log in to your Member Portal using the credentials below:</p>
            <p>
              <strong>Username:</strong> ${username}<br/>
              <strong>Temporary Password:</strong> ${tempPassword}<br/>
              <strong>Login URL:</strong> ${baseUrl}/login
            </p>
            <p>Please change your password after logging in for the first time.</p>
          `
        )
      } catch (emailError) {
        console.error("Failed to send credentials email:", emailError)
        await prisma.notification.create({
          data: {
            type: "EMAIL_ERROR",
            title: "Email Failed to Send",
            message: `Failed to send approval email to ${member.fullName} (${member.email}). Reason: ${(emailError instanceof Error ? emailError.message : "") || "Unknown error"}`
          }
        })
      }
    }

    // 4. Send SMS with Credentials
    if (member.phone) {
      const smsMsg = `Welcome to Future Savings Foundation! Your account is approved. Member ID: ${username}, Password: ${tempPassword}. Login: ${baseUrl}/login`
      const smsRes = await sendSMS(member.phone, smsMsg)
      
      if (smsRes.status !== "OK") {
        await prisma.notification.create({
          data: {
            type: "SMS_ERROR",
            title: "SMS Failed to Send",
            message: `Failed to send approval SMS to ${member.fullName} (${member.phone}). Reason: ${smsRes.response}`
          }
        })
      }
    }
  }
}

// --- Quick Approve Action ---
export async function approveMember(memberId: string) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  await prisma.member.update({
    where: { id: memberId },
    data: { status: "ACTIVE" },
  })

  // Trust Score: initialize on first activation (FRS §8.6). Also fires a
  // REFERRAL_APPROVED recalc on this member's referrer, if any, so the
  // referrer's REFERRAL KPI picks up the new active referral.
  try {
    await recalculateTrustScore(memberId, "MEMBER_ACTIVATED", { referenceType: "member" })
    const m = await prisma.member.findUnique({
      where: { id: memberId },
      select: { referredByMemberId: true },
    })
    if (m?.referredByMemberId) {
      await recalculateTrustScore(m.referredByMemberId, "REFERRAL_APPROVED", {
        referenceId: memberId,
        referenceType: "referral",
      })
    }
  } catch (e) {
    console.error("[trustScore] approveMember hook failed:", e)
  }

  await generateAndSendCredentials(memberId)

  // Task auto-spawn: member onboarding follow-up (idempotent). Non-blocking.
  const onboardMember = await prisma.member.findUnique({
    where: { id: memberId },
    select: { fullName: true, memberNo: true },
  })
  if (onboardMember) {
    await spawnTask({
      title: `Onboard new member: ${onboardMember.fullName} (${onboardMember.memberNo})`,
      description: `New member approved. Complete KYC verification, deliver welcome pack, and explain savings/meeting policies.`,
      priority: "MEDIUM",
      dueInDays: 7,
      relatedMemberId: memberId,
      createdByLabel: "MEMBER_APPROVAL_SYSTEM",
      checklist: ["Complete KYC verification", "Deliver welcome pack", "Explain savings policies", "Add to upcoming meeting invite"],
    }).catch(() => undefined)
  }

  revalidatePath("/dashboard/approvals")
  redirect("/dashboard/approvals")
}

// --- Reject and Delete Action ---
export async function rejectMember(memberId: string) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  await prisma.member.delete({ where: { id: memberId } })

  revalidatePath("/dashboard/approvals")
  redirect("/dashboard/approvals")
}

// --- Reject with Remark Action ---
export async function rejectMemberWithRemark(memberId: string, remark: string) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  await prisma.member.update({
    where: { id: memberId },
    data: { status: "REJECTED", remarks: remark || null },
  })

  revalidatePath("/dashboard/approvals")
  redirect("/dashboard/approvals")
}

// --- Review, Edit, and Approve Action ---
export async function approveApplication(memberId: string, formData: FormData) {
  await requirePermission(await getCurrentUser(), PERMISSIONS.USER_MANAGE)
  // 1. Extract Data
  const firstName = formData.get("firstName") as string
  const lastName = formData.get("lastName") as string
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
  const phone = formData.get("phone") as string
  const email = (formData.get("email") as string) || null
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

  const nidNumber = idType === "National ID" ? idNumber : null
  const passportNumber = idType === "Passport" ? idNumber : null
  const birthCertificateNo = idType === "Birth Certificate" ? idNumber : null

  // 2. Fetch existing to preserve files if not updated
  const existingMember = await prisma.member.findUnique({
    where: { id: memberId },
    include: { documents: true, nominees: true }
  })

  // Upload Photos/Documents OUTSIDE transaction to prevent timeouts
  const memberPhotoFile = formData.get("memberPhoto") as File
  const memberPhotoUrl = memberPhotoFile?.size > 0 ? await uploadImage(memberPhotoFile) : existingMember?.photoUrl

  // Member signature — preserve existing URL when no new file is uploaded.
  // Without this, the signature column is wiped whenever approveApplication
  // re-writes the member row, because prisma.update replaces all provided
  // fields (omitting a field nulls it on the Prisma type level for required-
  // shape payloads). Mirrors the logic in updateMember (app/actions/member.ts).
  const signatureFile = formData.get("signature") as File
  const signatureUrl = signatureFile?.size > 0 ? await uploadImage(signatureFile) : existingMember?.signatureUrl

  const idDocFile = formData.get("idDocument") as File
  const idDocUrl = idDocFile?.size > 0 ? await uploadImage(idDocFile) : existingMember?.documents.find(d => d.documentType === idType)?.fileUrl

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
  const nomineesData: Prisma.MemberNomineeCreateWithoutMemberInput[] = []
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
    // Mirrors updateMember; without this, the nominee rows created below have
    // signatureUrl = null and any previously uploaded nominee signature is lost.
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

  // 3. Update Database & Set Status to ACTIVE
  try {
    await directPrisma.$transaction(async (tx) => {
      await tx.member.update({
        where: { id: memberId },
        data: {
          firstName, lastName, fullName, fatherName, motherName, spouseName,
          dateOfBirth: dob ? new Date(dob) : null,
          gender: gender as Gender, religion, nationality,
          bloodGroup: bloodGroup as BloodGroup, profession,
          phone, emergencyPhone, emergencyContactName, email,
          maritalStatus: maritalStatus as MaritalStatus, marriageDate: marriageDate ? new Date(marriageDate) : null,
          nidNumber, passportNumber, birthCertificateNo,
          accountName, accountNumber, bankName, branch, routingNumber,
          photoUrl: memberPhotoUrl,
          signatureUrl: signatureUrl,
          status: "ACTIVE", // Approve the member
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
        })
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
    console.error("Failed to approve member:", error)
    throw error 
  }

  // 4. Generate Credentials & Send Email
  await generateAndSendCredentials(memberId)

  revalidatePath("/dashboard/approvals")
  redirect("/dashboard/approvals")
}