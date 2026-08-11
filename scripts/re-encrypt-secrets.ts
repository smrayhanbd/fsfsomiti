/**
 * One-time migration script: re-encrypt all stored secrets under the new
 * per-row-salt scheme (S18 follow-up).
 *
 * Background — `lib/crypto.ts` historically derived its AES key via
 * `scryptSync(ENCRYPTION_KEY, STATIC_SALT, 32)` where STATIC_SALT was a
 * hardcoded constant shared across every row. That made the system
 * vulnerable to a rainbow-table / precomputation attack: an attacker who
 * learned ENCRYPTION_KEY could precompute a single derived key once and
 * decrypt every secret at once. The fix landed in `lib/crypto.ts` is to
 * generate a fresh 16-byte random salt per encryption and store it
 * alongside the ciphertext:
 *
 *   old format: base64(iv):base64(ciphertext):base64(tag)
 *   new format: base64(iv):base64(salt):base64(ciphertext):base64(tag)
 *
 * `decrypt()` keeps backward compatibility (it still reads 3-part payloads
 * by falling back to the legacy static salt) so existing rows keep working
 * after the deploy. This script walks every encrypted column in the DB,
 * decrypts (using either format) and re-encrypts (writing the new format).
 *
 * Usage:
 *   1. Ensure ENCRYPTION_KEY is set in your env (.env / .env.local /
 *      export). If you have rows written under the legacy NEXTAUTH_SECRET
 *      fallback (removed in S18), set ENCRYPTION_KEY = the OLD
 *      NEXTAUTH_SECRET value for this one run, run this script, then set
 *      ENCRYPTION_KEY to your new dedicated value going forward.
 *   2. Run with one of:
 *        node --experimental-strip-types scripts/re-encrypt-secrets.ts
 *        npx tsx scripts/re-encrypt-secrets.ts
 *
 * Idempotent — running it twice is safe (the second pass reads rows that
 * are already in the new format, decrypts them, and re-encrypts with a
 * fresh per-row salt, which is a no-op semantically).
 */
import "dotenv/config"

import prisma from "../lib/prisma"
import { decrypt, encrypt } from "../lib/crypto"

/**
 * Type for a column we want to migrate. `model` is the Prisma model delegate
 * name, `column` is the encrypted field name.
 */
type EncryptedColumn = {
  model: "mailSettings" | "smsSettings" | "transparencySettings"
  column: string
}

// MailSettings + SmsSettings are the primary secrets per S18. TransparencySettings
// also stores an iBanking password via the same crypto module, so include it.
const COLUMNS: EncryptedColumn[] = [
  { model: "mailSettings", column: "smtpPasswordEnc" },
  { model: "mailSettings", column: "apiKeyEnc" },
  { model: "smsSettings", column: "bulksmsbdApiKeyEnc" },
  { model: "smsSettings", column: "sendmysmsKeyEnc" },
  { model: "smsSettings", column: "sslTokenEnc" },
  { model: "smsSettings", column: "twilioTokenEnc" },
  { model: "smsSettings", column: "customAuthValueEnc" },
  { model: "transparencySettings", column: "ibankingPasswordEnc" },
]

function countSeparator(parts: number): string {
  return parts === 3 ? "legacy-3-part" : parts === 4 ? "new-4-part" : `unknown-${parts}-part`
}

async function main(): Promise<void> {
  console.log("[re-encrypt-secrets] starting migration to per-row salt scheme")

  if (!process.env.ENCRYPTION_KEY) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Export it (or add it to .env) before running this script. " +
        "If you have legacy ciphertext written under NEXTAUTH_SECRET (pre-S18), temporarily set " +
        "ENCRYPTION_KEY to that value just for this run."
    )
  }

  let scanned = 0
  let migrated = 0
  let skippedAlreadyNew = 0
  let skippedBlank = 0
  let failed = 0

  for (const { model, column } of COLUMNS) {
    console.log(`[re-encrypt-secrets] scanning ${model}.${column}`)
    // Each of these models is a singleton (id="singleton"), but the script
    // doesn't assume that — it iterates every row so it would also work on
    // a hypothetical multi-tenant future.
    // @ts-expect-error — Prisma's model delegate index isn't typed here; we
    // dispatch dynamically by string. The columns are also dynamic, so we
    // cast.
    const rows: Array<{ id: string; [k: string]: unknown }> = await prisma[model].findMany()
    for (const row of rows) {
      const current = row[column] as string | null | undefined
      scanned++
      if (!current) {
        skippedBlank++
        continue
      }
      const parts = current.split(":").length
      if (parts === 4) {
        // Already in the new format. Skip (idempotent).
        skippedAlreadyNew++
        continue
      }
      if (parts !== 3) {
        console.warn(
          `[re-encrypt-secrets] ${model}.${column} row ${row.id}: unexpected ${countSeparator(
            parts
          )} payload — skipping (manual review needed)`
        )
        failed++
        continue
      }
      try {
        const plain = decrypt(current) // works with legacy 3-part format
        const next = encrypt(plain) // writes new 4-part format
        // @ts-expect-error — dynamic column write
        await prisma[model].update({ where: { id: row.id }, data: { [column]: next } })
        migrated++
        console.log(`[re-encrypt-secrets] ${model}.${column} row ${row.id}: migrated`)
      } catch (err) {
        failed++
        console.error(
          `[re-encrypt-secrets] ${model}.${column} row ${row.id}: FAILED —`,
          err instanceof Error ? err.message : err
        )
      }
    }
  }

  console.log("\n[re-encrypt-secrets] summary")
  console.log(`  scanned columns : ${scanned}`)
  console.log(`  migrated       : ${migrated}`)
  console.log(`  already new    : ${skippedAlreadyNew}`)
  console.log(`  blank (skipped): ${skippedBlank}`)
  console.log(`  failed         : ${failed}`)
  if (failed > 0) {
    process.exitCode = 1
  }
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error("[re-encrypt-secrets] fatal error:", err)
  await prisma.$disconnect()
  process.exit(1)
})
