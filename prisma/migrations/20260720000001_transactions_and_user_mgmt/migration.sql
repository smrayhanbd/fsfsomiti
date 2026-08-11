-- Transactions Module + User Management
-- Adds the unified Transaction engine (Maker-Checker, double-entry bridge,
-- reversals, approval limits, atomic counters) and extends the User model
-- with audit/activation fields. Review then apply with:
--   npx prisma migrate deploy

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'CHARGE', 'INCOME_DISTRIBUTION');

-- CreateEnum
CREATE TYPE "TransactionSubType" AS ENUM ('SAVINGS_DEPOSIT', 'ADVANCE', 'DUE_PAYMENT', 'SERVICE_CHARGE', 'BANK_CHARGE', 'ANNUAL_FEE', 'ADMIN_CHARGE', 'FINE_PENALTY', 'OTHER_CHARGE', 'PROJECT_PROFIT', 'BANK_INTEREST', 'INVESTMENT_INCOME', 'DIVIDEND', 'OTHER_INCOME', 'LOAN_DISBURSEMENT', 'LOAN_INSTALLMENT', 'ADMISSION_FEE', 'MEMBERSHIP_FEE', 'SHARE_PURCHASE', 'SHARE_REFUND');

-- CreateEnum
CREATE TYPE "TransactionCategory" AS ENUM ('MEMBER', 'FUTURE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'BKASH', 'NAGAD', 'ROCKET');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'RETURNED', 'REJECTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ApprovalLevel" AS ENUM ('L1', 'L2', 'L3');

-- AlterTable
-- Backfill is required for the NOT NULL "createdAt"/"updatedAt" columns on
-- databases older than Postgres 16, which cannot read CURRENT_TIMESTAMP at
-- ALTER time for existing rows.
ALTER TABLE "User" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastLogin" TIMESTAMP(3),
ADD COLUMN     "name" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "transactionType" "TransactionType" NOT NULL,
    "subType" "TransactionSubType" NOT NULL,
    "category" "TransactionCategory" NOT NULL DEFAULT 'MEMBER',
    "memberId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "paymentMethod" "PaymentMethod",
    "cashAccountId" TEXT,
    "referenceNo" TEXT,
    "breakdown" JSONB,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "remarks" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'DRAFT',
    "approvalLevel" "ApprovalLevel",
    "returnReason" TEXT,
    "rejectionReason" TEXT,
    "reversalOfId" TEXT,
    "reversedById" TEXT,
    "reversalReason" TEXT,
    "journalEntryId" TEXT,
    "savingsMirrorId" TEXT,
    "memberSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "memberRequestId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedBy" TEXT,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "returnedBy" TEXT,
    "returnedById" TEXT,
    "returnedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "reversedByUser" TEXT,
    "reversedByUserId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "deviceInfo" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalLimit" (
    "id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "permission" TEXT,
    "minAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "maxAmount" DECIMAL(14,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_voucherNo_key" ON "Transaction"("voucherNo");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_reversalOfId_key" ON "Transaction"("reversalOfId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_reversedById_key" ON "Transaction"("reversedById");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_savingsMirrorId_key" ON "Transaction"("savingsMirrorId");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_transactionType_status_idx" ON "Transaction"("transactionType", "status");

-- CreateIndex
CREATE INDEX "Transaction_memberId_idx" ON "Transaction"("memberId");

-- CreateIndex
CREATE INDEX "Transaction_approvedAt_idx" ON "Transaction"("approvedAt");

-- CreateIndex
CREATE INDEX "Transaction_reversalOfId_idx" ON "Transaction"("reversalOfId");

-- CreateIndex
CREATE INDEX "Transaction_cashAccountId_idx" ON "Transaction"("cashAccountId");

-- CreateIndex
CREATE INDEX "ApprovalLimit_level_isActive_idx" ON "ApprovalLimit"("level", "isActive");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_savingsMirrorId_fkey" FOREIGN KEY ("savingsMirrorId") REFERENCES "Savings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_memberRequestId_fkey" FOREIGN KEY ("memberRequestId") REFERENCES "MemberRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
