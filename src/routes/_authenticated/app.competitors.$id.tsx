import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Archive, Download, ExternalLink, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  getCompetitorResearch,
  setResearchStatus,
  deleteCompetitorResearch,
} from "@/lib/competitors.functions";
import { Button } from "@/components/ui/button";
import { HeaderPortal, useHideHeaderActions } from "@/components/layout/HeaderPortal";
import {
  CATEGORY_LABEL,
  LEADER_META,
  PRIORITY_META,
  GAP_STATUS_META,
  RESEARCH_STATUS_META,
  fmtDate,
} from "@/lib/competitors-ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/competitors/$id")({
  head: () => ({ meta: [{ title: "Research — Sales Insights" }] }),
  component: ResearchDetail,
});

type Src = { label?: string; url?: string; type?: string };

function ResearchDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  useHideHeaderActions(true);

  const getFn = useServerFn(getCompetitorResearch);
  const statusFn = useServerFn(setResearchStatus);
  const delFn = useServerFn(deleteCompetitorResearch);

  const { data, isLoading } = useQuery({
    queryKey: ["competitor-research", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const setStatus = useMutation({
    mutationFn: (status: "draft" | "published" | "archived") => statusFn({ data: { id, status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competitor-research", id] });
      qc.invalidateQueries({ queryKey: ["competitor-research"] });
      toast.success("Status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: () => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competitor-research"] });
      toast.success("Research deleted");
      navigate({ to: "/app/competitors" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data?.research) return <p className="text-sm text-muted-foreground">Not found.</p>;

  const r = data.research as unknown as Record<string, unknown> & {
    id: string;
    title: string;
    category: string;
    status: string;
    summary: string | null;
    our_product_name: string | null;
    our_product_url: string | null;
    researcher: string | null;
    researched_at: string | null;
    sources: Src[] | null;
    competitor_companies: { name: string; website: string | null } | null;
    competitor_products: { name: string; product_url: string | null } | null;
  };
  const features = data.features as { id: string; capability: string; our_assessment: string | null; their_assessment: string | null; leader: string | null }[];
  const strengths = data.strengths as { id: string; side: string; point: string }[];
  const weaknesses = data.weaknesses as { id: string; side: string; point: string }[];
  const gaps = data.gaps as { id: string; title: string; why_it_hurts: string | null; recommended_action: string | null; priority: string; status: string }[];

  const themName = r.competitor_companies?.name ?? "Competitor";
  const st = RESEARCH_STATUS_META[r.status] ?? RESEARCH_STATUS_META.published;

  const usStrengths = strengths.filter((s) => s.side === "us");
  const themStrengths = strengths.filter((s) => s.side === "them");
  const usWeak = weaknesses.filter((s) => s.side === "us");
  const themWeak = weaknesses.filter((s) => s.side === "them");

  const exportHtml = () => {
    const esc = (s: string | null | undefined) =>
      (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rows = features
      .map(
        (f) =>
          `<tr><td class="dim">${esc(f.capability)}</td><td>${esc(f.our_assessment)}</td><td>${esc(f.their_assessment)}</td><td>${LEADER_META[f.leader ?? "unknown"]?.label ?? "?"}</td></tr>`,
      )
      .join("");
    const li = (items: { point: string }[]) => items.map((i) => `<li>${esc(i.point)}</li>`).join("");
    const gapRows = gaps
      .map(
        (g) =>
          `<tr><td>${esc(g.title)}</td><td>${esc(g.why_it_hurts)}</td><td>${esc(g.recommended_action)}</td><td>${g.priority.toUpperCase()}</td></tr>`,
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.title)}</title>
<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:1000px;margin:32px auto;padding:0 20px;color:#111;line-height:1.5}h1{font-size:1.5rem}h2{margin-top:32px;border-bottom:1px solid #ddd;padding-bottom:6px}table{width:100%;border-collapse:collapse;margin-top:8px;font-size:14px}th,td{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}th{background:#f5f5f5}td.dim{font-weight:600;width:22%}.cols{display:flex;gap:24px}.cols>div{flex:1}.muted{color:#666}</style></head><body>
<h1>${esc(r.title)}</h1>
<p class="muted">${CATEGORY_LABEL[r.category] ?? r.category} · Us: ${esc(r.our_product_name)} · Them: ${esc(themName)} · ${fmtDate(r.researched_at)} · ${esc(r.researcher)}</p>
${r.summary ? `<p><strong>Summary:</strong> ${esc(r.summary)}</p>` : ""}
<h2>Feature matrix</h2><table><thead><tr><th>Capability</th><th>Us</th><th>Them</th><th>Leader</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Strengths</h2><div class="cols"><div><h3>Us</h3><ul>${li(usStrengths)}</ul></div><div><h3>${esc(themName)}</h3><ul>${li(themStrengths)}</ul></div></div>
<h2>Weaknesses</h2><div class="cols"><div><h3>Us</h3><ul>${li(usWeak)}</ul></div><div><h3>${esc(themName)}</h3><ul>${li(themWeak)}</ul></div></div>
<h2>Gaps</h2><table><thead><tr><th>Gap</th><th>Why it hurts</th><th>Action</th><th>Priority</th></tr></thead><tbody>${gapRows}</tbody></table>
</body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${r.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <nav className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
        <Link to="/app/competitors" className="inline-flex items-center hover:text-foreground">
          <ArrowLeft className="mr-1 h-4 w-4" /> Competitor Analysis
        </Link>
        <span>/</span>
        <span className="truncate font-medium text-foreground">{r.title}</span>
        <span className={cn("ml-1 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold", st.className)}>{st.label}</span>
      </nav>
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="ghost" size="sm" onClick={exportHtml}>
          <Download className="mr-1 h-3.5 w-3.5" /> Export HTML
        </Button>
        {r.status !== "archived" ? (
          <Button variant="ghost" size="sm" onClick={() => setStatus.mutate("archived")}>
            <Archive className="mr-1 h-3.5 w-3.5" /> Archive
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setStatus.mutate("published")}>
            <Upload className="mr-1 h-3.5 w-3.5" /> Publish
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive"
          title="Delete research"
          onClick={() => confirm("Delete this research snapshot?") && del.mutate()}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 min-w-0">
      <HeaderPortal>{header}</HeaderPortal>

      {/* Header block */}
      <div className="rounded-xl border bg-card p-4">
        <h1 className="text-xl font-bold tracking-tight">{r.title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="rounded bg-secondary px-2 py-0.5 text-xs">{CATEGORY_LABEL[r.category] ?? r.category}</span>
          {r.our_product_url ? (
            <a href={r.our_product_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-teal-600 hover:underline">
              {r.our_product_name ?? "Our product"} <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span>Us: {r.our_product_name ?? "—"}</span>
          )}
          <span>vs</span>
          {r.competitor_products?.product_url ? (
            <a href={r.competitor_products.product_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-amber-600 hover:underline">
              {themName} <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span>Them: {themName}</span>
          )}
          <span>· {fmtDate(r.researched_at)}</span>
          {r.researcher && <span>· {r.researcher}</span>}
        </div>
        {Array.isArray(r.sources) && r.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {r.sources.filter((s) => s.url).map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {s.label || s.type || "source"} <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        )}
        {r.summary && (
          <div className="mt-3 rounded-lg border-l-4 border-primary bg-muted/40 p-3 text-sm">{r.summary}</div>
        )}
      </div>

      {/* Feature matrix */}
      <Section title="Feature matrix">
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-[13px]">
            <thead className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Capability</th>
                <th className="px-3 py-2 text-left font-semibold">Us</th>
                <th className="px-3 py-2 text-left font-semibold">{themName}</th>
                <th className="px-3 py-2 text-left font-semibold">Leader</th>
              </tr>
            </thead>
            <tbody>
              {features.map((f) => {
                const lm = LEADER_META[f.leader ?? "unknown"] ?? LEADER_META.unknown;
                return (
                  <tr key={f.id} className="border-b border-border/50 align-top">
                    <td className="px-3 py-2.5 font-medium">{f.capability}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{f.our_assessment ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{f.their_assessment ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", lm.className)}>{lm.label}</span>
                    </td>
                  </tr>
                );
              })}
              {features.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">No feature rows.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Strengths */}
      <Section title="Strengths">
        <TwoCol usTitle="Us" themTitle={themName} us={usStrengths} them={themStrengths} tone="pos" />
      </Section>

      {/* Weaknesses */}
      <Section title="Weaknesses">
        <TwoCol usTitle="Us" themTitle={themName} us={usWeak} them={themWeak} tone="neg" />
      </Section>

      {/* Gaps */}
      <Section title="Gaps blocking us">
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-[13px]">
            <thead className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Gap</th>
                <th className="px-3 py-2 text-left font-semibold">Why it hurts</th>
                <th className="px-3 py-2 text-left font-semibold">Recommended action</th>
                <th className="px-3 py-2 text-left font-semibold">Priority</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((g) => {
                const pm = PRIORITY_META[g.priority] ?? PRIORITY_META.p1;
                const gs = GAP_STATUS_META[g.status] ?? GAP_STATUS_META.open;
                return (
                  <tr key={g.id} className="border-b border-border/50 align-top">
                    <td className="px-3 py-2.5 font-medium">{g.title}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{g.why_it_hurts ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{g.recommended_action ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", pm.className)}>{pm.label}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", gs.className)}>{gs.label}</span>
                    </td>
                  </tr>
                );
              })}
              {gaps.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">No gaps recorded.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-base font-bold">{title}</h2>
      {children}
    </div>
  );
}

function TwoCol({
  usTitle,
  themTitle,
  us,
  them,
  tone,
}: {
  usTitle: string;
  themTitle: string;
  us: { id: string; point: string }[];
  them: { id: string; point: string }[];
  tone: "pos" | "neg";
}) {
  const dot = tone === "pos" ? "bg-emerald-500" : "bg-rose-500";
  const col = (title: string, items: { id: string; point: string }[], accent: string) => (
    <div className="flex-1 rounded-xl border bg-card p-4">
      <div className={cn("mb-2 text-sm font-semibold", accent)}>{title}</div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.id} className="flex gap-2 text-sm">
              <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
              <span>{i.point}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <div className="flex flex-col gap-3 md:flex-row">
      {col(usTitle, us, "text-teal-600")}
      {col(themTitle, them, "text-amber-600")}
    </div>
  );
}
