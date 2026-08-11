-- Charge Type tab → dynamic (free-form names).
-- ChargeTypeConfig becomes a simple name catalog (like ChargeType / Collection
-- Type). The human-readable charge name is snapshotted on each Transaction via
-- the new chargeTypeName column; Transaction.subType uses a generic CUSTOM_CHARGE
-- marker for these dynamic charges so the Postgres enum stays valid.

-- Add a generic CHARGE marker to the TransactionSubType enum.
ALTER TYPE "TransactionSubType" ADD VALUE IF NOT EXISTS 'CUSTOM_CHARGE';

-- Transaction: snapshot the chosen charge type name.
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "chargeTypeName" TEXT;

-- ChargeTypeConfig: convert from (enumValue, label) to a single unique name.
-- Backfill name from the existing label before making it NOT NULL.
ALTER TABLE "ChargeTypeConfig" ADD COLUMN IF NOT EXISTS "name" TEXT;
UPDATE "ChargeTypeConfig" SET "name" = "label" WHERE "name" IS NULL;
ALTER TABLE "ChargeTypeConfig" ALTER COLUMN "name" SET NOT NULL;

-- Create the unique index on name before dropping the old enumValue unique
-- index, then drop the legacy columns.
CREATE UNIQUE INDEX IF NOT EXISTS "ChargeTypeConfig_name_key" ON "ChargeTypeConfig"("name");
DROP INDEX IF EXISTS "ChargeTypeConfig_enumValue_key";
ALTER TABLE "ChargeTypeConfig" DROP COLUMN IF EXISTS "enumValue";
ALTER TABLE "ChargeTypeConfig" DROP COLUMN IF EXISTS "label";
