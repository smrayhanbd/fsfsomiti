-- Mail & SMS Settings + Message Templates + Settings Audit Log
-- Adds configurable mail/SMS provider singletons, a reusable message-template
-- store, and an append-only audit trail for settings changes. Secrets are
-- stored as AES-256-GCM ciphertext (see lib/crypto.ts) — never plaintext.
--
-- These tables are already present in the target database (created earlier via
-- `prisma db push`). This migration is recorded as applied via
-- `prisma migrate resolve --applied` so the migration history is consistent
-- going forward; it is NOT re-executed against the live DB.

-- CreateTable
CREATE TABLE "MailSettings" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'gmail',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayName" TEXT,
    "fromEmail" TEXT,
    "replyTo" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "encryption" TEXT,
    "smtpUsername" TEXT,
    "smtpPasswordEnc" TEXT,
    "sesRegion" TEXT,
    "sesConfigSet" TEXT,
    "sesSandbox" BOOLEAN NOT NULL DEFAULT false,
    "apiKeyEnc" TEXT,
    "apiDomain" TEXT,
    "apiRegion" TEXT,
    "maxRetry" INTEGER NOT NULL DEFAULT 3,
    "retryIntervalMin" INTEGER NOT NULL DEFAULT 5,
    "timeoutSec" INTEGER NOT NULL DEFAULT 30,
    "dailyLimit" INTEGER,
    "perMinuteLimit" INTEGER,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsSettings" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'bulksmsbd',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayName" TEXT,
    "bulksmsbdUrl" TEXT,
    "bulksmsbdApiKeyEnc" TEXT,
    "bulksmsbdSender" TEXT,
    "sendmysmsUrl" TEXT,
    "sendmysmsUser" TEXT,
    "sendmysmsKeyEnc" TEXT,
    "sslTokenEnc" TEXT,
    "sslSender" TEXT,
    "sslUrl" TEXT,
    "twilioSid" TEXT,
    "twilioTokenEnc" TEXT,
    "twilioFrom" TEXT,
    "customUrl" TEXT,
    "customMethod" TEXT,
    "customAuthType" TEXT,
    "customAuthValueEnc" TEXT,
    "customBodyType" TEXT,
    "customPhoneParam" TEXT,
    "customMsgParam" TEXT,
    "customSenderParam" TEXT,
    "customApiKeyParam" TEXT,
    "customSuccessField" TEXT,
    "customSuccessValue" TEXT,
    "countryCode" TEXT,
    "phoneFormat" TEXT,
    "urlEncode" BOOLEAN NOT NULL DEFAULT true,
    "timeoutSec" INTEGER NOT NULL DEFAULT 30,
    "maxRetry" INTEGER NOT NULL DEFAULT 3,
    "dailyLimit" INTEGER,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettingsAuditLog" (
    "id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "changes" JSONB,
    "userId" TEXT,
    "userEmail" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettingsAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_key_key" ON "MessageTemplate"("key");

-- CreateIndex
CREATE INDEX "SettingsAuditLog_section_createdAt_idx" ON "SettingsAuditLog"("section", "createdAt"(sort: Desc));
