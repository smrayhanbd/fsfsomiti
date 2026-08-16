/**
 * Deposit maturity scan — shared by the /api/deposits/maturity-scan route
 * (manual admin trigger) and the Inngest scheduled-maturity-scan function.
 *
 * Extracted from app/api/deposits/maturity-scan/route.ts so both callers
 * use the exact same logic. The route handler still owns auth +
 * idempotency; this function owns the scan + payout creation.
 *
 * Server-only.
 */
import prisma from "@/lib/prisma"
import { calculateExpectedProfit } from "@/lib/depositProfit"
import { logger } from "@/lib/logger"

export interface MaturityScanResult {
  scanned: number
  processed: number
  reinvested: number
  withdrawn: number
  errors: number
}

/**
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
 * Idempotency: once a deposit is marked MATURED, subsequent scans skip it
 * (the `where: { status: "ACTIVE" }` filter excludes it). So a double-fire
 * from Inngest + manual admin trigger is safe even without the cron lock.
 */
export async function runMaturityScan(): Promise<MaturityScanResult> {
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
  let errors = 0

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
          },
        })
        reinvested++
      } else {
        // WITHDRAW or RENEW — both credit either the full amount (WITHDRAW) or
        // just the profit (RENEW) to the member's Savings account via a
        // PENDING_APPROVAL Transaction. The admin approves the cash-out.
        const credit = behavior === "RENEW" ? profit : total
        if (credit > 0) {
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
      errors++
      logger.error({ err: e, depositId: d.id }, "[runMaturityScan] row failed")
    }
  }

  return { scanned: mature.length, processed, reinvested, withdrawn, errors }
}
