/* eslint-disable @typescript-eslint/no-require-imports */
// ============================================================================
// RBAC RECOVERY SCRIPT — fixes the "Could not save / Unknown permission keys"
// error produced by PUT /api/permissions/roles/[roleId]/permissions.
// ----------------------------------------------------------------------------
// WHAT THIS DOES
//   1. Ensures every Permission row from the registry exists in the DB
//      (the catalogue the matrix UI resolves against).
//   2. Ensures the 5 system roles exist with their default grants.
//   3. Re-links the bootstrap Super Admin (admin@foundation.com) to the
//      Super Admin role so the matrix page can be opened.
//
// WHEN TO RUN
//   • After `prisma migrate dev` / `prisma db push` — they create the empty
//     RBAC tables but don't populate them.
//   • After updating `lib/permissions/permission-registry.ts` and forgetting
//     to re-run the seed.
//   • Anytime you see "Unknown permission keys (not in registry)" when
//     saving role permissions — that message is misleading; it really means
//     the corresponding Permission row is missing from the DB.
//
// HOW TO RUN
//   node prisma/seed-permissions.js          # from the project root
//   # or, with the patched package.json:
//   npm run seed:rbac
//   # or, as part of the full seed chain:
//   npm run seed
//
// This script is IDEMPOTENT — safe to re-run any number of times. Custom
// roles and their grants are NOT touched; only the system roles' grants are
// reset to the spec defaults.
// ============================================================================

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

// ── Permission registry — loaded from prisma/registry.json ──────────────
// The JSON file is generated from lib/permissions/permission-registry.ts by
// running `node scripts/sync-registry.mjs`. This keeps the seed in sync
// with the TS source automatically — no need to manually mirror the
// registry in two places.
//
// To regenerate after editing permission-registry.ts:
//   node scripts/sync-registry.mjs
//   npm run seed:rbac
const REGISTRY_PATH = path.join(__dirname, 'registry.json');
let REGISTRY;
try {
  REGISTRY = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
} catch (e) {
  console.error('Could not read prisma/registry.json.');
  console.error('Run `node scripts/sync-registry.mjs` first to generate it from the TS registry.');
  process.exit(1);
}

const SEP = '::';
const groupKey = (g) => g;
const pageKey = (g, p) => `${g}${SEP}${p}`;
const tabKey = (g, p, t) => `${g}${SEP}${p}${SEP}${t}`;
const actionKey = (g, p, a, t) => `${g}${SEP}${p}${SEP}${t ?? ''}${SEP}${a}`;

function enumerateRegistry() {
  const nodes = [];
  for (const [group, pages] of Object.entries(REGISTRY)) {
    nodes.push({ menuGroup: group, page: '', tab: '', action: '', key: groupKey(group) });
    for (const [page, def] of Object.entries(pages)) {
      nodes.push({ menuGroup: group, page, tab: '', action: '', key: pageKey(group, page) });
      for (const tab of def.tabs) {
        nodes.push({ menuGroup: group, page, tab, action: '', key: tabKey(group, page, tab) });
      }
      for (const action of def.actions) {
        nodes.push({ menuGroup: group, page, tab: '', action, key: actionKey(group, page, action) });
      }
    }
  }
  return nodes;
}

function allKeysUnderGroup(group) {
  return enumerateRegistry().filter((n) => n.menuGroup === group).map((n) => n.key);
}

const READONLY_ACTIONS = new Set(['export_pdf', 'print', 'view_detail']);
function readOnlyKeysForGroup(group) {
  const out = [groupKey(group)];
  for (const [page, def] of Object.entries(REGISTRY[group])) {
    out.push(pageKey(group, page));
    for (const tab of def.tabs) out.push(tabKey(group, page, tab));
    for (const action of def.actions) {
      if (READONLY_ACTIONS.has(action)) out.push(actionKey(group, page, action));
    }
  }
  return out;
}

const SYSTEM_ROLES = [
  {
    name: 'Super Admin',
    description: 'Full unrestricted access to every module. Cannot be deleted.',
    isSystem: true,
    isSuperAdmin: true,
    keys: [],
  },
  {
    name: 'Treasurer / Cashier',
    description: 'Full Transactions section (deposits, withdrawals, charges, distributions, approvals). Read-only Finance reports. No System Settings, no User Control.',
    isSystem: true,
    isSuperAdmin: false,
    keys: [
      ...readOnlyKeysForGroup('Overview'),
      ...allKeysUnderGroup('Transactions'),
      ...allKeysUnderGroup('Finance & Accounting').filter((k) => {
        const page = k.split(SEP)[1];
        return page === 'Loan Management' || page === 'Voucher Entry' || page === 'Chart of Accounts';
      }),
      ...['Trial Balance', 'Balance Sheet', 'Profit & Loss', 'Account Ledger', 'Member Ledger', 'Money Receipts', 'View Vouchers'].flatMap((p) => readOnlyKeysForGroup('Finance & Accounting').filter((k) => k.split(SEP)[1] === p)),
    ],
  },
  {
    name: 'Auditor',
    description: 'Read-only access to all of Finance & Accounting and Transactions history. Can view reports and ledgers but cannot create, edit, approve, or delete anything.',
    isSystem: true,
    isSuperAdmin: false,
    keys: [
      ...readOnlyKeysForGroup('Overview'),
      ...readOnlyKeysForGroup('Finance & Accounting'),
      ...readOnlyKeysForGroup('Transactions').filter((k) => {
        const page = k.split(SEP)[1];
        return page === 'Transaction History' || page === 'Admin Submitted' || page === 'Member Requests';
      }),
    ],
  },
  {
    name: 'Committee Member',
    description: 'Operations & Management (meetings, projects, investments, tasks, committees, wishes). Read-only Dashboard. No financial data entry.',
    isSystem: true,
    isSuperAdmin: false,
    keys: [
      ...readOnlyKeysForGroup('Overview'),
      ...allKeysUnderGroup('Operations & Management'),
    ],
  },
  {
    name: 'Member Support',
    description: 'Member Management section (members, approvals, trust score). View-only Transactions. No Finance, no Settings, no User Control.',
    isSystem: true,
    isSuperAdmin: false,
    keys: [
      ...readOnlyKeysForGroup('Overview'),
      ...allKeysUnderGroup('Member Management'),
      ...readOnlyKeysForGroup('Transactions').filter((k) => {
        const page = k.split(SEP)[1];
        return page === 'Members Due List' || page === 'Transaction History';
      }),
    ],
  },
];

const uniq = (arr) => Array.from(new Set(arr));

function keyToFields(key) {
  const parts = key.split(SEP);
  if (parts.length === 1) return { menuGroup: parts[0], page: '', tab: '', action: '' };
  if (parts.length === 2) return { menuGroup: parts[0], page: parts[1], tab: '', action: '' };
  if (parts.length === 3) return { menuGroup: parts[0], page: parts[1], tab: parts[2], action: '' };
  return { menuGroup: parts[0], page: parts[1], tab: parts[2], action: parts[3] };
}

async function main() {
  console.log('→ Seeding RBAC permissions & system roles…');

  // ── 0. Pre-flight: count existing rows so we can report what changed ──
  const beforePerms = await prisma.permission.count();
  const beforeRoles = await prisma.role.count();

  // ── 1. Ensure every registry node exists as a Permission row ──────────
  const nodes = enumerateRegistry();
  let permCount = 0;
  let permCreated = 0;
  for (const node of nodes) {
    const existing = await prisma.permission.findUnique({
      where: {
        menuGroup_page_tab_action: {
          menuGroup: node.menuGroup,
          page: node.page,
          tab: node.tab,
          action: node.action,
        },
      },
      select: { id: true },
    });
    if (!existing) {
      await prisma.permission.create({
        data: {
          menuGroup: node.menuGroup,
          page: node.page,
          tab: node.tab,
          action: node.action,
        },
      });
      permCreated++;
    }
    permCount++;
  }
  console.log(`  ✓ ${permCount} permission rows ensured (${permCreated} newly created, ${permCount - permCreated} already present)`);

  // ── 2. Ensure the 5 system roles exist with their default grants ──────
  for (const roleDef of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      update: {
        description: roleDef.description,
        isSystem: roleDef.isSystem,
        isSuperAdmin: roleDef.isSuperAdmin,
      },
      create: {
        name: roleDef.name,
        description: roleDef.description,
        isSystem: roleDef.isSystem,
        isSuperAdmin: roleDef.isSuperAdmin,
      },
    });

    if (roleDef.isSuperAdmin) {
      console.log(`  ✓ Role "${roleDef.name}" (super-admin, all access)`);
      continue;
    }

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const keys = uniq(roleDef.keys);
    let linked = 0;
    let skipped = 0;
    for (const key of keys) {
      const fields = keyToFields(key);
      const perm = await prisma.permission.findUnique({
        where: { menuGroup_page_tab_action: fields },
        select: { id: true },
      });
      if (!perm) {
        console.warn(`    ! permission not found for key "${key}" — skipping`);
        skipped++;
        continue;
      }
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: perm.id },
      });
      linked++;
    }
    console.log(`  ✓ Role "${roleDef.name}" → ${linked} permissions linked${skipped ? `, ${skipped} skipped` : ''}`);
  }

  // ── 3. Link the bootstrap Super Admin user to the new Super Admin role ─
  const admin = await prisma.user.findUnique({ where: { email: 'admin@foundation.com' } });
  if (admin) {
    const superRole = await prisma.role.findUnique({ where: { name: 'Super Admin' } });
    if (superRole) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: admin.id, roleId: superRole.id } },
        update: {},
        create: { userId: admin.id, roleId: superRole.id, assignedBy: 'seed' },
      });
      console.log(`  ✓ Linked ${admin.email} → Super Admin role`);
    }
  } else {
    console.log(`  · Bootstrap admin@foundation.com not found — skipping user-role link (run prisma/seed.js first).`);
  }

  const afterPerms = await prisma.permission.count();
  const afterRoles = await prisma.role.count();
  console.log('→ RBAC seed complete.');
  console.log('  Permission rows:', `${beforePerms} → ${afterPerms}`);
  console.log('  Role rows:      ', `${beforeRoles} → ${afterRoles}`);
}

main()
  .catch((e) => {
    console.error('RBAC seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
