// Fuzzy company-name matching — the same rules create-prospect uses, so an
// agent never creates a second "ABC Trading" next to "ABC Trading LLC" or a
// one-letter typo of an existing company.

const COMPANY_STOPWORDS = new Set([
  "llc", "fze", "fzc", "fzco", "fz", "llp", "wll", "dmcc", "difc", "pjsc", "psc", "jsc",
  "spc", "est", "establishment", "ltd", "limited", "inc", "incorporated", "co", "company",
  "corp", "corporation", "the", "and",
]);

/** Lowercase, strip punctuation + legal forms: "ABC Trading L.L.C." → "abc trading". */
export function normalizeCompany(name: string | null | undefined): string {
  const s = (name ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ");
  return s.split(/\s+/).filter((t) => t && !COMPANY_STOPWORDS.has(t)).join(" ").trim();
}

/** Spaces removed too, so "Blue Ocean" and "BlueOcean" compare equal. */
export const squashCompany = (name: string | null | undefined) => normalizeCompany(name).replace(/\s+/g, "");

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[n];
}

export type NameMatch = "exact" | "near" | "prefix" | null;

/**
 * How two company names relate:
 *  exact  — equal once legal forms / punctuation / spaces are removed
 *  near   — within 2 edits (a typo or an extra letter)
 *  prefix — one is the start of the other and ≥ 6 chars ("Blue Ocean" vs
 *           "BlueOcean Technologies & Trading")
 */
export function matchCompany(a: string | null | undefined, b: string | null | undefined): NameMatch {
  const x = squashCompany(a);
  const y = squashCompany(b);
  if (!x || !y) return null;
  if (x === y) return "exact";
  const maxLen = Math.max(x.length, y.length);
  if (Math.abs(x.length - y.length) <= 3) {
    const d = levenshtein(x, y);
    if (maxLen >= 5 && d <= 2 && d / maxLen <= 0.34) return "near";
  }
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 6 && long.startsWith(short)) return "prefix";
  return null;
}
