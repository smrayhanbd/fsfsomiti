import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import prisma from "@/lib/prisma"
import { getOrganization } from "@/lib/organization"
import { getCurrentUser, PERMISSIONS, hasPermission } from "@/lib/permissions"
import { authOptions } from "@/lib/auth"
import {
  generateMemberFormPdf,
  type MemberFormPayload,
} from "@/lib/pdf/memberFormPdf"

export const dynamic = "force-dynamic"

// ── SSRF allow-list (S19) ───────────────────────────────────────────────────
// Only these hosts may be fetched by fetchImageBuffer(). The member-form PDF
// only ever embeds images uploaded to Cloudinary (or the org logo, also stored
// on Cloudinary), so we restrict to the Cloudinary host. Local uploads under
// /uploads/* are served from the app origin itself and don't go through
// fetchImageBuffer (they'd be relative URLs the browser fetches directly).
//
// Configure via env if you use a custom Cloudinary domain or CDN.
const CLOUDINARY_HOSTS = new Set(
  (process.env.CLOUDINARY_FETCH_ALLOWLIST || "res.cloudinary.com")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
)

/**
 * Block any URL pointing at a private / loopback / link-local address.
 * Catches both literal IPs in the hostname (e.g. http://127.0.0.1) and
 * well-known private ranges (10.x, 192.168.x, 172.16-31.x, 169.254.x).
 *
 * Returns true if the URL is SAFE to fetch; false if it must be rejected.
 */
function isSafeFetchUrl(rawUrl: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }
  const host = parsed.hostname.toLowerCase()

  // 1. Host allow-list — must match one of the configured Cloudinary hosts
  //    (suffix match so subdomains like `res.cloudinary.com` pass).
  const hostOk = [...CLOUDINARY_HOSTS].some(
    (allowed) => host === allowed || host.endsWith("." + allowed)
  )
  if (!hostOk) return false

  // 2. Block obvious private / loopback / link-local literal IPs even if
  //    someone configures a too-permissive allow-list. Belt + suspenders.
  if (host === "localhost" || host === "::1" || host === "[::1]") return false
  if (host === "metadata.google.internal") return false
  // IPv4 dotted-quad checks
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)]
    if (a === 10) return false
    if (a === 127) return false
    if (a === 0) return false
    if (a === 169 && b === 254) return false // AWS / GCP metadata
    if (a === 192 && b === 168) return false
    if (a === 172 && b >= 16 && b <= 31) return false
  }
  return true
}

/**
 * GET /api/members/[id]/print-form
 *
 * Generates a full-page Membership Application Form PDF for the given member
 * and returns it with `Content-Type: application/pdf`. The response uses
 * `Content-Disposition: inline` so the browser opens the PDF in a new tab,
 * ready to print or save — matching the "Print" button on the member profile.
 *
 * The PDF is generated on-demand from live DB data, so it always reflects the
 * current member record (no stale cached files).
 *
 * S2 fix: This endpoint used to be unauthenticated. Now:
 *   - Unauthenticated → 401.
 *   - Authenticated member → only their own form (params.id must match
 *     session.user.id where session.user.role === "MEMBER").
 *   - SUPER_ADMIN / ADMIN, or any user holding USER_MANAGE → any member.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // ── Auth gate (S2) ───────────────────────────────────────────────────────
  // Members authenticate via MemberAccount → session.user.id IS the memberId
  // (see lib/auth.ts). They may only print their own form. Admins/Super-Admins
  // authenticate via the User table (getCurrentUser re-reads the DB for the
  // persisted role) and may print any member's form. Unknown roles default
  // to USER_MANAGE permission check.
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  if (session.user.role === "MEMBER") {
    // Member — only their own form. session.user.id is the memberId
    // (memberAccount.memberId, per lib/auth.ts authorize()).
    if (session.user.id !== id) {
      return new NextResponse("Forbidden", { status: 403 })
    }
  } else {
    // Admin path — re-read the persisted User row to confirm role + permissions.
    const user = await getCurrentUser()
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 })
    }
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      // Unknown role — require USER_MANAGE.
      const allowed = await hasPermission(user.id, PERMISSIONS.USER_MANAGE, user).catch(() => false)
      if (!allowed) {
        return new NextResponse("Forbidden", { status: 403 })
      }
    }
  }

  const member = await prisma.member.findUnique({
    where: { id },
    include: {
      addresses: true,
      nominees: true,
      documents: true,
      savings: {
        orderBy: { date: "desc" },
        take: 6,
        select: { id: true, type: true, amount: true, method: true, date: true, receiptNo: true },
      },
    },
  })

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 })
  }

  const org = await getOrganization()

  // Assemble the payload expected by the PDF generator.
  // Decimals are converted to numbers; dates are passed through as-is (the
  // PDF helper accepts Date | string | null and formats them).
  const payload: MemberFormPayload = {
    id: member.id,
    memberNo: member.memberNo,
    firstName: member.firstName,
    lastName: member.lastName,
    fullName: member.fullName,
    fatherName: member.fatherName,
    motherName: member.motherName,
    spouseName: member.spouseName,
    dateOfBirth: member.dateOfBirth,
    gender: member.gender,
    maritalStatus: member.maritalStatus,
    marriageDate: member.marriageDate,
    religion: member.religion,
    nationality: member.nationality,
    bloodGroup: member.bloodGroup,
    profession: member.profession,
    occupation: member.profession,
    nidNumber: member.nidNumber,
    passportNumber: member.passportNumber,
    birthCertificateNo: member.birthCertificateNo,
    drivingLicense: null,
    phone: member.phone,
    email: member.email,
    emergencyPhone: member.emergencyPhone,
    emergencyContactName: member.emergencyContactName,
    accountName: member.accountName,
    accountNumber: member.accountNumber,
    bankName: member.bankName,
    branch: member.branch,
    routingNumber: member.routingNumber,
    photoUrl: member.photoUrl,
    status: member.status,
    kycVerified: member.kycVerified,
    membershipDate: member.membershipDate,
    createdAt: member.createdAt,
    addresses: member.addresses.map((a) => ({
      addressType: a.addressType,
      village: a.village,
      postOffice: a.postOffice,
      district: a.district,
      postalCode: a.postalCode,
      country: a.country,
    })),
    nominees: member.nominees.map((n) => ({
      name: n.name,
      relation: n.relation,
      phone: n.phone,
      email: n.email,
      dateOfBirth: n.dateOfBirth,
      nidNumber: n.nidNumber,
      idType: n.idType,
      sharePercentage: Number(n.sharePercentage),
      photoUrl: n.photoUrl,
      signatureUrl: n.signatureUrl,
    })),
    documents: member.documents.map((d) => ({
      documentType: d.documentType,
      name: d.name,
      fileUrl: d.fileUrl,
    })),
    recentActivity: member.savings.map((s) => ({
      date: s.date,
      type: s.type,
      amount: Number(s.amount),
      method: s.method,
      receiptNo: s.receiptNo,
    })),
  }

  // Helper: fetch an image URL into a Buffer (time-boxed, returns null on failure).
  // Used for the member photo, member signature, and nominee signatures.
  //
  // S19 fix: SSRF allow-list. Only Cloudinary hosts are fetched; private IP
  // ranges and link-local addresses are blocked even if the allow-list is
  // mis-configured. A non-allow-listed URL returns null (treated as a missing
  // image) rather than throwing — same contract as the original.
  async function fetchImageBuffer(url: string): Promise<Buffer | null> {
    if (!isSafeFetchUrl(url)) {
      console.warn("[print-form] blocked non-allow-listed image URL:", url)
      return null
    }
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)
      if (!res.ok) return null
      const ct = res.headers.get("content-type") || ""
      if (!ct.startsWith("image/")) return null
      const buf = Buffer.from(await res.arrayBuffer())
      return buf.length > 100 ? buf : null
    } catch {
      return null
    }
  }

  // Fetch org logo + member photo + signature in parallel.
  const [logoBuffer, photoBuffer, signatureBuffer] = await Promise.all([
    org.logo ? fetchImageBuffer(org.logo) : Promise.resolve(null),
    member.photoUrl ? fetchImageBuffer(member.photoUrl) : Promise.resolve(null),
    member.signatureUrl ? fetchImageBuffer(member.signatureUrl) : Promise.resolve(null),
  ])

  // Fetch nominee signatures + photos (up to 3) — keyed by nominee index.
  const nomineeSignatureBuffers: (Buffer | null)[] = []
  const nomineePhotoBuffers: (Buffer | null)[] = []
  for (const n of member.nominees.slice(0, 3)) {
    nomineeSignatureBuffers.push(n.signatureUrl ? await fetchImageBuffer(n.signatureUrl) : null)
    nomineePhotoBuffers.push(n.photoUrl ? await fetchImageBuffer(n.photoUrl) : null)
  }

  const pdf = await generateMemberFormPdf({
    member: payload,
    org,
    logoBuffer,
    photoBuffer,
    signatureBuffer,
    nomineeSignatureBuffers,
    nomineePhotoBuffers,
  })

  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      // Inline so the browser opens it in a new tab; the filename is a hint
      // for "Save As..." / "Download".
      "Content-Disposition": `inline; filename="member-${member.memberNo}-form.pdf"`,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
