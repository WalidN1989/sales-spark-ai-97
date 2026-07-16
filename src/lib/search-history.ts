const KEY = "search:history";
const MAX = 20;

export type HistoryEntry = { query: string; ts: number };

export function readHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is HistoryEntry =>
        x && typeof x.query === "string" && typeof x.ts === "number",
    );
  } catch {
    return [];
  }
}

export function pushHistory(query: string): HistoryEntry[] {
  const q = query.trim();
  if (!q) return readHistory();
  const cur = readHistory().filter((e) => e.query.toLowerCase() !== q.toLowerCase());
  const next = [{ query: q, ts: Date.now() }, ...cur].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

export function removeHistory(query: string): HistoryEntry[] {
  const next = readHistory().filter((e) => e.query !== query);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function clearHistory(): HistoryEntry[] {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return [];
}
