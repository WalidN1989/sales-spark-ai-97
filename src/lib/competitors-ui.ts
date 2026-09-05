// Presentation helpers for the Competitor Analysis module.

export const CATEGORY_OPTIONS = [
  "visitor_management",
  "time_attendance",
  "meal_management",
  "access_control",
  "turnstile",
  "other",
] as const;
export type Category = (typeof CATEGORY_OPTIONS)[number];

export const CATEGORY_LABEL: Record<string, string> = {
  visitor_management: "Visitor Management",
  time_attendance: "Time & Attendance",
  meal_management: "Meal Management",
  access_control: "Access Control",
  turnstile: "Turnstile",
  other: "Other",
};

export const LEADER_META: Record<string, { label: string; className: string }> = {
  us: { label: "Us", className: "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300" },
  them: { label: "Them", className: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
  even: { label: "Even", className: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  unknown: { label: "?", className: "bg-muted text-muted-foreground" },
};

export const PRIORITY_META: Record<string, { label: string; className: string }> = {
  p0: { label: "P0", className: "bg-rose-500 text-white" },
  p1: { label: "P1", className: "bg-amber-500 text-white" },
  p2: { label: "P2", className: "bg-slate-400 text-white" },
};

export const GAP_STATUS_META: Record<string, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" },
  in_progress: { label: "In progress", className: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
  done: { label: "Done", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  wont_do: { label: "Won't do", className: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

export const RESEARCH_STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  published: { label: "Published", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  archived: { label: "Archived", className: "bg-muted text-muted-foreground" },
};

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
