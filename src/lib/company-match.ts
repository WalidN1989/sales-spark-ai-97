// Fuzzy company-name matching for dedupe. Strips legal forms + punctuation so
// "ABC Trading LLC" == "ABC Trading", then compares with a small edit distance
// so a typo or one extra letter is treated as the same company.

const COMPANY_STOPWORDS = new Set([
  "llc", "fze", "fzc", "fzco", "fz", "llp", "wll", "dmcc", "difc", "pjsc", "psc", "jsc",
  "spc", "est", "establishment", "ltd", "limited", "inc", "incorporated", "co", "company",
  "corp", "corporation", "the", "and",
]);

export function normalizeCompany(name: string | null | undefined): string {
  const s = (name ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ");
  return s.split(/\s+/).filter((t) => t && !COMPANY_STOPWORDS.has(t)).join(" ").trim();
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array<number>(n + 1);
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

// True if two normalized names are the same company (equal, or within a couple
// of edits — catches an extra letter / minor typo).
export function namesMatch(aNorm: string, bNorm: string): boolean {
  if (!aNorm || !bNorm) return false;
  if (aNorm === bNorm) return true;
  if (Math.abs(aNorm.length - bNorm.length) > 3) return false;
  const d = levenshtein(aNorm, bNorm);
  const maxLen = Math.max(aNorm.length, bNorm.length);
  return maxLen >= 5 && d <= 2 && d / maxLen <= 0.34;
}
