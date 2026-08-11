// Deep-import the CommonJS entry (pdfkit/js/pdfkit.js) so Turbopack doesn't
// trip on the ESM build's fontkit transitive deps. See lib/pdf/memberFormPdf.ts
// for the full rationale. The constructor is imported untyped and cast.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — no type declarations for the deep CJS path.
import PDFDocumentConstructor from "pdfkit/js/pdfkit.js"
import QRCode from "qrcode"
import type { OrgInfo } from "@/lib/organization"

/** Instance type of a pdfkit document, taken from the typed `"pdfkit"` module. */
type PDFDocument = InstanceType<typeof import("pdfkit")>
const PDFDocument = PDFDocumentConstructor as unknown as new (
  options?: Record<string, unknown>
) => PDFDocument

/**
 * Server-side Membership ID Card PDF generator.
 *
 * Produces a credit-card-sized (CR80 → 3.375" × 2.125" landscape = 243×153pt)
 * printable ID card with the member's photo, identity fields, KYC badge,
 * organization branding, a QR code that opens the member's public profile,
 * and an issue/expiry date pair.
 *
 * Pure drawing — takes a payload, returns a Buffer. No DB or network access,
 * so it is cheap to call and easy to reason about. Server-only (pdfkit + QR
 * are Node libraries).
 */

// Card dimensions — landscape CR80 (credit-card size) with a small outer bleed.
const CARD_W = 243 // 3.375" * 72
const CARD_H = 153 // 2.125" * 72
const BLEED = 6
const PAGE_W = CARD_W + BLEED * 2
const PAGE_H = CARD_H + BLEED * 2

const NAVY = "#0f2c5c"
const GREEN = "#1f8a4c"
const GOLD = "#c9a227"
const INK = "#111827"
const MUTED = "#6b7280"
const LINE = "#e5e7eb"
const SOFT_BG = "#f8fafc"

export interface MemberIdCardPayload {
  id: string
  memberNo: string
  fullName: string
  firstName?: string
  lastName?: string
  profession?: string | null
  phone: string
  email?: string | null
  photoUrl?: string | null
  status: string
  kycVerified: boolean
  membershipDate?: Date | string | null
}

export interface MemberIdCardInput {
  member: MemberIdCardPayload
  org: OrgInfo
  /** Optional pre-fetched member photo buffer (PNG/JPEG). */
  photoBuffer?: Buffer | null
  /** Public base URL of the site (e.g. https://example.com) — the QR code links to `${publicBaseUrl}/portal/profile/[id]`. */
  publicBaseUrl?: string | null
  /** Issue date — defaults to today. */
  issueDate?: Date | null
  /** Card expiry (defaults to issueDate + 1 year). */
  expiryDate?: Date | null
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—"
  const date = new Date(d)
  if (isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

/**
 * Build the Membership ID Card PDF.
 * Returns a Promise<Buffer> that resolves with the full PDF bytes.
 */
export async function generateMemberIdCardPdf(input: MemberIdCardInput): Promise<Buffer> {
  // Generate the QR code as a PNG buffer up front. The QR encodes the public
  // profile URL so a scanner jumps to /portal/profile/[id].
  const baseUrl = (input.publicBaseUrl || "").replace(/\/+$/, "")
  const profileUrl = baseUrl ? `${baseUrl}/portal/profile/${input.member.id}` : input.member.id
  let qrBuffer: Buffer | null = null
  try {
    qrBuffer = await QRCode.toBuffer(profileUrl, {
      type: "png",
      margin: 0,
      width: 240,
      color: { dark: "#0f2c5c", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
  } catch (e) {
    console.error("[memberIdCardPdf] QR generation failed:", e)
  }

  const issueDate = input.issueDate ?? new Date()
  const expiryDate = input.expiryDate ?? new Date(new Date(issueDate).setFullYear(new Date(issueDate).getFullYear() + 1))

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [PAGE_W, PAGE_H],
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        info: {
          Title: `Membership ID Card — ${input.member.memberNo}`,
          Author: input.org.name,
          Subject: "Member ID Card",
        },
      })

      const chunks: Buffer[] = []
      doc.on("data", (c: Buffer) => chunks.push(c))
      doc.on("end", () => resolve(Buffer.concat(chunks)))
      doc.on("error", reject)

      // Outer card rectangle with a thin gold border.
      const cardX = BLEED
      const cardY = BLEED

      // ── Header band (navy with green underline) ────────────────────────────
      doc.roundedRect(cardX, cardY, CARD_W, 36, 6).fill(NAVY)
      // Square off the bottom edge of the header so it joins the body cleanly.
      doc.rect(cardX, cardY + 24, CARD_W, 12).fill(NAVY)
      doc.rect(cardX, cardY + 36, CARD_W, 2).fill(GREEN)

      // Org name (top-left), KYC badge (top-right) inside the header.
      doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(input.org.name.toUpperCase(), cardX + 10, cardY + 8, { width: CARD_W - 110 })
      if (input.org.tagline) {
        doc
          .fillColor("#c7d2fe")
          .font("Helvetica-Oblique")
          .fontSize(6)
          .text(input.org.tagline, cardX + 10, cardY + 22, { width: CARD_W - 110 })
      }

      // KYC badge — a small pill in the header right.
      const badgeX = cardX + CARD_W - 64
      const badgeY = cardY + 10
      const badgeW = 54
      const badgeH = 16
      doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 8).fill(input.member.kycVerified ? GREEN : "#9ca3af")
      doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(7)
        .text(input.member.kycVerified ? "KYC VERIFIED" : "KYC PENDING", badgeX, badgeY + 4.5, {
          width: badgeW,
          align: "center",
        })

      // ── Body ────────────────────────────────────────────────────────────────
      const bodyY = cardY + 44
      const bodyH = CARD_H - 44 - 28 // subtract header + footer
      doc.roundedRect(cardX, bodyY - 4, CARD_W, bodyH + 4, 6).fill("#ffffff")
      // Mask the top corners of the body so it looks flush with the header.
      doc.rect(cardX, bodyY - 4, CARD_W, 6).fill("#ffffff")

      // ── Member photo (top-left, 80×80 rounded) ───────────────────────────
      const PHOTO_SIZE = 80
      const photoX = cardX + 10
      const photoY = bodyY + 4
      doc
        .roundedRect(photoX, photoY, PHOTO_SIZE, PHOTO_SIZE, 6)
        .strokeColor(LINE)
        .lineWidth(0.8)
        .stroke()
      if (input.photoBuffer) {
        try {
          doc.image(input.photoBuffer, photoX + 2, photoY + 2, {
            fit: [PHOTO_SIZE - 4, PHOTO_SIZE - 4],
            align: "center",
            valign: "center",
          })
        } catch {
          drawPhotoPlaceholder(doc, photoX, photoY, PHOTO_SIZE)
        }
      } else {
        drawPhotoPlaceholder(doc, photoX, photoY, PHOTO_SIZE)
      }

      // ── Member identity text (right of the photo) ───────────────────────
      const textX = photoX + PHOTO_SIZE + 8
      const textW = CARD_W - (PHOTO_SIZE + 18) - 10 // leave 10pt right padding
      let ty = bodyY + 6

      // Member name (bold, larger).
      doc
        .fillColor(NAVY)
        .font("Helvetica-Bold")
        .fontSize(13)
        .text(input.member.fullName, textX, ty, { width: textW, lineBreak: true })
      ty += 16

      // Member number (mono-ish).
      doc
        .fillColor(INK)
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(`No: ${input.member.memberNo}`, textX, ty, { width: textW })
      ty += 12

      // Profession.
      if (input.member.profession) {
        doc
          .fillColor(MUTED)
          .font("Helvetica")
          .fontSize(7)
          .text(input.member.profession, textX, ty, { width: textW })
        ty += 10
      }

      // Phone.
      doc
        .fillColor(MUTED)
        .font("Helvetica")
        .fontSize(7)
        .text(`Ph: ${input.member.phone}`, textX, ty, { width: textW })

      // ── QR code (bottom-right of body) ────────────────────────────────────
      const QR_SIZE = 50
      const qrX = cardX + CARD_W - QR_SIZE - 8
      const qrY = bodyY + bodyH - QR_SIZE - 6
      if (qrBuffer) {
        // White background plate so the QR is scannable even on a coloured card.
        doc.roundedRect(qrX - 3, qrY - 3, QR_SIZE + 6, QR_SIZE + 6, 4).fill("#ffffff")
        doc.image(qrBuffer, qrX, qrY, { fit: [QR_SIZE, QR_SIZE] })
        doc
          .fillColor(MUTED)
          .font("Helvetica")
          .fontSize(5)
          .text("Scan to verify", qrX - 3, qrY + QR_SIZE + 1, { width: QR_SIZE + 6, align: "center" })
      }

      // ── Footer band (issue / expiry dates + status pill) ──────────────────
      const footY = cardY + CARD_H - 28
      doc.rect(cardX, footY, CARD_W, 28).fill(SOFT_BG)
      doc.rect(cardX, footY, CARD_W, 1).fill(LINE)

      // Issue date (left).
      doc
        .fillColor(MUTED)
        .font("Helvetica")
        .fontSize(6)
        .text("ISSUE", cardX + 10, footY + 5, { width: 80 })
      doc
        .fillColor(INK)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(fmtDate(issueDate), cardX + 10, footY + 13, { width: 80 })

      // Expiry date (centre-left).
      doc
        .fillColor(MUTED)
        .font("Helvetica")
        .fontSize(6)
        .text("EXPIRY", cardX + 80, footY + 5, { width: 80 })
      doc
        .fillColor(INK)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(fmtDate(expiryDate), cardX + 80, footY + 13, { width: 80 })

      // Status pill (right).
      const statusLabel = (input.member.status || "PENDING").toUpperCase()
      const pillW = 54
      const pillH = 14
      const pillX = cardX + CARD_W - pillW - 10
      const pillY = footY + 7
      const pillColor =
        input.member.status === "ACTIVE" ? GREEN :
        input.member.status === "SUSPENDED" ? "#dc2626" :
        input.member.status === "PENDING" ? "#f59e0b" : MUTED
      doc.roundedRect(pillX, pillY, pillW, pillH, 7).fill(pillColor)
      doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(7)
        .text(statusLabel, pillX, pillY + 3.5, { width: pillW, align: "center" })

      // ── Outer gold border ──────────────────────────────────────────────────
      doc
        .roundedRect(cardX, cardY, CARD_W, CARD_H, 6)
        .strokeColor(GOLD)
        .lineWidth(1.2)
        .stroke()

      doc.end()
    } catch (e) {
      reject(e)
    }
  })
}

/** Draw a simple silhouette placeholder where the photo would go. */
function drawPhotoPlaceholder(doc: PDFDocument, x: number, y: number, size: number): void {
  doc.save()
  doc.rect(x, y, size, size).clip()
  // Head
  const cx = x + size / 2
  const headR = size * 0.18
  doc.circle(cx, y + size * 0.4, headR).fill(MUTED)
  // Shoulders / body
  const bodyW = size * 0.7
  const bodyH = size * 0.5
  doc
    .roundedRect(cx - bodyW / 2, y + size * 0.55, bodyW, bodyH, bodyW / 2)
    .fill(MUTED)
  doc.restore()
}
