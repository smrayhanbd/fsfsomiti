-- Landing page redesign: new sections in the SiteContent singleton.
--   heroBadge / heroCtaPrimary / heroCtaSecondary  — hero pill + button labels
--   howItWorks    Json  — numbered onboarding steps ({step, title, description})
--   stats          Json  — top-of-page stat strip ({value, label, suffix})
--   securityBadges Json  — horizontal scrolling trust badges ({label, icon})
-- NOTE: the dev database is applied via `prisma db push`; this file records the
-- change for environments that run migrations cleanly.
ALTER TABLE "SiteContent" ADD COLUMN "heroBadge"     TEXT;
ALTER TABLE "SiteContent" ADD COLUMN "heroCtaPrimary"   TEXT;
ALTER TABLE "SiteContent" ADD COLUMN "heroCtaSecondary" TEXT;
ALTER TABLE "SiteContent" ADD COLUMN "howItWorks"     JSONB   NOT NULL DEFAULT '[]';
ALTER TABLE "SiteContent" ADD COLUMN "stats"          JSONB   NOT NULL DEFAULT '[]';
ALTER TABLE "SiteContent" ADD COLUMN "securityBadges" JSONB   NOT NULL DEFAULT '[]';
