/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Standard Chart-of-Accounts entries the Transactions Module's double-entry
// rules resolve by `accountCode`. If they don't already exist we create them
// so the approve action can post balanced vouchers without manual setup.
// ---------------------------------------------------------------------------
const TXN_SYSTEM_ACCOUNTS = [
  {
    accountCode: 'MEMBER-SAVINGS-LIABILITY',
    accountName: 'Member Savings Liability',
    accountType: 'LIABILITY',
    nature: 'CREDIT',
    description: 'Aggregate liability owed to members for their savings balances.',
  },
  {
    accountCode: 'CASH-IN-HAND',
    accountName: 'Cash in Hand',
    accountType: 'ASSET',
    nature: 'DEBIT',
    isCash: true,
    description: 'Physical cash held by the Somiti (drawer / petty / main cash).',
  },
  {
    accountCode: 'BANK-ACCOUNTS',
    accountName: 'Bank Accounts',
    accountType: 'ASSET',
    nature: 'DEBIT',
    isBank: true,
    description: 'Parent grouping for all operating bank accounts.',
  },
  {
    accountCode: 'MOBILE-WALLETS',
    accountName: 'Mobile Wallets (bKash/Nagad/Rocket)',
    accountType: 'ASSET',
    nature: 'DEBIT',
    description: 'Parent grouping for mobile-wallet business accounts.',
  },
  {
    accountCode: 'PROFIT-PAYABLE',
    accountName: 'Profit / Income Payable',
    accountType: 'LIABILITY',
    nature: 'CREDIT',
    description: 'Profit/income calculated for distribution but not yet credited to members.',
  },
  {
    accountCode: 'INCOME-PROFIT-INTEREST',
    accountName: 'Profit & Interest Income',
    accountType: 'INCOME',
    nature: 'CREDIT',
    description: 'Project profit, bank interest, investment income, dividends.',
  },
  {
    accountCode: 'EXPENSE-RECOVERY-INCOME',
    accountName: 'Expense Recovery Income',
    accountType: 'INCOME',
    nature: 'CREDIT',
    description: 'Charges recovered from members to offset incurred expenses.',
  },
  {
    accountCode: 'OPERATING-EXPENSES',
    accountName: 'Operating Expenses',
    accountType: 'EXPENSE',
    nature: 'DEBIT',
    description: 'Parent grouping for service, bank, annual and admin charges.',
  },
  // ── Loan module accounts (B21) ───────────────────────────────────────
  // LOANS-RECEIVABLE holds the outstanding principal owed by members; it
  // decreases on credit when a loan is written off. EXPENSE-LOAN-WRITEOFF is
  // the P&L loss recognised at the same time.
  {
    accountCode: 'LOANS-RECEIVABLE',
    accountName: 'Loans Receivable (Members)',
    accountType: 'ASSET',
    nature: 'DEBIT',
    description: 'Outstanding principal owed by members on disbursed loans.',
  },
  {
    accountCode: 'EXPENSE-LOAN-WRITEOFF',
    accountName: 'Loan Write-Off Expense',
    accountType: 'EXPENSE',
    nature: 'DEBIT',
    description: 'Loss recognised when a member loan is written off as uncollectible.',
  },
  // ── Investment & Project module accounts ─────────────────────────────
  // Assets (where Somiti money is placed) — nature DEBIT.
  {
    accountCode: 'INVESTMENT-SHARES',
    accountName: 'Investment in Shares / Securities',
    accountType: 'ASSET',
    nature: 'DEBIT',
    description: 'Listed & unlisted shares, mutual funds, bonds.',
  },
  {
    accountCode: 'INVESTMENT-FDR',
    accountName: 'Fixed Deposit Investments',
    accountType: 'ASSET',
    nature: 'DEBIT',
    description: 'Bank / NBFI fixed deposits.',
  },
  {
    accountCode: 'INVESTMENT-LAND',
    accountName: 'Investment in Land',
    accountType: 'ASSET',
    nature: 'DEBIT',
    description: 'Agricultural / commercial / residential land held as investment.',
  },
  {
    accountCode: 'INVESTMENT-PROPERTY',
    accountName: 'Investment in Property / Building',
    accountType: 'ASSET',
    nature: 'DEBIT',
    description: 'Commercial / residential property held as investment.',
  },
  {
    accountCode: 'INVESTMENT-BUSINESS',
    accountName: 'Investment in Businesses',
    accountType: 'ASSET',
    nature: 'DEBIT',
    description: 'Own business / joint venture / subsidiary equity.',
  },
  {
    accountCode: 'INVESTMENT-LOANS',
    accountName: 'Loans to External Parties',
    accountType: 'ASSET',
    nature: 'DEBIT',
    description: 'Loans & advances given to individuals / organisations.',
  },
  {
    accountCode: 'INVESTMENT-OTHER',
    accountName: 'Other Investments',
    accountType: 'ASSET',
    nature: 'DEBIT',
    description: 'Gold / commodity / foreign currency / misc investments.',
  },
  {
    accountCode: 'PROJECT-WIP',
    accountName: 'Construction Work in Progress',
    accountType: 'ASSET',
    nature: 'DEBIT',
    description: 'Project work-in-progress before transfer to a fixed asset.',
  },
  {
    accountCode: 'PROJECT-RECEIVABLES',
    accountName: 'Project Receivables',
    accountType: 'ASSET',
    nature: 'DEBIT',
    description: 'Amounts receivable from project customers (e.g. plot buyers).',
  },
  // Assets — tax receivable (nature DEBIT). Tax already deducted and
  // deposited to NBR by the payer on our behalf; a claim to adjust against
  // future income-tax liability, NOT something we owe.
  {
    accountCode: 'TDS-RECEIVABLE',
    accountName: 'TDS Receivable',
    accountType: 'ASSET',
    nature: 'DEBIT',
    description: 'Tax deducted at source on investment income — claimable against future income-tax liability.',
  },
  // Liabilities — tax payables (nature CREDIT).
  {
    accountCode: 'TDS-PAYABLE',
    accountName: 'TDS Payable',
    accountType: 'LIABILITY',
    nature: 'CREDIT',
    description: 'Tax / VAT collected from project customers, owed to NBR.',
  },
  {
    accountCode: 'CGT-PAYABLE',
    accountName: 'Capital Gains Tax Payable',
    accountType: 'LIABILITY',
    nature: 'CREDIT',
    description: 'Capital gains tax on investment disposals, owed to NBR.',
  },
  // Income (nature CREDIT).
  {
    accountCode: 'INCOME-DIVIDEND',
    accountName: 'Dividend Income',
    accountType: 'INCOME',
    nature: 'CREDIT',
    description: 'Dividends received from shares / mutual funds.',
  },
  {
    accountCode: 'INCOME-INTEREST',
    accountName: 'Interest Income (FDR)',
    accountType: 'INCOME',
    nature: 'CREDIT',
    description: 'Interest earned on fixed deposits & loans.',
  },
  {
    accountCode: 'INCOME-RENTAL',
    accountName: 'Rental Income',
    accountType: 'INCOME',
    nature: 'CREDIT',
    description: 'Rent received from investment property.',
  },
  {
    accountCode: 'INCOME-CAPITAL-GAIN',
    accountName: 'Capital Gain Income',
    accountType: 'INCOME',
    nature: 'CREDIT',
    description: 'Realised capital gains on investment disposals.',
  },
  {
    accountCode: 'INCOME-PROFIT-SHARE',
    accountName: 'Profit Share from Business',
    accountType: 'INCOME',
    nature: 'CREDIT',
    description: 'Profit share from invested businesses / joint ventures.',
  },
  {
    accountCode: 'INCOME-PROJECT-REVENUE',
    accountName: 'Project Revenue',
    accountType: 'INCOME',
    nature: 'CREDIT',
    description: 'Plot / product / service / rental revenue from projects.',
  },
  // Expenses (nature DEBIT).
  {
    accountCode: 'EXPENSE-BROKERAGE',
    accountName: 'Brokerage / Commission',
    accountType: 'EXPENSE',
    nature: 'DEBIT',
    description: 'Brokerage, commission, and fees on investment purchases.',
  },
  {
    accountCode: 'EXPENSE-REGISTRATION',
    accountName: 'Land Registration & Stamp Expense',
    accountType: 'EXPENSE',
    nature: 'DEBIT',
    description: 'Registration cost & stamp duty on land/property acquisition.',
  },
  {
    accountCode: 'EXPENSE-CAPITAL-LOSS',
    accountName: 'Capital Loss Expense',
    accountType: 'EXPENSE',
    nature: 'DEBIT',
    description: 'Realised capital losses on investment disposals.',
  },
  {
    accountCode: 'EXPENSE-INVESTMENT-WRITEOFF',
    accountName: 'Investment Write-Off',
    accountType: 'EXPENSE',
    nature: 'DEBIT',
    description: 'Bad-investment write-offs.',
  },
  {
    accountCode: 'EXPENSE-PROJECT',
    accountName: 'Project Expenses',
    accountType: 'EXPENSE',
    nature: 'DEBIT',
    description: 'All project costs (cost centre recorded on the voucher memo).',
  },
];

// ---------------------------------------------------------------------------
// Default Investment Type master (spec §1.1). Each maps to its asset CoA code
// and lists the sub-categories shown in the dynamic form dropdown.
// ---------------------------------------------------------------------------
const DEFAULT_INVESTMENT_TYPES = [
  { name: 'Stock / Shares', slug: 'stock-shares', subCategories: ['Listed', 'Unlisted'], assetCode: 'INVESTMENT-SHARES', sortOrder: 1 },
  { name: 'Fixed Deposit (FDR)', slug: 'fixed-deposit', subCategories: ['Bank FDR', 'NBFI'], assetCode: 'INVESTMENT-FDR', sortOrder: 2 },
  { name: 'Land', slug: 'land', subCategories: ['Agricultural', 'Commercial', 'Residential'], assetCode: 'INVESTMENT-LAND', sortOrder: 3 },
  { name: 'Building / Property', slug: 'building-property', subCategories: ['Commercial', 'Residential'], assetCode: 'INVESTMENT-PROPERTY', sortOrder: 4 },
  { name: 'Business Equity', slug: 'business-equity', subCategories: ['Own Business', 'Joint Venture', 'Subsidiary'], assetCode: 'INVESTMENT-BUSINESS', sortOrder: 5 },
  { name: 'Mutual Fund / Bond', slug: 'mutual-fund-bond', subCategories: ['Govt Bond', 'Corporate Bond', 'Mutual Fund'], assetCode: 'INVESTMENT-SHARES', sortOrder: 6 },
  { name: 'Loan to External Party', slug: 'loan-external', subCategories: ['Individual', 'Organization'], assetCode: 'INVESTMENT-LOANS', sortOrder: 7 },
  { name: 'Gold / Commodity', slug: 'gold-commodity', subCategories: [], assetCode: 'INVESTMENT-OTHER', sortOrder: 8 },
  { name: 'Foreign Currency', slug: 'foreign-currency', subCategories: [], assetCode: 'INVESTMENT-OTHER', sortOrder: 9 },
  { name: 'Other', slug: 'other', subCategories: [], assetCode: 'INVESTMENT-OTHER', sortOrder: 10 },
];

async function main() {
  // --- 1. Bootstrap Super Admin ---------------------------------------------
  // D14: bcrypt rounds bumped from 10 → 12 for stronger password hashing.
  const hashedPassword = await bcrypt.hash('Admin@123', 12);
  await prisma.user.upsert({
    where: { email: 'admin@foundation.com' },
    update: { role: 'SUPER_ADMIN' },
    create: {
      email: 'admin@foundation.com',
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      name: 'System Administrator',
    },
  });

  // --- 2. Ensure Counter rows exist -----------------------------------------
  await prisma.counter.upsert({
    where: { id: 'transaction' },
    update: {},
    create: { id: 'transaction', value: 0 },
  });

  // --- 3. Seed default Approval Limits (spec §13) ---------------------------
  // Replace any existing rows with the canonical 3-tier configuration.
  const existingLimits = await prisma.approvalLimit.count();
  if (existingLimits === 0) {
    await prisma.approvalLimit.createMany({
      data: [
        {
          level: 1,
          label: 'Branch Manager',
          role: 'ADMIN',
          minAmount: 0,
          maxAmount: 50000,
          isActive: true,
        },
        {
          level: 2,
          label: 'Regional Manager',
          role: 'ADMIN',
          permission: 'TRANSACTION_APPROVE',
          minAmount: 50000.01,
          maxAmount: 500000,
          isActive: true,
        },
        {
          level: 3,
          label: 'Super Admin / Executive Committee',
          role: 'SUPER_ADMIN',
          minAmount: 500000.01,
          maxAmount: 9999999999,
          isActive: true,
        },
      ],
    });
  }

  // --- 4. Ensure system Chart-of-Accounts entries exist ---------------------
  for (const acc of TXN_SYSTEM_ACCOUNTS) {
    const exists = await prisma.account.findUnique({
      where: { accountCode: acc.accountCode },
      select: { id: true },
    });
    if (!exists) {
      await prisma.account.create({
        data: {
          accountCode: acc.accountCode,
          accountName: acc.accountName,
          accountType: acc.accountType,
          nature: acc.nature,
          description: acc.description,
          isBank: !!acc.isBank,
          isCash: !!acc.isCash,
          allowPosting: true,
          allowJournal: true,
          status: 'ACTIVE',
        },
      });
    }
  }

  // --- 4b. Ensure default Investment Type master rows exist -----------------
  for (const t of DEFAULT_INVESTMENT_TYPES) {
    await prisma.investmentType.upsert({
      where: { slug: t.slug },
      update: { assetAccountCode: t.assetAccountCode, subCategories: t.subCategories, sortOrder: t.sortOrder, isSystem: true },
      create: {
        name: t.name,
        slug: t.slug,
        subCategories: t.subCategories,
        assetAccountCode: t.assetCode,
        isActive: true,
        isSystem: true,
        sortOrder: t.sortOrder,
      },
    });
  }

  // --- 5. Seed default Mail/SMS message templates ----------------------------
  // Mirrors SEED_TEMPLATES in lib/templates.ts (the runtime source of truth).
  // Only inserts missing rows; existing templates are never overwritten.
  const DEFAULT_TEMPLATES = [
    {
      channel: 'EMAIL', key: 'MEMBER_WELCOME', name: 'Member Welcome',
      subject: 'Membership Approved! Welcome to the Portal',
      variables: 'memberName, username, tempPassword, loginUrl',
      body: '<p>Dear {{memberName}},</p><p>Your membership has been approved. Member ID: <strong>{{username}}</strong></p><p>Username: {{username}}<br/>Temporary Password: {{tempPassword}}<br/>Login URL: {{loginUrl}}</p>',
    },
    {
      channel: 'EMAIL', key: 'PASSWORD_RESET', name: 'Password Reset',
      subject: 'Password Reset Request', variables: 'memberName, resetUrl',
      body: '<p>Dear {{memberName}},</p><p>Reset your password: <a href="{{resetUrl}}">{{resetUrl}}</a></p>',
    },
    {
      channel: 'EMAIL', key: 'DEPOSIT_RECEIVED', name: 'Deposit Received',
      subject: 'Deposit Received — ৳{{amount}}', variables: 'memberName, amount, balance, transactionId',
      body: '<p>Hello {{memberName}},</p><p>Your deposit of <strong>৳{{amount}}</strong> has been received. Transaction ID: {{transactionId}}. Balance: ৳{{balance}}</p>',
    },
    {
      channel: 'EMAIL', key: 'DEPOSIT_REQUEST_RECEIVED', name: 'Deposit Request Received',
      subject: 'Deposit Request Received — ৳{{amount}} (pending approval)', variables: 'memberName, amount, method, referenceNo, transactionDate, voucherNo',
      body: '<p>Dear {{memberName}},</p><p>We\'ve received your deposit request of <strong>৳{{amount}}</strong> via {{method}}.</p><p>Your request is now <strong>pending admin approval</strong>. Once approved, the amount will be credited to your deposit balance and a money receipt will be generated automatically.</p><p><strong>Request details:</strong></p><ul><li>Voucher No: {{voucherNo}}</li><li>Method: {{method}}</li><li>Deposit Date: {{transactionDate}}</li>{{referenceNo}}</ul><p>You can track the status from your portal under <em>My Requests → Deposits</em>.</p><p>Future Savings Foundation</p>',
    },
    {
      channel: 'EMAIL', key: 'DEPOSIT_REQUEST_RETURNED', name: 'Deposit Request Returned for Correction',
      subject: 'Action Needed: Deposit Request Returned — ৳{{amount}}', variables: 'memberName, amount, voucherNo, returnReason',
      body: '<p>Dear {{memberName}},</p><p>Your deposit request of <strong>৳{{amount}}</strong> (voucher {{voucherNo}}) was <strong>returned for correction</strong> by the admin.</p><p><strong>Reason:</strong> {{returnReason}}</p><p>Please log in to your member portal, open <em>Deposit Request</em>, edit the highlighted fields, and resubmit. Your deposit will then go back into the admin approval queue.</p><p>Future Savings Foundation</p>',
    },
    {
      channel: 'EMAIL', key: 'WITHDRAWAL_APPROVED', name: 'Withdrawal Approved',
      subject: 'Withdrawal Approved — ৳{{amount}}', variables: 'memberName, amount, balance, transactionId',
      body: '<p>Hello {{memberName}},</p><p>Your withdrawal of <strong>৳{{amount}}</strong> has been approved. Remaining Balance: ৳{{balance}}</p>',
    },
    {
      channel: 'EMAIL', key: 'LOAN_APPROVED', name: 'Loan Approved',
      subject: 'Loan Approved — ৳{{loanAmount}}', variables: 'memberName, loanAmount',
      body: '<p>Dear {{memberName}},</p><p>Your loan of <strong>৳{{loanAmount}}</strong> has been approved.</p>',
    },
    {
      channel: 'EMAIL', key: 'MEETING_NOTICE', name: 'Meeting Notice',
      subject: 'Meeting Notice — {{meetingTitle}}', variables: 'memberName, meetingTitle, meetingDate, meetingLink, agenda',
      body: '<p>Dear {{memberName}},</p><p>{{meetingTitle}} on {{meetingDate}}. Venue/Link: {{meetingLink}}</p><div>{{agenda}}</div>',
    },
    {
      channel: 'EMAIL', key: 'FINE_NOTICE', name: 'Fine Notice',
      subject: 'Fine Notice', variables: 'memberName, amount, reason',
      body: '<p>Dear {{memberName}},</p><p>A fine of <strong>৳{{amount}}</strong> has been recorded. Reason: {{reason}}</p>',
    },
    {
      channel: 'EMAIL', key: 'PROFIT_DISTRIBUTION', name: 'Profit Distribution',
      subject: 'Profit Distribution — ৳{{amount}}', variables: 'memberName, amount, balance',
      body: '<p>Dear {{memberName}},</p><p>Profit share of <strong>৳{{amount}}</strong> credited. New Balance: ৳{{balance}}</p>',
    },
    {
      channel: 'SMS', key: 'OTP_SMS', name: 'OTP', variables: 'otp',
      body: 'Your verification code is {{otp}}. Do not share it. — Future Savings Foundation',
    },
    {
      channel: 'SMS', key: 'MEMBER_WELCOME_SMS', name: 'Member Welcome', variables: 'memberName, username, tempPassword, loginUrl',
      body: 'Welcome {{memberName}}! Account approved. Member ID: {{username}}, Password: {{tempPassword}}. Login: {{loginUrl}}',
    },
    {
      channel: 'SMS', key: 'DEPOSIT_RECEIVED_SMS', name: 'Deposit Received', variables: 'memberName, amount, balance',
      body: 'Dear {{memberName}}, deposit of ৳{{amount}} received. Balance: ৳{{balance}}. — Future Savings Foundation',
    },
    {
      channel: 'SMS', key: 'DEPOSIT_REQUEST_RECEIVED_SMS', name: 'Deposit Request Received', variables: 'memberName, amount, method, voucherNo',
      body: 'Dear {{memberName}}, deposit request of ৳{{amount}} via {{method}} received. Voucher {{voucherNo}}. Pending admin approval. — Future Savings Foundation',
    },
    {
      channel: 'SMS', key: 'DEPOSIT_REQUEST_RETURNED_SMS', name: 'Deposit Request Returned for Correction', variables: 'memberName, amount, voucherNo',
      body: 'Dear {{memberName}}, your deposit request ৳{{amount}} ({{voucherNo}}) was returned for correction. Please edit & resubmit in your portal. — Future Savings Foundation',
    },
    {
      channel: 'SMS', key: 'WITHDRAWAL_APPROVED_SMS', name: 'Withdrawal Approved', variables: 'memberName, amount, balance',
      body: 'Dear {{memberName}}, withdrawal of ৳{{amount}} approved. Balance: ৳{{balance}}.',
    },
    {
      channel: 'SMS', key: 'LOAN_APPROVED_SMS', name: 'Loan Approved', variables: 'memberName, loanAmount',
      body: 'Dear {{memberName}}, your loan of ৳{{loanAmount}} is approved. — Future Savings Foundation',
    },
    {
      channel: 'SMS', key: 'LOAN_REMINDER_SMS', name: 'Loan Reminder', variables: 'memberName, amount, dueDate',
      body: 'Dear {{memberName}}, your loan installment of ৳{{amount}} is due on {{dueDate}}.',
    },
    {
      channel: 'SMS', key: 'MEETING_NOTICE_SMS', name: 'Meeting Notice', variables: 'meetingTitle, meetingDate, meetingLink',
      body: 'Meeting Notice: {{meetingTitle}} on {{meetingDate}}. Venue/Link: {{meetingLink}}. — Future Savings Foundation',
    },
    {
      channel: 'SMS', key: 'FINE_NOTICE_SMS', name: 'Fine Notice', variables: 'memberName, amount, reason',
      body: 'Dear {{memberName}}, a fine of ৳{{amount}} ({{reason}}) has been recorded.',
    },
    {
      channel: 'SMS', key: 'DUE_REMINDER_SMS', name: 'Due Reminder', variables: 'memberName, amount',
      body: 'Dear {{memberName}}, your due balance is ৳{{amount}}. Please clear it soon.',
    },
    {
      channel: 'SMS', key: 'PASSWORD_RESET_SMS', name: 'Password Reset OTP', variables: 'otp',
      body: 'Your password reset code is {{otp}}. — Future Savings Foundation',
    },
  ];
  for (const tpl of DEFAULT_TEMPLATES) {
    await prisma.messageTemplate.upsert({
      where: { key: tpl.key },
      update: {},
      create: {
        channel: tpl.channel,
        key: tpl.key,
        name: tpl.name,
        subject: tpl.subject || null,
        body: tpl.body,
        variables: tpl.variables,
      },
    });
  }

  // ---------------------------------------------------------------------
  // Task Management module — demo data, only when SEED_TASKS=true.
  // Creates an Executive Committee, grants the demo admin task permissions,
  // and seeds one recurring task + one open task. Keeps the default seed
  // deterministic otherwise.
  // ---------------------------------------------------------------------
  if (process.env.SEED_TASKS === 'true') {
    const adminUser = await prisma.user.findUnique({ where: { email: 'admin@foundation.com' } });
    if (adminUser) {
      // Grant task permissions to the demo admin (idempotent).
      const TASK_PERMS = [
        'TASK_CREATE', 'TASK_VIEW_ALL', 'TASK_ASSIGN', 'TASK_APPROVE', 'TASK_DELETE',
        'TASK_MANAGE_RECURRING', 'COMMITTEE_MANAGE',
      ];
      for (const p of TASK_PERMS) {
        await prisma.userPermission.upsert({
          where: { userId_permission: { userId: adminUser.id, permission: p } },
          update: {},
          create: { userId: adminUser.id, permission: p },
        });
      }
    }

    // Executive Committee (idempotent by name).
    const committee = await prisma.committee.upsert({
      where: { name: 'Executive Committee' },
      update: {},
      create: {
        name: 'Executive Committee',
        description: 'Governing body responsible for strategic decisions and approvals.',
        chairUserId: adminUser?.id ?? null,
        isActive: true,
      },
    });

    // One recurring task + one open one-off task (idempotent by title).
    const existingRecur = await prisma.task.findFirst({ where: { title: 'Monthly financial reconciliation' } });
    if (!existingRecur) {
      const due = new Date();
      due.setDate(due.getDate() + 7);
      await prisma.task.create({
        data: {
          title: 'Monthly financial reconciliation',
          description: 'Reconcile savings, loans, and ledger balances for the period. Review discrepancies and post corrections.',
          status: 'TODO',
          priority: 'HIGH',
          dueDate: due,
          recurrence: 'MONTHLY',
          requiresApproval: true,
          createdBy: 'SEED',
          createdById: adminUser?.id ?? null,
          assignees: { create: [{ assigneeType: 'COMMITTEE', committeeId: committee.id }] },
          checklist: {
            create: [
              { title: 'Reconcile savings ledger', order: 0 },
              { title: 'Reconcile loan balances', order: 1 },
              { title: 'Review discrepancies', order: 2 },
              { title: 'Post corrections', order: 3 },
            ],
          },
          reminders: { create: [{ channel: 'IN_APP', offsetMinutes: -1440 }] },
        },
      });
    }

    const existingOpen = await prisma.task.findFirst({ where: { title: 'Welcome new applicants this week' } });
    if (!existingOpen) {
      const soon = new Date();
      soon.setDate(soon.getDate() + 2);
      await prisma.task.create({
        data: {
          title: 'Welcome new applicants this week',
          description: 'Review pending member applications and complete onboarding for approved members.',
          status: 'IN_PROGRESS',
          priority: 'MEDIUM',
          dueDate: soon,
          recurrence: 'NONE',
          createdBy: 'SEED',
          createdById: adminUser?.id ?? null,
          assignees: adminUser ? { create: [{ assigneeType: 'STAFF', userId: adminUser.id }] } : undefined,
        },
      });
    }

    console.log('Task demo data: committee + 2 tasks seeded (SEED_TASKS=true).');
  }

  console.log('--------------------------------------------------');
  console.log('Seed complete.');
  // D14: never echo the plaintext admin password from the seed script —
  // rotate it after first login instead.
  console.log('Seed admin user created (rotate password after first login)');
  console.log('Approval tiers: 3 (Branch / Regional / Super Admin)');
  console.log('System accounts: ' + TXN_SYSTEM_ACCOUNTS.length + ' ensured');
  console.log('Investment types: ' + DEFAULT_INVESTMENT_TYPES.length + ' ensured');
  console.log('Message templates: ' + DEFAULT_TEMPLATES.length + ' ensured');
  if (process.env.SEED_TASKS === 'true') console.log('Task module  : demo data seeded');
  console.log('--------------------------------------------------');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
