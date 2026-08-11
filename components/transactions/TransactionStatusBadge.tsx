import { Badge } from "@/components/ui/badge"
import { STATUS_META, type TransactionStatus } from "@/lib/transactions/types"

export function TransactionStatusBadge({ status }: { status: TransactionStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.DRAFT
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold border ${meta.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </Badge>
  )
}
