-- AlterTable
ALTER TABLE "SiteContent" DROP COLUMN "securityBadges",
DROP COLUMN "transparency",
ADD COLUMN     "androidAppSizeBytes" INTEGER,
ADD COLUMN     "androidAppUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "androidAppUrl" TEXT,
ADD COLUMN     "androidAppVersion" TEXT,
ADD COLUMN     "softwareDescription" TEXT,
ADD COLUMN     "softwareTitle" TEXT,
ADD COLUMN     "windowsAppSizeBytes" INTEGER,
ADD COLUMN     "windowsAppUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "windowsAppUrl" TEXT,
ADD COLUMN     "windowsAppVersion" TEXT;
