-- Charge Type config tab (Fees & Charge Setup → Charge Type).
-- Each row maps a user-editable label to a TransactionSubType CHARGE enum
-- value, with an active/inactive toggle. The Charge Management page reads the
-- active rows to populate its "Charge Type" dropdown and stores enumValue on
-- Transaction.subType.
CREATE TABLE "ChargeTypeConfig" (
    "id" TEXT NOT NULL,
    "enumValue" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChargeTypeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChargeTypeConfig_enumValue_key" ON "ChargeTypeConfig"("enumValue");

-- Seed the six TransactionSubType CHARGE members so the tab is usable on a
-- fresh database. Idempotent: skipped if rows already exist.
INSERT INTO "ChargeTypeConfig" ("id", "enumValue", "label", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), v.enumValue, v.label, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('SERVICE_CHARGE', 'Service Charge'),
  ('BANK_CHARGE',    'Bank Charge'),
  ('ANNUAL_FEE',     'Annual Membership Fee'),
  ('ADMIN_CHARGE',   'Administrative Charge'),
  ('FINE_PENALTY',   'Fine / Penalty'),
  ('OTHER_CHARGE',   'Other Charge')
) AS v(enumValue, label)
WHERE NOT EXISTS (
  SELECT 1 FROM "ChargeTypeConfig" c WHERE c."enumValue" = v.enumValue
);
