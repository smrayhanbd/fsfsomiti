// Client-safe type mirrors for the Investment & Project modules.
// Mirrors lib/transactions/types.ts conventions — avoid bundling the Prisma
// client into the browser.

// ── Enums (as string-literal unions) ───────────────────────────────────
export type InvestmentStatus =
  | "DRAFT"
  | "ACTIVE"
  | "PARTIALLY_EXITED"
  | "FULLY_EXITED"
  | "MATURED"
  | "SUSPENDED"
  | "WRITTEN_OFF"

export type InvestmentIncomeType =
  | "DIVIDEND"
  | "INTEREST"
  | "RENTAL"
  | "PROFIT_SHARE"
  | "OTHER"

export type InvestmentExitType =
  | "FULL_EXIT"
  | "PARTIAL_EXIT"
  | "MATURED"
  | "WRITTEN_OFF"

export type ValuationMethod = "MARKET" | "GOVT_RATE" | "APPRAISER"

export type ProjectType =
  | "REAL_ESTATE"
  | "BUSINESS_VENTURE"
  | "AGRICULTURE"
  | "INFRASTRUCTURE"
  | "SOCIAL"
  | "SERVICE"
  | "OTHER"

export type ProjectStatus =
  | "PLANNING"
  | "ACTIVE"
  | "ON_HOLD"
  | "COMPLETED"
  | "CANCELLED"

export type ProjectPhase = "PLANNING" | "EXECUTION" | "MONITORING" | "CLOSING"

export type ProjectExpenseCategory =
  | "MATERIAL"
  | "LABOR"
  | "SERVICE"
  | "ASSET"
  | "OTHER"

export type ProjectRevenueType =
  | "PLOT_SALE"
  | "PRODUCT_SALE"
  | "SERVICE"
  | "RENTAL"
  | "OTHER"

export type MilestoneStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "DELAYED"

export type BudgetSource =
  | "SOMITI_FUND"
  | "INVESTMENT"
  | "LOAN"
  | "DONOR"
  | "MIXED"

export type InvestmentLinkType = "FUNDS_PROJECT" | "MANAGES_ASSET"

// Re-use the existing PaymentMethod union (same values stored everywhere).
export type PaymentMethod =
  | "CASH"
  | "BANK_TRANSFER"
  | "CHEQUE"
  | "BKASH"
  | "NAGAD"
  | "ROCKET"

// ── Display labels ─────────────────────────────────────────────────────
export const INVESTMENT_STATUS_LABELS: Record<InvestmentStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  PARTIALLY_EXITED: "Partially Exited",
  FULLY_EXITED: "Fully Exited",
  MATURED: "Matured",
  SUSPENDED: "Suspended",
  WRITTEN_OFF: "Written Off",
}

export const INCOME_TYPE_LABELS: Record<InvestmentIncomeType, string> = {
  DIVIDEND: "Dividend",
  INTEREST: "Interest",
  RENTAL: "Rental Income",
  PROFIT_SHARE: "Profit Share",
  OTHER: "Other",
}

export const EXIT_TYPE_LABELS: Record<InvestmentExitType, string> = {
  FULL_EXIT: "Full Exit",
  PARTIAL_EXIT: "Partial Exit",
  MATURED: "Matured",
  WRITTEN_OFF: "Written Off",
}

export const VALUATION_METHOD_LABELS: Record<ValuationMethod, string> = {
  MARKET: "Market Rate",
  GOVT_RATE: "Government Rate",
  APPRAISER: "Appraiser",
}

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  REAL_ESTATE: "Real Estate Development",
  BUSINESS_VENTURE: "Business Venture",
  AGRICULTURE: "Agricultural Project",
  INFRASTRUCTURE: "Infrastructure",
  SOCIAL: "Social Project",
  SERVICE: "Service Project",
  OTHER: "Other",
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
}

export const PROJECT_PHASE_LABELS: Record<ProjectPhase, string> = {
  PLANNING: "Planning",
  EXECUTION: "Execution",
  MONITORING: "Monitoring",
  CLOSING: "Closing",
}

export const EXPENSE_CATEGORY_LABELS: Record<ProjectExpenseCategory, string> = {
  MATERIAL: "Material",
  LABOR: "Labor",
  SERVICE: "Service",
  ASSET: "Asset",
  OTHER: "Other",
}

export const REVENUE_TYPE_LABELS: Record<ProjectRevenueType, string> = {
  PLOT_SALE: "Plot Sale",
  PRODUCT_SALE: "Product Sale",
  SERVICE: "Service",
  RENTAL: "Rental",
  OTHER: "Other",
}

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  DELAYED: "Delayed",
}

export const BUDGET_SOURCE_LABELS: Record<BudgetSource, string> = {
  SOMITI_FUND: "Somiti Fund",
  INVESTMENT: "Investment",
  LOAN: "Loan",
  DONOR: "Donor",
  MIXED: "Mixed",
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket",
}

// ── Status badge metadata (mirrors STATUS_META shape in transactions/types) ─
export const INVESTMENT_STATUS_META: Record<
  InvestmentStatus,
  { label: string; tone: "blue" | "emerald" | "amber" | "violet" | "crimson" | "gold" | "sky" }
> = {
  DRAFT: { label: "Draft", tone: "sky" },
  ACTIVE: { label: "Active", tone: "emerald" },
  PARTIALLY_EXITED: { label: "Partially Exited", tone: "amber" },
  FULLY_EXITED: { label: "Fully Exited", tone: "violet" },
  MATURED: { label: "Matured", tone: "blue" },
  SUSPENDED: { label: "Suspended", tone: "crimson" },
  WRITTEN_OFF: { label: "Written Off", tone: "gold" },
}

export const PROJECT_STATUS_META: Record<
  ProjectStatus,
  { label: string; tone: "blue" | "emerald" | "amber" | "violet" | "crimson" | "gold" | "sky" }
> = {
  PLANNING: { label: "Planning", tone: "sky" },
  ACTIVE: { label: "Active", tone: "emerald" },
  ON_HOLD: { label: "On Hold", tone: "amber" },
  COMPLETED: { label: "Completed", tone: "blue" },
  CANCELLED: { label: "Cancelled", tone: "crimson" },
}

// ── Investment type-specific field definitions (Section 3 of the form) ─────
// Each type declares the extra fields rendered conditionally. `kind`
// drives the field control. Stored into Investment.details (Json).
export interface TypeFieldDef {
  key: string
  label: string
  kind: "text" | "number" | "date" | "select" | "textarea"
  options?: string[]
  required?: boolean
  group: string
}

// Maps the type slug → its conditional fields. The create/edit form reads
// this to render Section 3 dynamically.
export const INVESTMENT_TYPE_FIELDS: Record<string, TypeFieldDef[]> = {
  "stock-shares": [
    { key: "company", label: "Company / Issuer Name", kind: "text", group: "Stock" },
    { key: "exchange", label: "Stock Exchange", kind: "select", options: ["DSE", "CSE", "Unlisted"], group: "Stock" },
    { key: "isin", label: "ISIN / Symbol", kind: "text", group: "Stock" },
    { key: "numberOfShares", label: "Number of Shares", kind: "number", group: "Stock" },
    { key: "purchasePricePerShare", label: "Purchase Price / Share", kind: "number", group: "Stock" },
    { key: "currentPricePerShare", label: "Current Price / Share", kind: "number", group: "Stock" },
    { key: "broker", label: "Broker Name", kind: "text", group: "Stock" },
    { key: "boAccount", label: "BO Account Number", kind: "text", group: "Stock" },
  ],
  "fixed-deposit": [
    { key: "bankName", label: "Bank / NBFI Name", kind: "text", group: "FDR", required: true },
    { key: "branch", label: "Branch", kind: "text", group: "FDR" },
    { key: "fdrAccountNo", label: "FDR Account Number", kind: "text", group: "FDR" },
    { key: "interestRate", label: "Interest Rate (%)", kind: "number", group: "FDR" },
    { key: "interestType", label: "Interest Type", kind: "select", options: ["Simple", "Compound"], group: "FDR" },
    { key: "interestFrequency", label: "Interest Payment Frequency", kind: "select", options: ["Monthly", "Quarterly", "On Maturity"], group: "FDR" },
    { key: "autoRenewal", label: "Auto-Renewal", kind: "select", options: ["Yes", "No"], group: "FDR" },
  ],
  land: [
    { key: "location", label: "Location / Address", kind: "textarea", group: "Land" },
    { key: "mouzaPlot", label: "Mouza / Plot Number", kind: "text", group: "Land" },
    { key: "area", label: "Land Area", kind: "number", group: "Land" },
    { key: "areaUnit", label: "Area Unit", kind: "select", options: ["Bigha", "Decimal", "Sqft", "Katha"], group: "Land" },
    { key: "registrationCost", label: "Registration Cost (৳)", kind: "number", group: "Land" },
    { key: "stampDuty", label: "Stamp Duty (৳)", kind: "number", group: "Land" },
    { key: "deedNumber", label: "Deed Number", kind: "text", group: "Land" },
    { key: "registrationDate", label: "Registration Date", kind: "date", group: "Land" },
    { key: "valuationMethod", label: "Valuation Method", kind: "select", options: ["Market", "Government Rate", "Appraiser"], group: "Land" },
    { key: "appraiser", label: "Appraiser Name", kind: "text", group: "Land" },
  ],
  "building-property": [
    { key: "location", label: "Location / Address", kind: "textarea", group: "Property" },
    { key: "propertyType", label: "Property Type", kind: "select", options: ["Commercial", "Residential"], group: "Property" },
    { key: "area", label: "Area (Sqft)", kind: "number", group: "Property" },
    { key: "registrationCost", label: "Registration Cost (৳)", kind: "number", group: "Property" },
    { key: "deedNumber", label: "Deed Number", kind: "text", group: "Property" },
    { key: "registrationDate", label: "Registration Date", kind: "date", group: "Property" },
    { key: "valuationMethod", label: "Valuation Method", kind: "select", options: ["Market", "Government Rate", "Appraiser"], group: "Property" },
    { key: "appraiser", label: "Appraiser Name", kind: "text", group: "Property" },
  ],
  "business-equity": [
    { key: "businessName", label: "Business Name", kind: "text", group: "Business", required: true },
    { key: "businessType", label: "Business Type", kind: "select", options: ["Proprietorship", "Partnership", "Limited Company"], group: "Business" },
    { key: "ownershipPct", label: "Ownership %", kind: "number", group: "Business" },
    { key: "tradeLicenseNo", label: "Trade License Number", kind: "text", group: "Business" },
    { key: "tinBin", label: "TIN / BIN", kind: "text", group: "Business" },
    { key: "numberOfShares", label: "Number of Shares / Units", kind: "number", group: "Business" },
    { key: "faceValuePerShare", label: "Face Value / Share", kind: "number", group: "Business" },
  ],
  "loan-external": [
    { key: "borrowerName", label: "Borrower Name", kind: "text", group: "Loan", required: true },
    { key: "borrowerType", label: "Borrower Type", kind: "select", options: ["Individual", "Organization"], group: "Loan" },
    { key: "loanPurpose", label: "Loan Purpose", kind: "text", group: "Loan" },
    { key: "interestRate", label: "Interest Rate (%)", kind: "number", group: "Loan" },
    { key: "repaymentSchedule", label: "Repayment Schedule", kind: "select", options: ["Monthly", "Quarterly", "Bullet"], group: "Loan" },
    { key: "collateral", label: "Collateral", kind: "textarea", group: "Loan" },
  ],
}

// ── Plain serializable row shapes passed to client components ───────────
// (server pages serialize Prisma rows into these before crossing the
// Server→Client boundary; Decimal → number, Date → ISO string.)

export interface AccountOption {
  id: string
  accountCode: string
  accountName: string
  accountType: string
  isCash: boolean
  isBank: boolean
  currentBalance: number
}

export interface InvestmentTypeOption {
  id: string
  name: string
  slug: string
  subCategories: string[]
  assetAccountCode: string
}

export interface InvestmentDocument {
  name: string
  type?: string
  url: string
  date?: string
  notes?: string
}

export interface ProjectDocItem {
  name: string
  type?: string
  url: string
  date?: string
}

export interface TeamMember {
  id: string
  name: string
}
