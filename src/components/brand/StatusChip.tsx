import { cn } from "@/lib/cn";
import type { NinStatus } from "@/types/domain";

const LABELS: Record<NinStatus, string> = {
  NOT_SUBMITTED: "Not submitted",
  SUBMITTED: "Submitted",
  VALIDATING: "Validating…",
  VALIDATED: "Validated",
  FAILED: "Failed",
  UPDATED: "Updated",
  MANUAL_REVIEW: "Manual review",
};

const STYLES: Record<NinStatus, string> = {
  NOT_SUBMITTED: "border-border bg-muted text-muted-foreground",
  SUBMITTED: "border-brand-sky/30 bg-brand-sky/10 text-brand-navy",
  VALIDATING: "border-brand-sky/30 bg-brand-sky/10 text-brand-navy",
  VALIDATED: "border-success/30 bg-success/10 text-success",
  UPDATED: "border-success/30 bg-success/10 text-success",
  FAILED: "border-destructive/30 bg-destructive/10 text-destructive",
  MANUAL_REVIEW: "border-warning/30 bg-warning/10 text-warning",
};

export function StatusChip({ status }: { status: NinStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STYLES[status],
      )}
    >
      {LABELS[status]}
    </span>
  );
}
