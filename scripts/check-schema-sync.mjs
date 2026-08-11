#!/usr/bin/env node
/**
 * Check DB schema vs Prisma schema — surfaces missing columns/tables that
 * would cause runtime PrismaClientKnownRequestError like:
 *   "The column `Loan.nplBucket` does not exist in the current database."
 *
 * Run with: node scripts/check-schema-sync.mjs
 *
 * Exit codes:
 *   0 — schema is in sync (or only has extra columns in DB, which is safe)
 *   1 — schema is OUT OF SYNC — Prisma will crash at runtime. Run migrations.
 *   2 — could not connect to DB or read schema.prisma
 *
 * IMPORTANT: This script only checks SCALAR fields (the ones that become
 * real DB columns). Relation fields like `Member.loans` or `Member.savings`
 * are Prisma-level abstractions backed by foreign-key columns (e.g. `Loan.memberId`)
 * — they're NOT real columns on the parent table, so we skip them. Checking
 * them would produce hundreds of false positives.
 */
import { PrismaClient } from "@prisma/client"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Prisma scalar types that map to real DB columns. Anything NOT in this set
 * is a relation field (a reference to another Model) and gets skipped.
 *
 * Relations in Prisma look like: `loans  Loan[]` or `member  Member? @relation(...)`
 * — the type is a capitalized Model name, NOT a scalar.
 */
const PRISMA_SCALAR_TYPES = new Set([
  "String", "Int", "BigInt", "Boolean", "Float", "Decimal", "DateTime", "Json",
  "Bytes", "Unsupported",
])

/**
 * Parse a single Prisma field line and decide if it represents a real DB column.
 *
 * Examples (the `↓` marks whether we count it):
 *   id              String         @id @default(cuid())   ✓ scalar
 *   amount          Decimal        @db.Decimal(14, 2)     ✓ scalar
 *   createdAt       DateTime       @default(now())        ✓ scalar
 *   loans           Loan[]                                ✗ relation (array)
 *   member          Member?        @relation(...)        ✗ relation (optional)
 *   memberId        String                                ✓ scalar (FK column)
 *   role            Role           @default(...)         ✗ relation (enum)
 *   status          TransactionStatus                    ✗ enum (still scalar
 *                                                            — handled below)
 */
function isScalarField(line, enumNames) {
  // Match: `  fieldName   Type   @modifiers`
  // The type is the second whitespace-separated token.
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@") || trimmed.startsWith("}")) {
    return false
  }
  // Skip block-level directives like @@unique, @@index, @@map
  if (trimmed.startsWith("@@")) return false
  // Match the field name + type. Allow `?` and `[]` suffix on type.
  const m = trimmed.match(/^(\w+)\s+([\w<>]+)(\?|(\[\]))?/)
  if (!m) return false
  let type = m[2]
  // Strip generic args like `Unsupported("tsvector")` → keep `Unsupported`
  // (already handled since we match \w only — but the `(` would have stopped the match.)
  // If type is in PRISMA_SCALAR_TYPES → scalar.
  if (PRISMA_SCALAR_TYPES.has(type)) return true
  // If type is an enum (lowercase-first OR listed in enumNames) → scalar (enums become columns)
  if (enumNames.has(type)) return true
  // Otherwise it's a relation (Type is a Model name, capitalized) → skip.
  return false
}

/**
 * Parse the whole schema.prisma file. Returns:
 *   { models: Record<ModelName, Set<ColumnName>>, enums: Set<EnumName> }
 */
function parseSchema(schema) {
  const models = {}
  const enums = new Set()
  let currentModel = null
  let currentEnum = null

  for (const line of schema.split("\n")) {
    // model Foo {
    const modelMatch = line.match(/^model\s+(\w+)\s*\{/)
    if (modelMatch) {
      currentModel = modelMatch[1]
      models[currentModel] = new Set()
      currentEnum = null
      continue
    }
    // enum Foo {
    const enumMatch = line.match(/^enum\s+(\w+)\s*\{/)
    if (enumMatch) {
      currentEnum = enumMatch[1]
      enums.add(currentEnum)
      currentModel = null
      continue
    }
    // closing brace
    if (line.startsWith("}")) {
      currentModel = null
      currentEnum = null
      continue
    }
    // inside a model
    if (currentModel) {
      if (isScalarField(line, enums)) {
        // Extract just the field name (first token after whitespace).
        const m = line.trim().match(/^(\w+)\s+/)
        if (m) models[currentModel].add(m[1])
      }
    }
    // inside an enum — just collect the name, no columns to track
  }

  return { models, enums }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("✗ DATABASE_URL not set — copy .env.example to .env and fill in the value.")
    process.exit(2)
  }

  const prisma = new PrismaClient()
  try {
    // 1. Read + parse schema.prisma.
    const schemaPath = path.resolve(__dirname, "..", "prisma", "schema.prisma")
    const schema = fs.readFileSync(schemaPath, "utf8")
    const { models: expectedModels, enums } = parseSchema(schema)

    // 2. Read live DB schema via information_schema.
    const tablesResult = await prisma.$queryRaw`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, column_name
    `
    /** @type {Record<string, Set<string>>} */
    const liveModels = {}
    for (const row of tablesResult) {
      const t = row.table_name
      if (!liveModels[t]) liveModels[t] = new Set()
      liveModels[t].add(row.column_name)
    }

    // 3. Compare — find SCALAR fields Prisma expects but DB doesn't have.
    /** @type {Array<{table: string, missingColumns: string[]}>} */
    const problems = []
    let totalMissing = 0
    for (const [table, expectedFields] of Object.entries(expectedModels)) {
      const liveFields = liveModels[table] || new Set()
      const missing = [...expectedFields].filter((f) => !liveFields.has(f))
      if (missing.length > 0) {
        problems.push({ table, missingColumns: missing })
        totalMissing += missing.length
      }
    }

    // 4. Tables in schema.prisma but not in the DB.
    const missingTables = Object.keys(expectedModels).filter((t) => !liveModels[t])

    // 5. Report.
    console.log("")
    console.log("Schema sync check")
    console.log("==================")
    console.log(`  Prisma models:      ${Object.keys(expectedModels).length}`)
    console.log(`  Prisma enums:       ${enums.size}`)
    console.log(`  Live DB tables:     ${Object.keys(liveModels).length}`)
    console.log(`  Missing tables:     ${missingTables.length}`)
    console.log(`  Missing columns:    ${totalMissing}  (scalar fields only — relations skipped)`)
    console.log("")

    if (missingTables.length > 0) {
      console.log("✗ Tables in schema.prisma but NOT in DB:")
      for (const t of missingTables) {
        console.log(`    - ${t}`)
      }
      console.log("")
    }

    if (problems.length > 0) {
      console.log("✗ Scalar columns in schema.prisma but NOT in DB (will cause runtime crashes):")
      for (const { table, missingColumns } of problems) {
        console.log(`    ${table}:`)
        for (const c of missingColumns) {
          console.log(`      - ${c}`)
        }
      }
      console.log("")
      console.log("FIX: run `npx prisma migrate deploy` to apply pending migrations.")
      console.log("     If migrations are blocked by drift, run `npx prisma db push` instead.")
      process.exit(1)
    }

    if (missingTables.length === 0 && totalMissing === 0) {
      console.log("✓ Schema is in sync — no missing tables or columns.")
      process.exit(0)
    }

    if (missingTables.length > 0) {
      process.exit(1)
    }
  } catch (err) {
    console.error("✗ Could not check schema sync:", err.message)
    process.exit(2)
  } finally {
    await prisma.$disconnect()
  }
}

main()
