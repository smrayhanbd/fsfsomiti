#!/usr/bin/env node
/**
 * scripts/fix-member-counter.mjs
 *
 * Standalone one-shot repair script that syncs the `member` Counter row
 * with the MAX numeric part of `Member.memberNo` in the database.
 *
 * Run with:
 *   node scripts/fix-member-counter.mjs
 *
 * Or via npm script (add to package.json "scripts"):
 *   "fix:member-counter": "node scripts/fix-member-counter.mjs"
 *
 * When to run:
 *   - You see "Unique constraint failed on the fields: (memberNo)" when
 *     creating a member.
 *   - After importing members from an external source.
 *   - After restoring from a backup.
 *   - After running `prisma migrate reset` (the Counter is wiped but the
 *     Member table may still have rows from prior runs).
 *
 * What it does:
 *   1. Reads the current `Counter` row where `id = "member"`.
 *   2. Queries the `Member` table for the maximum numeric part of any
 *      `memberNo` matching the pattern `M####`.
 *   3. Sets `Counter.value = MAX(current_counter_value, max_member_no)`.
 *   4. Prints a before/after summary.
 *
 * The script is IDEMPOTENT — safe to run multiple times. It only ever
 * INCREASES the Counter value (never decreases it), so running it on a
 * healthy database is a no-op.
 */
import { PrismaClient } from '@prisma/client'

// Use the same env loading as prisma.config.js so this works whether or not
// the user has shell env vars set.
import dotenv from 'dotenv'
dotenv.config()

const prisma = new PrismaClient({
  log: ['warn', 'error'],
})

async function main() {
  console.log('─'.repeat(60))
  console.log('FSF Somiti — memberNo Counter repair')
  console.log('─'.repeat(60))

  // 1. Current Counter state
  const counter = await prisma.counter.findUnique({ where: { id: 'member' } })
  console.log('\nCurrent state:')
  console.log(`  Counter{ id: "member", value: ${counter?.value ?? '(missing)'} }`)

  // 2. Max numeric part of existing memberNo values
  const rows = await prisma.$queryRaw`
    SELECT COALESCE(MAX(CAST(SUBSTRING("memberNo", 2) AS INTEGER)), 0) AS max_no
    FROM "Member"
    WHERE "memberNo" ~ '^M[0-9]+$'
  `
  const maxMemberNo = rows[0]?.max_no ?? 0
  console.log(`  MAX(memberNo numeric part) in Member table: ${maxMemberNo}`)

  // 3. Compute the new value (whichever is higher)
  const currentVal = counter?.value ?? 0
  const newVal = Math.max(maxMemberNo, currentVal)
  const delta = newVal - currentVal

  if (delta === 0) {
    console.log('\n✓ Counter is already in sync. No change needed.')
    return
  }

  console.log(`\nAdjusting Counter.value: ${currentVal} → ${newVal} (+${delta})`)

  // 4. Update the Counter row (upsert so we create it if missing)
  await prisma.counter.upsert({
    where: { id: 'member' },
    update: { value: newVal },
    create: { id: 'member', value: newVal },
  })

  console.log('\n✓ Counter synced. Next memberNo will be:' +
    ` M${String(newVal + 1).padStart(4, '0')}`)
  console.log('\nYou can now create members normally.')
}

main()
  .catch((err) => {
    console.error('\n✗ Repair failed:')
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
