// The Wed/Fri reminder feed: open items with no activity since `since`.
// Auth: x-api-key (PAYMENT_FOLLOWUP_API_KEY). Accepts GET (?since=&statuses=)
// or POST { since, statuses }. Returns items where last_activity_at IS NULL OR
// last_activity_at < since. Empty result → the assistant stays silent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });

const DEFAULT_STATUSES = ["open", "waiting", "partially_resolved"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const expected = Deno.env.get("PAYMENT_FOLLOWUP_API_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expected || !url || !serviceKey) return json({ error: "Function not fully configured" }, 500);
  const key = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (key !== expected) return json({ error: "Unauthorized" }, 401);

  let since: string | null = null;
  let statuses: string[] = DEFAULT_STATUSES;
  if (req.method === "POST") {
    try {
      const b = (await req.json()) as { since?: string; statuses?: string[] };
      since = b.since ?? null;
      if (Array.isArray(b.statuses) && b.statuses.length) statuses = b.statuses;
    } catch {
      return json({ error: "Body must be JSON" }, 400);
    }
  } else if (req.method === "GET") {
    const p = new URL(req.url).searchParams;
    since = p.get("since");
    const s = p.get("statuses");
    if (s) statuses = s.split(",").map((x) => x.trim()).filter(Boolean);
  } else {
    return json({ error: "Use GET or POST" }, 405);
  }
  if (!since) return json({ error: "`since` (ISO timestamp) is required" }, 400);

  const supabase = createClient(url, serviceKey);
  const { data, error } = await supabase
    .from("payment_followups")
    .select("id, company_name, category, reference, title, amount_aed, due_date, sent_date, status, priority, owner, last_activity_at")
    .in("status", statuses)
    .or(`last_activity_at.is.null,last_activity_at.lt.${since}`)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(1000);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, since, count: data?.length ?? 0, items: data ?? [] });
});
