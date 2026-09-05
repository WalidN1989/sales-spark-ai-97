import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { BellRing, Plus, Search, Wallet } from "lucide-react";
import { listPaymentFollowups } from "@/lib/payments.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HeaderPortal } from "@/components/layout/HeaderPortal";
import {
  CATEGORY_META,
  STATUS_META,
  CATEGORY_OPTIONS,
  fmtAmount,
  fmtDubaiDate,
  shortAgo,
  dubaiWeekStartISO,
} from "@/lib/payments-ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/payments/")({
  head: () => ({ meta: [{ title: "Payment Follow-up — Sales Insights" }] }),
  component: PaymentsList,
});

type Item = {
  id: string;
  company_name: string;
  category: string;
  reference: string | null;
  title: string;
  amount_aed: number | null;
  currency: string;
  due_date: string | null;
  status: string;
  priority: string;
  last_activity_at: string | null;
};

const OPEN_STATUSES = new Set(["open", "waiting", "partially_resolved"]);

function PaymentsList() {
  const navigate = useNavigate();
  const listFn = useServerFn(listPaymentFollowups);
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["payment-followups"],
    queryFn: () => listFn() as unknown as Promise<Item[]>,
  });

  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [showResolved, setShowResolved] = useState(false);
  const [needsReminder, setNeedsReminder] = useState(false);

  const weekStart = useMemo(() => dubaiWeekStartISO(), []);
  const staleCount = useMemo(
    () =>
      items.filter(
        (i) => OPEN_STATUSES.has(i.status) && (!i.last_activity_at || i.last_activity_at < weekStart),
      ).length,
    [items, weekStart],
  );

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return items.filter((i) => {
      if (!showResolved && (i.status === "resolved" || i.status === "cancelled")) return false;
      if (category !== "all" && i.category !== category) return false;
      if (needsReminder && !(OPEN_STATUSES.has(i.status) && (!i.last_activity_at || i.last_activity_at < weekStart)))
        return false;
      if (n) {
        const hay = [i.company_name, i.reference, i.title, CATEGORY_META[i.category]?.label]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(n)) return false;
      }
      return true;
    });
  }, [items, q, category, showResolved, needsReminder, weekStart]);

  const totalOpen = useMemo(
    () => rows.filter((i) => OPEN_STATUSES.has(i.status)).reduce((a, i) => a + (i.amount_aed ?? 0), 0),
    [rows],
  );

  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] min-w-0 flex-col md:-m-6 md:h-[calc(100%+3rem)]">
      <HeaderPortal>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight">
            <Wallet className="h-5 w-5 text-primary" /> Payment Follow-up
          </h1>
          <span className="shrink-0 text-xs text-muted-foreground">{rows.length}</span>
          <div className="relative ml-2 w-56 max-w-full">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company, ref…" className="h-8 pl-7 text-[13px]" />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Button size="sm" className="h-8 text-xs" onClick={() => navigate({ to: "/app/payments/new" })}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New Item
            </Button>
          </div>
        </div>
      </HeaderPortal>

      {/* Filter chips */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-2">
        <button
          type="button"
          onClick={() => setCategory("all")}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            category === "all" ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
          )}
        >
          All
        </button>
        {CATEGORY_OPTIONS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(category === c ? "all" : c)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              CATEGORY_META[c].className,
              category === c && "ring-2 ring-primary ring-offset-1",
            )}
          >
            {CATEGORY_META[c].label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          onClick={() => setNeedsReminder((v) => !v)}
          className={cn(
            "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            needsReminder
              ? "border-rose-300 bg-rose-500 text-white"
              : staleCount > 0
                ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400"
                : "text-muted-foreground hover:bg-accent",
          )}
          title="Open items with no activity since Monday 10:00 (Dubai)"
        >
          <BellRing className="h-3 w-3" /> Needs reminder {staleCount}
        </button>
        <label className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          Show resolved
        </label>
        {totalOpen > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            Open value: <span className="font-semibold text-foreground">{fmtAmount(totalOpen)}</span>
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-card">
        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No follow-up items match.</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 border-b bg-card text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Company / Item</th>
                <th className="px-3 py-2 text-left font-semibold">Category</th>
                <th className="px-3 py-2 text-left font-semibold">Ref</th>
                <th className="px-3 py-2 text-right font-semibold">Amount</th>
                <th className="px-3 py-2 text-left font-semibold">Due</th>
                <th className="px-3 py-2 text-left font-semibold">Last activity</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const cm = CATEGORY_META[i.category];
                const sm = STATUS_META[i.status] ?? STATUS_META.open;
                const stale = OPEN_STATUSES.has(i.status) && (!i.last_activity_at || i.last_activity_at < weekStart);
                return (
                  <tr
                    key={i.id}
                    onClick={() => navigate({ to: "/app/payments/$id", params: { id: i.id } })}
                    className="cursor-pointer border-b border-border/50 hover:bg-accent/40"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 font-medium">
                        {i.company_name}
                        {i.priority === "high" && <span className="rounded bg-rose-100 px-1 text-[9px] font-bold uppercase text-rose-700">High</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">{i.title}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", cm?.className)}>{cm?.label ?? i.category}</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{i.reference ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtAmount(i.amount_aed, i.currency)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{fmtDubaiDate(i.due_date)}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn(stale ? "font-semibold text-rose-600" : "text-muted-foreground")}>
                        {shortAgo(i.last_activity_at)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", sm.className)}>{sm.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
