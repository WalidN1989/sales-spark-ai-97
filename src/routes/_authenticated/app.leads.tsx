import { createFileRoute, Link, Outlet, useChildMatches, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, useMemo } from "react";
import {
  Flame,
  TrendingUp,
  Target,
  Mail,
  MessageCircle,
  Plus,
  Upload,
  Sparkles,
  X,
  Image as ImageIcon,
  Linkedin,
  Users as UsersIcon,
} from "lucide-react";
import { listLeads, createQuickLead, extractLeadFromImage } from "@/lib/leads.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  LEAD_STATUS_DOT,
  LEAD_STATUS_ORDER,
  LEAD_STATUS_STYLES,
  type LeadStatus,
  fmtMoneyCents,
  leadInitials,
  timeAgo,
  waHref,
  scoreBucket,
  EMAIL_STATUS_STYLES,
  EMAIL_STATUS_LABEL,
  type EmailStatusUI,
} from "@/lib/leads-ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/leads")({
  head: () => ({ meta: [{ title: "Leads — Sales Insights" }] }),
  component: LeadsRoot,
});

function LeadsRoot() {
  const childMatches = useChildMatches();
  if (childMatches.length > 0) return <Outlet />;
  return <LeadsPage />;
}

type Lead = {
  id: string;
  company_id: string | null;
  contact_person: string | null;
  contact_email: string | null;
  whatsapp: string | null;
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
  department: string | null;
  seniority: string | null;
  website: string | null;
  created_at: string | null;
  updated_at: string | null;
  companies: { name: string; domain: string | null; country: string | null; industry: string | null } | null;
};

type SortKey = "score" | "updated" | "created" | "status";

const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;
const isNewLead = (l: Lead) =>
  !!l.created_at && Date.now() - new Date(l.created_at).getTime() < NEW_WINDOW_MS;

function LeadsPage() {
  const listFn = useServerFn(listLeads);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({ queryKey: ["leads"], queryFn: () => listFn() });
  const leads = (data ?? []) as unknown as Lead[];

  const [quickOpen, setQuickOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("status");

  // ---------- Group by visible company first, even when some rows have company_id ----------
  type Item =
    | { kind: "single"; lead: Lead }
    | { kind: "group"; groupKey: string; companyName: string; leads: Lead[] };

  const items = useMemo<Item[]>(() => {
    const normalizeName = (n: string | null | undefined) =>
      (n ?? "")
        .trim()
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const normalizeDomain = (d: string | null | undefined) =>
      (d ?? "")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0]
        .trim();
    const groupKeyFor = (l: Lead): string | null => {
      const name = normalizeName(l.company_name ?? l.companies?.name);
      if (name) return `name:${name}`;
      const domain = normalizeDomain(l.website ?? l.companies?.domain);
      if (domain) return `domain:${domain}`;
      if (l.company_id) return `id:${l.company_id}`;
      return name ? `name:${name}` : null;
    };

    const groupsMap = new Map<string, Lead[]>();
    const singles: Lead[] = [];
    for (const l of leads) {
      const k = groupKeyFor(l);
      if (!k) {
        singles.push(l);
        continue;
      }
      const arr = groupsMap.get(k) ?? [];
      arr.push(l);
      groupsMap.set(k, arr);
    }
    const out: Item[] = [];
    for (const [groupKey, arr] of groupsMap) {
      if (arr.length >= 2) {
        out.push({
          kind: "group",
          groupKey,
          companyName: arr[0].company_name ?? arr[0].companies?.name ?? "Company",
          leads: arr,
        });
      } else {
        singles.push(arr[0]);
      }
    }
    for (const l of singles) out.push({ kind: "single", lead: l });
    return out;
  }, [leads]);

  const sorted = useMemo(() => {
    const arr = [...items];
    const itemScore = (i: Item) =>
      i.kind === "single" ? i.lead.lead_score ?? 0 : Math.max(...i.leads.map((l) => l.lead_score ?? 0));
    const itemUpdated = (i: Item) =>
      i.kind === "single" ? i.lead.updated_at ?? "" : i.leads.map((l) => l.updated_at ?? "").sort().slice(-1)[0] ?? "";
    const itemCreated = (i: Item) =>
      i.kind === "single" ? i.lead.created_at ?? "" : i.leads.map((l) => l.created_at ?? "").sort().slice(-1)[0] ?? "";
    const itemStatus = (i: Item) =>
      i.kind === "single"
        ? LEAD_STATUS_ORDER[i.lead.status]
        : Math.min(...i.leads.map((l) => LEAD_STATUS_ORDER[l.status]));
    const itemActivity = (i: Item) =>
      i.kind === "single" ? i.lead.last_activity_at ?? "" : i.leads.map((l) => l.last_activity_at ?? "").sort().slice(-1)[0] ?? "";
    const itemIsNew = (i: Item) =>
      i.kind === "single" ? isNewLead(i.lead) : i.leads.some(isNewLead);

    if (sortKey === "score") arr.sort((a, b) => itemScore(b) - itemScore(a));
    else if (sortKey === "updated") arr.sort((a, b) => itemUpdated(b).localeCompare(itemUpdated(a)));
    else if (sortKey === "created") arr.sort((a, b) => itemCreated(b).localeCompare(itemCreated(a)));
    else
      arr.sort((a, b) => {
        // bubble "new" leads to the top regardless of status
        const an = itemIsNew(a) ? 0 : 1;
        const bn = itemIsNew(b) ? 0 : 1;
        if (an !== bn) return an - bn;
        const s = itemStatus(a) - itemStatus(b);
        if (s !== 0) return s;
        return itemActivity(b).localeCompare(itemActivity(a));
      });
    return arr;
  }, [items, sortKey]);

  const hotCount = leads.filter((l) => l.status === "hot").length;
  const pipelineCents = leads.reduce((a, l) => a + (l.pipeline_value_cents || 0), 0);
  const quotaPct = leads.length === 0 ? 0 : Math.round((hotCount / leads.length) * 100);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">Prospects you're actively pursuing.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="status">Sort: Status</SelectItem>
              <SelectItem value="score">Sort: Score</SelectItem>
              <SelectItem value="updated">Sort: Recent</SelectItem>
              <SelectItem value="created">Sort: Newest</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setQuickOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add Lead
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-orange-100 text-orange-500">
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Hot Leads</div>
            <div className="text-2xl font-bold">{hotCount}</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-sky-100 text-sky-600">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Pipeline Value</div>
            <div className="text-2xl font-bold">{fmtMoneyCents(pipelineCents)}</div>
          </div>
        </Card>
        <Card className="p-4 bg-slate-900 text-white flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-white/10">
            <Target className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-xs uppercase text-white/60">Hot Ratio</div>
            <div className="text-2xl font-bold">{quotaPct}%</div>
            <div className="mt-1 h-1.5 w-full rounded bg-white/10">
              <div className="h-full rounded bg-sky-400" style={{ width: `${quotaPct}%` }} />
            </div>
          </div>
        </Card>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : sorted.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No leads yet. Promote a prospect from the Prospects page using the 🔥 icon, or click "Add Lead".
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((item) =>
            item.kind === "group" ? (
              <GroupCard key={`g-${item.groupKey}`} groupKey={item.groupKey} companyName={item.companyName} leads={item.leads} />
            ) : (
              <SingleLeadCard key={item.lead.id} l={item.lead} onWhatsApp={(id) => navigate({ to: "/app/leads/$id", params: { id } })} />
            ),
          )}
        </div>
      )}

      <QuickAddLeadDialog
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["leads"] });
          setQuickOpen(false);
        }}
      />
    </div>
  );
}

// ---------- Single Lead Card ----------

function NewBadge() {
  return (
    <span className="absolute -left-1 -top-1 z-10 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow">
      New
    </span>
  );
}

function SingleLeadCard({ l, onWhatsApp }: { l: Lead; onWhatsApp: (id: string) => void }) {
  const isNew = isNewLead(l);
  return (
    <div className="relative">
      {isNew && <NewBadge />}
      <Link to="/app/leads/$id" params={{ id: l.id }} className="block">
        <Card className="p-4 pr-3 transition-colors hover:bg-accent min-h-[170px] flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-secondary text-sm font-semibold">
              {leadInitials(l.contact_person, l.companies?.name ?? "?")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{l.contact_person || l.whatsapp || "—"}</div>
              {l.job_title && (
                <div className="truncate text-xs font-medium text-foreground/80">{l.job_title}</div>
              )}
              <div className="truncate text-xs text-muted-foreground">
                {l.company_name || l.companies?.name ? `@ ${l.company_name ?? l.companies?.name}` : "WhatsApp lead"}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${LEAD_STATUS_STYLES[l.status]}`}>
                {l.status}
              </span>
              {l.lead_score != null && l.lead_score > 0 && (
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${scoreBucket(l.lead_score).className}`}>
                  {l.lead_score}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            {l.contact_email && (
              <div className="flex items-center gap-1.5 truncate">
                <span className="truncate">✉ {l.contact_email}</span>
                {l.email_status && (
                  <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase ${EMAIL_STATUS_STYLES[l.email_status]}`}>
                    {EMAIL_STATUS_LABEL[l.email_status]}
                  </span>
                )}
              </div>
            )}
            {l.whatsapp && <div className="truncate">☎ {l.whatsapp}</div>}
            {l.pipeline_value_cents > 0 && (
              <div className="text-foreground font-medium">{fmtMoneyCents(l.pipeline_value_cents)}</div>
            )}
          </div>

          {l.last_activity_note && (
            <div className="border-l-2 border-muted pl-2 text-xs italic text-muted-foreground line-clamp-2">
              "{l.last_activity_note}"
            </div>
          )}

          <div className="mt-auto flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${LEAD_STATUS_DOT[l.status]}`} />
              {timeAgo(l.last_activity_at)}
            </div>
            <div
              className="flex items-center gap-1"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {l.linkedin_url && (
                <a
                  href={l.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="LinkedIn"
                  className="grid h-8 w-8 place-items-center rounded-md bg-[#0A66C2] text-white hover:opacity-90"
                >
                  <Linkedin className="h-4 w-4" />
                </a>
              )}
              {waHref(l.whatsapp) ? (
                <a
                  href={waHref(l.whatsapp)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open WhatsApp"
                  className="grid h-8 w-8 place-items-center rounded-md bg-[#25D366] text-white hover:opacity-90"
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => onWhatsApp(l.id)}
                  className="grid h-8 px-2 place-items-center rounded-md border text-xs hover:bg-accent"
                >
                  + WhatsApp
                </button>
              )}
              {l.contact_email && (
                <a
                  href={`mailto:${l.contact_email}`}
                  title="Send email"
                  className="grid h-8 w-8 place-items-center rounded-md border hover:bg-accent"
                >
                  <Mail className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        </Card>
      </Link>
    </div>
  );
}

// ---------- Group Card (multiple leads from same company) ----------

function GroupCard({
  groupKey,
  companyName,
  leads,
}: {
  groupKey: string;
  companyName: string;
  leads: Lead[];
}) {
  const groupHasNew = leads.some(isNewLead);
  const topStatus = [...leads].sort(
    (a, b) => LEAD_STATUS_ORDER[a.status] - LEAD_STATUS_ORDER[b.status],
  )[0].status;
  const sumValue = leads.reduce((a, l) => a + (l.pipeline_value_cents || 0), 0);
  const lastActivity = leads
    .map((l) => l.last_activity_at ?? "")
    .sort()
    .slice(-1)[0];
  const visible = leads.slice(0, 3);
  const overflow = leads.length - visible.length;
  const domain = leads[0].companies?.domain ?? null;
  const country = leads[0].companies?.country ?? null;
  const industry = leads[0].companies?.industry ?? null;

  return (
    <div className="relative">
      {groupHasNew && <NewBadge />}
      <Link to="/app/leads/group/$companyId" params={{ companyId: encodeURIComponent(groupKey) }} className="block">
        <Card className="p-4 transition-colors hover:bg-accent min-h-[170px] flex flex-col gap-3 ring-1 ring-primary/30">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <UsersIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold flex items-center gap-2">
                {companyName}
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {leads.length} leads
                </span>
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {[industry, country, domain].filter(Boolean).join(" · ") || "Group"}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${LEAD_STATUS_STYLES[topStatus]}`}>
                {topStatus}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {visible.map((l) => (
              <div
                key={l.id}
                title={`${l.contact_person ?? "—"}${l.job_title ? ` · ${l.job_title}` : ""}`}
                className="flex items-center gap-1.5 rounded-full bg-secondary px-2 py-1 text-[11px]"
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-background text-[9px] font-bold">
                  {leadInitials(l.contact_person, l.company_name ?? "?")}
                </span>
                <span className="max-w-[100px] truncate">{l.contact_person || l.contact_email || "—"}</span>
                {l.linkedin_url && <Linkedin className="h-3 w-3 text-[#0A66C2]" />}
              </div>
            ))}
            {overflow > 0 && (
              <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium">+{overflow} more</span>
            )}
          </div>

          {sumValue > 0 && (
            <div className="text-xs font-medium text-foreground">Pipeline · {fmtMoneyCents(sumValue)}</div>
          )}

          <div className="mt-auto flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${LEAD_STATUS_DOT[topStatus]}`} />
              {timeAgo(lastActivity || null)}
            </div>
            <span className="text-primary font-medium">Open group →</span>
          </div>
        </Card>
      </Link>
    </div>
  );
}

// ---------- Quick Add Lead (WhatsApp) ----------


function QuickAddLeadDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const extractFn = useServerFn(extractLeadFromImage);
  const createFn = useServerFn(createQuickLead);
  const fileRef = useRef<HTMLInputElement>(null);

  const [images, setImages] = useState<string[]>([]);
  const [contact, setContact] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [product, setProduct] = useState("");
  const [note, setNote] = useState("");
  const [extracted, setExtracted] = useState<Set<string>>(new Set());

  const reset = () => {
    setImages([]);
    setContact("");
    setWhatsapp("");
    setEmail("");
    setCompanyName("");
    setWebsite("");
    setProduct("");
    setNote("");
    setExtracted(new Set());
  };

  const extract = useMutation({
    mutationFn: (url: string) => extractFn({ data: { imageDataUrl: url } }),
    onSuccess: (r) => {
      const tags = new Set<string>(extracted);
      // Merge: only fill empty fields so multiple images stack info
      if (r.contact_person && !contact) { setContact(r.contact_person); tags.add("contact"); }
      if (r.whatsapp && !whatsapp) { setWhatsapp(r.whatsapp.replace(/[^\d+\-\s()]/g, "")); tags.add("whatsapp"); }
      if (r.contact_email && !email) { setEmail(r.contact_email); tags.add("email"); }
      if (r.company_name && !companyName) { setCompanyName(r.company_name); tags.add("company"); }
      if (r.website && !website) { setWebsite(r.website); tags.add("website"); }
      if (r.product && !product) { setProduct(r.product); tags.add("product"); }
      if (r.note) {
        setNote((n) => (n ? `${n}\n${r.note}` : r.note!));
        tags.add("note");
      }
      setExtracted(tags);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          contact_person: contact || null,
          whatsapp,
          contact_email: email || null,
          company_name: companyName || null,
          website: website || null,
          product: product || null,
          note: note || null,
        },
      }),
    onSuccess: () => {
      toast.success("Lead added");
      reset();
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFiles = (files: File[] | FileList) => {
    const arr = Array.from(files).slice(0, 10);
    for (const file of arr) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 6 * 1024 * 1024) {
        toast.error(`${file.name || "Image"} is over 6 MB — skipped`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result || "");
        setImages((prev) => [...prev, url]);
        extract.mutate(url);
      };
      reader.readAsDataURL(file);
    }
  };

  // Paste images directly (Ctrl/Cmd + V) while dialog is open
  useEffect(() => {
    if (!open) return;
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        handleFiles(files);
        toast.success(`Pasted ${files.length} image${files.length === 1 ? "" : "s"}`);
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const tag = (k: string) =>
    extracted.has(k) ? (
      <span className="ml-2 text-[10px] font-bold tracking-wider text-sky-500 uppercase">Extracted</span>
    ) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New WhatsApp Lead</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
            }}
            className="relative cursor-pointer rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-center hover:bg-muted/50"
          >
            {images.length > 0 ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {images.map((src, i) => (
                    <div key={i} className="relative">
                      <img
                        src={src}
                        alt={`screenshot ${i + 1}`}
                        className="h-20 w-20 rounded object-cover ring-1 ring-border"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setImages((prev) => prev.filter((_, idx) => idx !== i));
                        }}
                        className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-background ring-1 ring-border hover:bg-muted"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">
                  {extract.isPending
                    ? "Reading screenshot(s)…"
                    : "Click, drop, or paste (Ctrl+V) more images"}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-4 text-sm text-muted-foreground">
                <ImageIcon className="h-6 w-6" />
                <div>
                  Drop, click to upload, or <span className="font-medium text-foreground">paste (Ctrl+V)</span> WhatsApp screenshots
                </div>
                <div className="text-xs">PNG / JPG / WebP, up to 6 MB each — multiple supported</div>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {extract.isPending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 animate-pulse" /> Extracting fields…
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Contact name {tag("contact")}
              </Label>
              <Input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                WhatsApp number * {tag("whatsapp")}
              </Label>
              <Input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                maxLength={30}
                placeholder="+971 50 753 1457"
                required
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Company name {tag("company")}
              </Label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                maxLength={200}
                placeholder="Optional"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Website {tag("website")}
              </Label>
              <Input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                maxLength={300}
                placeholder="example.com (optional)"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Product requested {tag("product")}
            </Label>
            <Input
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              maxLength={500}
              placeholder="What is the customer asking about?"
            />
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Email (optional) {tag("email")}
            </Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={200}
              type="email"
              placeholder="example@domain.com"
            />
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Notes / comments {tag("note")}
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Add internal notes about this lead…"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!whatsapp.trim() || create.isPending}
          >
            <Upload className="mr-1 h-4 w-4" />
            {create.isPending ? "Saving…" : "Add to Leads"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
