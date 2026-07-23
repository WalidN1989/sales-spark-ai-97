// Prospects in the same high-density command-center style as Leads: one row
// per target company, virtualized, searchable, facet-filterable, keyboard
// navigable, with promote-to-lead as the primary row action.

import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Flame, Mail, Phone, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { faviconUrl } from "@/lib/leads-ui";
import { shortAgo } from "@/lib/leads-command";
import { FacetFilter } from "@/components/leads/CommandCenter";
import { HeaderPortal } from "@/components/layout/HeaderPortal";

export type ProspectRow = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  country: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  product_service: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ColKey = "company" | "industry" | "country" | "contact" | "product" | "updated" | "lead" | "actions";

const COLS: { key: ColKey; label: string; width: number; sortable?: boolean }[] = [
  { key: "company", label: "Company", width: 240, sortable: true },
  { key: "industry", label: "Industry", width: 150, sortable: true },
  { key: "country", label: "Country", width: 110, sortable: true },
  { key: "contact", label: "Contact", width: 170 },
  { key: "product", label: "Product / Service", width: 240 },
  { key: "updated", label: "Updated", width: 90, sortable: true },
  { key: "lead", label: "Lead", width: 64 },
  { key: "actions", label: "", width: 40 },
];

const ROW_H = 37;

type SortState = { key: ColKey; dir: 1 | -1 };

export function ProspectsTable({
  companies,
  promotedSet,
  onPromote,
  isLoading,
}: {
  companies: ProspectRow[];
  promotedSet: Set<string | null>;
  onPromote: (companyId: string) => void;
  isLoading: boolean;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [industries, setIndustries] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [sort, setSort] = useState<SortState>({ key: "updated", dir: 1 });
  const [activeIdx, setActiveIdx] = useState(-1);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = companies.filter((c) => {
      if (industries.length && !industries.includes(c.industry ?? "—")) return false;
      if (countries.length && !countries.includes(c.country ?? "—")) return false;
      if (needle) {
        const hay = [c.name, c.domain, c.industry, c.country, c.contact_person, c.email, c.product_service]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const dir = sort.dir;
    const cmp: Partial<Record<ColKey, (a: ProspectRow, b: ProspectRow) => number>> = {
      company: (a, b) => a.name.localeCompare(b.name),
      industry: (a, b) => (a.industry ?? "").localeCompare(b.industry ?? ""),
      country: (a, b) => (a.country ?? "").localeCompare(b.country ?? ""),
      updated: (a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""),
    };
    const f = cmp[sort.key];
    if (f) out = [...out].sort((a, b) => dir * f(a, b));
    return out;
  }, [companies, q, industries, countries, sort]);

  const facets = useMemo(() => {
    const count = (get: (c: ProspectRow) => string) => {
      const m = new Map<string, number>();
      for (const c of companies) m.set(get(c), (m.get(get(c)) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    return { industries: count((c) => c.industry ?? "—"), countries: count((c) => c.country ?? "—") };
  }, [companies]);

  // Virtualization
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    setViewH(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  const overscan = 8;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - overscan);
  const endIdx = Math.min(rows.length, Math.ceil((scrollTop + viewH) / ROW_H) + overscan);
  const slice = rows.slice(startIdx, endIdx);
  const totalW = COLS.reduce((a, c) => a + c.width, 0);

  const open = (c: ProspectRow) => navigate({ to: "/app/prospects/$id", params: { id: c.id } });

  const handleKey = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      const next =
        e.key === "ArrowDown" ? Math.min(rows.length - 1, activeIdx + 1) : Math.max(0, Math.max(activeIdx, 0) - 1);
      setActiveIdx(next);
      const el = scrollRef.current;
      if (el) {
        const top = next * ROW_H;
        if (top < el.scrollTop) el.scrollTop = top;
        else if (top + ROW_H > el.scrollTop + el.clientHeight - 34)
          el.scrollTop = top + ROW_H - el.clientHeight + 34;
      }
    } else if (e.key === "Enter" && activeIdx >= 0 && rows[activeIdx]) {
      e.preventDefault();
      e.stopPropagation();
      open(rows[activeIdx]);
    } else if (e.key === "Escape") {
      setActiveIdx(-1);
    }
  };

  const filtersActive = q || industries.length || countries.length;

  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] min-w-0 flex-col md:-m-6 md:h-[calc(100%+3rem)]">
      <HeaderPortal>
        <div className="flex min-w-0 flex-1 items-center gap-2">
        <h1 className="shrink-0 text-lg font-bold tracking-tight">Prospects</h1>
        <span className="text-xs text-muted-foreground">
          {rows.length}
          {filtersActive ? ` of ${companies.length}` : ""}
        </span>
        <div className="relative ml-2 w-64 max-w-full">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search company, contact, product…"
            className="h-8 pl-7 text-[13px]"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <FacetFilter
          label="Industry"
          options={facets.industries.map(([v, n]) => ({ value: v, label: v, count: n }))}
          selected={industries}
          onChange={setIndustries}
        />
        <FacetFilter
          label="Country"
          options={facets.countries.map(([v, n]) => ({ value: v, label: v, count: n }))}
          selected={countries}
          onChange={setCountries}
        />
        {filtersActive ? (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setIndustries([]);
              setCountries([]);
            }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        ) : null}
        </div>
      </HeaderPortal>

      <div
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={handleKey}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        className="relative min-h-0 flex-1 overflow-auto border-t bg-card outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <table className="w-full border-collapse text-[13px]" style={{ tableLayout: "fixed", width: totalW }}>
          <colgroup>
            {COLS.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
          </colgroup>
          <thead>
            <tr className="h-[34px] border-b bg-card text-[11px] uppercase tracking-wide text-muted-foreground">
              {COLS.map((c, i) => (
                <th
                  key={c.key}
                  onClick={() => {
                    if (!c.sortable) return;
                    setSort((s) => (s.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }));
                  }}
                  className={cn(
                    "sticky top-0 z-20 border-b bg-card px-2 text-left font-semibold",
                    i === 0 && "left-0 z-30",
                    c.sortable && "cursor-pointer select-none hover:text-foreground",
                  )}
                >
                  <span className="flex items-center gap-1">
                    <span className="truncate">{c.label}</span>
                    {sort.key === c.key && <span className="text-primary">{sort.dir === 1 ? "↑" : "↓"}</span>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 12 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50" style={{ height: ROW_H }}>
                  <td className="px-2" colSpan={COLS.length}>
                    <div className="h-3 w-full max-w-md animate-pulse rounded bg-muted" />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={COLS.length} className="p-10 text-center text-sm text-muted-foreground">
                  {filtersActive ? (
                    "No companies match the current filters."
                  ) : (
                    <>
                      No companies yet. Press{" "}
                      <kbd className="mx-1 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl+I</kbd> to
                      add your first prospect.
                    </>
                  )}
                </td>
              </tr>
            ) : (
              <>
                {startIdx > 0 && <tr style={{ height: startIdx * ROW_H }} />}
                {slice.map((c, i) => {
                  const idx = startIdx + i;
                  const isLead = promotedSet.has(c.id);
                  const isActive = idx === activeIdx;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setActiveIdx(idx)}
                      onDoubleClick={() => open(c)}
                      className={cn(
                        "group border-b border-border/50 transition-colors",
                        isActive ? "bg-accent/70" : "hover:bg-accent/40",
                      )}
                      style={{ height: ROW_H }}
                    >
                      <td className="sticky left-0 z-10 overflow-hidden bg-card px-2">
                        <div className="flex min-w-0 items-center gap-2">
                          {faviconUrl(c.domain) ? (
                            <img src={faviconUrl(c.domain)!} alt="" className="h-4 w-4 shrink-0 rounded-sm" loading="lazy" />
                          ) : (
                            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-sm bg-secondary text-[8px] font-bold">
                              {c.name.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              open(c);
                            }}
                            className="truncate font-medium hover:underline"
                            title={c.name}
                          >
                            {c.name}
                          </button>
                          {c.domain && (
                            <a
                              href={`https://${c.domain.replace(/^https?:\/\//, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={c.domain}
                              className="ml-auto hidden shrink-0 text-muted-foreground/40 hover:text-foreground group-hover:block"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="overflow-hidden px-2">
                        <span className="block truncate text-muted-foreground">{c.industry ?? "—"}</span>
                      </td>
                      <td className="overflow-hidden px-2">
                        <span className="block truncate text-muted-foreground">{c.country ?? "—"}</span>
                      </td>
                      <td className="overflow-hidden px-2">
                        <div className="flex min-w-0 items-center gap-1">
                          <span className="min-w-0 truncate" title={c.email ?? undefined}>
                            {c.contact_person ?? "—"}
                          </span>
                          <span className="ml-auto flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
                            {c.email && (
                              <a
                                href={`mailto:${c.email}`}
                                title={c.email}
                                className="grid h-6 w-6 place-items-center rounded text-muted-foreground/50 hover:bg-accent hover:text-foreground"
                              >
                                <Mail className="h-3.5 w-3.5" />
                              </a>
                            )}
                            {c.phone && (
                              <a
                                href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}
                                title={c.phone}
                                className="grid h-6 w-6 place-items-center rounded text-muted-foreground/50 hover:bg-accent hover:text-foreground"
                              >
                                <Phone className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="overflow-hidden px-2">
                        <span className="block truncate italic text-muted-foreground" title={c.product_service ?? undefined}>
                          {c.product_service ?? "—"}
                        </span>
                      </td>
                      <td className="overflow-hidden px-2">
                        <span className="block truncate text-muted-foreground">{shortAgo(c.updated_at ?? c.created_at)}</span>
                      </td>
                      <td className="overflow-hidden px-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          title={isLead ? "Open in Leads" : "Promote to Lead"}
                          onClick={() => (isLead ? navigate({ to: "/app/leads" }) : onPromote(c.id))}
                          className={cn(
                            "grid h-6 w-6 place-items-center rounded transition-colors",
                            isLead
                              ? "text-orange-500 hover:bg-orange-100 dark:hover:bg-orange-950/40"
                              : "text-muted-foreground/40 hover:bg-accent hover:text-orange-500",
                          )}
                        >
                          <Flame className={cn("h-3.5 w-3.5", isLead && "fill-orange-500")} />
                        </button>
                      </td>
                      <td className="overflow-hidden px-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            open(c);
                          }}
                          className="text-xs text-muted-foreground/50 hover:text-foreground"
                          title="Open prospect"
                        >
                          →
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {endIdx < rows.length && <tr style={{ height: (rows.length - endIdx) * ROW_H }} />}
              </>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
