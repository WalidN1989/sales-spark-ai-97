// Leads Command Center — high-density operational table replacing the old card
// grid. One row per lead; every column answers a decision question without
// opening the record. Works before and after the sales_command_center DB
// migration (inline editors are enabled only when the new columns exist).

import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Check,
  ChevronDown,
  Columns3,
  Download,
  ExternalLink,
  Flag,
  Linkedin,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Rows3,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { HeaderPortal } from "@/components/layout/HeaderPortal";
import {
  updateLead,
  bulkUpdateLeads,
  bulkDeleteLeads,
  generateLeadAiSummary,
  listLeadActivities,
} from "@/lib/leads.functions";
import {
  fmtMoneyCents,
  waHref,
  faviconUrl,
  type LeadStatus,
  type EmailStatusUI,
  EMAIL_STATUS_STYLES,
  EMAIL_STATUS_LABEL,
} from "@/lib/leads-ui";
import {
  PIPELINE_STAGES,
  STAGE_LABEL,
  STAGE_ORDER,
  STAGE_DOT,
  PRIORITIES,
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  PRIORITY_FLAG,
  HEALTH_META,
  type PipelineStage,
  type LeadPriority,
  type LeadHealth,
  computeHealth,
  leadStage,
  leadPriority,
  nextAction,
  dueInfo,
  DUE_TONE_CLASS,
  lastActivityInfo,
  displaySummary,
  hasCommandColumns,
} from "@/lib/leads-command";

// ---------- Types ----------

export type CommandLead = {
  id: string;
  company_id: string | null;
  contact_person: string | null;
  contact_email: string | null;
  whatsapp: string | null;
  phone: string | null;
  status: LeadStatus;
  pipeline_value_cents: number;
  last_activity_kind: string | null;
  last_activity_at: string | null;
  last_activity_note: string | null;
  job_title: string | null;
  lead_score: number | null;
  email_status: EmailStatusUI | null;
  company_name: string | null;
  linkedin_url: string | null;
  website: string | null;
  notes: string | null;
  source: string | null;
  created_at: string | null;
  updated_at: string | null;
  lead_type: "direct" | "reseller" | null;
  reseller_company_id: string | null;
  end_user_project: string | null;
  is_primary?: boolean | null;
  products_services: string[] | null;
  reseller: { id: string; name: string; domain: string | null; status: string | null } | null;
  companies: {
    name: string;
    domain: string | null;
    country: string | null;
    industry: string | null;
    product_service?: string | null;
  } | null;
  // Present only after the sales_command_center migration:
  pipeline_stage?: string | null;
  next_action?: string | null;
  next_action_due?: string | null;
  priority?: string | null;
  ai_summary?: string | null;
};

type Tab = "direct" | "resellers" | "all" | "won";

type ColKey =
  | "company"
  | "contact"
  | "product"
  | "source"
  | "country"
  | "industry"
  | "stage"
  | "health"
  | "priority"
  | "due"
  | "activity"
  | "next"
  | "summary"
  | "value"
  | "comms"
  | "actions";

type ColDef = { key: ColKey; label: string; width: number; min: number; sortable?: boolean; defaultHidden?: boolean };

const COLUMNS: ColDef[] = [
  { key: "company", label: "Company", width: 210, min: 140, sortable: true },
  { key: "contact", label: "Contact", width: 140, min: 100, sortable: true },
  { key: "product", label: "Product", width: 180, min: 110 },
  { key: "stage", label: "Stage", width: 128, min: 110, sortable: true },
  { key: "health", label: "Health", width: 92, min: 80, sortable: true },
  { key: "priority", label: "Priority", width: 104, min: 90, sortable: true },
  { key: "due", label: "Due", width: 96, min: 80, sortable: true },
  { key: "activity", label: "Last Activity", width: 150, min: 110, sortable: true },
  { key: "next", label: "Next Action", width: 168, min: 120 },
  { key: "summary", label: "Summary", width: 240, min: 140, defaultHidden: false },
  { key: "value", label: "Value", width: 100, min: 80, sortable: true },
  { key: "source", label: "Source", width: 88, min: 70, defaultHidden: true },
  { key: "country", label: "Country", width: 100, min: 80, defaultHidden: true },
  { key: "industry", label: "Industry", width: 120, min: 90, defaultHidden: true },
  { key: "comms", label: "Comms", width: 118, min: 100 },
  { key: "actions", label: "", width: 40, min: 40 },
];

const CHECK_W = 36;
const LS_WIDTHS = "leadscc:widths";
const LS_HIDDEN = "leadscc:hidden";
const LS_VIEWS = "leadscc:views";
const LS_DENSITY = "leadscc:density";

type SortState = { key: ColKey | "smart"; dir: 1 | -1 };

type Filters = {
  q: string;
  stages: PipelineStage[];
  healths: LeadHealth[];
  priorities: LeadPriority[];
  sources: string[];
  countries: string[];
  products: string[];
  quick: "" | "overdue" | "today" | "cold";
};

const EMPTY_FILTERS: Filters = {
  q: "",
  stages: [],
  healths: [],
  priorities: [],
  sources: [],
  countries: [],
  products: [],
  quick: "",
};

type SavedView = { name: string; tab: Tab; filters: Filters; sort: SortState };

function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function loadLSRaw<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// ---------- Row view-model (one row per COMPANY, not per contact) ----------

type RowVM = {
  lead: CommandLead; // primary contact — inline edits fan out to all ids
  ids: string[]; // every lead id in this company group
  contactCount: number;
  groupKey: string;
  stage: PipelineStage;
  health: LeadHealth;
  priority: LeadPriority;
  due: ReturnType<typeof dueInfo>;
  act: ReturnType<typeof lastActivityInfo>;
  next: ReturnType<typeof nextAction>;
  summary: ReturnType<typeof displaySummary>;
  companyName: string;
  domain: string | null;
  country: string | null;
  industry: string | null;
  productText: string;
  searchExtra: string; // other contacts' names/emails so search still finds them
};

const normName = (n: string | null | undefined) =>
  (n ?? "").trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const normDomain = (d: string | null | undefined) =>
  (d ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].trim();

// Same key format the /app/leads/group/$companyId route already understands.
function groupKeyFor(l: CommandLead): string {
  if (l.lead_type === "reseller" && l.reseller_company_id) return `id:${l.reseller_company_id}`;
  const name = normName(l.company_name ?? l.companies?.name);
  if (name) return `name:${name}`;
  const domain = normDomain(l.website ?? l.companies?.domain);
  if (domain) return `domain:${domain}`;
  if (l.company_id) return `id:${l.company_id}`;
  return `solo:${l.id}`;
}

function tabVisible(leads: CommandLead[], tab: Tab): CommandLead[] {
  return leads.filter((l) => {
    if (tab === "won") return l.status === "won";
    if (l.status === "won") return false;
    if (tab === "resellers") return l.lead_type === "reseller";
    if (tab === "direct") return l.lead_type !== "reseller";
    return true;
  });
}

function groupByCompany(leads: CommandLead[]): CommandLead[][] {
  const map = new Map<string, CommandLead[]>();
  for (const l of leads) {
    const k = groupKeyFor(l);
    const arr = map.get(k) ?? [];
    arr.push(l);
    map.set(k, arr);
  }
  return [...map.values()];
}

// Products the group is interested in — falls back to the linked company's
// product_service so a prospect's captured product still shows on the lead.
function productsFor(group: CommandLead[]): string[] {
  const own = [...new Set(group.flatMap((l) => l.products_services ?? []))].filter(Boolean);
  if (own.length > 0) return own;
  const fromCompany = group.map((l) => l.companies?.product_service).find((p) => p && p.trim());
  return fromCompany ? [fromCompany.trim()] : [];
}

function buildGroupVM(group: CommandLead[]): RowVM {
  // Primary contact first (is_primary flag, then oldest — the original entry)
  const sorted = [...group].sort(
    (a, b) =>
      (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) ||
      (a.created_at ?? "").localeCompare(b.created_at ?? ""),
  );
  const primary = sorted[0];
  const latest = group.reduce(
    (best, l) => ((l.last_activity_at ?? "") > (best.last_activity_at ?? "") ? l : best),
    primary,
  );

  // Company-level aggregates: most advanced stage, highest urgency, soonest due
  const stages = group.map(leadStage);
  const live = stages.filter((s) => s !== "lost");
  const stage = live.length === 0 ? "lost" : live.reduce((a, b) => (STAGE_ORDER[b] > STAGE_ORDER[a] ? b : a));
  const priority = group.map(leadPriority).reduce((a, b) => (PRIORITY_ORDER[b] < PRIORITY_ORDER[a] ? b : a));
  const dues = group.map((l) => l.next_action_due).filter(Boolean) as string[];
  const earliestDue = dues.length ? dues.sort()[0] : null;

  const products = productsFor(group);
  const repr: CommandLead = {
    ...primary,
    products_services: products,
    pipeline_value_cents: group.reduce((a, l) => a + (l.pipeline_value_cents || 0), 0),
    last_activity_at: latest.last_activity_at,
    last_activity_kind: latest.last_activity_kind,
    last_activity_note: latest.last_activity_note,
    next_action_due: earliestDue,
    ai_summary: primary.ai_summary ?? group.find((l) => l.ai_summary)?.ai_summary ?? null,
  };

  return {
    lead: repr,
    ids: group.map((l) => l.id),
    contactCount: group.length,
    groupKey: groupKeyFor(primary),
    stage,
    health: computeHealth(repr),
    priority,
    due: dueInfo(earliestDue),
    act: lastActivityInfo(repr),
    next: nextAction({ ...repr, pipeline_stage: stage }),
    summary: displaySummary(repr),
    companyName: repr.company_name ?? repr.companies?.name ?? repr.reseller?.name ?? (repr.whatsapp ? "WhatsApp lead" : "—"),
    domain: repr.website ?? repr.companies?.domain ?? repr.reseller?.domain ?? null,
    country: repr.companies?.country ?? null,
    industry: repr.companies?.industry ?? null,
    productText: products.join(" · "),
    searchExtra: group
      .flatMap((l) => [l.contact_person, l.contact_email, l.whatsapp])
      .filter(Boolean)
      .join(" "),
  };
}

// ---------- Component ----------

export function LeadsCommandCenter({
  leads,
  isLoading,
  onAddLead,
}: {
  leads: CommandLead[];
  isLoading: boolean;
  onAddLead: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const updateFn = useServerFn(updateLead);
  const bulkUpdateFn = useServerFn(bulkUpdateLeads);
  const bulkDeleteFn = useServerFn(bulkDeleteLeads);
  const summaryFn = useServerFn(generateLeadAiSummary);

  const canEdit = hasCommandColumns(leads as unknown as Array<Record<string, unknown>>);

  // ----- Persistent UI prefs -----
  // Defaults on first render (matches SSR output — reading localStorage during
  // render causes hydration mismatches), then load stored prefs after mount.
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [hidden, setHidden] = useState<ColKey[]>(
    COLUMNS.filter((c) => c.defaultHidden).map((c) => c.key),
  );
  const [dense, setDense] = useState<boolean>(true);
  const [views, setViews] = useState<SavedView[]>([]);
  useEffect(() => {
    setWidths(loadLS(LS_WIDTHS, {}));
    setHidden(loadLSRaw<ColKey[]>(LS_HIDDEN, COLUMNS.filter((c) => c.defaultHidden).map((c) => c.key)));
    setDense(loadLSRaw(LS_DENSITY, true));
    setViews(loadLSRaw(LS_VIEWS, []));
    setPrefsLoaded(true);
  }, []);
  useEffect(() => {
    if (prefsLoaded) localStorage.setItem(LS_WIDTHS, JSON.stringify(widths));
  }, [widths, prefsLoaded]);
  useEffect(() => {
    if (prefsLoaded) localStorage.setItem(LS_HIDDEN, JSON.stringify(hidden));
  }, [hidden, prefsLoaded]);
  useEffect(() => {
    if (prefsLoaded) localStorage.setItem(LS_DENSITY, JSON.stringify(dense));
  }, [dense, prefsLoaded]);
  useEffect(() => {
    if (prefsLoaded) localStorage.setItem(LS_VIEWS, JSON.stringify(views));
  }, [views, prefsLoaded]);

  const ROW_H = dense ? 37 : 46;

  // ----- Filters / tabs / sort -----
  const [tab, setTab] = useState<Tab>("direct");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortState>({ key: "smart", dir: 1 });

  // ----- Selection & keyboard -----
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const lastClickIdx = useRef<number>(-1);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);

  // ----- Mutations -----
  const patchLocal = useCallback(
    (ids: string[], patch: Partial<CommandLead>) => {
      qc.setQueryData(["leads"], (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.map((l: CommandLead) => (ids.includes(l.id) ? { ...l, ...patch } : l));
      });
    },
    [qc],
  );

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      updateFn({ data: { id, patch } }),
    onMutate: async ({ id, patch }) => patchLocal([id], patch as Partial<CommandLead>),
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  const bulkUpdate = useMutation({
    mutationFn: ({ ids, patch }: { ids: string[]; patch: Record<string, unknown> }) =>
      bulkUpdateFn({ data: { ids, patch } }),
    onMutate: async ({ ids, patch }) => patchLocal(ids, patch as Partial<CommandLead>),
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onSuccess: (_r, { ids }) => {
      toast.success(`Updated ${ids.length} lead${ids.length === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const bulkDelete = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteFn({ data: { ids } }),
    onSuccess: (_r, ids) => {
      toast.success(`Deleted ${ids.length} lead${ids.length === 1 ? "" : "s"}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const genSummary = useMutation({
    mutationFn: (leadId: string) => summaryFn({ data: { leadId } }),
    onSuccess: (r, leadId) => {
      patchLocal([leadId], { ai_summary: r.summary });
      if (!r.persisted) toast.info("Summary generated (apply the DB migration to save it permanently)");
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ----- Derived rows: one per company -----
  const vms = useMemo(
    () => groupByCompany(tabVisible(leads, tab)).map(buildGroupVM),
    [leads, tab],
  );

  // Open the right page for a row: single contact → lead detail; multiple →
  // the existing group / reseller page listing all contacts.
  const openRow = useCallback(
    (r: RowVM) => {
      if (r.contactCount > 1) {
        if (r.lead.lead_type === "reseller" && r.lead.reseller_company_id) {
          navigate({ to: "/app/leads/reseller/$resellerId", params: { resellerId: r.lead.reseller_company_id } });
        } else {
          navigate({ to: "/app/leads/group/$companyId", params: { companyId: encodeURIComponent(r.groupKey) } });
        }
      } else {
        navigate({ to: "/app/leads/$id", params: { id: r.lead.id } });
      }
    },
    [navigate],
  );

  // Inline edits apply to every contact of the company so data stays consistent.
  const patchRow = useCallback(
    (r: RowVM, patch: Record<string, unknown>) => {
      if (r.ids.length > 1) bulkUpdate.mutate({ ids: r.ids, patch });
      else update.mutate({ id: r.lead.id, patch });
    },
    [bulkUpdate, update],
  );

  const rows = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    let out = vms.filter((r) => {
      if (filters.stages.length && !filters.stages.includes(r.stage)) return false;
      if (filters.healths.length && !filters.healths.includes(r.health)) return false;
      if (filters.priorities.length && !filters.priorities.includes(r.priority)) return false;
      if (filters.sources.length && !filters.sources.includes(r.lead.source ?? "—")) return false;
      if (filters.countries.length && !filters.countries.includes(r.country ?? "—")) return false;
      if (
        filters.products.length &&
        !(r.lead.products_services ?? []).some((p) => filters.products.includes(p))
      )
        return false;
      if (filters.quick === "overdue" && r.due.tone !== "overdue") return false;
      if (filters.quick === "today" && r.due.tone !== "today" && r.due.tone !== "overdue") return false;
      if (filters.quick === "cold" && r.health !== "cold") return false;
      if (q) {
        const hay = [
          r.companyName,
          r.lead.contact_person,
          r.lead.contact_email,
          r.lead.whatsapp,
          r.productText,
          r.domain,
          r.country,
          r.industry,
          r.summary.text,
          r.next.label,
          r.searchExtra,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const dir = sort.dir;
    const cmp: Record<string, (a: RowVM, b: RowVM) => number> = {
      company: (a, b) => a.companyName.localeCompare(b.companyName),
      contact: (a, b) => (a.lead.contact_person ?? "").localeCompare(b.lead.contact_person ?? ""),
      stage: (a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage],
      health: (a, b) => HEALTH_META[a.health].order - HEALTH_META[b.health].order,
      priority: (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
      due: (a, b) =>
        (a.lead.next_action_due ?? "9999-99-99").localeCompare(b.lead.next_action_due ?? "9999-99-99"),
      activity: (a, b) =>
        (b.lead.last_activity_at ?? "").localeCompare(a.lead.last_activity_at ?? ""),
      value: (a, b) => (b.lead.pipeline_value_cents ?? 0) - (a.lead.pipeline_value_cents ?? 0),
    };

    if (sort.key === "smart") {
      // Work order: today first, then the rest of this week, then later,
      // then overdue, then anything without a follow-up date.
      const dueRank = (r: RowVM) => {
        switch (r.due.tone) {
          case "today":
            return 0;
          case "soon":
            return 1;
          case "later":
            return 2;
          case "overdue":
            return 3;
          default:
            return 4;
        }
      };
      out = [...out].sort((a, b) => {
        const d = dueRank(a) - dueRank(b);
        if (d !== 0) return d;
        // Ascending by due date inside each band.
        const da = a.lead.next_action_due ?? "";
        const db = b.lead.next_action_due ?? "";
        if (da !== db) return da.localeCompare(db);
        const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (p !== 0) return p;
        return (b.lead.last_activity_at ?? "").localeCompare(a.lead.last_activity_at ?? "");
      });
    } else if (cmp[sort.key]) {
      out = [...out].sort((a, b) => dir * cmp[sort.key](a, b));
    }
    return out;
  }, [vms, filters, sort]);

  // ----- Facet options -----
  const facets = useMemo(() => {
    const count = <K extends string>(get: (r: RowVM) => K | K[] | null) => {
      const m = new Map<string, number>();
      for (const r of vms) {
        const v = get(r);
        const arr = v === null ? [] : Array.isArray(v) ? v : [v];
        for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    return {
      sources: count((r) => (r.lead.source ?? "—") as string),
      countries: count((r) => (r.country ?? "—") as string),
      products: count((r) => r.lead.products_services ?? []).slice(0, 40),
      stageCounts: count((r) => r.stage as string),
    };
  }, [vms]);

  // ----- Virtualization -----
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

  // Keep active row sane when rows change
  useEffect(() => {
    if (activeIdx >= rows.length) setActiveIdx(rows.length - 1);
  }, [rows.length, activeIdx]);

  // ----- Columns -----
  const visibleCols = COLUMNS.filter((c) => !hidden.includes(c.key));
  const colW = (c: ColDef) => Math.max(c.min, widths[c.key] ?? c.width);
  const totalW = CHECK_W + visibleCols.reduce((a, c) => a + colW(c), 0);

  const resizing = useRef<{ key: ColKey; startX: number; startW: number } | null>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const r = resizing.current;
      if (!r) return;
      const col = COLUMNS.find((c) => c.key === r.key)!;
      setWidths((w) => ({ ...w, [r.key]: Math.max(col.min, r.startW + (e.clientX - r.startX)) }));
    };
    const up = () => (resizing.current = null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  // ----- Selection helpers (selection keyed by company row; ops expand to all contacts) -----
  const rowIds = useMemo(() => rows.map((r) => r.lead.id), [rows]);
  const selectedGroupIds = useMemo(
    () => rows.filter((r) => selected.has(r.lead.id)).flatMap((r) => r.ids),
    [rows, selected],
  );
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(rowIds));
  };
  const toggleOne = (idx: number, shift: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && lastClickIdx.current >= 0) {
        const [a, b] = [Math.min(lastClickIdx.current, idx), Math.max(lastClickIdx.current, idx)];
        const turnOn = !prev.has(rowIds[idx]);
        for (let i = a; i <= b; i++) {
          if (turnOn) next.add(rowIds[i]);
          else next.delete(rowIds[i]);
        }
      } else {
        if (next.has(rowIds[idx])) next.delete(rowIds[idx]);
        else next.add(rowIds[idx]);
      }
      return next;
    });
    lastClickIdx.current = idx;
  };

  // ----- Keyboard -----
  const scrollRowIntoView = (idx: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const top = idx * ROW_H;
    const bottom = top + ROW_H;
    const headerH = 34;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + el.clientHeight - headerH) {
      el.scrollTop = bottom - el.clientHeight + headerH;
    }
  };
  const handleKey = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      const next =
        e.key === "ArrowDown"
          ? Math.min(rows.length - 1, activeIdx + 1)
          : Math.max(0, activeIdx <= 0 ? 0 : activeIdx - 1);
      setActiveIdx(next);
      scrollRowIntoView(next);
    } else if (e.key === "Enter" && activeIdx >= 0 && rows[activeIdx]) {
      e.preventDefault();
      e.stopPropagation();
      openRow(rows[activeIdx]);
    } else if ((e.key === " " || e.code === "Space") && activeIdx >= 0) {
      e.preventDefault();
      e.stopPropagation();
      toggleOne(activeIdx, e.shiftKey);
    } else if (e.key === "Escape") {
      if (selected.size > 0) setSelected(new Set());
      else setActiveIdx(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIdx(0);
      scrollRowIntoView(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIdx(rows.length - 1);
      scrollRowIntoView(rows.length - 1);
    }
  };

  // ----- CSV export -----
  const exportCsv = (only: Set<string> | null) => {
    const pick = only && only.size > 0 ? rows.filter((r) => only.has(r.lead.id)) : rows;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = [
      "Company", "Contact", "Email", "WhatsApp", "Product", "Source", "Stage", "Health",
      "Priority", "Due", "Last Activity", "Next Action", "Value (AED)", "Summary",
    ];
    const lines = pick.map((r) =>
      [
        r.companyName, r.lead.contact_person, r.lead.contact_email, r.lead.whatsapp,
        r.productText, r.lead.source, STAGE_LABEL[r.stage], HEALTH_META[r.health].label,
        PRIORITY_LABEL[r.priority], r.lead.next_action_due ?? "",
        r.lead.last_activity_at ?? "", r.next.label,
        (r.lead.pipeline_value_cents / 100).toFixed(0), r.summary.text ?? "",
      ].map(esc).join(","),
    );
    const blob = new Blob([[header.map(esc).join(","), ...lines].join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const bulkEmail = () => {
    const emails = rows
      .filter((r) => selected.has(r.lead.id) && r.lead.contact_email)
      .map((r) => r.lead.contact_email);
    if (!emails.length) return toast.error("No selected lead has an email address");
    window.location.href = `mailto:?bcc=${encodeURIComponent(emails.join(","))}`;
  };

  const requireMigration = () =>
    toast.info("This field needs the Sales Command Center database migration — push & publish to enable editing.");

  // ----- Cells -----

  const stageCell = (r: RowVM) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-accent"
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT[r.stage]}`} />
          <span className="truncate">{STAGE_LABEL[r.stage]}</span>
          <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-xs">Pipeline stage</DropdownMenuLabel>
        {PIPELINE_STAGES.map((s) => (
          <DropdownMenuItem
            key={s}
            onSelect={() => {
              if (!canEdit) return requireMigration();
              const patch: Record<string, unknown> = { pipeline_stage: s };
              if (s === "won") patch.status = "won";
              patchRow(r, patch);
            }}
          >
            <span className={`mr-2 h-2 w-2 rounded-full ${STAGE_DOT[s]}`} />
            {STAGE_LABEL[s]}
            {r.stage === s && <Check className="ml-auto h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const priorityCell = (r: RowVM) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-accent"
        >
          <Flag className={`h-3.5 w-3.5 shrink-0 ${PRIORITY_FLAG[r.priority]}`} fill="currentColor" />
          <span className="truncate">{PRIORITY_LABEL[r.priority]}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        {PRIORITIES.map((p) => (
          <DropdownMenuItem
            key={p}
            onSelect={() => (canEdit ? patchRow(r, { priority: p }) : requireMigration())}
          >
            <Flag className={`mr-2 h-3.5 w-3.5 ${PRIORITY_FLAG[p]}`} fill="currentColor" />
            {PRIORITY_LABEL[p]}
            {r.priority === p && <Check className="ml-auto h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const dueCell = (r: RowVM) => (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`w-full truncate rounded px-1 py-0.5 text-left hover:bg-accent ${DUE_TONE_CLASS[r.due.tone]}`}
          title={r.lead.next_action_due ?? undefined}
        >
          {r.due.label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-2 p-3" onClick={(e) => e.stopPropagation()}>
        <div className="text-xs font-medium text-muted-foreground">Follow-up due</div>
        <Input
          type="date"
          defaultValue={r.lead.next_action_due ?? ""}
          onChange={(e) => {
            const v = e.target.value || null;
            if (!canEdit) return requireMigration();
            patchRow(r, { next_action_due: v });
          }}
        />
        <div className="flex flex-wrap gap-1">
          {[
            ["Today", 0],
            ["Tomorrow", 1],
            ["+3d", 3],
            ["+1w", 7],
          ].map(([label, days]) => (
            <Button
              key={label as string}
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              onClick={() => {
                if (!canEdit) return requireMigration();
                const d = new Date();
                d.setDate(d.getDate() + (days as number));
                patchRow(r, { next_action_due: d.toISOString().slice(0, 10) });
              }}
            >
              {label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={() => (canEdit ? patchRow(r, { next_action_due: null }) : requireMigration())}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );

  const nextCell = (r: RowVM) => (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`w-full truncate rounded px-1 py-0.5 text-left hover:bg-accent ${
            r.next.auto ? "italic text-muted-foreground" : ""
          }`}
          title={r.next.label}
        >
          {r.next.label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2 p-3" onClick={(e) => e.stopPropagation()}>
        <div className="text-xs font-medium text-muted-foreground">
          Next action {r.next.auto && <span className="opacity-70">(currently auto-suggested)</span>}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canEdit) return requireMigration();
            const v = new FormData(e.currentTarget).get("na");
            patchRow(r, { next_action: String(v ?? "").trim() || null });
          }}
        >
          <Input name="na" defaultValue={r.next.auto ? "" : r.next.label} placeholder={r.next.label} maxLength={200} />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="submit" size="sm" className="h-7 text-xs">
              Save
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );

  const summaryCell = (r: RowVM) => (
    <div className="flex items-center gap-1">
      <span
        className={`min-w-0 flex-1 truncate ${r.summary.text ? "" : "text-muted-foreground/50"} ${
          r.summary.isAi ? "" : "text-muted-foreground"
        }`}
        title={r.summary.text ?? undefined}
      >
        {r.summary.text ?? "—"}
      </span>
      <button
        type="button"
        title={r.summary.isAi ? "Regenerate AI summary" : "Generate AI summary"}
        onClick={(e) => {
          e.stopPropagation();
          genSummary.mutate(r.lead.id);
        }}
        disabled={genSummary.isPending}
        className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground/50 hover:bg-accent hover:text-foreground disabled:opacity-40"
      >
        <Sparkles className={`h-3 w-3 ${genSummary.isPending && genSummary.variables === r.lead.id ? "animate-pulse text-primary" : ""}`} />
      </button>
    </div>
  );

  const commsCell = (r: RowVM) => {
    const wa = waHref(r.lead.whatsapp);
    const stop = (e: React.MouseEvent) => e.stopPropagation();
    const iconCls =
      "grid h-6 w-6 place-items-center rounded text-muted-foreground/60 hover:bg-accent hover:text-foreground";
    return (
      <div className="flex items-center gap-0.5" onClick={stop}>
        {r.lead.contact_email && (
          <a href={`mailto:${r.lead.contact_email}`} title={r.lead.contact_email} className={iconCls}>
            <Mail className="h-3.5 w-3.5" />
          </a>
        )}
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" title={`WhatsApp ${r.lead.whatsapp}`} className={`${iconCls} hover:text-[#25D366]`}>
            <MessageCircle className="h-3.5 w-3.5" />
          </a>
        )}
        {(r.lead.phone || r.lead.whatsapp) && (
          <a href={`tel:${(r.lead.phone ?? r.lead.whatsapp ?? "").replace(/[^\d+]/g, "")}`} title={r.lead.phone ?? r.lead.whatsapp ?? ""} className={iconCls}>
            <Phone className="h-3.5 w-3.5" />
          </a>
        )}
        {r.lead.linkedin_url && (
          <a href={r.lead.linkedin_url} target="_blank" rel="noopener noreferrer" title="LinkedIn" className={`${iconCls} hover:text-[#0A66C2]`}>
            <Linkedin className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    );
  };

  const renderCell = (c: ColDef, r: RowVM, idx: number): ReactNode => {
    switch (c.key) {
      case "company":
        return (
          <HoverCard openDelay={350} closeDelay={100}>
            <HoverCardTrigger asChild>
              <div className="flex min-w-0 items-center gap-2">
                {faviconUrl(r.domain) ? (
                  <img src={faviconUrl(r.domain)!} alt="" className="h-4 w-4 shrink-0 rounded-sm" loading="lazy" />
                ) : (
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-sm bg-secondary text-[8px] font-bold">
                    {r.companyName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openRow(r);
                      }}
                      className="truncate font-medium text-foreground hover:underline"
                    >
                      {r.companyName}
                    </button>
                    {r.lead.lead_type === "reseller" && (
                      <span className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-bold uppercase text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                        RSL
                      </span>
                    )}
                  </div>
                  {!dense && (
                    <div className="truncate text-[10px] leading-tight text-muted-foreground">
                      {[r.domain, r.country].filter(Boolean).join(" · ") || "—"}
                    </div>
                  )}
                </div>
                {r.domain && (
                  <a
                    href={`https://${r.domain.replace(/^https?:\/\//, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title={r.domain}
                    className="ml-auto hidden shrink-0 text-muted-foreground/40 hover:text-foreground group-hover:block"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </HoverCardTrigger>
            <HoverCardContent side="right" align="start" className="w-96 p-0" onClick={(e) => e.stopPropagation()}>
              <LeadPreview r={r} />
            </HoverCardContent>
          </HoverCard>
        );
      case "contact":
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="min-w-0">
              <div className="truncate" title={r.lead.job_title ?? undefined}>
                {r.lead.contact_person ?? "—"}
              </div>
              {!dense && r.lead.job_title && (
                <div className="truncate text-[10px] leading-tight text-muted-foreground">{r.lead.job_title}</div>
              )}
            </div>
            {r.contactCount > 1 && (
              <button
                type="button"
                title={`${r.contactCount} contacts at this company — open all`}
                onClick={(e) => {
                  e.stopPropagation();
                  openRow(r);
                }}
                className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                +{r.contactCount - 1}
              </button>
            )}
          </div>
        );
      case "product":
        return (
          <span className="truncate" title={r.productText || undefined}>
            {r.productText || <span className="text-muted-foreground/50">—</span>}
          </span>
        );
      case "source":
        return <span className="truncate text-muted-foreground">{r.lead.source ?? "—"}</span>;
      case "country":
        return <span className="truncate text-muted-foreground">{r.country ?? "—"}</span>;
      case "industry":
        return <span className="truncate text-muted-foreground">{r.industry ?? "—"}</span>;
      case "stage":
        return stageCell(r);
      case "health": {
        const h = HEALTH_META[r.health];
        return (
          <span className={`flex items-center gap-1 ${h.className}`} title={`Auto-computed from activity (${r.act.when} since last touch)`}>
            <span className="text-[11px] leading-none">{h.emoji}</span>
            <span className="truncate">{h.label}</span>
          </span>
        );
      }
      case "priority":
        return priorityCell(r);
      case "due":
        return dueCell(r);
      case "activity":
        return (
          <span className="truncate text-muted-foreground" title={r.act.note ?? undefined}>
            <span className="text-foreground">{r.act.when}</span>
            {r.act.what ? ` · ${r.act.what}` : ""}
          </span>
        );
      case "next":
        return nextCell(r);
      case "summary":
        return summaryCell(r);
      case "value":
        return (
          <span className="block truncate text-right tabular-nums">
            {r.lead.pipeline_value_cents > 0 ? (
              fmtMoneyCents(r.lead.pipeline_value_cents)
            ) : (
              <span className="text-muted-foreground/40">—</span>
            )}
          </span>
        );
      case "comms":
        return commsCell(r);
      case "actions":
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="grid h-6 w-6 place-items-center rounded text-muted-foreground/50 hover:bg-accent hover:text-foreground"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onSelect={() => navigate({ to: "/app/leads/$id", params: { id: r.lead.id } })}>
                Open lead
              </DropdownMenuItem>
              {r.lead.contact_email && (
                <DropdownMenuItem
                  onSelect={() => {
                    navigator.clipboard.writeText(r.lead.contact_email!);
                    toast.success("Email copied");
                  }}
                >
                  Copy email
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-rose-600 focus:text-rose-600"
                onSelect={() => setConfirmDelete(r.ids)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
    }
  };

  // ----- Header sort -----
  const onSortClick = (c: ColDef) => {
    if (!c.sortable) return;
    setSort((s) =>
      s.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 },
    );
  };

  // ----- Tabs / counts (count companies, matching what the table shows) -----
  const tabCounts = useMemo<Record<Tab, number>>(
    () => ({
      direct: groupByCompany(tabVisible(leads, "direct")).length,
      resellers: groupByCompany(tabVisible(leads, "resellers")).length,
      all: groupByCompany(tabVisible(leads, "all")).length,
      won: groupByCompany(tabVisible(leads, "won")).length,
    }),
    [leads],
  );

  const filtersActive =
    filters.q ||
    filters.stages.length ||
    filters.healths.length ||
    filters.priorities.length ||
    filters.sources.length ||
    filters.countries.length ||
    filters.products.length ||
    filters.quick;

  const attention = useMemo(() => {
    let overdue = 0,
      today = 0,
      cold = 0;
    for (const r of vms) {
      if (r.due.tone === "overdue") overdue++;
      else if (r.due.tone === "today") today++;
      if (r.health === "cold" && r.stage !== "won" && r.stage !== "lost") cold++;
    }
    return { overdue, today, cold };
  }, [vms]);

  // ---------- Render ----------

  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] min-w-0 flex-col md:-m-6 md:h-[calc(100%+3rem)]">
      {/* Title, search and actions render into the app header bar */}
      <HeaderPortal>
        <div className="flex min-w-0 flex-1 items-center gap-2">
        <h1 className="shrink-0 text-lg font-bold tracking-tight">Leads</h1>
        <span className="text-xs text-muted-foreground">
          {rows.length}
          {filtersActive ? ` of ${vms.length}` : ""}
        </span>
        <div className="relative ml-2 w-64 max-w-full">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Search company, contact, product…"
            className="h-8 pl-7 text-[13px]"
          />
          {filters.q && (
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, q: "" }))}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Saved views */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs">
                Views <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {views.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No saved views yet</div>
              )}
              {views.map((v, i) => (
                <DropdownMenuItem
                  key={i}
                  onSelect={() => {
                    setTab(v.tab);
                    setFilters({ ...EMPTY_FILTERS, ...v.filters });
                    setSort(v.sort);
                  }}
                >
                  {v.name}
                  <button
                    type="button"
                    className="ml-auto text-muted-foreground/50 hover:text-rose-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      setViews((vs) => vs.filter((_, j) => j !== i));
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  const name = window.prompt("Name this view:", "My view");
                  if (name) setViews((vs) => [...vs, { name, tab, filters, sort }]);
                }}
              >
                + Save current view
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Column customize */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs">
                <Columns3 className="mr-1 h-3.5 w-3.5" /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {COLUMNS.filter((c) => c.key !== "actions").map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={!hidden.includes(c.key)}
                  onCheckedChange={(on) =>
                    setHidden((h) => (on ? h.filter((k) => k !== c.key) : [...h, c.key]))
                  }
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            title={dense ? "Comfortable rows" : "Compact rows"}
            onClick={() => setDense((d) => !d)}
          >
            <Rows3 className="h-3.5 w-3.5" />
          </Button>

          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => exportCsv(null)}>
            <Download className="mr-1 h-3.5 w-3.5" /> Export
          </Button>

          <Button size="sm" className="h-8 text-xs" onClick={onAddLead}>
            + Add Lead
          </Button>
        </div>
        </div>
      </HeaderPortal>

      {/* Filters row */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-2">
        <div className="flex items-center gap-0.5 rounded-md border bg-card p-0.5">
          {(["direct", "resellers", "all", "won"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {t === "all" ? "All" : t === "resellers" ? "Resellers" : t === "won" ? "Won" : "Direct"}
              <span className="ml-1 opacity-60">{tabCounts[t]}</span>
            </button>
          ))}
        </div>

        <span className="mx-1 h-4 w-px bg-border" />

        {/* Quick attention chips */}
        {(
          [
            ["overdue", `Overdue ${attention.overdue}`, attention.overdue > 0],
            ["today", `Due today ${attention.today}`, attention.today > 0],
            ["cold", `Gone cold ${attention.cold}`, attention.cold > 0],
          ] as const
        ).map(([key, label, hot]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilters((f) => ({ ...f, quick: f.quick === key ? "" : key }))}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              filters.quick === key
                ? "border-primary bg-primary text-primary-foreground"
                : hot
                  ? key === "overdue"
                    ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400"
                    : key === "today"
                      ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400"
                      : "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-400"
                  : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {label}
          </button>
        ))}

        <span className="mx-1 h-4 w-px bg-border" />

        <FacetFilter
          label="Stage"
          options={PIPELINE_STAGES.map((s) => ({
            value: s,
            label: STAGE_LABEL[s],
            count: facets.stageCounts.find(([v]) => v === s)?.[1] ?? 0,
          }))}
          selected={filters.stages}
          onChange={(v) => setFilters((f) => ({ ...f, stages: v as PipelineStage[] }))}
        />
        <FacetFilter
          label="Health"
          options={(Object.keys(HEALTH_META) as LeadHealth[]).map((h) => ({
            value: h,
            label: `${HEALTH_META[h].emoji} ${HEALTH_META[h].label}`,
            count: vms.filter((r) => r.health === h).length,
          }))}
          selected={filters.healths}
          onChange={(v) => setFilters((f) => ({ ...f, healths: v as LeadHealth[] }))}
        />
        <FacetFilter
          label="Priority"
          options={PRIORITIES.map((p) => ({
            value: p,
            label: PRIORITY_LABEL[p],
            count: vms.filter((r) => r.priority === p).length,
          }))}
          selected={filters.priorities}
          onChange={(v) => setFilters((f) => ({ ...f, priorities: v as LeadPriority[] }))}
        />
        <FacetFilter
          label="Product"
          options={facets.products.map(([v, n]) => ({ value: v, label: v, count: n }))}
          selected={filters.products}
          onChange={(v) => setFilters((f) => ({ ...f, products: v }))}
        />
        <FacetFilter
          label="Country"
          options={facets.countries.map(([v, n]) => ({ value: v, label: v, count: n }))}
          selected={filters.countries}
          onChange={(v) => setFilters((f) => ({ ...f, countries: v }))}
        />
        <FacetFilter
          label="Source"
          options={facets.sources.map(([v, n]) => ({ value: v, label: v, count: n }))}
          selected={filters.sources}
          onChange={(v) => setFilters((f) => ({ ...f, sources: v }))}
        />

        {filtersActive ? (
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="ml-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        ) : null}

        {sort.key !== "smart" && (
          <button
            type="button"
            onClick={() => setSort({ key: "smart", dir: 1 })}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            title="Back to smart order: overdue → due today → priority → recent activity"
          >
            ↺ Smart sort
          </button>
        )}
      </div>

      {/* Table */}
      <div
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={handleKey}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        className="relative min-h-0 flex-1 overflow-auto bg-card outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <table className="w-full border-collapse text-[13px]" style={{ tableLayout: "fixed", width: totalW }}>
          <colgroup>
            <col style={{ width: CHECK_W }} />
            {visibleCols.map((c) => (
              <col key={c.key} style={{ width: colW(c) }} />
            ))}
          </colgroup>
          <thead>
            <tr className="h-[34px] border-b bg-card text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="sticky left-0 top-0 z-30 border-b bg-card px-2 text-left">
                <Checkbox
                  checked={allSelected && rowIds.length > 0}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                  className="h-3.5 w-3.5"
                />
              </th>
              {visibleCols.map((c, i) => (
                <th
                  key={c.key}
                  className={`group/th relative top-0 z-20 border-b bg-card px-2 text-left font-semibold ${
                    i === 0 ? "sticky left-[36px] z-30" : "sticky"
                  } ${c.sortable ? "cursor-pointer select-none hover:text-foreground" : ""} ${
                    c.key === "value" ? "text-right" : ""
                  }`}
                  onClick={() => onSortClick(c)}
                >
                  <span className="flex items-center gap-1">
                    <span className={`truncate ${c.key === "value" ? "ml-auto" : ""}`}>{c.label}</span>
                    {sort.key === c.key && (
                      <span className="text-primary">{sort.dir === 1 ? "↑" : "↓"}</span>
                    )}
                  </span>
                  <span
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      resizing.current = { key: c.key, startX: e.clientX, startW: colW(c) };
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 hover:bg-primary/40 group-hover/th:opacity-100"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 12 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50" style={{ height: ROW_H }}>
                  <td className="px-2" colSpan={visibleCols.length + 1}>
                    <div className="h-3 w-full max-w-md animate-pulse rounded bg-muted" />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.length + 1} className="p-10 text-center text-sm text-muted-foreground">
                  {filtersActive
                    ? "No leads match the current filters."
                    : 'No leads yet. Promote a prospect or click "Add Lead".'}
                </td>
              </tr>
            ) : (
              <>
                {startIdx > 0 && <tr style={{ height: startIdx * ROW_H }} />}
                {slice.map((r, i) => {
                  const idx = startIdx + i;
                  const isSel = selected.has(r.lead.id);
                  const isActive = idx === activeIdx;
                  return (
                    <tr
                      key={r.lead.id}
                      data-idx={idx}
                      onClick={() => setActiveIdx(idx)}
                      onDoubleClick={() => openRow(r)}
                      className={`group border-b border-border/50 transition-colors ${
                        isSel
                          ? "bg-primary/[0.06]"
                          : isActive
                            ? "bg-accent/70"
                            : "hover:bg-accent/40"
                      }`}
                      style={{ height: ROW_H }}
                    >
                      <td
                        className={`sticky left-0 z-10 px-2 ${
                          isSel ? "bg-[#f4f4fd] dark:bg-[#191927]" : "bg-card"
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={isSel}
                          onCheckedChange={() => {}}
                          onClick={(e) => {
                            e.preventDefault();
                            toggleOne(idx, (e as React.MouseEvent).shiftKey);
                          }}
                          aria-label="Select lead"
                          className="h-3.5 w-3.5"
                        />
                      </td>
                      {visibleCols.map((c, ci) => (
                        <td
                          key={c.key}
                          className={`overflow-hidden px-2 ${
                            ci === 0
                              ? `sticky left-[36px] z-10 ${isSel ? "bg-[#f4f4fd] dark:bg-[#191927]" : "bg-card"}`
                              : ""
                          }`}
                        >
                          {renderCell(c, r, idx)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {endIdx < rows.length && <tr style={{ height: (rows.length - endIdx) * ROW_H }} />}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-card px-3 py-2 shadow-lg">
          <span className="mr-2 text-xs font-semibold">
            {selected.size} selected
            {selectedGroupIds.length > selected.size && (
              <span className="ml-1 font-normal text-muted-foreground">
                ({selectedGroupIds.length} contacts)
              </span>
            )}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs">
                Stage <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {PIPELINE_STAGES.map((s) => (
                <DropdownMenuItem
                  key={s}
                  onSelect={() =>
                    canEdit
                      ? bulkUpdate.mutate({ ids: selectedGroupIds, patch: { pipeline_stage: s } })
                      : requireMigration()
                  }
                >
                  <span className={`mr-2 h-2 w-2 rounded-full ${STAGE_DOT[s]}`} /> {STAGE_LABEL[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs">
                Priority <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {PRIORITIES.map((p) => (
                <DropdownMenuItem
                  key={p}
                  onSelect={() =>
                    canEdit
                      ? bulkUpdate.mutate({ ids: selectedGroupIds, patch: { priority: p } })
                      : requireMigration()
                  }
                >
                  <Flag className={`mr-2 h-3.5 w-3.5 ${PRIORITY_FLAG[p]}`} fill="currentColor" />
                  {PRIORITY_LABEL[p]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs">
                Follow-up <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 space-y-2 p-3">
              <div className="text-xs font-medium text-muted-foreground">Set follow-up date</div>
              <Input
                type="date"
                onChange={(e) => {
                  if (!e.target.value) return;
                  if (!canEdit) return requireMigration();
                  bulkUpdate.mutate({
                    ids: selectedGroupIds,
                    patch: { next_action_due: e.target.value },
                  });
                }}
              />
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={bulkEmail}>
            <Mail className="mr-1 h-3 w-3" /> Email
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => exportCsv(selected)}>
            <Download className="mr-1 h-3 w-3" /> Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs text-rose-600 hover:text-rose-700"
            onClick={() => setConfirmDelete(selectedGroupIds)}
          >
            <Trash2 className="mr-1 h-3 w-3" /> Delete
          </Button>
          <button
            type="button"
            className="ml-1 text-muted-foreground/60 hover:text-foreground"
            onClick={() => setSelected(new Set())}
            title="Clear selection (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {confirmDelete?.length === 1 ? "this lead" : `${confirmDelete?.length} leads`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the lead{confirmDelete && confirmDelete.length > 1 ? "s" : ""}, including
              activity history and documents. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => {
                if (confirmDelete) bulkDelete.mutate(confirmDelete);
                setConfirmDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------- Hover preview (lazy — mounts only while open) ----------

function LeadPreview({ r }: { r: RowVM }) {
  const listActsFn = useServerFn(listLeadActivities);
  const { data: acts = [], isLoading } = useQuery({
    queryKey: ["lead-acts-preview", r.lead.id],
    queryFn: () => listActsFn({ data: { leadId: r.lead.id } }),
    staleTime: 30_000,
  });
  const h = HEALTH_META[r.health];
  return (
    <div className="text-[13px]">
      <div className="border-b p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-semibold">{r.companyName}</div>
            <div className="truncate text-xs text-muted-foreground">
              {[r.lead.contact_person, r.lead.job_title, r.country].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
          <span className={`shrink-0 text-xs font-medium ${h.className}`}>
            {h.emoji} {h.label}
          </span>
        </div>
        {r.productText && (
          <div className="mt-1.5 truncate text-xs italic text-muted-foreground" title={r.productText}>
            {r.productText}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${STAGE_DOT[r.stage]}`} /> {STAGE_LABEL[r.stage]}
          </span>
          {r.lead.pipeline_value_cents > 0 && (
            <span className="font-medium">{fmtMoneyCents(r.lead.pipeline_value_cents)}</span>
          )}
          {r.lead.email_status && (
            <span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${EMAIL_STATUS_STYLES[r.lead.email_status]}`}>
              {EMAIL_STATUS_LABEL[r.lead.email_status]}
            </span>
          )}
        </div>
        {r.summary.text && (
          <div className="mt-2 rounded bg-muted/60 p-2 text-xs leading-snug">
            {r.summary.isAi && <Sparkles className="mr-1 inline h-3 w-3 text-primary" />}
            {r.summary.text}
          </div>
        )}
      </div>
      <div className="max-h-52 overflow-y-auto p-3">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Recent activity
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-3 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : acts.length === 0 ? (
          <div className="text-xs text-muted-foreground">No activity recorded yet.</div>
        ) : (
          <div className="space-y-2">
            {acts.slice(0, 6).map((a: { id: string; kind: string; body: string; created_at: string }) => (
              <div key={a.id} className="flex gap-2 text-xs">
                <span className="shrink-0 font-medium capitalize text-muted-foreground">{a.kind}</span>
                <span className="min-w-0 flex-1 truncate" title={a.body}>
                  {a.body}
                </span>
                <span className="shrink-0 text-muted-foreground/60">
                  {new Date(a.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="border-t p-2 text-right">
        <Link to="/app/leads/$id" params={{ id: r.lead.id }} className="text-xs font-medium text-primary hover:underline">
          Open lead →
        </Link>
      </div>
    </div>
  );
}

// ---------- Generic facet filter (shared with ProspectsTable) ----------

export function FacetFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string; count: number }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const active = selected.length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
            active
              ? "border-primary/40 bg-primary/[0.07] text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          {label}
          {active && <span className="rounded bg-primary/15 px-1">{selected.length}</span>}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
        {options.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No options</div>
        )}
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onCheckedChange={(on) =>
              onChange(on ? [...selected, o.value] : selected.filter((v) => v !== o.value))
            }
            onSelect={(e) => e.preventDefault()}
          >
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            <span className="ml-2 text-[10px] text-muted-foreground">{o.count}</span>
          </DropdownMenuCheckboxItem>
        ))}
        {active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])} className="text-xs text-muted-foreground">
              Clear {label.toLowerCase()} filter
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
