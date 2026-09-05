// Monday digest feed: all non-resolved items (or filtered). Auth: x-api-key
// (PAYMENT_FOLLOWUP_API_KEY). GET (?status=&category=) or POST { status, category }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const expected = Deno.env.get("PAYMENT_FOLLOWUP_API_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expected || !url || !serviceKey) return json({ error: "Function not fully configured" }, 500);
  const key = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (key !== expected) return json({ error: "Unauthorized" }, 401);

  let status: string | null = null;
  let category: string | null = null;
  if (req.method === "POST") {
    try {
      const b = (await req.json()) as { status?: string; category?: string };
      status = b.status ?? null;
      category = b.category ?? null;
    } catch {
      return json({ error: "Body must be JSON" }, 400);
    }
  } else if (req.method === "GET") {
    const p = new URL(req.url).searchParams;
    status = p.get("status");
    category = p.get("category");
  } else {
    return json({ error: "Use GET or POST" }, 405);
  }

  const supabase = createClient(url, serviceKey);
  let q = supabase
    .from("payment_followups")
    .select("id, company_name, category, reference, title, amount_aed, currency, quantity, unit_sku, due_date, sent_date, status, priority, owner, last_activity_at, notes")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(1000);
  // Default Monday digest = everything not resolved/cancelled.
  if (status) q = q.eq("status", status);
  else q = q.not("status", "in", "(resolved,cancelled)");
  if (category) q = q.eq("category", category);

  const { data, error } = await q;
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, count: data?.length ?? 0, items: data ?? [] });
});
