import { cn } from "@/lib/utils";
import { LEAD_STATUSES, LEAD_STATUS_STYLES, type LeadStatus } from "@/lib/leads-ui";
import type { CompanyStatus } from "@/lib/utils";

/**
 * The single, unified funnel used everywhere (lead detail, group, prospect, reseller).
 * Canonical stages: HOT · WARM · COLD · FROZEN · DEAD · WON
 */
export type UnifiedStatus = LeadStatus;
export const UNIFIED_STATUSES = LEAD_STATUSES;

/** companies.status only stores hot|warm|cold|won|lost — map both ways. */
export function companyToUnified(s: CompanyStatus | null | undefined): UnifiedStatus {
  if (s === "lost") return "dead";
  return (s ?? "warm") as UnifiedStatus;
}

export function unifiedToCompany(s: UnifiedStatus): CompanyStatus {
  if (s === "frozen") return "cold";
  if (s === "dead") return "lost";
  return s as CompanyStatus;
}

export function StatusFunnel({
  status,
  onChange,
  size = "md",
  className,
}: {
  status: UnifiedStatus;
  onChange: (s: UnifiedStatus) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className={cn("flex rounded-md border bg-background p-0.5", className)}>
      {UNIFIED_STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          title={`Set status: ${s}`}
          className={cn(
            "rounded font-bold uppercase tracking-wider transition-colors",
            size === "sm" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]",
            status === s ? LEAD_STATUS_STYLES[s] : "text-muted-foreground hover:bg-muted",
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
