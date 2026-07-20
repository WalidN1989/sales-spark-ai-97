// Lead Workspace — the "sales notebook" lead page. It answers three questions
// and nothing else: Who is this? · What happened? · What do I do next?
//
// Layout: identity header + Activity Journal (the star) in the main column;
// searchable Contacts drawer, Next Follow-up box, a derived recommendation, and
// collapsible Company Information in the right rail. Route-specific extras
// (documents, inquiries, AI respond, notes) mount through the `secondary` and
// `companyInfo` slots so this component stays focused.

import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarClock,
  ChevronDown,
  Flag,
  Linkedin,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addLeadActivity,
  deleteLeadActivity,
  listCompanyActivities,
  updateLead,
} from "@/lib/leads.functions";
import { listNotes, deleteNote } from "@/lib/notes.functions";
import { faviconUrl, leadInitials, waHref, fmtMoneyCents, type LeadStatus } from "@/lib/leads-ui";
import {
  ACTIVITY_KINDS,
  OUTCOMES,
  PRIORITIES,
  PRIORITY_LABEL,
  PRIORITY_FLAG,
  STAGE_LABEL,
  STAGE_DOT,
  activityMeta,
  outcomeMeta,
  dayLabel,
  dueInfo,
  DUE_TONE_CLASS,
  leadStage,
  leadPriority,
  followUpRecommendation,
  hasCommandColumns,
  type ActivityKind,
  type Outcome,
  type LeadPriority,
} from "@/lib/leads-command";
import { cn } from "@/lib/utils";

export type WorkspaceContact = {
  id: string;
  contact_person: string | null;
  contact_email: string | null;
  whatsapp: string | null;
  phone?: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  is_primary?: boolean | null;
  lead_score?: number | null;
  status: LeadStatus;
  pipeline_stage?: string | null;
  next_action?: string | null;
  next_action_due?: string | null;
  priority?: string | null;
  last_activity_at?: string | null;
  products_services?: string[] | null;
  pipeline_value_cents?: number;
};

type ActivityRow = {
  id: string;
  lead_id: string;
  kind: string;
  body: string;
  outcome?: string | null;
  created_at: string;
};

type NoteRow = { id: string; title: string | null; body_text: string | null; created_at: string };

// A journal entry is either an activity row or a note folded into the feed.
type FeedEntry = {
  id: string;
  lead_id?: string;
  noteId?: string;
  kind: string;
  body: string;
  outcome?: string | null;
  created_at: string;
};

export function LeadWorkspace({
  companyName,
  industry,
  country,
  city,
  website,
  contacts,
  anchorId,
  activeContactId,
  onSelectContact,
  onAddContact,
  header,
  companyInfo,
  secondary,
  notesEntityType,
  notesEntityId,
  onChanged,
}: {
  companyName: string;
  industry?: string | null;
  country?: string | null;
  city?: string | null;
  website?: string | null;
  contacts: WorkspaceContact[];
  anchorId: string;
  activeContactId?: string;
  onSelectContact?: (id: string) => void;
  onAddContact?: () => void;
  header?: ReactNode;
  companyInfo?: ReactNode;
  secondary?: ReactNode;
  // Company/lead notes are blended into the Activity Journal (one history).
  notesEntityType?: "prospect" | "lead";
  notesEntityId?: string | null;
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const listActsFn = useServerFn(listCompanyActivities);
  const addActFn = useServerFn(addLeadActivity);
  const delActFn = useServerFn(deleteLeadActivity);
  const updateFn = useServerFn(updateLead);
  const listNotesFn = useServerFn(listNotes);
  const delNoteFn = useServerFn(deleteNote);

  const contactIds = useMemo(() => contacts.map((c) => c.id), [contacts]);
  const anchor = contacts.find((c) => c.id === anchorId) ?? contacts[0];
  const canEdit = hasCommandColumns(contacts as unknown as Array<Record<string, unknown>>);

  const primary =
    contacts.find((c) => c.is_primary) ??
    [...contacts].sort((a, b) => (a.contact_person ?? "").localeCompare(b.contact_person ?? ""))[0] ??
    anchor;

  const productsInterested = useMemo(
    () => [...new Set(contacts.flatMap((c) => c.products_services ?? []))],
    [contacts],
  );
  const contactName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contacts) m.set(c.id, c.contact_person ?? c.contact_email ?? "Unknown");
    return m;
  }, [contacts]);

  const journalKey = ["company-activities", ...[...contactIds].sort()];
  const { data: activities = [], isLoading: actsLoading } = useQuery({
    queryKey: journalKey,
    queryFn: () => listActsFn({ data: { leadIds: contactIds } }),
    enabled: contactIds.length > 0,
  });

  // Company/lead notes are folded into the same journal — one history.
  const notesKey = ["workspace-notes", notesEntityType ?? "", notesEntityId ?? ""];
  const { data: notes = [] } = useQuery({
    queryKey: notesKey,
    queryFn: () => listNotesFn({ data: { entityType: notesEntityType, entityId: notesEntityId } }),
    enabled: !!notesEntityId && !!notesEntityType,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: journalKey });
    qc.invalidateQueries({ queryKey: notesKey });
    onChanged?.();
  };

  const stage = leadStage(anchor);
  const priority = leadPriority(anchor);

  // ---- Follow-up editing (on the anchor lead) ----
  const patchAnchor = useMutation({
    mutationFn: (patch: Record<string, unknown>) => updateFn({ data: { id: anchorId, patch } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (entry: FeedEntry) =>
      entry.noteId ? delNoteFn({ data: { id: entry.noteId } }) : delActFn({ data: { id: entry.id } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const [addOpen, setAddOpen] = useState(false);
  const [filter, setFilter] = useState<ActivityKind | "all">("all");
  const [companyOpen, setCompanyOpen] = useState(false);

  // One unified feed: activity rows + notes (as note-kind entries), newest first.
  const feed = useMemo<FeedEntry[]>(() => {
    const acts: FeedEntry[] = (activities as ActivityRow[]).map((a) => ({
      id: a.id,
      lead_id: a.lead_id,
      kind: a.kind,
      body: a.body,
      outcome: a.outcome ?? null,
      created_at: a.created_at,
    }));
    const noteEntries: FeedEntry[] = (notes as NoteRow[]).map((n) => ({
      id: `note-${n.id}`,
      noteId: n.id,
      kind: "note",
      body: [n.title, n.body_text].filter((s) => s && s.trim()).join("\n").trim() || "(empty note)",
      created_at: n.created_at,
    }));
    return [...acts, ...noteEntries].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [activities, notes]);

  const rec = followUpRecommendation({
    lastActivityAt: feed[0]?.created_at ?? anchor.last_activity_at,
    stage,
    nextActionDue: anchor.next_action_due,
    primaryContact: primary?.contact_person,
  });

  const filtered = filter === "all" ? feed : feed.filter((a) => a.kind === filter);

  // Group the (newest-first) feed by day.
  const grouped = useMemo(() => {
    const out: { day: string; items: FeedEntry[] }[] = [];
    for (const a of filtered) {
      const day = dayLabel(a.created_at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(a);
      else out.push({ day, items: [a] });
    }
    return out;
  }, [filtered]);

  const kindsPresent = useMemo(() => {
    const s = new Set<string>();
    for (const a of feed) s.add(a.kind);
    return s;
  }, [feed]);

  return (
    <div className="grid gap-4 min-w-0 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        {header}

        {/* WHO — compact identity */}
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-start gap-3">
            {faviconUrl(website) ? (
              <img src={faviconUrl(website)!} alt="" className="mt-0.5 h-10 w-10 shrink-0 rounded-lg ring-1 ring-border" loading="lazy" />
            ) : (
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary text-sm font-bold">
                {companyName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold tracking-tight">{companyName}</h1>
              <div className="truncate text-sm text-muted-foreground">
                {[industry, [city, country].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium">
                <span className={cn("h-2 w-2 rounded-full", STAGE_DOT[stage])} /> {STAGE_LABEL[stage]}
              </span>
            </div>
          </div>

          {productsInterested.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Products interested
              </div>
              <div className="flex flex-wrap gap-1.5">
                {productsInterested.slice(0, 8).map((p) => (
                  <span key={p} className="rounded-md bg-secondary px-2 py-0.5 text-xs">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {primary && (
            <div className="mt-3 flex items-center gap-2 border-t pt-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {leadInitials(primary.contact_person, companyName)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <span className="truncate">{primary.contact_person ?? "—"}</span>
                  <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {primary.job_title ?? "Decision maker"}
                </div>
              </div>
              <ContactActions c={primary} className="ml-auto" />
            </div>
          )}
        </div>

        {/* WHAT HAPPENED — the Activity Journal */}
        <div className="rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold">Activity Journal</h2>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                {feed.length}
              </span>
            </div>
            <Button size="sm" className="h-8" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add Activity
            </Button>
          </div>

          {/* Type filter chips */}
          <div className="flex flex-wrap items-center gap-1 border-b px-3 py-2">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                filter === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
              )}
            >
              All
            </button>
            {ACTIVITY_KINDS.filter((k) => k !== "log" && (kindsPresent.has(k) || k === filter)).map((k) => {
              const m = activityMeta(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(filter === k ? "all" : k)}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    filter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  <span>{m.emoji}</span> {m.label}
                </button>
              );
            })}
          </div>

          {/* Feed */}
          <div className="max-h-[calc(100vh-360px)] min-h-[200px] overflow-y-auto p-3">
            {actsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : grouped.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  {filter === "all" ? "No activity yet." : `No ${activityMeta(filter).label.toLowerCase()} activity.`}
                </p>
                {filter === "all" && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setAddOpen(true)}>
                    <Plus className="mr-1 h-4 w-4" /> Log the first interaction
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {grouped.map((g) => (
                  <div key={g.day}>
                    <div className="sticky top-0 z-10 -mx-3 mb-1 bg-card/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                      {g.day}
                    </div>
                    <div className="space-y-2">
                      {g.items.map((a) => (
                        <JournalEntry
                          key={a.id}
                          a={a}
                          who={contactIds.length > 1 && a.lead_id ? contactName.get(a.lead_id) : undefined}
                          onDelete={() => del.mutate(a)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {secondary}
      </div>

      {/* RIGHT RAIL */}
      <div className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:self-start">
        {/* WHAT NEXT — Next Follow-up */}
        <NextFollowUpBox
          anchor={anchor}
          stage={stage}
          priority={priority}
          canEdit={canEdit}
          onSetDue={(v) => patchAnchor.mutate({ next_action_due: v })}
          onSetAction={(v) => patchAnchor.mutate({ next_action: v })}
          onSetPriority={(p) => patchAnchor.mutate({ priority: p })}
        />

        {/* Derived recommendation */}
        {rec && (
          <div
            className={cn(
              "rounded-xl border p-3 text-sm",
              rec.tone === "overdue"
                ? "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30"
                : rec.tone === "due"
                  ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
                  : rec.tone === "quiet"
                    ? "border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/30"
                    : "border-border bg-muted/40",
            )}
          >
            <div className="flex items-center gap-1.5 font-semibold">
              <Sparkles className="h-3.5 w-3.5" /> {rec.headline}
            </div>
            <p className="mt-1 text-muted-foreground">{rec.suggestion}</p>
          </div>
        )}

        {/* WHO TO TALK TO — Contacts drawer */}
        <ContactsDrawer
          contacts={contacts}
          primaryId={primary?.id}
          activeContactId={activeContactId}
          onSelectContact={onSelectContact}
          onAddContact={onAddContact}
          companyName={companyName}
        />

        {/* Collapsible Company Information */}
        {companyInfo && (
          <div className="rounded-xl border bg-card">
            <button
              type="button"
              onClick={() => setCompanyOpen((o) => !o)}
              className="flex w-full items-center justify-between p-3 text-sm font-semibold"
            >
              Company Information
              <ChevronDown className={cn("h-4 w-4 transition-transform", companyOpen && "rotate-180")} />
            </button>
            {companyOpen && <div className="border-t p-3">{companyInfo}</div>}
          </div>
        )}
      </div>

      <AddActivityDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        contacts={contacts}
        defaultContactId={anchorId}
        canScheduleFollowUp={canEdit}
        onSubmit={async (payload) => {
          await addActFn({ data: payload });
          invalidate();
          setAddOpen(false);
          toast.success("Activity logged");
        }}
      />
    </div>
  );
}

// ---------- Journal entry ----------

function JournalEntry({ a, who, onDelete }: { a: FeedEntry; who?: string; onDelete: () => void }) {
  const m = activityMeta(a.kind);
  const oc = outcomeMeta(a.outcome);
  const time = new Date(a.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return (
    <div className="group flex gap-3">
      <div className="flex flex-col items-center">
        <div className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm", m.tint)} title={m.label}>
          <span>{m.emoji}</span>
        </div>
        <div className="mt-1 w-px flex-1 bg-border" />
      </div>
      <div className="min-w-0 flex-1 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{m.label}</span>
          {oc && <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", oc.className)}>{oc.label}</span>}
          <span className="text-xs text-muted-foreground">{time}</span>
          {who && <span className="truncate text-xs text-muted-foreground">· {who}</span>}
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto rounded p-1 text-muted-foreground/0 transition-colors hover:bg-muted hover:text-rose-600 group-hover:text-muted-foreground/60"
            title="Delete entry"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground/90">{a.body}</p>
      </div>
    </div>
  );
}

// ---------- Next Follow-up box ----------

function NextFollowUpBox({
  anchor,
  stage,
  priority,
  canEdit,
  onSetDue,
  onSetAction,
  onSetPriority,
}: {
  anchor: WorkspaceContact;
  stage: string;
  priority: LeadPriority;
  canEdit: boolean;
  onSetDue: (v: string | null) => void;
  onSetAction: (v: string | null) => void;
  onSetPriority: (p: LeadPriority) => void;
}) {
  const due = dueInfo(anchor.next_action_due);
  const [editing, setEditing] = useState(false);
  const done = stage === "won" || stage === "lost";

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-bold">
          <CalendarClock className="h-4 w-4" /> Next Follow-up
        </div>
        {canEdit && !done && (
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {editing ? "Done" : "Edit"}
          </button>
        )}
      </div>

      {done ? (
        <p className="text-sm text-muted-foreground">Deal {stage === "won" ? "won" : "closed"} — no follow-up needed.</p>
      ) : editing ? (
        <div className="space-y-2">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date</label>
            <Input
              type="date"
              defaultValue={anchor.next_action_due ?? ""}
              onChange={(e) => onSetDue(e.target.value || null)}
              className="h-8"
            />
            <div className="mt-1 flex flex-wrap gap-1">
              {([["Today", 0], ["Tomorrow", 1], ["+3d", 3], ["+1w", 7]] as const).map(([label, d]) => (
                <Button
                  key={label}
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    const dt = new Date();
                    dt.setDate(dt.getDate() + d);
                    onSetDue(dt.toISOString().slice(0, 10));
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Action</label>
            <Input
              defaultValue={anchor.next_action ?? ""}
              placeholder="e.g. Call procurement"
              maxLength={200}
              className="h-8"
              onBlur={(e) => onSetAction(e.target.value.trim() || null)}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Priority</label>
            <div className="mt-1 flex gap-1">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onSetPriority(p)}
                  className={cn(
                    "flex items-center gap-1 rounded border px-2 py-1 text-xs",
                    priority === p ? "border-primary bg-primary/10" : "hover:bg-accent",
                  )}
                >
                  <Flag className={cn("h-3 w-3", PRIORITY_FLAG[p])} fill="currentColor" /> {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : anchor.next_action_due || anchor.next_action ? (
        <div className="space-y-2">
          {anchor.next_action_due && (
            <div className={cn("text-2xl font-bold", DUE_TONE_CLASS[due.tone])}>
              {new Date(anchor.next_action_due).toLocaleDateString(undefined, { day: "numeric", month: "long" })}
            </div>
          )}
          <div className={cn("text-xs font-medium", DUE_TONE_CLASS[due.tone])}>{due.label}</div>
          {anchor.next_action && <div className="text-sm">{anchor.next_action}</div>}
          <div className="flex items-center gap-1.5 pt-1 text-xs">
            <Flag className={cn("h-3 w-3", PRIORITY_FLAG[priority])} fill="currentColor" />
            <span className="text-muted-foreground">{PRIORITY_LABEL[priority]} priority</span>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm text-muted-foreground">No follow-up scheduled.</p>
          {canEdit && (
            <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => setEditing(true)}>
              <Plus className="mr-1 h-3 w-3" /> Schedule follow-up
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Contacts drawer ----------

function ContactActions({ c, className }: { c: WorkspaceContact; className?: string }) {
  const wa = waHref(c.whatsapp);
  const cls = "grid h-7 w-7 place-items-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground";
  return (
    <div className={cn("flex items-center gap-0.5", className)} onClick={(e) => e.stopPropagation()}>
      {c.contact_email && (
        <a href={`mailto:${c.contact_email}`} title={c.contact_email} className={cls}>
          <Mail className="h-3.5 w-3.5" />
        </a>
      )}
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" title={`WhatsApp ${c.whatsapp}`} className={cn(cls, "hover:text-[#25D366]")}>
          <MessageCircle className="h-3.5 w-3.5" />
        </a>
      )}
      {(c.phone || c.whatsapp) && (
        <a href={`tel:${(c.phone ?? c.whatsapp ?? "").replace(/[^\d+]/g, "")}`} title={c.phone ?? c.whatsapp ?? ""} className={cls}>
          <Phone className="h-3.5 w-3.5" />
        </a>
      )}
      {c.linkedin_url && (
        <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" title="LinkedIn" className={cn(cls, "hover:text-[#0A66C2]")}>
          <Linkedin className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

function ContactsDrawer({
  contacts,
  primaryId,
  activeContactId,
  onSelectContact,
  onAddContact,
  companyName,
}: {
  contacts: WorkspaceContact[];
  primaryId?: string;
  activeContactId?: string;
  onSelectContact?: (id: string) => void;
  onAddContact?: () => void;
  companyName: string;
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const list = needle
    ? contacts.filter((c) =>
        [c.contact_person, c.job_title, c.contact_email].filter(Boolean).join(" ").toLowerCase().includes(needle),
      )
    : contacts;
  // Primary first, then alphabetical
  const sorted = [...list].sort(
    (a, b) =>
      (b.id === primaryId ? 1 : 0) - (a.id === primaryId ? 1 : 0) ||
      (a.contact_person ?? "").localeCompare(b.contact_person ?? ""),
  );

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between p-3 pb-2">
        <div className="flex items-center gap-1.5 text-sm font-bold">
          Contacts <span className="rounded-full bg-secondary px-1.5 text-xs text-muted-foreground">{contacts.length}</span>
        </div>
        {onAddContact && (
          <button
            type="button"
            onClick={onAddContact}
            className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Add contact"
          >
            <UserPlus className="h-4 w-4" />
          </button>
        )}
      </div>
      {contacts.length > 4 && (
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts…" className="h-8 pl-7 text-xs" />
          </div>
        </div>
      )}
      <div className="max-h-[340px] overflow-y-auto px-1.5 pb-2">
        {sorted.map((c) => {
          const active = c.id === activeContactId;
          return (
            <div
              key={c.id}
              onClick={() => onSelectContact?.(c.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5",
                onSelectContact && "cursor-pointer",
                active ? "bg-accent" : "hover:bg-accent/50",
              )}
            >
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold">
                {leadInitials(c.contact_person, companyName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-sm font-medium">
                  <span className="truncate">{c.contact_person ?? c.contact_email ?? "—"}</span>
                  {c.id === primaryId && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
                </div>
                {c.job_title && <div className="truncate text-[11px] text-muted-foreground">{c.job_title}</div>}
              </div>
              <ContactActions c={c} />
            </div>
          );
        })}
        {sorted.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">No contacts match.</p>}
      </div>
    </div>
  );
}

// ---------- Add Activity dialog (medical-record template) ----------

function AddActivityDialog({
  open,
  onClose,
  contacts,
  defaultContactId,
  canScheduleFollowUp,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  contacts: WorkspaceContact[];
  defaultContactId: string;
  canScheduleFollowUp: boolean;
  onSubmit: (payload: {
    leadId: string;
    kind: ActivityKind;
    body: string;
    outcome?: Outcome | null;
    next_action?: string | null;
    next_action_due?: string | null;
  }) => Promise<void>;
}) {
  const [kind, setKind] = useState<ActivityKind>("call");
  const [leadId, setLeadId] = useState(defaultContactId);
  const [body, setBody] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [nextAction, setNextAction] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setKind("call");
    setLeadId(defaultContactId);
    setBody("");
    setOutcome(null);
    setNextAction("");
    setDue("");
  };

  const submit = async () => {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        leadId,
        kind,
        body: body.trim(),
        outcome,
        ...(canScheduleFollowUp && due ? { next_action_due: due } : {}),
        ...(canScheduleFollowUp && nextAction.trim() ? { next_action: nextAction.trim() } : {}),
      });
      reset();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

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
          <DialogTitle>Add Activity</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Type */}
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Activity type
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {ACTIVITY_KINDS.filter((k) => k !== "log").map((k) => {
                const m = activityMeta(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border py-2 text-xs transition-colors",
                      kind === k ? "border-primary bg-primary/10 font-semibold" : "hover:bg-accent",
                    )}
                  >
                    <span className="text-base">{m.emoji}</span>
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Contact (only when several) */}
          {contacts.length > 1 && (
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Contact
              </label>
              <select
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contact_person ?? c.contact_email ?? "Unknown"}
                    {c.job_title ? ` — ${c.job_title}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Note */}
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              What happened?
            </label>
            <Textarea
              autoFocus
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="e.g. Called procurement — asked about warranty, needs revised quotation."
            />
          </div>

          {/* Outcome */}
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Outcome <span className="font-normal normal-case">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {OUTCOMES.map((o) => {
                const m = outcomeMeta(o)!;
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOutcome(outcome === o ? null : o)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                      outcome === o ? m.className : "bg-muted text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Next follow-up */}
          {canScheduleFollowUp && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Schedule next follow-up <span className="font-normal normal-case">(optional)</span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 w-40" />
                {([["Tomorrow", 1], ["+3d", 3], ["+1w", 7]] as const).map(([label, d]) => (
                  <Button
                    key={label}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 px-2 text-xs"
                    onClick={() => {
                      const dt = new Date();
                      dt.setDate(dt.getDate() + d);
                      setDue(dt.toISOString().slice(0, 10));
                    }}
                  >
                    {label}
                  </Button>
                ))}
                {due && (
                  <button type="button" onClick={() => setDue("")} className="text-muted-foreground/60 hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {due && (
                <Input
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  placeholder="What's the next action? e.g. Send revised quote"
                  maxLength={200}
                  className="mt-2 h-8"
                />
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!body.trim() || saving}>
            {saving ? "Saving…" : "Log Activity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
