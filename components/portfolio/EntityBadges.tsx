"use client"

// Lightweight status badges for the Investment & Project modules. Maps the
// new enum values onto the existing StatusBadge tones (success/debit/warning/
// info/neutral) so they share the app's visual language.

import StatusBadge from "@/components/somiti/StatusBadge"
import {
  INVESTMENT_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  type InvestmentStatus,
  type ProjectStatus,
} from "@/lib/portfolio/types"

const INVESTMENT_TONE: Record<InvestmentStatus, "success" | "debit" | "warning" | "info" | "neutral"> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  PARTIALLY_EXITED: "warning",
  FULLY_EXITED: "info",
  MATURED: "info",
  SUSPENDED: "warning",
  WRITTEN_OFF: "debit",
}

const PROJECT_TONE: Record<ProjectStatus, "success" | "debit" | "warning" | "info" | "neutral"> = {
  PLANNING: "info",
  ACTIVE: "success",
  ON_HOLD: "warning",
  COMPLETED: "neutral",
  CANCELLED: "debit",
}

export function InvestmentStatusBadge({ status }: { status: InvestmentStatus }) {
  return (
    <StatusBadge tone={INVESTMENT_TONE[status]}>
      {INVESTMENT_STATUS_LABELS[status]}
    </StatusBadge>
  )
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <StatusBadge tone={PROJECT_TONE[status]}>
      {PROJECT_STATUS_LABELS[status]}
    </StatusBadge>
  )
}

// A neutral type-chip badge (e.g. "Stock / Shares", "Real Estate").
export function TypeBadge({ label, tone = "neutral" }: { label: string; tone?: "success" | "debit" | "warning" | "info" | "neutral" }) {
  return (
    <StatusBadge tone={tone}>
      {label}
    </StatusBadge>
  )
}
