import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import prisma from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { getOrganization } from "@/lib/organization"
import { generateMemberIdCardPdf } from "@/lib/pdf/memberIdCardPdf"
import { isSuperAdmin } from "@/lib/permissions"

export const dynamic = "force-dynamic"

/**
 * GET /api/members/[id]/id-card
 *
 * Generates a printable Membership ID Card PDF for the given member. Auth:
 * admins (SUPER_ADMIN / ADMIN) can fetch any member's card; a MEMBER may only
 * fetch their own card. The PDF is returned inline (Content-Type
 * application/pdf) so the browser opens it in a new tab for printing / saving.
 *
 * Mirrors the auth + fetch-image-buffer pattern used by the print-form route
 * (see app/api/members/[id]/print-form/route.ts).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // ── Auth ────────────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const role = session.user.role
  const isOwner = role === "MEMBER" && session.user.id === id
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN" || isSuperAdmin({ role })
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // ── Load member ───────────────────────────────────────────────────────────
  const member = await prisma.member.findUnique({
    where: { id },
    select: {
      id: true,
      memberNo: true,
      firstName: true,
      lastName: true,
      fullName: true,
      profession: true,
      phone: true,
      email: true,
      photoUrl: true,
      status: true,
      kycVerified: true,
      membershipDate: true,
    },
  })
  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 })
  }

  const org = await getOrganization()

  // Helper: fetch an image URL into a Buffer (time-boxed, returns null on failure).
  async function fetchImageBuffer(url: string): Promise<Buffer | null> {
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

  const photoBuffer = member.photoUrl ? await fetchImageBuffer(member.photoUrl) : null

  // Public base URL — fall back to the incoming request origin so the QR works
  // even when no explicit NEXT_PUBLIC_APP_URL is configured.
  const proto = _req.headers.get("x-forwarded-proto") || "https"
  const host = _req.headers.get("host") || ""
  const publicBaseUrl = process.env.NEXT_PUBLIC_APP_URL || (host ? `${proto}://${host}` : null)

  const pdf = await generateMemberIdCardPdf({
    member: {
      id: member.id,
      memberNo: member.memberNo,
      fullName: member.fullName,
      firstName: member.firstName,
      lastName: member.lastName,
      profession: member.profession,
      phone: member.phone,
      email: member.email,
      photoUrl: member.photoUrl,
      status: member.status,
      kycVerified: member.kycVerified,
      membershipDate: member.membershipDate,
    },
    org,
    photoBuffer,
    publicBaseUrl,
  })

  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      // Inline so the browser opens it in a new tab; the filename is a hint
      // for "Save As..." / "Download".
      "Content-Disposition": `inline; filename="member-${member.memberNo}-id-card.pdf"`,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
