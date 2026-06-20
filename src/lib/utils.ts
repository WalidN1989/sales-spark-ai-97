import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Heuristic split of a raw phone number into landline vs mobile.
 * UAE-centric: mobile numbers start with 5 (with optional +971 / 971 / 0 prefix).
 * Falls back to landline (`phone`) when the format is ambiguous.
 */
export function classifyPhone(raw: string | null | undefined): {
  phone: string | null;
  mobile: string | null;
} {
  const v = (raw ?? "").trim();
  if (!v) return { phone: null, mobile: null };
  const digits = v.replace(/[^\d]/g, "");
  const uaeMobile =
    /^9715\d{8}$/.test(digits) || // 9715XXXXXXXX
    /^05\d{8}$/.test(digits) || //   05XXXXXXXX
    /^5\d{8}$/.test(digits); //      5XXXXXXXX (10 digits)
  return uaeMobile ? { phone: null, mobile: v } : { phone: v, mobile: null };
}

export const COMPANY_STATUSES = ["hot", "warm", "cold", "won", "lost"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export const COMPANY_STATUS_STYLES: Record<CompanyStatus, string> = {
  hot: "bg-orange-500 text-white",
  warm: "bg-amber-400 text-amber-950",
  cold: "bg-sky-300 text-sky-950",
  won: "bg-emerald-500 text-white",
  lost: "bg-zinc-500 text-white",
};
