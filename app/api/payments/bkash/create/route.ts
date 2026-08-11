import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { directPrisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { isBkashConfigured, createBkashPayment, bkashCallbackUrl } from "@/lib/payments/bkash"
import { getRequestLogger } from "@/lib/logger"

export const dynamic = "force-dynamic"

/**
 * POST /api/payments/bkash/create
 *
 * Initiates a bKash tokenized checkout payment for the authenticated member.
 *
 * Body: { amount: number, memberId?: string, description?: string }
 *
 * Returns: { paymentID: string, bkashURL: string } — the client redirects the
 * user to `bkashURL`. After the user pays (or cancels), bKash redirects them
 * to /api/payments/bkash/callback?paymentID=...&status=...
 *
 * When bKash credentials are not configured (BKASH_APP_KEY unset), returns
 * 503 with `{ error: "bKash not configured" }` so the UI can disable the
 * button and the user is never sent into a half-wired flow.
 */
export async function POST(req: NextRequest) {
  const log = getRequestLogger()

  // 1. Auth — members only. The memberId in the body must match the session
  // (IDOR guard, same convention as /api/portal/transactions).
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "MEMBER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const memberId = session.user.id

  // 2. Parse + validate the body.
  let body: { amount?: unknown; memberId?: unknown; description?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const rawAmount = typeof body.amount === "string" ? parseFloat(body.amount) : body.amount
  const amount =
    typeof rawAmount === "number" && Number.isFinite(rawAmount) ? rawAmount : NaN

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 })
  }
  // Round to 2dp — bKash rejects more precision.
  const roundedAmount = Math.round(amount * 100) / 100

  // Body may include memberId, but we always use the session one (IDOR guard).
  // The optional `description` is stored on the PaymentIntent.metadata so
  // the receipt / journal narration can surface it.
  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim().slice(0, 500)
      : null

  // 3. Refuse if bKash is not configured. The route must NOT call the gateway
  // with empty credentials — bKash would 401 and the failure envelope is
  // misleading. Surface a clear "not configured" message instead.
  if (!isBkashConfigured()) {
    log.warn({ memberId }, "bkash create requested but gateway not configured")
    return NextResponse.json({ error: "bKash not configured" }, { status: 503 })
  }

  // 4. Verify the member exists + is active. We don't accept payment on
  // behalf of a CLOSED / soft-deleted member.
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, memberNo: true, fullName: true, status: true, deletedAt: true },
  })
  if (!member || member.deletedAt || member.status === "CLOSED") {
    return NextResponse.json({ error: "Member account is not active." }, { status: 403 })
  }

  // 5. Generate our merchant invoice number — unique, used as
  // `merchantInvoiceNumber` on the bKash create call and stored on the
  // PaymentIntent row so the callback can re-resolve the row by it.
  const merchantInvoice = `INV-${Date.now()}`

  // 6. Persist the pending PaymentIntent BEFORE calling the gateway. If the
  // gateway call fails we still have a record; the callback will never fire
  // for a non-existent paymentID.
  let paymentIntentId: string
  try {
    const intent = await directPrisma.paymentIntent.create({
      data: {
        provider: "BKASH",
        merchantInvoice,
        amount: roundedAmount,
        memberId,
        status: "PENDING",
        metadata: description ? ({ description } as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
      select: { id: true },
    })
    paymentIntentId = intent.id
  } catch (e) {
    log.error({ err: (e as Error).message, memberId, merchantInvoice }, "failed to create PaymentIntent")
    return NextResponse.json({ error: "Failed to initiate payment" }, { status: 500 })
  }

  // 7. Call bKash /create — get paymentID + bkashURL.
  try {
    const created = await createBkashPayment(
      roundedAmount.toFixed(2),
      merchantInvoice,
      bkashCallbackUrl()
    )

    if (!created.paymentID || !created.bkashURL) {
      throw new Error("bKash did not return a paymentID / bkashURL")
    }

    // 8. Persist the gateway-issued paymentID so the callback can re-resolve
    // the row. The unique merchantInvoice is the primary key we look up by,
    // but paymentID is what bKash echoes back.
    await prisma.paymentIntent.update({
      where: { id: paymentIntentId },
      data: {
        providerPaymentId: created.paymentID,
        metadata: {
          ...(description ? { description } : {}),
          bkashCreate: {
            paymentID: created.paymentID,
            amount: created.amount,
            currency: created.currency,
            intent: created.intent,
            createTime: created.createTime,
          },
        } as Prisma.InputJsonValue,
      },
    })

    log.info(
      { memberId, merchantInvoice, paymentID: created.paymentID },
      "bkash payment created"
    )

    return NextResponse.json({
      paymentID: created.paymentID,
      bkashURL: created.bkashURL,
      merchantInvoice,
    })
  } catch (e) {
    log.error(
      { err: (e as Error).message, memberId, merchantInvoice },
      "bkash create failed"
    )
    // Mark the intent FAILED so it's not left in PENDING purgatory.
    await prisma.paymentIntent
      .update({
        where: { id: paymentIntentId },
        data: {
          status: "FAILED",
          metadata: {
            error: (e as Error).message,
          } as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create bKash payment" },
      { status: 502 }
    )
  }
}
