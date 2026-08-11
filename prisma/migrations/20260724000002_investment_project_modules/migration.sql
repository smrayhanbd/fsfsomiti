-- =====================================================================
-- Investment Management + Project Management modules.
-- Adds 12 models, 12 enums, extends Account/JournalEntry/Task relations,
-- and a polymorphic EntityAuditLog. Generated via `prisma migrate diff`
-- (live DB → schema) because the shadow DB cannot replay older migrations.
-- =====================================================================

-- CreateEnum
CREATE TYPE "InvestmentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PARTIALLY_EXITED', 'FULLY_EXITED', 'MATURED', 'SUSPENDED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "InvestmentIncomeType" AS ENUM ('DIVIDEND', 'INTEREST', 'RENTAL', 'PROFIT_SHARE', 'OTHER');

-- CreateEnum
CREATE TYPE "InvestmentExitType" AS ENUM ('FULL_EXIT', 'PARTIAL_EXIT', 'MATURED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "ValuationMethod" AS ENUM ('MARKET', 'GOVT_RATE', 'APPRAISER');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('REAL_ESTATE', 'BUSINESS_VENTURE', 'AGRICULTURE', 'INFRASTRUCTURE', 'SOCIAL', 'SERVICE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectPhase" AS ENUM ('PLANNING', 'EXECUTION', 'MONITORING', 'CLOSING');

-- CreateEnum
CREATE TYPE "ProjectExpenseCategory" AS ENUM ('MATERIAL', 'LABOR', 'SERVICE', 'ASSET', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectRevenueType" AS ENUM ('PLOT_SALE', 'PRODUCT_SALE', 'SERVICE', 'RENTAL', 'OTHER');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED');

-- CreateEnum
CREATE TYPE "BudgetSource" AS ENUM ('SOMITI_FUND', 'INVESTMENT', 'LOAN', 'DONOR', 'MIXED');

-- CreateEnum
CREATE TYPE "InvestmentLinkType" AS ENUM ('FUNDS_PROJECT', 'MANAGES_ASSET');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "projectId" TEXT;

-- CreateTable
CREATE TABLE "InvestmentType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "subCategories" JSONB NOT NULL DEFAULT '[]',
    "assetAccountCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Investment" (
    "id" TEXT NOT NULL,
    "investmentNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "investmentTypeId" TEXT NOT NULL,
    "subCategory" TEXT,
    "investmentDate" TIMESTAMP(3) NOT NULL,
    "maturityDate" TIMESTAMP(3),
    "description" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "investedAmount" DECIMAL(16,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "exchangeRate" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "bdtEquivalent" DECIMAL(16,2) NOT NULL,
    "feesAmount" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "costBasis" DECIMAL(16,2) NOT NULL,
    "currentValue" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "lastValuationDate" TIMESTAMP(3),
    "expectedAnnualReturn" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "incomeTypes" JSONB NOT NULL DEFAULT '[]',
    "paymentFrequency" TEXT,
    "expectedNextIncomeDate" TIMESTAMP(3),
    "expectedIncomeAmount" DECIMAL(16,2),
    "debitAccountId" TEXT NOT NULL,
    "creditAccountId" TEXT,
    "paymentMethod" TEXT,
    "bankAccountId" TEXT,
    "referenceNo" TEXT,
    "journalEntryId" TEXT,
    "status" "InvestmentStatus" NOT NULL DEFAULT 'DRAFT',
    "details" JSONB NOT NULL DEFAULT '{}',
    "documents" JSONB NOT NULL DEFAULT '[]',
    "createdBy" TEXT,
    "createdById" TEXT,
    "updatedBy" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Investment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentIncome" (
    "id" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "incomeDate" TIMESTAMP(3) NOT NULL,
    "incomeType" "InvestmentIncomeType" NOT NULL,
    "grossAmount" DECIMAL(16,2) NOT NULL,
    "tdsPercent" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "tdsAmount" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(16,2) NOT NULL,
    "paymentMethod" TEXT,
    "bankAccountId" TEXT,
    "referenceNo" TEXT,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdBy" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT,

    CONSTRAINT "InvestmentIncome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentExit" (
    "id" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "exitType" "InvestmentExitType" NOT NULL,
    "exitDate" TIMESTAMP(3) NOT NULL,
    "unitsSold" DECIMAL(16,4),
    "salePricePerUnit" DECIMAL(16,4),
    "proceeds" DECIMAL(16,2) NOT NULL,
    "costBasisSold" DECIMAL(16,2) NOT NULL,
    "capitalGainLoss" DECIMAL(16,2) NOT NULL,
    "taxPercent" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "netProceeds" DECIMAL(16,2) NOT NULL,
    "paymentMethod" TEXT,
    "bankAccountId" TEXT,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdBy" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT,

    CONSTRAINT "InvestmentExit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentValuation" (
    "id" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "valuationDate" TIMESTAMP(3) NOT NULL,
    "marketValue" DECIMAL(16,2) NOT NULL,
    "method" "ValuationMethod" NOT NULL DEFAULT 'MARKET',
    "valuer" TEXT,
    "notes" TEXT,
    "createGainLossEntry" BOOLEAN NOT NULL DEFAULT false,
    "changeAmount" DECIMAL(16,2),
    "journalEntryId" TEXT,
    "createdBy" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT,

    CONSTRAINT "InvestmentValuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "projectNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProjectType" NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "plannedStartDate" TIMESTAMP(3),
    "plannedEndDate" TIMESTAMP(3),
    "actualStartDate" TIMESTAMP(3),
    "phase" "ProjectPhase" NOT NULL DEFAULT 'PLANNING',
    "managerMemberId" TEXT,
    "sponsorMemberId" TEXT,
    "teamMembers" JSONB NOT NULL DEFAULT '[]',
    "externalContractors" TEXT,
    "totalBudget" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "budgetSource" "BudgetSource" NOT NULL DEFAULT 'SOMITI_FUND',
    "revenuePlan" JSONB NOT NULL DEFAULT '{}',
    "revenueAccountId" TEXT NOT NULL,
    "expenseAccountId" TEXT NOT NULL,
    "wipAssetAccountId" TEXT,
    "bankAccountId" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "documents" JSONB NOT NULL DEFAULT '[]',
    "createdBy" TEXT,
    "createdById" TEXT,
    "updatedBy" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCostCenter" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "budgetAmount" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectExpense" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "referenceNo" TEXT,
    "description" TEXT NOT NULL,
    "costCenterId" TEXT,
    "category" "ProjectExpenseCategory" NOT NULL DEFAULT 'OTHER',
    "amount" DECIMAL(16,2) NOT NULL,
    "vendor" TEXT,
    "paymentMethod" TEXT,
    "bankAccountId" TEXT,
    "chequeNo" TEXT,
    "approvalStatus" TEXT NOT NULL DEFAULT 'APPROVED',
    "approvedById" TEXT,
    "receiptUrl" TEXT,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdBy" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRevenue" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "revenueDate" TIMESTAMP(3) NOT NULL,
    "referenceNo" TEXT,
    "description" TEXT NOT NULL,
    "revenueType" "ProjectRevenueType" NOT NULL DEFAULT 'OTHER',
    "customer" TEXT,
    "amount" DECIMAL(16,2) NOT NULL,
    "taxPercent" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(16,2) NOT NULL,
    "paymentMethod" TEXT,
    "bankAccountId" TEXT,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdBy" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectRevenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMilestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3),
    "actualDate" TIMESTAMP(3),
    "status" "MilestoneStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "value" DECIMAL(16,2),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentProjectLink" (
    "id" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "relationshipType" "InvestmentLinkType" NOT NULL DEFAULT 'FUNDS_PROJECT',
    "relationshipNote" TEXT,
    "linkedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkedById" TEXT,
    "linkedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestmentProjectLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityAuditLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "investmentId" TEXT,
    "projectId" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "changes" JSONB,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentType_name_key" ON "InvestmentType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentType_slug_key" ON "InvestmentType"("slug");

-- CreateIndex
CREATE INDEX "InvestmentType_isActive_idx" ON "InvestmentType"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Investment_investmentNo_key" ON "Investment"("investmentNo");

-- CreateIndex
CREATE INDEX "Investment_status_idx" ON "Investment"("status");

-- CreateIndex
CREATE INDEX "Investment_investmentTypeId_idx" ON "Investment"("investmentTypeId");

-- CreateIndex
CREATE INDEX "Investment_investmentDate_idx" ON "Investment"("investmentDate");

-- CreateIndex
CREATE INDEX "Investment_maturityDate_idx" ON "Investment"("maturityDate");

-- CreateIndex
CREATE INDEX "InvestmentIncome_investmentId_incomeDate_idx" ON "InvestmentIncome"("investmentId", "incomeDate");

-- CreateIndex
CREATE INDEX "InvestmentIncome_incomeType_idx" ON "InvestmentIncome"("incomeType");

-- CreateIndex
CREATE INDEX "InvestmentExit_investmentId_exitDate_idx" ON "InvestmentExit"("investmentId", "exitDate");

-- CreateIndex
CREATE INDEX "InvestmentValuation_investmentId_valuationDate_idx" ON "InvestmentValuation"("investmentId", "valuationDate");

-- CreateIndex
CREATE UNIQUE INDEX "Project_projectNo_key" ON "Project"("projectNo");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_type_idx" ON "Project"("type");

-- CreateIndex
CREATE INDEX "Project_plannedStartDate_idx" ON "Project"("plannedStartDate");

-- CreateIndex
CREATE INDEX "ProjectCostCenter_projectId_idx" ON "ProjectCostCenter"("projectId");

-- CreateIndex
CREATE INDEX "ProjectExpense_projectId_expenseDate_idx" ON "ProjectExpense"("projectId", "expenseDate");

-- CreateIndex
CREATE INDEX "ProjectExpense_costCenterId_idx" ON "ProjectExpense"("costCenterId");

-- CreateIndex
CREATE INDEX "ProjectRevenue_projectId_revenueDate_idx" ON "ProjectRevenue"("projectId", "revenueDate");

-- CreateIndex
CREATE INDEX "ProjectRevenue_revenueType_idx" ON "ProjectRevenue"("revenueType");

-- CreateIndex
CREATE INDEX "ProjectMilestone_projectId_idx" ON "ProjectMilestone"("projectId");

-- CreateIndex
CREATE INDEX "ProjectMilestone_status_idx" ON "ProjectMilestone"("status");

-- CreateIndex
CREATE INDEX "InvestmentProjectLink_investmentId_idx" ON "InvestmentProjectLink"("investmentId");

-- CreateIndex
CREATE INDEX "InvestmentProjectLink_projectId_idx" ON "InvestmentProjectLink"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentProjectLink_investmentId_projectId_key" ON "InvestmentProjectLink"("investmentId", "projectId");

-- CreateIndex
CREATE INDEX "EntityAuditLog_entityType_investmentId_createdAt_idx" ON "EntityAuditLog"("entityType", "investmentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "EntityAuditLog_entityType_projectId_createdAt_idx" ON "EntityAuditLog"("entityType", "projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "EntityAuditLog_action_idx" ON "EntityAuditLog"("action");

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_investmentTypeId_fkey" FOREIGN KEY ("investmentTypeId") REFERENCES "InvestmentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_debitAccountId_fkey" FOREIGN KEY ("debitAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentIncome" ADD CONSTRAINT "InvestmentIncome_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentIncome" ADD CONSTRAINT "InvestmentIncome_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentIncome" ADD CONSTRAINT "InvestmentIncome_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentExit" ADD CONSTRAINT "InvestmentExit_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentExit" ADD CONSTRAINT "InvestmentExit_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentExit" ADD CONSTRAINT "InvestmentExit_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentValuation" ADD CONSTRAINT "InvestmentValuation_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentValuation" ADD CONSTRAINT "InvestmentValuation_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentValuation" ADD CONSTRAINT "InvestmentValuation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_revenueAccountId_fkey" FOREIGN KEY ("revenueAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_wipAssetAccountId_fkey" FOREIGN KEY ("wipAssetAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCostCenter" ADD CONSTRAINT "ProjectCostCenter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectExpense" ADD CONSTRAINT "ProjectExpense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectExpense" ADD CONSTRAINT "ProjectExpense_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "ProjectCostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectExpense" ADD CONSTRAINT "ProjectExpense_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRevenue" ADD CONSTRAINT "ProjectRevenue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRevenue" ADD CONSTRAINT "ProjectRevenue_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentProjectLink" ADD CONSTRAINT "InvestmentProjectLink_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentProjectLink" ADD CONSTRAINT "InvestmentProjectLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityAuditLog" ADD CONSTRAINT "EntityAuditLog_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityAuditLog" ADD CONSTRAINT "EntityAuditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

