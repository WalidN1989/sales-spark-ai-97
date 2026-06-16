import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(since: string | null | undefined): { label: string; days: number } | null {
  if (!since) return null;
  const ms = Date.now() - new Date(since).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60_000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  if (months >= 1) return { label: `${months}mo`, days };
  if (weeks >= 1) return { label: `${weeks}w ${days - weeks * 7}d`.trim(), days };
  if (days >= 1) return { label: `${days}d ${hrs - days * 24}h`.trim(), days };
  if (hrs >= 1) return { label: `${hrs}h ${mins - hrs * 60}m`.trim(), days };
  if (mins >= 1) return { label: `${mins}m`, days };
  return { label: "just now", days };
}

function colorFor(days: number): string {
  if (days < 2) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (days < 7) return "bg-amber-100 text-amber-700 border-amber-200";
  if (days < 30) return "bg-orange-100 text-orange-700 border-orange-200";
  return "bg-rose-100 text-rose-700 border-rose-200";
}

export function StaleBadge({
  since,
  className,
  prefix = "",
}: {
  since: string | null | undefined;
  className?: string;
  prefix?: string;
}) {
  const f = fmt(since);
  if (!f) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 border-slate-200",
          className,
        )}
        title="No activity yet"
      >
        <Clock className="h-2.5 w-2.5" /> new
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap",
        colorFor(f.days),
        className,
      )}
      title={since ? `Last activity: ${new Date(since).toLocaleString()}` : undefined}
    >
      <Clock className="h-2.5 w-2.5" />
      {prefix}
      {f.label}
    </span>
  );
}
