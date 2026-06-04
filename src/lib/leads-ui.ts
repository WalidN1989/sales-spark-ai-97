export type LeadStatus = "hot" | "warm" | "cold" | "frozen" | "dead";

export const LEAD_STATUSES: LeadStatus[] = ["hot", "warm", "cold", "frozen", "dead"];

export const LEAD_STATUS_ORDER: Record<LeadStatus, number> = {
  hot: 0,
  warm: 1,
  cold: 2,
  frozen: 3,
  dead: 4,
};

export const LEAD_STATUS_STYLES: Record<LeadStatus, string> = {
  hot: "bg-orange-500 text-white",
  warm: "bg-amber-400 text-amber-950",
  cold: "bg-sky-300 text-sky-950",
  frozen: "bg-slate-200 text-slate-700",
  dead: "bg-zinc-400 text-white",
};

export const LEAD_STATUS_DOT: Record<LeadStatus, string> = {
  hot: "bg-orange-500",
  warm: "bg-amber-400",
  cold: "bg-sky-400",
  frozen: "bg-slate-300",
  dead: "bg-zinc-400",
};

export function waHref(num: string | null | undefined): string | null {
  if (!num) return null;
  const digits = num.replace(/\D+/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

export function leadInitials(name: string | null | undefined, fallback: string) {
  const s = (name || fallback).trim();
  const parts = s.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function fmtMoneyCents(cents: number) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "live.com",
  "aol.com",
  "yahoo.co.uk",
  "yahoo.co.in",
]);

export function domainFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const m = email.trim().toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})$/i);
  if (!m) return null;
  const d = m[1];
  return FREE_EMAIL_DOMAINS.has(d) ? null : d;
}

export function normalizeWebsite(input: string | null | undefined): string | null {
  if (!input) return null;
  const v = input.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

export function hostFromWebsite(input: string | null | undefined): string | null {
  const url = normalizeWebsite(input);
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function faviconUrl(websiteOrDomain: string | null | undefined, size = 64): string | null {
  const host = hostFromWebsite(websiteOrDomain) ?? websiteOrDomain ?? null;
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
}

export const DOC_LABELS = {
  trade_license: "Trade License",
  vat_certificate: "VAT Certificate",
  other: "Other",
} as const;

export type DocLabel = keyof typeof DOC_LABELS;

export function fmtFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
