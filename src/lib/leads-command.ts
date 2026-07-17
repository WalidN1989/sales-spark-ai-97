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
