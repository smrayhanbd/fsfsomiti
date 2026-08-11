/**
 * StatusBadge — semantic, colour-independent status pill.
 *
 * Each tone pairs a coloured dot + label text so status is readable without
 * relying on colour alone (WCAG AA). Use the preset `status` prop for common
 * entity states, or `tone` + children for custom labels.
 */
import React from "react"
import { CheckCircle2, Clock, AlertCircle, UserX, XCircle, ShieldCheck } from "lucide-react"

type Tone = "success" | "debit" | "warning" | "info" | "neutral"

const TONE_STYLES: Record<Tone, { wrap: string; dot: string }> = {
  success: { wrap: "bg-success-soft text-success border border-success", dot: "bg-[var(--status-success)]" },
  debit: { wrap: "bg-debit-soft text-debit border border-debit", dot: "bg-[var(--status-debit)]" },
  warning: { wrap: "bg-warning-soft text-warning border border-warning", dot: "bg-[var(--status-warning)]" },
  info: { wrap: "bg-info-soft text-info border border-info", dot: "bg-[var(--status-info)]" },
  neutral: { wrap: "bg-subtle text-secondary-ink border border-[var(--border-base)]", dot: "bg-[var(--text-muted)]" },
}

const STATUS_PRESETS: Record<string, { tone: Tone; label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  ACTIVE: { tone: "success", label: "Active", Icon: CheckCircle2 },
  PENDING: { tone: "warning", label: "Pending", Icon: Clock },
  APPROVED: { tone: "success", label: "Approved", Icon: CheckCircle2 },
  REJECTED: { tone: "debit", label: "Rejected", Icon: XCircle },
  SUSPENDED: { tone: "warning", label: "Suspended", Icon: AlertCircle },
  INACTIVE: { tone: "neutral", label: "Inactive", Icon: UserX },
  VERIFIED: { tone: "success", label: "Verified", Icon: ShieldCheck },
  COMPLETED: { tone: "success", label: "Completed", Icon: CheckCircle2 },
}

interface StatusBadgeProps {
  status?: string
  tone?: Tone
  children?: React.ReactNode
  className?: string
}

export default function StatusBadge({ status, tone, children, className = "" }: StatusBadgeProps) {
  const preset = status ? STATUS_PRESETS[status] : undefined
  const resolvedTone = tone ?? preset?.tone ?? "neutral"
  const styles = TONE_STYLES[resolvedTone]
  const Icon = preset?.Icon
  const label = children ?? preset?.label ?? status ?? ""

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${styles.wrap} ${className}`}
    >
      {Icon ? (
        <Icon className="h-3 w-3" />
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} aria-hidden="true" />
      )}
      {label}
    </span>
  )
}
