-- Seed the new message templates for the deposit-request workflow.
-- Idempotent: each INSERT ... ON CONFLICT (key) DO NOTHING so re-running the
-- migration (or running it on a DB that already has the templates from a
-- fresh `prisma seed`) is a no-op. The application layer (lib/templates.ts
-- `renderTemplate`) falls back to inline defaults if a template is missing,
-- so absence is non-fatal — but seeding them lets admins edit the copy from
-- the Mail/SMS settings UI.

-- Email: Deposit Request Received (sent to member at submission time).
INSERT INTO "MessageTemplate" (id, "channel", key, name, subject, body, variables)
VALUES (
  'seed-deposit-request-received-email',
  'EMAIL',
  'DEPOSIT_REQUEST_RECEIVED',
  'Deposit Request Received',
  'Deposit Request Received — ৳{{amount}} (pending approval)',
  '<p>Dear {{memberName}},</p><p>We''ve received your deposit request of <strong>৳{{amount}}</strong> via {{method}}.</p><p>Your request is now <strong>pending admin approval</strong>. Once approved, the amount will be credited to your deposit balance and a money receipt will be generated automatically.</p><p><strong>Request details:</strong></p><ul><li>Voucher No: {{voucherNo}}</li><li>Method: {{method}}</li><li>Deposit Date: {{transactionDate}}</li>{{referenceNo}}</ul><p>You can track the status from your portal under <em>My Requests → Deposits</em>.</p><p>Future Savings Foundation</p>',
  'memberName, amount, method, referenceNo, transactionDate, voucherNo'
)
ON CONFLICT (key) DO NOTHING;

-- Email: Deposit Request Returned for Correction (sent to member when admin
-- returns a member-submitted deposit transaction).
INSERT INTO "MessageTemplate" (id, "channel", key, name, subject, body, variables)
VALUES (
  'seed-deposit-request-returned-email',
  'EMAIL',
  'DEPOSIT_REQUEST_RETURNED',
  'Deposit Request Returned for Correction',
  'Action Needed: Deposit Request Returned — ৳{{amount}}',
  '<p>Dear {{memberName}},</p><p>Your deposit request of <strong>৳{{amount}}</strong> (voucher {{voucherNo}}) was <strong>returned for correction</strong> by the admin.</p><p><strong>Reason:</strong> {{returnReason}}</p><p>Please log in to your member portal, open <em>Deposit Request</em>, edit the highlighted fields, and resubmit. Your deposit will then go back into the admin approval queue.</p><p>Future Savings Foundation</p>',
  'memberName, amount, voucherNo, returnReason'
)
ON CONFLICT (key) DO NOTHING;

-- SMS: Deposit Request Received (short confirmation at submission time).
INSERT INTO "MessageTemplate" (id, "channel", key, name, body, variables)
VALUES (
  'seed-deposit-request-received-sms',
  'SMS',
  'DEPOSIT_REQUEST_RECEIVED_SMS',
  'Deposit Request Received',
  'Dear {{memberName}}, deposit request of ৳{{amount}} via {{method}} received. Voucher {{voucherNo}}. Pending admin approval. — Future Savings Foundation',
  'memberName, amount, method, voucherNo'
)
ON CONFLICT (key) DO NOTHING;

-- SMS: Deposit Request Returned for Correction.
INSERT INTO "MessageTemplate" (id, "channel", key, name, body, variables)
VALUES (
  'seed-deposit-request-returned-sms',
  'SMS',
  'DEPOSIT_REQUEST_RETURNED_SMS',
  'Deposit Request Returned for Correction',
  'Dear {{memberName}}, your deposit request ৳{{amount}} ({{voucherNo}}) was returned for correction. Please edit & resubmit in your portal. — Future Savings Foundation',
  'memberName, amount, voucherNo'
)
ON CONFLICT (key) DO NOTHING;
