# memberNo Collision Fix — 2026-08-19

## Symptom

When creating a member (via `/dashboard/members/add` or public self-registration), the form fails with:

> **Unique constraint failed on the fields: (memberNo)**

The full Prisma error is `P2002` on the `memberNo` @unique constraint.

---

## Root Cause

The `addMember` action in `app/actions/member.ts` generates `memberNo` values
(`M0001`, `M0002`, ...) by reading and incrementing a row in the `Counter`
table where `id = "member"`:

```ts
const counter = await tx.counter.upsert({
  where: { id: "member" },
  update: { value: { increment: 1 } },
  create: { id: "member", value: 1 },
})
const memberNo = `M${String(counter.value).padStart(4, "0")}`
```

This logic is correct **as long as the Counter row's value matches the maximum
numeric part of any existing `Member.memberNo`**. When they're out of sync:

- The Counter says the next value is `5`, so the code generates `M0005`.
- But a member with `memberNo = "M0005"` already exists in the Member table.
- `Member.create()` fails with `P2002`.

The desync typically happens because:

1. **Manual member inserts** — members were added via SQL/seed without
   updating the Counter row.
2. **Database restore from backup** — the Member table was restored but
   the Counter row was reset to its seed value.
3. **`prisma migrate reset`** — wipes the Counter (seed only creates the
   `transaction` Counter, not the `member` one) but may leave Member rows
   behind if a partial seed was run.
4. **Partial transaction failure** — a previous `addMember` call failed
   AFTER the Member row was created (e.g., on Cloudinary upload) but the
   Counter was still incremented. The next call generates a memberNo
   that's one higher than expected — but since the failed member wasn't
   created, there's no collision. The collision happens in the OPPOSITE
   case: the Member was created but the Counter increment was rolled back.

---

## The Fix

### `app/actions/member.ts` (patched)

Added a self-healing retry wrapper around the member-create transaction:

1. **`resyncMemberCounter()`** — new helper function that runs a separate
   transaction to:
   - Query `MAX(CAST(SUBSTRING("memberNo", 2) AS INTEGER))` from the
     `Member` table (only for rows matching `^M[0-9]+$`).
   - Read the current `Counter` row for `id = "member"`.
   - Set `Counter.value = MAX(current_value, max_member_no)`.
   - Return the new value.

2. **Retry wrapper** — the existing `directPrisma.$transaction(...)` call
   is now wrapped in a `runCreateTx` function. The flow is:
   - Try `runCreateTx()`.
   - If it throws `P2002` with `target = ["memberNo"]`, call
     `resyncMemberCounter()` and retry `runCreateTx()` once.
   - Any other error (NID collision, passport collision, etc.) is re-thrown
     unchanged so the existing error handling kicks in.

This means users will **never see a "DUPLICATE_MEMBER_NO" error caused by
a stale Counter** — the system auto-recovers on the next attempt.

### `scripts/fix-member-counter.mjs` (new file)

A standalone one-shot repair script that does the same thing as
`resyncMemberCounter()` but can be run manually:

```bash
node scripts/fix-member-counter.mjs
```

Output looks like:

```
──────────────────────────────────────────────────────────
FSF Somiti — memberNo Counter repair
──────────────────────────────────────────────────────────

Current state:
  Counter{ id: "member", value: 3 }
  MAX(memberNo numeric part) in Member table: 8

Adjusting Counter.value: 3 → 8 (+5)

✓ Counter synced. Next memberNo will be: M0009

You can now create members normally.
```

The script is **idempotent** — running it on a healthy database is a no-op
(it only ever INCREASES the Counter value).

---

## What to do RIGHT NOW

You have two options — pick ONE:

### Option A: Run the repair script (fastest)

If your dev server is still running, you don't even need to restart it.

```bash
# from project root (C:\FSF Somiti\)
node scripts/fix-member-counter.mjs
```

This immediately syncs the Counter. Try creating the member again — it
should succeed.

### Option B: Let the self-healing patch handle it

If you've applied the patch in `app/actions/member.ts`, just try creating
the member again. The first attempt will fail (same error), but the system
will auto-resync and the **second** attempt will succeed.

Option A is faster because it prevents the first failure. Option B is
better long-term because it auto-recovers from future drift.

**Best practice: do both.** Run the script once now, AND apply the patch
so it never happens again.

---

## Verification

After running the repair script (or after the self-healing patch kicks in):

```bash
node scripts/fix-member-counter.mjs
# Should print: "✓ Counter is already in sync. No change needed."
```

Try creating a member via `/dashboard/members/add` — should succeed without
errors.

---

## Files Changed

| File | Change |
|------|--------|
| `app/actions/member.ts` | Added `resyncMemberCounter()` helper + retry wrapper around the create-member transaction |
| `scripts/fix-member-counter.mjs` | New file — standalone one-shot repair script |
