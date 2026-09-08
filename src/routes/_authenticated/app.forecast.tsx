import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw, Sliders, TrendingUp } from "lucide-react";
import { HeaderPortal } from "@/components/layout/HeaderPortal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listLeads, listTeamMembers, type TeamMember } from "@/lib/leads.functions";
import { fmtMoneyCents } from "@/lib/leads-ui";
import {
  PIPELINE_STAGES,
  STAGE_LABEL,
  STAGE_ORDER,
  STAGE_DOT,
  leadStage,
  type PipelineStage,
} from "@/lib/leads-command";

export const Route = createFileRoute("/_authenticated/app/forecast")({
  head: () => ({ meta: [{ title: "Forecast — Sales Insights" }] }),
  component: ForecastPage,
});

// Default win-probability per stage — the weighting behind the forecast.
// Editable by the manager and persisted in the browser.
const DEFAULT_WEIGHTS: Record<PipelineStage, number> = {
  prospect: 0.1,
  qualified: 0.2,
  meeting: 0.35,
  quotation: 0.5,
  negotiation: 0.7,
  purchase_order: 0.9,
  won: 1,
  lost: 0,
};

const LS_WEIGHTS = "forecast:weights";

// The open (still-forecastable) stages, in order.
const OPEN_STAGES = PIPELINE_STAGES.filter((s) => s !== "won" && s !== "lost");

type RawLead = {
  id: string;
  company_id: string | null;
  prospect_id?: string | null;
  company_name: string | null;
  pipeline_value_cents: number | null;
  pipeline_stage?: string | null;
  status: string;
  assigned_to?: string | null;
  products_services: string[] | null;
  last_activity_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  lead_score?: number | null;
  priority?: string | null;
  companies?: { name?: string | null; product_service?: string | null } | null;
};

type Deal = {
  key: string;
  company: string;
  valueCents: number;
  stage: PipelineStage;
  assignedTo: string | null;
  product: string | null;
  leadId: string;
};

const normName = (n: string | null | undefined) =>
  (n ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function ForecastPage() {
  const listFn = useServerFn(listLeads);
  const membersFn = useServerFn(listTeamMembers);
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: () => listFn() as unknown as Promise<RawLead[]>,
  });
  const { data: members = [] } = useQuery<TeamMember[]>({
    queryKey: ["team-members"],
    queryFn: () => membersFn(),
    staleTime: 60_000,
  });
  const memberName = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of members) m.set(x.id, x.full_name || x.email || "Member");
    return m;
  }, [members]);

  // Editable stage win-rates (persisted in the browser). won=100%, lost=0% fixed.
  const [weights, setWeights] = useState<Record<PipelineStage, number>>(DEFAULT_WEIGHTS);
  const [wLoaded, setWLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_WEIGHTS);
      if (raw) setWeights({ ...DEFAULT_WEIGHTS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    setWLoaded(true);
  }, []);
  useEffect(() => {
    if (wLoaded) {
      try {
        localStorage.setItem(LS_WEIGHTS, JSON.stringify(weights));
      } catch {
        /* ignore */
      }
    }
  }, [weights, wLoaded]);
  const prob = (s: PipelineStage) => (s === "won" ? 1 : s === "lost" ? 0 : weights[s] ?? DEFAULT_WEIGHTS[s]);
  const setStageWeight = (s: PipelineStage, pct: number) =>
    setWeights((w) => ({ ...w, [s]: Math.max(0, Math.min(100, pct)) / 100 }));

  // One deal per company: sum value, take the most-advanced stage.
  const deals = useMemo<Deal[]>(() => {
    const map = new Map<string, Deal>();
    for (const l of leads) {
      const company = l.company_name || l.companies?.name || "—";
      const key = l.company_id || l.prospect_id || normName(company) || l.id;
      const stage = leadStage(l as Parameters<typeof leadStage>[0]);
      const val = l.pipeline_value_cents || 0;
      const product = (l.products_services ?? [])[0] || l.companies?.product_service || null;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          company,
          valueCents: val,
          stage,
          assignedTo: l.assigned_to ?? null,
          product,
          leadId: l.id,
        });
      } else {
        existing.valueCents += val;
        if (STAGE_ORDER[stage] > STAGE_ORDER[existing.stage] && stage !== "lost") existing.stage = stage;
        if (!existing.assignedTo && l.assigned_to) existing.assignedTo = l.assigned_to;
        if (!existing.product && product) existing.product = product;
      }
    }
    return [...map.values()];
  }, [leads]);

  const open = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
  const won = deals.filter((d) => d.stage === "won");

  const openCents = open.reduce((a, d) => a + d.valueCents, 0);
  const weightedCents = open.reduce((a, d) => a + d.valueCents * prob(d.stage), 0);
  const wonCents = won.reduce((a, d) => a + d.valueCents, 0);

  // Funnel per open stage.
  const funnel = useMemo(() => {
    return OPEN_STAGES.map((s) => {
      const items = open.filter((d) => d.stage === s);
      const value = items.reduce((a, d) => a + d.valueCents, 0);
      return { stage: s, count: items.length, value, weighted: value * prob(s) };
    });
  }, [open, weights]);
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));

  // Weighted forecast per rep.
  const byRep = useMemo(() => {
    const m = new Map<string, { name: string; count: number; open: number; weighted: number }>();
    for (const d of open) {
      const id = d.assignedTo ?? "unassigned";
      const name = d.assignedTo ? memberName.get(d.assignedTo) ?? "Member" : "Unassigned";
      const cur = m.get(id) ?? { name, count: 0, open: 0, weighted: 0 };
      cur.count += 1;
      cur.open += d.valueCents;
      cur.weighted += d.valueCents * prob(d.stage);
      m.set(id, cur);
    }
    return [...m.values()].sort((a, b) => b.weighted - a.weighted);
  }, [open, memberName, weights]);

  // Weighted forecast per product (top 6).
  const byProduct = useMemo(() => {
    const m = new Map<string, { count: number; weighted: number }>();
    for (const d of open) {
      const p = d.product || "Unspecified";
      const cur = m.get(p) ?? { count: 0, weighted: 0 };
      cur.count += 1;
      cur.weighted += d.valueCents * prob(d.stage);
      m.set(p, cur);
    }
    return [...m.entries()]
      .map(([product, v]) => ({ product, ...v }))
      .sort((a, b) => b.weighted - a.weighted)
      .slice(0, 6);
  }, [open, weights]);

  const topDeals = useMemo(
    () => [...open].sort((a, b) => b.valueCents - a.valueCents).slice(0, 8),
    [open],
  );

  const tile = (label: string, value: string, sub?: string) => (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-5">
      <HeaderPortal>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight">
            <TrendingUp className="h-5 w-5 text-primary" /> Forecast
          </h1>
          <span className="text-xs text-muted-foreground">{open.length} open deals</span>
          <div className="ml-auto">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  <Sliders className="mr-1 h-3.5 w-3.5" /> Stage weights
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold">Stage win-rates</div>
                  <button
                    type="button"
                    onClick={() => setWeights(DEFAULT_WEIGHTS)}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="h-3 w-3" /> Reset
                  </button>
                </div>
                <p className="mb-2 text-[11px] text-muted-foreground">
                  The probability applied to each stage's value. Won is 100%, Lost 0%.
                </p>
                <div className="space-y-1.5">
                  {OPEN_STAGES.map((s) => (
                    <div key={s} className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT[s]}`} />
                      <span className="flex-1 text-[13px]">{STAGE_LABEL[s]}</span>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={Math.round(prob(s) * 100)}
                        onChange={(e) => setStageWeight(s, Number(e.target.value))}
                        className="h-7 w-16 text-right text-xs"
                      />
                      <span className="w-3 text-xs text-muted-foreground">%</span>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </HeaderPortal>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Crunching the pipeline…</p>
      ) : (
        <>
          {/* Headline tiles */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tile("Open pipeline", fmtMoneyCents(openCents), `${open.length} deals in play`)}
            {tile("Weighted forecast", fmtMoneyCents(weightedCents), "value × stage win-rate")}
            {tile("Won", fmtMoneyCents(wonCents), `${won.length} closed`)}
            {tile(
              "Avg deal (open)",
              fmtMoneyCents(open.length ? Math.round(openCents / open.length) : 0),
              "per company",
            )}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Funnel */}
            <div className="rounded-xl border bg-card p-4">
              <div className="mb-3 text-sm font-semibold">Pipeline by stage</div>
              <div className="space-y-2.5">
                {funnel.map((f) => (
                  <div key={f.stage}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${STAGE_DOT[f.stage]}`} />
                        {STAGE_LABEL[f.stage]}
                        <span className="text-muted-foreground">· {f.count}</span>
                        <span className="text-muted-foreground/70">({Math.round(prob(f.stage) * 100)}%)</span>
                      </span>
                      <span className="tabular-nums font-medium">{fmtMoneyCents(f.value)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={STAGE_DOT[f.stage]}
                        style={{ width: `${(f.value / funnelMax) * 100}%`, height: "100%" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Weighted forecast applies each stage's win-rate to its value.
              </p>
            </div>

            {/* By rep */}
            <div className="rounded-xl border bg-card p-4">
              <div className="mb-3 text-sm font-semibold">Weighted forecast by rep</div>
              {byRep.length === 0 ? (
                <p className="text-xs text-muted-foreground">No open deals yet.</p>
              ) : (
                <table className="w-full text-[13px]">
                  <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="pb-1.5 text-left font-semibold">Rep</th>
                      <th className="pb-1.5 text-right font-semibold">Deals</th>
                      <th className="pb-1.5 text-right font-semibold">Open</th>
                      <th className="pb-1.5 text-right font-semibold">Weighted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byRep.map((r) => (
                      <tr key={r.name} className="border-t border-border/50">
                        <td className="py-1.5">{r.name}</td>
                        <td className="py-1.5 text-right tabular-nums text-muted-foreground">{r.count}</td>
                        <td className="py-1.5 text-right tabular-nums text-muted-foreground">{fmtMoneyCents(r.open)}</td>
                        <td className="py-1.5 text-right tabular-nums font-semibold">{fmtMoneyCents(r.weighted)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Top deals */}
            <div className="rounded-xl border bg-card p-4">
              <div className="mb-3 text-sm font-semibold">Top open deals</div>
              {topDeals.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing with a value yet — add pipeline value to leads.</p>
              ) : (
                <ul className="divide-y">
                  {topDeals.map((d) => (
                    <li key={d.key} className="flex items-center gap-2 py-1.5 text-[13px]">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT[d.stage]}`} />
                      <Link to="/app/leads/$id" params={{ id: d.leadId }} className="min-w-0 flex-1 truncate hover:underline">
                        {d.company}
                      </Link>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{STAGE_LABEL[d.stage]}</span>
                      <span className="w-24 shrink-0 text-right tabular-nums font-medium">{fmtMoneyCents(d.valueCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* By product */}
            <div className="rounded-xl border bg-card p-4">
              <div className="mb-3 text-sm font-semibold">Weighted forecast by product</div>
              {byProduct.length === 0 ? (
                <p className="text-xs text-muted-foreground">No products captured on open leads.</p>
              ) : (
                <ul className="space-y-1.5">
                  {byProduct.map((p) => (
                    <li key={p.product} className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="min-w-0 flex-1 truncate">
                        {p.product} <span className="text-muted-foreground">· {p.count}</span>
                      </span>
                      <span className="shrink-0 tabular-nums font-medium">{fmtMoneyCents(p.weighted)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
