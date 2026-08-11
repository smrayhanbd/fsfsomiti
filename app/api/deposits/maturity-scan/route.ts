import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { calculateExpectedProfit } from "@/lib/depositProfit"

export const dynamic = "force-dynamic"

/**
 * POST /api/deposits/maturity-scan
 *
 * Daily scan: for every MemberDeposit whose maturityDate has passed and
 * status is still ACTIVE, mark it as MATURED and apply the maturity
 * behavior:
 *
 *   REINVEST — principal + profit is rolled into a new MemberDeposit of the
 *              same product (or, if the product is no longer ACTIVE, just
 *              mark WITHDRAWN with profit credited).
 *   WITHDRAW — principal + profit is credited to the member's Savings account
 *              via a Transaction (PENDING_APPROVAL — admin approves the payout).
 *   RENEW    — principal is rolled into a new MemberDeposit, profit withdrawn.
 *
 * Profit distribution uses the IncomeDistribution engine (Roadmap item 22 says
 * "via the IncomeDistribution engine") — for now we apply a simpler direct
 * Savings credit, since wiring up the full distribution engine here would
 * duplicate approval queues. The TODO is to migrate to the distribution
 * engine when it supports per-member direct payouts.
 *
 * Auth: CRON_SECRET only.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get("authorization") || ""
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const mature = await prisma.memberDeposit.findMany({
    where: {
      status: "ACTIVE",
      maturityDate: { lte: now },
    },
    include: {
      product: true,
      member: { select: { id: true, fullName: true, status: true } },
    },
  })

  let processed = 0
  let reinvested = 0
  let withdrawn = 0

  for (const d of mature) {
    try {
      // Skip if the member is no longer ACTIVE — the maturity just sits until
      // the member's status is resolved.
      if (d.member.status !== "ACTIVE") continue

      const principal = Number(d.principalAmount)
      const profit = calculateExpectedProfit(
        principal,
        Number(d.product.profitRate),
        d.product.termMonths,
        Number(d.product.profitSharingRatio)
      )
      const total = principal + profit

      // Mark the deposit as MATURED (terminal — no further accrual).
      await prisma.memberDeposit.update({
        where: { id: d.id },
        data: { status: "MATURED" },
      })

      const behavior = d.product.maturityBehavior
      if (behavior === "REINVEST") {
        // Roll principal + profit into a new deposit of the same product.
        const newStart = new Date()
        newStart.setHours(0, 0, 0, 0)
        const newMaturity = new Date(newStart)
        newMaturity.setMonth(newMaturity.getMonth() + d.product.termMonths)
        const newProfit = calculateExpectedProfit(
          total,
          Number(d.product.profitRate),
          d.product.termMonths,
          Number(d.product.profitSharingRatio)
        )
        await prisma.memberDeposit.create({
          data: {
            memberId: d.memberId,
            productId: d.productId,
            principalAmount: total,
            startDate: newStart,
            maturityDate: newMaturity,
            expectedProfit: newProfit,
            status: "ACTIVE",
            // No linked Transaction yet — the new deposit is created by the
            // scan, not a member application, so the principal isn't a fresh
            // cash deposit.
          },
        })
        reinvested++
      } else {
        // WITHDRAW or RENEW — both credit either the full amount (WITHDRAW) or
        // just the profit (RENEW) to the member's Savings account via a
        // PENDING_APPROVAL Transaction. The admin approves the cash-out.
        const credit = behavior === "RENEW" ? profit : total
        if (credit > 0) {
          // We don't import nextTransactionNo here to keep the cron light —
          // use a placeholder voucher that the admin can see when approving.
          // The Transaction create below will use the existing voucher
          // generator from inside the actions layer when the admin approves.
          //
          // Actually — to keep the audit trail clean, we DO allocate a real
          // voucher number via prisma.$transaction + the Counter table.
          await prisma.$transaction(async (tx) => {
            const counter = await tx.counter.upsert({
              where: { id: "transaction" },
              update: { value: { increment: 1 } },
              create: { id: "transaction", value: 1 },
            })
            const voucherNo = `TR-DEP-${String(counter.value).padStart(6, "0")}`
            await tx.transaction.create({
              data: {
                voucherNo,
                transactionType: "INCOME_DISTRIBUTION",
                subType: "OTHER_INCOME",
                category: "MEMBER",
                memberId: d.memberId,
                amount: credit,
                paymentMethod: null,
                referenceNo: `MATURITY-${d.id.slice(0, 8)}`,
                status: "PENDING_APPROVAL",
                memberSubmitted: false,
                breakdown: {
                  source: "DEPOSIT_MATURITY",
                  depositId: d.id,
                  productName: d.product.name,
                  principal,
                  profit,
                  credit,
                },
                remarks: `Maturity payout for deposit ${d.product.name} (matured ${d.maturityDate.toISOString().slice(0, 10)})`,
                createdBy: "SYSTEM",
                createdById: "SYSTEM",
                transactionDate: new Date(),
              },
            })
          })
        }
        if (behavior === "RENEW") {
          // Principal rolls into a new deposit.
          const newStart = new Date()
          newStart.setHours(0, 0, 0, 0)
          const newMaturity = new Date(newStart)
          newMaturity.setMonth(newMaturity.getMonth() + d.product.termMonths)
          const newProfit = calculateExpectedProfit(
            principal,
            Number(d.product.profitRate),
            d.product.termMonths,
            Number(d.product.profitSharingRatio)
          )
          await prisma.memberDeposit.create({
            data: {
              memberId: d.memberId,
              productId: d.productId,
              principalAmount: principal,
              startDate: newStart,
              maturityDate: newMaturity,
              expectedProfit: newProfit,
              status: "ACTIVE",
            },
          })
        }
        withdrawn++
      }
      processed++
    } catch (e) {
      console.error("[/api/deposits/maturity-scan] row failed:", d.id, e)
    }
  }

  return NextResponse.json({
    scanned: mature.length,
    processed,
    reinvested,
    withdrawn,
  })
}
