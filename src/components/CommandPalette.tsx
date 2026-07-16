import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import Fuse from "fuse.js";
import {
  Building2,
  Flame,
  Package,
  Plus,
  Search,
  StickyNote,
  X,
  Clock,
  History as HistoryIcon,
} from "lucide-react";
import { listCompanies } from "@/lib/companies.functions";
import { listLeads } from "@/lib/leads.functions";
import { listProducts } from "@/lib/products.functions";
import { listNotes } from "@/lib/notes.functions";
import {
  readHistory,
  pushHistory,
  removeHistory,
  clearHistory,
  type HistoryEntry,
} from "@/lib/search-history";
import { cn } from "@/lib/utils";

const isTypingTarget = (el: EventTarget | null) => {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
};

type CompanyRow = { id: string; name: string; domain?: string | null; industry?: string | null; contact_person?: string | null; product_service?: string | null };
type LeadRow = { id: string; contact_person?: string | null; contact_email?: string | null; company_name?: string | null; companies?: { name?: string | null } | null; products_services?: string | string[] | null; brands?: string | string[] | null; notes?: string | null; job_title?: string | null; last_activity_note?: string | null };
type ProductRow = { id: string; name: string; brand?: string | null; part_number?: string | null; category?: string | null; description?: string | null };
type NoteRow = { id: string; title?: string | null; body_text?: string | null; tags?: string[] | null; entity_type: string; entity_id: string | null; updated_at?: string | null };

const fuseOpts = { threshold: 0.35, ignoreLocation: true, minMatchCharLength: 2, includeScore: true };

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const companiesFn = useServerFn(listCompanies);
  const leadsFn = useServerFn(listLeads);
  const productsFn = useServerFn(listProducts);
  const notesFn = useServerFn(listNotes);

  const { data: companies = [] } = useQuery({ queryKey: ["companies"], queryFn: () => companiesFn(), enabled: open, staleTime: 60_000 });
  const { data: leads = [] } = useQuery({ queryKey: ["leads"], queryFn: () => leadsFn(), enabled: open, staleTime: 60_000 });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => productsFn(), enabled: open, staleTime: 60_000 });
  const { data: notes = [] } = useQuery({ queryKey: ["notes-all"], queryFn: () => notesFn({ data: {} }), enabled: open, staleTime: 60_000 });

  // Trigger listeners
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !e.ctrlKey && !e.metaKey && !e.altKey &&
        !isTypingTarget(e.target)
      ) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "i" || e.key === "I")) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        navigate({ to: "/app/prospects/new" });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "l" || e.key === "L")) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        navigate({ to: "/app/leads" });
        setTimeout(() => window.dispatchEvent(new CustomEvent("shortcut:add-lead")), 50);
        return;
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("shortcut:open-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("shortcut:open-search", onOpen);
    };
  }, [navigate, open]);

  useEffect(() => {
    if (open) {
      setHistory(readHistory());
      setQuery("");
      setDebounced("");
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 120);
    return () => clearTimeout(t);
  }, [query]);

  // Fuse indexes
  const companyFuse = useMemo(() => new Fuse(companies as CompanyRow[], {
    ...fuseOpts,
    keys: [
      { name: "name", weight: 3 },
      { name: "domain", weight: 2 },
      "industry",
      "contact_person",
      "product_service",
    ],
  }), [companies]);
  const leadFuse = useMemo(() => new Fuse(leads as unknown as LeadRow[], {
    ...fuseOpts,
    keys: [
      { name: "contact_person", weight: 3 },
      { name: "company_name", weight: 2 },
      { name: "companies.name", weight: 2 },
      "contact_email",
      "job_title",
      "products_services",
      "brands",
      "notes",
    ],
  }), [leads]);
  const productFuse = useMemo(() => new Fuse(products as ProductRow[], {
    ...fuseOpts,
    keys: [
      { name: "name", weight: 3 },
      { name: "brand", weight: 2 },
      "part_number",
      "category",
      "description",
    ],
  }), [products]);
  const noteFuse = useMemo(() => new Fuse(notes as NoteRow[], {
    ...fuseOpts,
    keys: [
      { name: "title", weight: 3 },
      { name: "body_text", weight: 1 },
      "tags",
    ],
  }), [notes]);

  const companyResults = useMemo(() => debounced ? companyFuse.search(debounced).slice(0, 8).map((r) => r.item) : [], [companyFuse, debounced]);
  const leadResults = useMemo(() => debounced ? leadFuse.search(debounced).slice(0, 8).map((r) => r.item) : [], [leadFuse, debounced]);
  const productResults = useMemo(() => debounced ? productFuse.search(debounced).slice(0, 8).map((r) => r.item) : [], [productFuse, debounced]);
  const noteResults = useMemo(() => debounced ? noteFuse.search(debounced).slice(0, 8).map((r) => r.item) : [], [noteFuse, debounced]);
  const activityResults = useMemo(() => {
    if (!debounced) return [];
    // Activity: leads with recent activity note matching
    const q = debounced.toLowerCase();
    const acts = (leads as unknown as LeadRow[])
      .filter((l) => (l.last_activity_note || "").toLowerCase().includes(q))
      .slice(0, 8);
    return acts;
  }, [leads, debounced]);

  const totalHits = companyResults.length + leadResults.length + productResults.length + noteResults.length + activityResults.length;

  const close = () => setOpen(false);
  const commit = (q: string) => {
    const next = pushHistory(q);
    setHistory(next);
  };

  const goProspect = (id: string) => { commit(debounced); close(); navigate({ to: "/app/prospects/$id", params: { id } }); };
  const goLead = (id: string) => { commit(debounced); close(); navigate({ to: "/app/leads/$id", params: { id } }); };
  const goProduct = (id: string) => { commit(debounced); close(); navigate({ to: "/app/products/$id", params: { id } }); };
  const goNoteEntity = (n: NoteRow) => {
    commit(debounced);
    close();
    if (!n.entity_id) { navigate({ to: "/app/notes" }); return; }
    if (n.entity_type === "prospect") navigate({ to: "/app/prospects/$id", params: { id: n.entity_id } });
    else if (n.entity_type === "lead") navigate({ to: "/app/leads/$id", params: { id: n.entity_id } });
    else navigate({ to: "/app/notes" });
  };

  if (!open) return null;

  const renderHighlight = (text: string | null | undefined) => {
    if (!text) return null;
    if (!debounced) return <span className="truncate">{text}</span>;
    const idx = text.toLowerCase().indexOf(debounced.toLowerCase());
    if (idx === -1) return <span className="truncate">{text}</span>;
    return (
      <span className="truncate">
        {text.slice(0, idx)}
        <mark className="rounded bg-primary/20 px-0.5 text-foreground">{text.slice(idx, idx + debounced.length)}</mark>
        {text.slice(idx + debounced.length)}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/70 backdrop-blur-sm" onClick={close}>
      <div
        className="mx-auto mt-0 flex w-full max-w-6xl flex-col border-b border-x bg-card shadow-2xl md:mt-4 md:rounded-2xl md:border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search bar */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anything — companies, leads, products, notes, activity…"
            className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => setQuery("")} className="rounded p-1 text-muted-foreground hover:bg-accent" title="Clear">
              <X className="h-4 w-4" />
            </button>
          )}
          <button onClick={close} className="rounded p-1 text-muted-foreground hover:bg-accent" title="Close (Esc)">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body: left history + right landscape grid */}
        <div className="flex max-h-[75vh] min-h-[320px] flex-col md:flex-row">
          {/* Left rail — history */}
          <aside className="border-b md:w-56 md:shrink-0 md:border-b-0 md:border-r">
            <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="flex items-center gap-1.5"><HistoryIcon className="h-3.5 w-3.5" /> Recent</span>
              {history.length > 0 && (
                <button
                  className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setHistory(clearHistory())}
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex max-h-56 flex-wrap gap-1 overflow-y-auto px-2 pb-2 md:max-h-none md:flex-col md:gap-0.5">
              {history.length === 0 && (
                <div className="px-2 py-1 text-xs text-muted-foreground">No recent searches</div>
              )}
              {history.slice(0, 12).map((h) => (
                <div
                  key={h.query}
                  className="group flex items-center gap-1 rounded-md md:hover:bg-accent"
                >
                  <button
                    className="flex flex-1 items-center gap-2 rounded-md border px-2 py-1 text-left text-xs md:border-0 md:px-2 md:py-1.5"
                    onClick={() => { setQuery(h.query); inputRef.current?.focus(); }}
                  >
                    <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{h.query}</span>
                  </button>
                  <button
                    className="hidden rounded p-1 text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100 md:block"
                    onClick={() => setHistory(removeHistory(h.query))}
                    title="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </aside>

          {/* Right area — results grid */}
          <div className="flex-1 overflow-auto p-4">
            {!debounced ? (
              <EmptyState onAction={(to) => { close(); navigate({ to }); }} />
            ) : totalHits === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                No results for "{debounced}"
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <Column icon={<Building2 className="h-4 w-4" />} label="Prospects" count={companyResults.length}>
                  {companyResults.map((c) => (
                    <ResultItem key={c.id} onClick={() => goProspect(c.id)}>
                      {renderHighlight(c.name)}
                      {c.domain && <div className="truncate text-[11px] text-muted-foreground">{c.domain}</div>}
                    </ResultItem>
                  ))}
                </Column>
                <Column icon={<Flame className="h-4 w-4 text-orange-500" />} label="Leads" count={leadResults.length}>
                  {leadResults.map((l) => (
                    <ResultItem key={l.id} onClick={() => goLead(l.id)}>
                      {renderHighlight(l.contact_person || l.contact_email || "—")}
                      {(l.company_name || l.companies?.name) && (
                        <div className="truncate text-[11px] text-muted-foreground">@ {l.company_name ?? l.companies?.name}</div>
                      )}
                    </ResultItem>
                  ))}
                </Column>
                <Column icon={<Package className="h-4 w-4" />} label="Products" count={productResults.length}>
                  {productResults.map((p) => (
                    <ResultItem key={p.id} onClick={() => goProduct(p.id)}>
                      {renderHighlight(p.name)}
                      {p.brand && <div className="truncate text-[11px] text-muted-foreground">{p.brand}</div>}
                    </ResultItem>
                  ))}
                </Column>
                <Column icon={<StickyNote className="h-4 w-4" />} label="Notes" count={noteResults.length}>
                  {noteResults.map((n) => (
                    <ResultItem key={n.id} onClick={() => goNoteEntity(n)}>
                      {renderHighlight(n.title || n.body_text?.slice(0, 60) || "Untitled note")}
                      {n.body_text && (
                        <div className="line-clamp-1 text-[11px] text-muted-foreground">{n.body_text.slice(0, 100)}</div>
                      )}
                    </ResultItem>
                  ))}
                </Column>
                <Column icon={<Clock className="h-4 w-4" />} label="Activity" count={activityResults.length}>
                  {activityResults.map((l) => (
                    <ResultItem key={`a-${l.id}`} onClick={() => goLead(l.id)}>
                      {renderHighlight(l.contact_person || l.company_name || "—")}
                      {(l as { last_activity_note?: string | null }).last_activity_note && (
                        <div className="line-clamp-1 text-[11px] text-muted-foreground">
                          {(l as { last_activity_note?: string | null }).last_activity_note}
                        </div>
                      )}
                    </ResultItem>
                  ))}
                </Column>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Column({ icon, label, count, children }: { icon: React.ReactNode; label: string; count: number; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border bg-background/40", count === 0 && "opacity-50")}>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
          {icon} {label}
        </div>
        <span className="text-[10px] text-muted-foreground">{count}</span>
      </div>
      <div className="max-h-[52vh] overflow-y-auto p-1">
        {count === 0 ? (
          <div className="px-2 py-3 text-[11px] text-muted-foreground">No matches</div>
        ) : children}
      </div>
    </div>
  );
}

function ResultItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
    >
      {children}
    </button>
  );
}

function EmptyState({ onAction }: { onAction: (to: "/app/prospects/new" | "/app/leads" | "/app/notes" | "/app/products") => void }) {
  const actions = [
    { to: "/app/prospects/new" as const, label: "Add company", icon: Plus, hint: "Ctrl+I" },
    { to: "/app/leads" as const, label: "Go to Leads", icon: Flame, hint: "Ctrl+L" },
    { to: "/app/products" as const, label: "Products", icon: Package },
    { to: "/app/notes" as const, label: "Notes", icon: StickyNote },
  ];
  return (
    <div>
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick actions</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {actions.map((a) => (
          <button
            key={a.to}
            onClick={() => onAction(a.to)}
            className="flex flex-col items-start gap-2 rounded-lg border bg-background/40 p-4 text-left transition hover:bg-accent"
          >
            <a.icon className="h-5 w-5 text-primary" />
            <div className="text-sm font-medium">{a.label}</div>
            {a.hint && <div className="text-[10px] text-muted-foreground">{a.hint}</div>}
          </button>
        ))}
      </div>
      <div className="mt-6 text-xs text-muted-foreground">
        Tip: press <kbd className="rounded border bg-muted px-1">Space</kbd> anywhere to open search.
        Fuzzy matches company/lead/product fields, plus note titles, note bodies, tags, and lead activity.
      </div>
    </div>
  );
}
