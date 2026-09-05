// Presentation + date helpers for the Payment Follow-up module.

export const CATEGORY_OPTIONS = [
  "pending_pdc",
  "pending_collection",
  "pending_po_payment_advice",
  "demo_unit",
  "consignment",
] as const;
export type PayCategory = (typeof CATEGORY_OPTIONS)[number];

export const CATEGORY_META: Record<string, { label: string; className: string }> = {
  pending_pdc: { label: "Pending PDC", className: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
  pending_collection: { label: "Pending collection", className: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" },
  pending_po_payment_advice: { label: "PO / payment advice", className: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" },
  demo_unit: { label: "Demo unit", className: "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300" },
  consignment: { label: "Consignment", className: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" },
};

export const STATUS_OPTIONS = ["open", "waiting", "partially_resolved", "resolved", "cancelled"] as const;
export const STATUS_META: Record<string, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  waiting: { label: "Waiting", className: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
  partially_resolved: { label: "Partial", className: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" },
  resolved: { label: "Resolved", className: "bg-muted text-muted-foreground line-through" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground line-through" },
};

export const ACTIVITY_TYPES = [
  "call",
  "whatsapp",
  "email",
  "visit",
  "note",
  "document_sent",
  "payment_received",
  "collection_done",
  "other",
] as const;
export const ACTIVITY_META: Record<string, { label: string; emoji: string }> = {
  call: { label: "Call", emoji: "📞" },
  whatsapp: { label: "WhatsApp", emoji: "💬" },
  email: { label: "Email", emoji: "📧" },
  visit: { label: "Visit", emoji: "📍" },
  note: { label: "Note", emoji: "📝" },
  document_sent: { label: "Document sent", emoji: "📄" },
  payment_received: { label: "Payment received", emoji: "💰" },
  collection_done: { label: "Collection done", emoji: "📦" },
  other: { label: "Other", emoji: "•" },
};

export function fmtAmount(amount: number | null | undefined, currency = "AED"): string {
  if (amount == null) return "—";
  return `${currency} ${new Intl.NumberFormat("en-AE", { maximumFractionDigits: 0 }).format(amount)}`;
}

export function fmtDubaiDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00+04:00`) : new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" });
}

export function shortAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// The current week's Monday 10:00 Asia/Dubai (UTC+4, no DST) as an ISO instant.
// Items with no activity since this moment are what the Wed/Fri assistant nudges.
export function dubaiWeekStartISO(): string {
  const OFFSET = 4 * 60 * 60 * 1000;
  const now = Date.now();
  const dubai = new Date(now + OFFSET); // UTC fields now read as Dubai local time
  const day = dubai.getUTCDay(); // 0 Sun … 6 Sat
  const sinceMonday = (day + 6) % 7;
  const mondayDubai = Date.UTC(
    dubai.getUTCFullYear(),
    dubai.getUTCMonth(),
    dubai.getUTCDate() - sinceMonday,
    10,
    0,
    0,
  );
  let mondayUTC = mondayDubai - OFFSET; // back to a real instant
  if (mondayUTC > now) mondayUTC -= 7 * 24 * 60 * 60 * 1000; // before Mon 10:00 → use last week's
  return new Date(mondayUTC).toISOString();
}
