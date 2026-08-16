"use server"

// Project Management server actions.
//
// Every expense/revenue wraps its writes in a single `prisma.$transaction`
// and calls the shared lib/portfolio/posting service so a balanced, POSTED
// JournalEntry is created atomically. Returns the discriminated ActionResult
// union so client forms can react with toasts.

import prisma, { directPrisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/permissions"
import { requireAction, authErrorResult } from "@/lib/auth-guard"
import { postProjectExpense, postProjectRevenue } from "@/lib/portfolio/posting"
import { nextProjectNo } from "@/lib/portfolio/ids"
import { resolveAccountId } from "@/lib/portfolio/accounting"
import { writeAuditLog, type ActionResult } from "@/lib/portfolio/validation"

// Permission scope for this module — used by all server actions in this file.
const SCOPE = {
  menuGroup: "Operations & Management",
  page: "Project Management",
} as const

const PATHS = [
  "/dashboard/investments",
  "/dashboard/projects",
  "/dashboard/accounts",
  "/dashboard/account-ledger",
  "/dashboard/vouchers",
]

function revalidateAll() {
  PATHS.forEach((p) => revalidatePath(p))
}

// ── Cost-center & milestone row shapes ──────────────────────────────────
export interface CostCenterInput {
  id?: string
  name: string
  budgetAmount: number
}

export interface MilestoneInput {
  id?: string
  name: string
  targetDate?: string | null
  status?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "DELAYED"
  value?: number | null
  notes?: string | null
}

export interface ProjectInput {
  id?: string
  name: string
  type: "REAL_ESTATE" | "BUSINESS_VENTURE" | "AGRICULTURE" | "INFRASTRUCTURE" | "SOCIAL" | "SERVICE" | "OTHER"
  code?: string | null
  description?: string | null
  tags?: string[]
  // Timeline
  plannedStartDate?: string | null
  plannedEndDate?: string | null
  actualStartDate?: string | null
  phase?: "PLANNING" | "EXECUTION" | "MONITORING" | "CLOSING"
  // Team
  managerMemberId?: string | null
  sponsorMemberId?: string | null
  teamMembers?: Array<{ id: string; name: string }>
  externalContractors?: string | null
  // Budget
  totalBudget: number
  budgetSource?: "SOMITI_FUND" | "INVESTMENT" | "LOAN" | "DONOR" | "MIXED"
  costCenters?: CostCenterInput[]
  // Revenue plan
  revenuePlan?: Record<string, unknown>
  // Accounting
  revenueAccountId?: string
  expenseAccountId?: string
  wipAssetAccountId?: string | null
  bankAccountId?: string | null
  // Milestones
  milestones?: MilestoneInput[]
  // Documents
  documents?: Array<{ name: string; type?: string; url: string; date?: string }>
  status?: "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED"
  linkInvestmentId?: string | null
}

// ---------------------------------------------------------------------------
// CREATE / UPDATE project
// ---------------------------------------------------------------------------
export async function saveProject(input: ProjectInput): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "You must be signed in." }

  // Permission check: create OR edit depending on whether this is a new project.
  try {
    await requireAction(user, SCOPE.menuGroup, SCOPE.page, input.id ? "edit_project" : "create_project")
  } catch (e) {
    return authErrorResult(e)
  }

  if (!input.name?.trim()) return { ok: false, error: "Project name is required." }
  if (!input.type) return { ok: false, error: "Project type is required." }
  if (!(Number(input.totalBudget) > 0)) return { ok: false, error: "Total budget must be greater than zero." }

  try {
    return await directPrisma.$transaction(async (tx) => {
      // Default accounting accounts if not supplied (Section 8 auto-fill).
      const revenueAccountId =
        input.revenueAccountId || (await resolveAccountId(tx, "INCOME-PROJECT-REVENUE"))
      const expenseAccountId =
        input.expenseAccountId || (await resolveAccountId(tx, "EXPENSE-PROJECT"))

      if (input.id) {
        // ── UPDATE ──
        const existing = await tx.project.findUnique({ where: { id: input.id } })
        if (!existing) return { ok: false, error: "Project not found." }

        await tx.project.update({
          where: { id: input.id },
          data: {
            name: input.name.trim(),
            type: input.type,
            code: input.code?.trim() || null,
            description: input.description?.trim() || null,
            tags: input.tags ?? [],
            plannedStartDate: input.plannedStartDate ? new Date(input.plannedStartDate) : null,
            plannedEndDate: input.plannedEndDate ? new Date(input.plannedEndDate) : null,
            actualStartDate: input.actualStartDate ? new Date(input.actualStartDate) : null,
            phase: input.phase || "PLANNING",
            managerMemberId: input.managerMemberId || null,
            sponsorMemberId: input.sponsorMemberId || null,
            teamMembers: (input.teamMembers ?? []) as unknown as Prisma.InputJsonValue,
            externalContractors: input.externalContractors || null,
            totalBudget: Number(input.totalBudget),
            budgetSource: input.budgetSource || "SOMITI_FUND",
            revenuePlan: (input.revenuePlan ?? {}) as Prisma.InputJsonValue,
            revenueAccountId,
            expenseAccountId,
            wipAssetAccountId: input.wipAssetAccountId || null,
            bankAccountId: input.bankAccountId || null,
            documents: (input.documents ?? []) as Prisma.InputJsonValue,
            status: input.status || existing.status,
            updatedBy: user.email,
            updatedById: user.id,
          },
        })

        // Sync cost centers (replace).
        if (input.costCenters !== undefined) {
          await tx.projectCostCenter.deleteMany({ where: { projectId: input.id } })
          for (const cc of input.costCenters) {
            if (!cc.name?.trim()) continue
            await tx.projectCostCenter.create({
              data: {
                projectId: input.id,
                name: cc.name.trim(),
                budgetAmount: Number(cc.budgetAmount || 0),
              },
            })
          }
        }
        // Sync milestones (replace).
        if (input.milestones !== undefined) {
          await tx.projectMilestone.deleteMany({ where: { projectId: input.id } })
          for (let i = 0; i < input.milestones.length; i++) {
            const m = input.milestones[i]
            if (!m.name?.trim()) continue
            await tx.projectMilestone.create({
              data: {
                projectId: input.id,
                name: m.name.trim(),
                targetDate: m.targetDate ? new Date(m.targetDate) : null,
                status: m.status || "NOT_STARTED",
                value: m.value ?? null,
                notes: m.notes || null,
                sortOrder: i,
              },
            })
          }
        }

        await writeAuditLog(tx, {
          entityType: "PROJECT",
          entityId: input.id,
          action: "UPDATE",
          summary: `Updated project "${input.name}"`,
          actor: user,
        })
        revalidateAll()
        return { ok: true, id: input.id }
      }

      // ── CREATE ──
      const projectNo = await nextProjectNo(tx)
      const project = await tx.project.create({
        data: {
          projectNo,
          name: input.name.trim(),
          type: input.type,
          code: input.code?.trim() || null,
          description: input.description?.trim() || null,
          tags: input.tags ?? [],
          plannedStartDate: input.plannedStartDate ? new Date(input.plannedStartDate) : null,
          plannedEndDate: input.plannedEndDate ? new Date(input.plannedEndDate) : null,
          actualStartDate: input.actualStartDate ? new Date(input.actualStartDate) : null,
          phase: input.phase || "PLANNING",
          managerMemberId: input.managerMemberId || null,
          sponsorMemberId: input.sponsorMemberId || null,
          teamMembers: (input.teamMembers ?? []) as unknown as Prisma.InputJsonValue,
          externalContractors: input.externalContractors || null,
          totalBudget: Number(input.totalBudget),
          budgetSource: input.budgetSource || "SOMITI_FUND",
          revenuePlan: (input.revenuePlan ?? {}) as Prisma.InputJsonValue,
          revenueAccountId,
          expenseAccountId,
          wipAssetAccountId: input.wipAssetAccountId || null,
          bankAccountId: input.bankAccountId || null,
          documents: (input.documents ?? []) as Prisma.InputJsonValue,
          status: input.status || "PLANNING",
          createdBy: user.email,
          createdById: user.id,
        },
      })

      // Cost centers.
      if (input.costCenters) {
        for (let i = 0; i < input.costCenters.length; i++) {
          const cc = input.costCenters[i]
          if (!cc.name?.trim()) continue
          await tx.projectCostCenter.create({
            data: {
              projectId: project.id,
              name: cc.name.trim(),
              budgetAmount: Number(cc.budgetAmount || 0),
              sortOrder: i,
            },
          })
        }
      }
      // Milestones.
      if (input.milestones) {
        for (let i = 0; i < input.milestones.length; i++) {
          const m = input.milestones[i]
          if (!m.name?.trim()) continue
          await tx.projectMilestone.create({
            data: {
              projectId: project.id,
              name: m.name.trim(),
              targetDate: m.targetDate ? new Date(m.targetDate) : null,
              status: m.status || "NOT_STARTED",
              value: m.value ?? null,
              notes: m.notes || null,
              sortOrder: i,
            },
          })
        }
      }
      // Optional investment link (scenarios B/D).
      if (input.linkInvestmentId) {
        await tx.investmentProjectLink.create({
          data: {
            investmentId: input.linkInvestmentId,
            projectId: project.id,
            relationshipType: "FUNDS_PROJECT",
            linkedById: user.id,
            linkedByName: user.email,
          },
        })
      }

      await writeAuditLog(tx, {
        entityType: "PROJECT",
        entityId: project.id,
        action: "CREATE",
        summary: `Created project "${project.name}" (${projectNo})`,
        actor: user,
      })

      revalidateAll()
      return { ok: true, id: project.id }
    })
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// RECORD EXPENSE
// ---------------------------------------------------------------------------
export interface ProjectExpenseInput {
  projectId: string
  expenseDate: string
  referenceNo?: string | null
  description: string
  costCenterId?: string | null
  category?: "MATERIAL" | "LABOR" | "SERVICE" | "ASSET" | "OTHER"
  amount: number
  vendor?: string | null
  paymentMethod?: string | null
  bankAccountId?: string | null
  chequeNo?: string | null
  receiptUrl?: string | null
  notes?: string | null
  autoGenerateVoucher?: boolean
}

export async function recordProjectExpense(input: ProjectExpenseInput): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "You must be signed in." }

  try {
    await requireAction(user, SCOPE.menuGroup, SCOPE.page, "record_expense")
  } catch (e) {
    return authErrorResult(e)
  }

  if (!input.expenseDate) return { ok: false, error: "Expense date is required." }
  if (!input.description?.trim()) return { ok: false, error: "Description is required." }
  const amount = Number(input.amount || 0)
  if (!(amount > 0)) return { ok: false, error: "Amount must be greater than zero." }

  try {
    return await directPrisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: input.projectId },
        select: { id: true, name: true, projectNo: true, expenseAccountId: true },
      })
      if (!project) return { ok: false, error: "Project not found." }

      const costCenter = input.costCenterId
        ? await tx.projectCostCenter.findUnique({
            where: { id: input.costCenterId },
            select: { id: true, name: true },
          })
        : null

      let voucherNo: string | undefined
      let journalEntryId: string | undefined

      if (input.autoGenerateVoucher !== false) {
        let cashAccountId: string | null = null
        if (input.bankAccountId) {
          const ba = await tx.bankAccount.findUnique({
            where: { id: input.bankAccountId },
            select: { coaAccountId: true },
          })
          cashAccountId = ba?.coaAccountId ?? null
        }
        if (!cashAccountId) cashAccountId = await resolveAccountId(tx, "CASH-IN-HAND")

        const res = await postProjectExpense(tx, {
          entryDate: new Date(input.expenseDate),
          narration: `Project expense — ${costCenter ? costCenter.name + " · " : ""}${input.description} (${project.projectNo})`,
          referenceNo: input.referenceNo || project.projectNo,
          expenseAccountId: project.expenseAccountId,
          cashAccountId,
          amount,
        })
        voucherNo = res.voucherNo
        journalEntryId = res.journalEntryId
      }

      const row = await tx.projectExpense.create({
        data: {
          projectId: project.id,
          expenseDate: new Date(input.expenseDate),
          referenceNo: input.referenceNo || null,
          description: input.description.trim(),
          costCenterId: costCenter?.id ?? null,
          category: input.category || "OTHER",
          amount,
          vendor: input.vendor || null,
          paymentMethod: input.paymentMethod || null,
          bankAccountId: input.bankAccountId || null,
          chequeNo: input.chequeNo || null,
          receiptUrl: input.receiptUrl || null,
          notes: input.notes || null,
          journalEntryId,
          approvalStatus: "APPROVED",
          createdBy: user.email,
          createdById: user.id,
        },
      })

      await writeAuditLog(tx, {
        entityType: "PROJECT",
        entityId: project.id,
        action: "EXPENSE",
        summary: `Recorded expense ৳${amount} — ${input.description}${voucherNo ? ` · ${voucherNo}` : ""}`,
        actor: user,
      })

      revalidateAll()
      return { ok: true, id: row.id, voucherNo }
    })
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// RECORD REVENUE
// ---------------------------------------------------------------------------
export interface ProjectRevenueInput {
  projectId: string
  revenueDate: string
  referenceNo?: string | null
  description: string
  revenueType?: "PLOT_SALE" | "PRODUCT_SALE" | "SERVICE" | "RENTAL" | "OTHER"
  customer?: string | null
  amount: number
  taxPercent?: number
  paymentMethod?: string | null
  bankAccountId?: string | null
  notes?: string | null
  autoGenerateVoucher?: boolean
}

export async function recordProjectRevenue(input: ProjectRevenueInput): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "You must be signed in." }

  try {
    await requireAction(user, SCOPE.menuGroup, SCOPE.page, "record_revenue")
  } catch (e) {
    return authErrorResult(e)
  }

  if (!input.revenueDate) return { ok: false, error: "Revenue date is required." }
  if (!input.description?.trim()) return { ok: false, error: "Description is required." }
  const gross = Number(input.amount || 0)
  if (!(gross > 0)) return { ok: false, error: "Amount must be greater than zero." }

  const taxPercent = Number(input.taxPercent || 0)
  const taxAmount = +((gross * taxPercent) / 100).toFixed(2)
  const netAmount = +(gross - taxAmount).toFixed(2)

  try {
    return await directPrisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: input.projectId },
        select: { id: true, name: true, projectNo: true, revenueAccountId: true },
      })
      if (!project) return { ok: false, error: "Project not found." }

      let voucherNo: string | undefined
      let journalEntryId: string | undefined

      if (input.autoGenerateVoucher !== false) {
        let cashAccountId: string | null = null
        if (input.bankAccountId) {
          const ba = await tx.bankAccount.findUnique({
            where: { id: input.bankAccountId },
            select: { coaAccountId: true },
          })
          cashAccountId = ba?.coaAccountId ?? null
        }
        if (!cashAccountId) cashAccountId = await resolveAccountId(tx, "CASH-IN-HAND")

        const res = await postProjectRevenue(tx, {
          entryDate: new Date(input.revenueDate),
          narration: `Project revenue (${input.revenueType || "OTHER"}) — ${input.description} (${project.projectNo})`,
          referenceNo: input.referenceNo || project.projectNo,
          revenueAccountId: project.revenueAccountId,
          cashAccountId,
          grossAmount: gross,
          taxAmount,
        })
        voucherNo = res.voucherNo
        journalEntryId = res.journalEntryId
      }

      const row = await tx.projectRevenue.create({
        data: {
          projectId: project.id,
          revenueDate: new Date(input.revenueDate),
          referenceNo: input.referenceNo || null,
          description: input.description.trim(),
          revenueType: input.revenueType || "OTHER",
          customer: input.customer || null,
          amount: gross,
          taxPercent,
          taxAmount,
          netAmount,
          paymentMethod: input.paymentMethod || null,
          bankAccountId: input.bankAccountId || null,
          notes: input.notes || null,
          journalEntryId,
          createdBy: user.email,
          createdById: user.id,
        },
      })

      await writeAuditLog(tx, {
        entityType: "PROJECT",
        entityId: project.id,
        action: "REVENUE",
        summary: `Recorded revenue ৳${gross} — ${input.description}${voucherNo ? ` · ${voucherNo}` : ""}`,
        actor: user,
      })

      revalidateAll()
      return { ok: true, id: row.id, voucherNo }
    })
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// DELETE (drafts / no postings only)
// ---------------------------------------------------------------------------
export async function deleteProjectDraft(id: string): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "You must be signed in." }

  try {
    await requireAction(user, SCOPE.menuGroup, SCOPE.page, "delete_project")
  } catch (e) {
    return authErrorResult(e)
  }

  try {
    const [project, expenseCount, revenueCount] = await Promise.all([
      prisma.project.findUnique({ where: { id }, select: { id: true, name: true, projectNo: true, status: true } }),
      prisma.projectExpense.count({ where: { projectId: id } }),
      prisma.projectRevenue.count({ where: { projectId: id } }),
    ])
    if (!project) return { ok: false, error: "Project not found." }
    if (expenseCount > 0 || revenueCount > 0) {
      return { ok: false, error: "Projects with recorded expenses/revenue can't be deleted." }
    }

    await prisma.project.delete({ where: { id } })
    await prisma.entityAuditLog.create({
      data: {
        entityType: "PROJECT",
        projectId: id,
        action: "DELETE",
        summary: `Deleted project "${project.name}" (${project.projectNo})`,
        actorUserId: user.id,
        actorName: user.email,
      },
    })
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// LINK / UNLINK INVESTMENT
// ---------------------------------------------------------------------------
export async function linkProjectInvestment(args: {
  investmentId: string
  projectId: string
  relationshipType?: "FUNDS_PROJECT" | "MANAGES_ASSET"
  relationshipNote?: string | null
}): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "You must be signed in." }

  try {
    await requireAction(user, SCOPE.menuGroup, SCOPE.page, "edit_project")
  } catch (e) {
    return authErrorResult(e)
  }

  try {
    const link = await prisma.investmentProjectLink.create({
      data: {
        investmentId: args.investmentId,
        projectId: args.projectId,
        relationshipType: args.relationshipType || "FUNDS_PROJECT",
        relationshipNote: args.relationshipNote || null,
        linkedById: user.id,
        linkedByName: user.email,
      },
    })
    await prisma.entityAuditLog.create({
      data: {
        entityType: "PROJECT",
        projectId: args.projectId,
        action: "LINK",
        summary: `Linked to investment`,
        actorUserId: user.id,
        actorName: user.email,
      },
    })
    revalidateAll()
    return { ok: true, id: link.id }
  } catch (e) {
    // P2002 = unique-constraint violation (investment/project pair already linked).
    if ((e as { code?: string }).code === "P2002") {
      return { ok: false, error: "This investment and project are already linked." }
    }
    return { ok: false, error: (e as Error).message }
  }
}

export async function unlinkProjectInvestment(linkId: string): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "You must be signed in." }

  try {
    await requireAction(user, SCOPE.menuGroup, SCOPE.page, "edit_project")
  } catch (e) {
    return authErrorResult(e)
  }

  try {
    // Capture the link before deleting so we can record an UNLINK audit entry
    // on the project (the link's owning entity).
    const link = await prisma.investmentProjectLink.findUnique({
      where: { id: linkId },
      select: { investmentId: true, projectId: true },
    })
    await prisma.investmentProjectLink.delete({ where: { id: linkId } })
    if (link) {
      await prisma.entityAuditLog.create({
        data: {
          entityType: "PROJECT",
          projectId: link.projectId,
          action: "UNLINK",
          summary: `Unlinked from investment`,
          actorUserId: user.id,
          actorName: user.email,
        },
      })
    }
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
