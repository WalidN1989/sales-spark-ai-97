// Pure helpers for the Leads Command Center: computed health, derived pipeline
// stage / next action, and human-relative date formatting. All functions are
// defensive about the new columns (pipeline_stage, priority, next_action,
// next_action_due, ai_summary) so the UI keeps working before the DB migration
// has been applied — derived values fill the gaps.

import type { LeadStatus } from "@/lib/leads-ui";

// ---------- Pipeline stage ----------

export const PIPELINE_STAGES = [
  "prospect",
  "qualified",
  "meeting",
  "quotation",
  "negotiation",
  "purchase_order",
  "won",
  "lost",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_LABEL: Record<PipelineStage, string> = {
  prospect: "Prospect",
  qualified: "Qualified",
  meeting: "Meeting",
  quotation: "Quotation",
  negotiation: "Negotiation",
  purchase_order: "PO",
  won: "Won",
  lost: "Lost",
};

export const STAGE_ORDER: Record<PipelineStage, number> = {
  prospect: 0,
  qualified: 1,
  meeting: 2,
  quotation: 3,
  negotiation: 4,
  purchase_order: 5,
  won: 6,
  lost: 7,
};

// Dot colour + text colour per stage — deliberately muted; colour = progress only.
export const STAGE_DOT: Record<PipelineStage, string> = {
  prospect: "bg-slate-400",
  qualified: "bg-sky-500",
  meeting: "bg-violet-500",
  quotation: "bg-amber-500",
  negotiation: "bg-orange-500",
  purchase_order: "bg-teal-500",
  won: "bg-emerald-500",
  lost: "bg-rose-400",
};

// ---------- Priority ----------

export const PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type LeadPriority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Record<LeadPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const PRIORITY_ORDER: Record<LeadPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const PRIORITY_FLAG: Record<LeadPriority, string> = {
  critical: "text-rose-600",
  high: "text-orange-500",
  medium: "text-amber-500",
  low: "text-slate-400",
};

// ---------- Health (always computed, never manual) ----------

export type LeadHealth = "hot" | "active" | "warm" | "cold";

export const HEALTH_META: Record<
  LeadHealth,
  { label: string; emoji: string; className: string; order: number }
> = {
  hot: { label: "Hot", emoji: "🔥", className: "text-orange-600", order: 0 },
  active: { label: "Active", emoji: "🟢", className: "text-emerald-600", order: 1 },
  warm: { label: "Warm", emoji: "🟡", className: "text-amber-600", order: 2 },
  cold: { label: "Cold", emoji: "🔴", className: "text-rose-600", order: 3 },
};

// The minimal shape the helpers need — the real Lead row is a superset.
export type CommandLeadLike = {
  status: LeadStatus;
  lead_score?: number | null;
  last_activity_at?: string | null;
  last_activity_kind?: string | null;
  last_activity_note?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  pipeline_stage?: string | null;
  priority?: string | null;
  next_action?: string | null;
  next_action_due?: string | null;
  ai_summary?: string | null;
};

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / 86_400_000);
}

export function computeHealth(l: CommandLeadLike): LeadHealth {
  if (l.status === "frozen" || l.status === "dead") return "cold";
  const silent = daysSince(l.last_activity_at ?? l.updated_at ?? l.created_at);
  if (l.status === "hot" && silent !== null && silent <= 7) return "hot";
  if ((l.lead_score ?? 0) >= 70 && silent !== null && silent <= 7) return "hot";
  if (silent === null) return "warm";
  if (silent <= 3) return "active";
  if (silent <= 10) return "warm";
  return "cold";
}

// ---------- Derived stage / priority (fallbacks before migration) ----------

export function leadStage(l: CommandLeadLike): PipelineStage {
  const s = l.pipeline_stage;
  if (s && (PIPELINE_STAGES as readonly string[]).includes(s)) return s as PipelineStage;
  if (l.status === "won") return "won";
  if (l.status === "dead") return "lost";
  if (l.status === "hot") return "qualified";
  return "prospect";
}

export function leadPriority(l: CommandLeadLike): LeadPriority {
  const p = l.priority;
  if (p && (PRIORITIES as readonly string[]).includes(p)) return p as LeadPriority;
  // Derived: hot leads deserve attention; scoring fills the rest.
  if (l.status === "hot") return "high";
  const score = l.lead_score ?? 0;
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

// ---------- Next action ----------

export type NextAction = { label: string; auto: boolean };

const STAGE_NEXT_ACTION: Record<PipelineStage, string> = {
  prospect: "Initial outreach",
  qualified: "Schedule meeting",
  meeting: "Prepare quotation",
  quotation: "Follow up on quote",
  negotiation: "Negotiate pricing",
  purchase_order: "Awaiting PO",
  won: "—",
  lost: "—",
};

export function nextAction(l: CommandLeadLike): NextAction {
  if (l.next_action && l.next_action.trim()) return { label: l.next_action.trim(), auto: false };
  const stage = leadStage(l);
  if (stage !== "won" && stage !== "lost" && computeHealth(l) === "cold") {
    return { label: "Re-engage — gone quiet", auto: true };
  }
  return { label: STAGE_NEXT_ACTION[stage], auto: true };
}

// ---------- Relative dates ----------

export type DueInfo = {
  label: string;
  tone: "overdue" | "today" | "soon" | "later" | "none";
};

export function dueInfo(iso: string | null | undefined): DueInfo {
  if (!iso) return { label: "—", tone: "none" };
  const due = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { label: days === -1 ? "Overdue 1d" : `Overdue ${-days}d`, tone: "overdue" };
  if (days === 0) return { label: "Today", tone: "today" };
  if (days === 1) return { label: "Tomorrow", tone: "soon" };
  if (days <= 7) return { label: `${days} days`, tone: "soon" };
  return { label: `${days} days`, tone: "later" };
}

// Day of the week for a YYYY-MM-DD (or ISO) value — "Sunday", "Monday"…
export function weekdayLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

export const DUE_TONE_CLASS: Record<DueInfo["tone"], string> = {
  overdue: "text-rose-600 font-semibold",
  today: "text-amber-600 font-semibold",
  soon: "text-foreground",
  later: "text-muted-foreground",
  none: "text-muted-foreground/60",
};

// "2h ago · WhatsApp replied" style formatting for the Last Activity column.
const ACTIVITY_KIND_LABEL: Record<string, string> = {
  note: "Note added",
  email: "Email",
  call: "Call",
  meeting: "Meeting",
  log: "Update",
};

export function shortAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  return `${mo}mo`;
}

export function lastActivityInfo(l: CommandLeadLike): {
  when: string;
  what: string | null;
  note: string | null;
  staleDays: number | null;
} {
  const at = l.last_activity_at ?? null;
  return {
    when: shortAgo(at),
    what: l.last_activity_kind ? (ACTIVITY_KIND_LABEL[l.last_activity_kind] ?? l.last_activity_kind) : null,
    note: l.last_activity_note ?? null,
    staleDays: daysSince(at),
  };
}

// ---------- Activity journal presentation ----------

export const ACTIVITY_KINDS = [
  "call",
  "whatsapp",
  "meeting",
  "email",
  "visit",
  "note",
  "quotation",
  "log",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

// Emoji keeps the journal readable without pulling icon components into helpers.
export const ACTIVITY_KIND_META: Record<
  ActivityKind,
  { label: string; emoji: string; dot: string; tint: string }
> = {
  call: { label: "Call", emoji: "📞", dot: "bg-sky-500", tint: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" },
  whatsapp: { label: "WhatsApp", emoji: "💬", dot: "bg-emerald-500", tint: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  meeting: { label: "Meeting", emoji: "🤝", dot: "bg-violet-500", tint: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" },
  email: { label: "Email", emoji: "📧", dot: "bg-amber-500", tint: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  visit: { label: "Site visit", emoji: "📍", dot: "bg-rose-500", tint: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
  note: { label: "Note", emoji: "📝", dot: "bg-slate-400", tint: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  quotation: { label: "Quotation", emoji: "📄", dot: "bg-teal-500", tint: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300" },
  log: { label: "Update", emoji: "•", dot: "bg-slate-300", tint: "bg-muted text-muted-foreground" },
};

export function activityMeta(kind: string): { label: string; emoji: string; dot: string; tint: string } {
  return ACTIVITY_KIND_META[kind as ActivityKind] ?? ACTIVITY_KIND_META.log;
}

export const OUTCOMES = [
  "interested",
  "need_quotation",
  "need_followup",
  "waiting",
  "decision_pending",
  "no_response",
  "ignoring",
  "not_interested",
  "won",
  "lost",
] as const;
export type Outcome = (typeof OUTCOMES)[number];

// The funnel offered when closing an overdue follow-up loop.
export const FOLLOWUP_RESOLUTIONS = [
  "won",
  "lost",
  "no_response",
  "ignoring",
  "need_followup",
] as const;
export type FollowUpResolution = (typeof FOLLOWUP_RESOLUTIONS)[number];

export const OUTCOME_META: Record<Outcome, { label: string; className: string }> = {
  no_response: { label: "No response", className: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300" },
  ignoring: { label: "Ignoring us", className: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" },
  interested: { label: "Interested", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  need_quotation: { label: "Need quotation", className: "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300" },
  need_followup: { label: "Need follow-up", className: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
  waiting: { label: "Waiting", className: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" },
  decision_pending: { label: "Decision pending", className: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" },
  not_interested: { label: "Not interested", className: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  won: { label: "Won", className: "bg-emerald-500 text-white" },
  lost: { label: "Lost", className: "bg-rose-500 text-white" },
};

export function outcomeMeta(o: string | null | undefined): { label: string; className: string } | null {
  if (!o) return null;
  return OUTCOME_META[o as Outcome] ?? null;
}

// Groups a chronological (newest-first) list into "Today / Yesterday / date" buckets.
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const that = new Date(d);
  that.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

// One-line "what to do next" recommendation from the last touch — no AI call,
// just honest derivation the salesperson can trust.
export function followUpRecommendation(opts: {
  lastActivityAt: string | null | undefined;
  stage: PipelineStage;
  nextActionDue: string | null | undefined;
  primaryContact?: string | null;
}): { tone: "overdue" | "due" | "quiet" | "ok"; headline: string; suggestion: string } | null {
  const { lastActivityAt, stage, nextActionDue, primaryContact } = opts;
  if (stage === "won" || stage === "lost") return null;
  const who = primaryContact ? primaryContact.split(/\s+/)[0] : "the contact";

  if (nextActionDue) {
    const info = dueInfo(nextActionDue);
    if (info.tone === "overdue") return { tone: "overdue", headline: `Follow-up ${info.label.toLowerCase()}`, suggestion: `Reconnect with ${who} — the scheduled follow-up has passed.` };
    if (info.tone === "today") return { tone: "due", headline: "Follow-up due today", suggestion: `Action the follow-up with ${who} today.` };
  }

  const silent = daysSince(lastActivityAt);
  if (silent === null) return { tone: "quiet", headline: "No activity logged yet", suggestion: `Log your first touch with ${who}.` };
  if (silent >= 14) return { tone: "quiet", headline: `Quiet for ${silent} days`, suggestion: `${primaryContact ?? "This lead"} has gone cold — a call would re-open the conversation.` };
  if (silent >= 7) return { tone: "quiet", headline: `${silent} days since last contact`, suggestion: `Check back in with ${who} before it goes cold.` };
  return { tone: "ok", headline: `Last contact ${silent === 0 ? "today" : `${silent}d ago`}`, suggestion: "This lead is being actively worked." };
}

// ---------- Feature detection ----------

// True once the sales-command-center migration has run and the row actually
// carries the new columns (select("*") only returns existing columns).
export function hasCommandColumns(rows: Array<Record<string, unknown>>): boolean {
  return rows.length > 0 && "pipeline_stage" in rows[0];
}

// ---------- Fallback summary (until ai_summary is populated) ----------

export function displaySummary(l: CommandLeadLike & { notes?: string | null }): {
  text: string | null;
  isAi: boolean;
} {
  if (l.ai_summary && l.ai_summary.trim()) return { text: l.ai_summary.trim(), isAi: true };
  const fallback = l.last_activity_note ?? l.notes ?? null;
  return { text: fallback ? fallback.replace(/\s+/g, " ").trim() : null, isAi: false };
}
