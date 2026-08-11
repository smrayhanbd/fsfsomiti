import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { buildReceiptPayload } from "@/lib/pdf/buildReceiptPayload"
import { generateMoneyReceiptPdf } from "@/lib/pdf/moneyReceiptPdf"

export const dynamic = "force-dynamic"

/**
 * GET /api/portal/transactions/[id]/receipt
 *
 * Member-portal route — returns a downloadable PDF Money Receipt / Withdrawal
 * Voucher for one of the authenticated member's own APPROVED DEPOSIT or
 * WITHDRAWAL transactions.
 *
 * Auth: the session user MUST be a MEMBER, and the transaction's `memberId`
 * MUST match `session.user.id`. Any mismatch returns 403 (we never leak whether
 * the transaction exists for another member).
 *
 * Reuses the same `buildReceiptPayload()` + `generateMoneyReceiptPdf()` the
 * admin approval email path uses, so the PDF a member downloads matches
 * exactly what the admin sees / emails.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: transactionId } = await params

  // 1. Auth — members only.
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const memberId = session.user.id

  // 2. Load the transaction and verify ownership + printability.
  const txn = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      memberId: true,
      status: true,
      transactionType: true,
      voucherNo: true,
    },
  })

  if (!txn) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
  }

  // Ownership check — never leak existence to non-owners.
  if (txn.memberId !== memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
  }

  // Only APPROVED DEPOSIT or WITHDRAWAL transactions have a posted voucher.
  if (
    txn.status !== "APPROVED" ||
    (txn.transactionType !== "DEPOSIT" && txn.transactionType !== "WITHDRAWAL")
  ) {
    return NextResponse.json(
      { error: "Receipt is only available for approved deposit / withdrawal transactions." },
      { status: 404 }
    )
  }

  // 3. Build the payload + render the PDF.
  const payload = await buildReceiptPayload(transactionId)
  if (!payload) {
    // buildReceiptPayload returns null when the transaction isn't printable —
    // should not happen given the checks above, but guard anyway.
    return NextResponse.json(
      { error: "Receipt could not be generated." },
      { status: 404 }
    )
  }

  const pdf = await generateMoneyReceiptPdf(payload)

  // 4. Stream the PDF back as a download (attachment, not inline).
  const filename = `receipt-${txn.voucherNo || transactionId}.pdf`
  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      // `attachment` forces the browser to download rather than preview.
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
