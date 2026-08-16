// Deep-import the CommonJS entry (pdfkit/js/pdfkit.js) so Turbopack doesn't
// trip on the ESM build's fontkit transitive deps. See lib/pdf/memberFormPdf.ts
// for the full rationale. The constructor is imported untyped and cast.

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
 * printable ID card with the member's photo, identity fields, organization
 * branding (logo + name + tagline), a QR code that opens the member's public
 * profile, and an issue/expiry date pair.
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
  /** Optional pre-fetched organization logo buffer (PNG/JPEG). Drawn top-left
   *  of the header, ahead of the org name. Same "pure drawing" contract as
   *  `photoBuffer` — fetch it wherever the caller already resolves
   *  `org`/`photoUrl` and pass the bytes in. Falls back to a text-only
   *  header when omitted. */
  logoBuffer?: Buffer | null
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
 * Shrink `fontSize` (in 0.5pt steps; the target font must already be set on
 * `doc`) until `text` fits `maxWidth` on a single line, down to `minSize`.
 * Leaves `doc`'s font size set to whatever size it settles on.
 *
 * This alone doesn't guarantee a single line for pathological input — callers
 * should still pass a bounded `height` + `ellipsis: true` to the actual
 * `.text()` call as a fallback, and measure with `heightOfString` using those
 * same options before positioning whatever comes next.
 */
function fitFontSizeToWidth(
  doc: PDFDocument,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number
): number {
  for (let size = startSize; size > minSize; size -= 0.5) {
    doc.fontSize(size)
    if (doc.widthOfString(text) <= maxWidth) return size
  }
  doc.fontSize(minSize)
  return minSize
}

/**
 * Build the Membership ID Card PDF.
 * Returns a Promise<Buffer> that resolves with the full PDF bytes.
 */
export async function generateMemberIdCardPdf(input: MemberIdCardInput): Promise<Buffer> {
  // Generate the QR code as a PNG buffer up front. The QR encodes a PUBLIC
  // member verification URL (/m/[id]) — this page is accessible without
  // login so anyone scanning the QR (member, admin, or public) can verify
  // the member's status. Previously pointed to /portal/profile/[id] which
  // required MEMBER login and redirected everyone else to the landing page.
  const baseUrl = (input.publicBaseUrl || "").replace(/\/+$/, "")
  const profileUrl = baseUrl ? `${baseUrl}/m/${input.member.id}` : `/m/${input.member.id}`
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

      // Card-type label (top-right) — replaces the old KYC pill, so the
      // header always makes clear what this document is at a glance.
      const labelW = 62
      const labelX = cardX + CARD_W - labelW - 8
      doc
        .fillColor(GOLD)
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .text("MEMBERSHIP", labelX, cardY + 8, { width: labelW, align: "right", lineBreak: false })
      doc.text("ID CARD", labelX, cardY + 17, { width: labelW, align: "right", lineBreak: false })

      // Organization logo (top-left) — small white plate behind it so logos
      // with transparent backgrounds or dark ink still read clearly on navy.
      const logoSize = 26
      const logoX = cardX + 8
      const logoY = cardY + 6
      let headerTextX = cardX + 10 // fallback start-X if no logo is provided
      if (input.logoBuffer) {
        doc.roundedRect(logoX, logoY, logoSize, logoSize, 4).fill("#ffffff")
        try {
          doc.image(input.logoBuffer, logoX + 2, logoY + 2, {
            fit: [logoSize - 4, logoSize - 4],
            align: "center",
            valign: "center",
          })
        } catch (e) {
          console.error("[memberIdCardPdf] logo draw failed:", e)
        }
        headerTextX = logoX + logoSize + 8
      }

      // Org name + tagline. Font size shrinks to fit one line where
      // possible; either way the tagline is positioned from the *measured*
      // height of the name (however many lines it actually took), so the
      // two can never land on top of each other.
      const headerTextW = labelX - headerTextX - 6
      const orgName = input.org.name.toUpperCase()
      doc.font("Helvetica-Bold")
      fitFontSizeToWidth(doc, orgName, headerTextW, 10, 7)
      const orgLineH = doc.currentLineHeight()
      const orgNameOpts = { width: headerTextW, height: orgLineH * 2, ellipsis: true }
      const orgNameH = doc.heightOfString(orgName, orgNameOpts)
      doc.fillColor("#ffffff").text(orgName, headerTextX, cardY + 8, orgNameOpts)
      if (input.org.tagline) {
        doc
          .fillColor("#c7d2fe")
          .font("Helvetica-Oblique")
          .fontSize(6)
          .text(input.org.tagline, headerTextX, cardY + 8 + orgNameH + 1, {
            width: headerTextW,
            lineBreak: false,
            ellipsis: true,
          })
      }

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
        // `cover` scales the image to fill the box completely (cropping
        // instead of letterboxing) — but pdfkit does NOT clip the overflow
        // on its own, so we clip to a rounded rect ourselves. That also
        // gives the photo the same rounded corners as its frame. The clip
        // is opened before the try and always closed in `finally`, so a
        // bad photo buffer can't leave the rest of the card clipped.
        const innerX = photoX + 2
        const innerY = photoY + 2
        const innerSize = PHOTO_SIZE - 4
        let drewPhoto = false
        doc.save()
        try {
          doc.roundedRect(innerX, innerY, innerSize, innerSize, 4).clip()
          doc.image(input.photoBuffer, innerX, innerY, {
            cover: [innerSize, innerSize],
            align: "center",
            valign: "center",
          })
          drewPhoto = true
        } catch (e) {
          console.error("[memberIdCardPdf] photo draw failed:", e)
        } finally {
          doc.restore()
        }
        if (!drewPhoto) {
          drawPhotoPlaceholder(doc, photoX, photoY, PHOTO_SIZE)
        }
      } else {
        drawPhotoPlaceholder(doc, photoX, photoY, PHOTO_SIZE)
      }

      // ── Member identity text (right of the photo) ───────────────────────
      const textX = photoX + PHOTO_SIZE + 8
      const textW = CARD_W - (PHOTO_SIZE + 18) - 10 // leave 10pt right padding
      let ty = bodyY + 6

      // Member name — same shrink-to-fit + measured-height approach as the
      // org name, so "No: ..." can never overlap a wrapped second line.
      doc.font("Helvetica-Bold")
      fitFontSizeToWidth(doc, input.member.fullName, textW, 13, 10)
      const nameLineH = doc.currentLineHeight()
      const nameOpts = { width: textW, height: nameLineH * 2, ellipsis: true }
      const nameH = doc.heightOfString(input.member.fullName, nameOpts)
      doc.fillColor(NAVY).text(input.member.fullName, textX, ty, nameOpts)
      ty += nameH + 3

      // Member number (mono-ish).
      doc
        .fillColor(INK)
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(`No: ${input.member.memberNo}`, textX, ty, { width: textW, lineBreak: false, ellipsis: true })
      ty += 12

      // Profession.
      if (input.member.profession) {
        doc
          .fillColor(MUTED)
          .font("Helvetica")
          .fontSize(7)
          .text(input.member.profession, textX, ty, { width: textW, lineBreak: false, ellipsis: true })
        ty += 10
      }

      // Phone.
      doc
        .fillColor(MUTED)
        .font("Helvetica")
        .fontSize(7)
        .text(`Ph: ${input.member.phone}`, textX, ty, { width: textW, lineBreak: false, ellipsis: true })

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