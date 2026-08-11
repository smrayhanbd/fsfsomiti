// Prisma configuration file — replaces the deprecated `package.json#prisma`
// block. Loaded automatically by Prisma 6+ CLI.
//
// IMPORTANT (Prisma 6+ breaking change):
// When this file exists, Prisma NO LONGER auto-loads .env files. We must load
// them ourselves, otherwise env("DATABASE_URL") / env("DIRECT_URL") in
// schema.prisma will throw "Environment variable not found" at migrate time.
//
// Schema path is auto-detected (prisma/schema.prisma) — no need to set it.

// Load .env from project root into process.env before Prisma reads schema.prisma.
// Use dotenv (cross-platform, works on every Node version).
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config();

/** @type {import('@prisma/config').PrismaConfig} */
module.exports = {
  // The seed command — run via `npx prisma db seed`, `npm run db:reset`,
  // or `npm run db:migrate`. Creates the super admin user + RBAC roles +
  // chart-of-accounts system accounts (LOANS-RECEIVABLE, EXPENSE-LOAN-WRITEOFF,
  // MEMBER-SAVINGS-LIABILITY, CASH-IN-HAND, etc.) needed for the GL to balance.
  migrations: {
    seed: "node prisma/seed.js && node prisma/seed-permissions.js",
  },
}
