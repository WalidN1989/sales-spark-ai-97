import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ExternalLink, Plus, Search, Swords } from "lucide-react";
import { listCompetitorResearch, listCompetitorCompanies } from "@/lib/competitors.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HeaderPortal } from "@/components/layout/HeaderPortal";
import { CATEGORY_LABEL, RESEARCH_STATUS_META, fmtDate } from "@/lib/competitors-ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/competitors/")({
  head: () => ({ meta: [{ title: "Competitor Analysis — Sales Insights" }] }),
  component: CompetitorsList,
});

type ResearchRow = {
  id: string;
  title: string;
  category: string;
  status: string;
  summary: string | null;
  our_product_name: string | null;
  researcher: string | null;
  researched_at: string | null;
  created_at: string | null;
  competitor_companies: { name: string; website: string | null } | null;
  competitor_products: { name: string } | null;
};

type CompanyRow = {
  id: string;
  name: string;
  website: string | null;
  regions: string[];
  is_distributor: boolean;
  software_strength: string | null;
  competitor_products: { id: string; name: string; category: string; status: string }[];
};

function CompetitorsList() {
  const navigate = useNavigate();
  const listResearchFn = useServerFn(listCompetitorResearch);
  const listCompaniesFn = useServerFn(listCompetitorCompanies);
  const [tab, setTab] = useState<"research" | "companies">("research");
  const [q, setQ] = useState("");

  const { data: research = [], isLoading } = useQuery({
    queryKey: ["competitor-research"],
    queryFn: () => listResearchFn() as unknown as Promise<ResearchRow[]>,
  });
  const { data: companies = [] } = useQuery({
    queryKey: ["competitor-companies-list"],
    queryFn: () => listCompaniesFn() as unknown as Promise<CompanyRow[]>,
  });

  const filteredResearch = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return research;
    return research.filter((r) =>
      [r.title, r.competitor_companies?.name, r.our_product_name, CATEGORY_LABEL[r.category]]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(n),
    );
  }, [research, q]);

  const filteredCompanies = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return companies;
    return companies.filter((c) => [c.name, c.website, ...c.regions].filter(Boolean).join(" ").toLowerCase().includes(n));
  }, [companies, q]);

  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] min-w-0 flex-col md:-m-6 md:h-[calc(100%+3rem)]">
      <HeaderPortal>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight">
            <Swords className="h-5 w-5 text-primary" /> Competitor Analysis
          </h1>
          <span className="shrink-0 text-xs text-muted-foreground">
            {tab === "research" ? filteredResearch.length : filteredCompanies.length}
          </span>
          <div className="relative ml-2 w-64 max-w-full">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-8 pl-7 text-[13px]" />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Button size="sm" className="h-8 text-xs" onClick={() => navigate({ to: "/app/competitors/new" })}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New Research
            </Button>
          </div>
        </div>
      </HeaderPortal>

      <div className="flex shrink-0 items-center gap-0.5 border-b px-3 py-2">
        {(["research", "companies"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors",
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {t === "research" ? "Research" : "Competitors"}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-card">
        {tab === "research" ? (
          isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : filteredResearch.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No research yet. Click <strong>New Research</strong>, or POST from the research agent.
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10 border-b bg-card text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Title</th>
                  <th className="px-3 py-2 text-left font-semibold">Competitor</th>
                  <th className="px-3 py-2 text-left font-semibold">Category</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-left font-semibold">Researched</th>
                </tr>
              </thead>
              <tbody>
                {filteredResearch.map((r) => {
                  const st = RESEARCH_STATUS_META[r.status] ?? RESEARCH_STATUS_META.published;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => navigate({ to: "/app/competitors/$id", params: { id: r.id } })}
                      className="cursor-pointer border-b border-border/50 hover:bg-accent/40"
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{r.title}</div>
                        {r.summary && <div className="mt-0.5 line-clamp-1 max-w-xl text-xs text-muted-foreground">{r.summary}</div>}
                      </td>
                      <td className="px-3 py-2.5">{r.competitor_companies?.name ?? "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{CATEGORY_LABEL[r.category] ?? r.category}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", st.className)}>{st.label}</span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{fmtDate(r.researched_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : filteredCompanies.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No competitors yet.</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 border-b bg-card text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Company</th>
                <th className="px-3 py-2 text-left font-semibold">Products</th>
                <th className="px-3 py-2 text-left font-semibold">Regions</th>
                <th className="px-3 py-2 text-left font-semibold">Software</th>
                <th className="px-3 py-2 text-left font-semibold">Distributor</th>
              </tr>
            </thead>
            <tbody>
              {filteredCompanies.map((c) => (
                <tr key={c.id} className="border-b border-border/50 hover:bg-accent/40">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 font-medium">
                      {c.name}
                      {c.website && (
                        <a
                          href={/^https?:\/\//i.test(c.website) ? c.website : `https://${c.website}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-muted-foreground/50 hover:text-foreground"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {c.competitor_products.map((p) => (
                        <span key={p.id} className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">
                          {p.name}
                        </span>
                      ))}
                      {c.competitor_products.length === 0 && <span className="text-muted-foreground">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{c.regions.join(", ") || "—"}</td>
                  <td className="px-3 py-2.5 capitalize text-muted-foreground">{c.software_strength ?? "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{c.is_distributor ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
