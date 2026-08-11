/**
 * OpenAPI spec builder (Roadmap item 28).
 *
 * Hand-rolled to avoid adding the `@asteasolutions/zod-to-openapi` dependency —
 * this is a small API surface (~15 routes) and the schemas are simple. If the
 * API grows beyond 30 routes, consider migrating to the auto-generation library.
 *
 * The spec is served at `/api/openapi.json` and browsed at `/api/docs` via
 * Stoplight Elements (loaded from CDN).
 */

interface OpenApiSpec {
  openapi: string
  info: { title: string; version: string; description?: string }
  servers?: Array<{ url: string; description?: string }>
  paths: Record<string, Record<string, unknown>>
  components?: { schemas: Record<string, unknown> }
}

const SPEC: OpenApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Somiti MS Portal API",
    version: "1.0.0",
    description:
      "Member-portal + admin API for the Somiti MS savings/loan co-operative platform. " +
      "Authentication uses NextAuth (JWT in cookies). All routes require auth unless noted.",
  },
  servers: [
    { url: "/", description: "Same-origin (default)" },
  ],
  paths: {
    "/api/health": {
      get: {
        summary: "Health check",
        description: "Returns service status + DB ping. No auth required.",
        responses: {
          "200": {
            description: "Service healthy",
            content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, db: { type: "string" }, time: { type: "string" }, version: { type: "string" } } } } },
          },
          "503": { description: "Service unavailable (DB down or config incomplete)" },
        },
      },
    },
    "/api/members/{id}/print-form": {
      get: {
        summary: "Member KYC form PDF",
        description: "Returns a PDF with full KYC details (NID, photo, signature, nominee). Member-self or admin only.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "PDF binary", content: { "application/pdf": {} } },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden (not self / not admin)" },
          "404": { description: "Member not found" },
        },
      },
    },
    "/api/members/{id}/id-card": {
      get: {
        summary: "Membership ID card PDF",
        description: "Returns a printable ID card PDF with QR code. Member-self or admin only.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "PDF binary", content: { "application/pdf": {} } },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
        },
      },
    },
    "/api/members/{id}/data-export": {
      get: {
        summary: "GDPR data export",
        description: "Returns a JSON zip of every row linked to the member (Member, Savings, Transactions, Loans, etc.). Member-self or admin only.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "JSON export", content: { "application/json": {} } },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
        },
      },
    },
    "/api/payments/bkash/create": {
      post: {
        summary: "Create bKash payment",
        description: "Initiates a bKash tokenized-checkout payment. Returns a redirect URL.",
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { amount: { type: "number" }, memberId: { type: "string" }, description: { type: "string" } }, required: ["amount", "memberId"] } } },
        },
        responses: {
          "200": { description: "Payment created", content: { "application/json": { schema: { type: "object", properties: { paymentID: { type: "string" }, bkashURL: { type: "string" } } } } } },
          "401": { description: "Unauthorized" },
          "503": { description: "bKash not configured (BKASH_APP_KEY unset)" },
        },
      },
    },
    "/api/payments/bkash/callback": {
      get: {
        summary: "bKash payment callback",
        description: "bKash redirects here after user pays. Confirms payment and creates a Transaction.",
        parameters: [
          { name: "paymentID", in: "query", required: true, schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "302": { description: "Redirect to /portal/deposit?status=success|failed" },
        },
      },
    },
    "/api/payments/nagad/create": {
      post: {
        summary: "Create Nagad payment",
        description: "Initiates a Nagad checkout. Returns a redirect URL.",
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { amount: { type: "number" }, memberId: { type: "string" } }, required: ["amount", "memberId"] } } },
        },
        responses: {
          "200": { description: "Payment created", content: { "application/json": { schema: { type: "object", properties: { callBackUrl: { type: "string" }, paymentRefId: { type: "string" } } } } } },
          "503": { description: "Nagad not configured" },
        },
      },
    },
    "/api/payments/nagad/callback": {
      get: { summary: "Nagad payment callback", responses: { "302": { description: "Redirect to success/failure page" } } },
    },
    "/api/portal/statement/ledger": {
      get: {
        summary: "Member ledger statement",
        description: "Returns the member's savings + transaction ledger with totals. Member-self only.",
        parameters: [
          { name: "from", in: "query", schema: { type: "string", format: "date" } },
          { name: "to", in: "query", schema: { type: "string", format: "date" } },
        ],
        responses: {
          "200": { description: "Ledger statement", content: { "application/json": {} } },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/api/portal/transactions/{id}/receipt": {
      get: {
        summary: "Money receipt PDF",
        description: "Returns a money receipt PDF for a specific transaction. Member-self only.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "PDF binary", content: { "application/pdf": {} } },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden (not owner)" },
        },
      },
    },
    "/api/financial-year/close": {
      post: {
        summary: "Close financial year",
        description: "Posts year-end P&L → Retained-Earnings voucher + locks the year. Admin only.",
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { yearId: { type: "string" } }, required: ["yearId"] } } } },
        responses: {
          "200": { description: "Year closed", content: { "application/json": { schema: { type: "object", properties: { journalEntryId: { type: "string" }, netIncome: { type: "number" } } } } } },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden (not admin)" },
        },
      },
    },
    "/api/loans/npl-scan": {
      post: {
        summary: "NPL scan",
        description: "Scans all active loans for days-past-due and flags NPL buckets. CRON_SECRET or admin.",
        responses: {
          "200": { description: "Scan complete", content: { "application/json": { schema: { type: "object", properties: { scanned: { type: "number" }, flagged: { type: "number" } } } } } },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/api/loans/late-fee": {
      post: {
        summary: "Late-fee accrual",
        description: "Accrues late-payment interest on overdue loan installments. CRON_SECRET or admin.",
        responses: {
          "200": { description: "Accrual complete", content: { "application/json": { schema: { type: "object", properties: { scanned: { type: "number" }, accrued: { type: "number" }, totalAmount: { type: "number" } } } } } },
        },
      },
    },
    "/api/messages/retry": {
      post: {
        summary: "Retry failed messages",
        description: "Retries SMS/email deliveries in RETRYING status. CRON_SECRET only.",
        responses: {
          "200": { description: "Retry pass complete", content: { "application/json": { schema: { type: "object", properties: { retried: { type: "number" }, succeeded: { type: "number" } } } } } },
        },
      },
    },
    "/api/backup/run": {
      post: {
        summary: "Trigger backup",
        description: "Creates a database backup and uploads to S3 if configured. CRON_SECRET only.",
        responses: {
          "200": { description: "Backup created", content: { "application/json": { schema: { type: "object", properties: { backupId: { type: "string" }, storageUrl: { type: "string" } } } } } },
        },
      },
    },
    "/api/backup/{id}/restore": {
      post: {
        summary: "Restore a backup",
        description: "Destructive — replaces every row in every backed-up table with the backup's contents. SUPER_ADMIN only. Runs inside a single transaction.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { confirmFilename: { type: "string", description: "Must match the backup's filename to proceed" } } } } },
        },
        responses: {
          "200": {
            description: "Restore complete",
            content: { "application/json": { schema: { type: "object", properties: {
              ok: { type: "boolean" },
              result: {
                type: "object",
                properties: {
                  tableCount: { type: "number" },
                  rowCount: { type: "number" },
                  durationMs: { type: "number" },
                  skippedTables: { type: "array", items: { type: "string" } },
                  warnings: { type: "array", items: { type: "string" } },
                },
              },
            } } } },
          },
          "400": { description: "Bad request (filename mismatch, file missing, etc.)" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden (not SUPER_ADMIN)" },
        },
      },
    },
    "/api/inngest": {
      get: { summary: "Inngest webhook", description: "Inngest invokes this endpoint to dispatch jobs.", responses: { "200": { description: "OK" }, "503": { description: "Inngest not configured" } } },
      post: { summary: "Inngest webhook (POST)", responses: { "200": { description: "OK" } } },
    },
  },
}

export function getSpec(): OpenApiSpec {
  return SPEC
}
