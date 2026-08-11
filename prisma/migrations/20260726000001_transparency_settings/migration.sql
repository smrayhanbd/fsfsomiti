-- TransparencySettings singleton: backs Somiti Settings → Transparency Settings.
-- Drives the member-portal transparency features (per-feature toggles + the
-- somiti's bank iBanking credentials, password stored as AES-256-GCM ciphertext).
-- NOTE: the dev database is applied via `prisma db push`; this file records the
-- change for environments that run migrations cleanly.
CREATE TABLE "TransparencySettings" (
    "id" TEXT NOT NULL,
    "showBankStatement" BOOLEAN NOT NULL DEFAULT true,
    "showInvestments" BOOLEAN NOT NULL DEFAULT true,
    "showProjects" BOOLEAN NOT NULL DEFAULT true,
    "showMeetingMinutes" BOOLEAN NOT NULL DEFAULT true,
    "bankName" TEXT,
    "ibankingUrl" TEXT,
    "ibankingUserId" TEXT,
    "ibankingPasswordEnc" TEXT,
    "bankInstructions" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransparencySettings_pkey" PRIMARY KEY ("id")
);
