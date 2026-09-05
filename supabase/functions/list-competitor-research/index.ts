// Read-only endpoint for the research agent to verify its posts.
// GET /functions/v1/list-competitor-research?category=&status=
// Auth: x-api-key (COMPETITOR_RESEARCH_API_KEY).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "Use GET" }, 405);

  const expected = Deno.env.get("COMPETITOR_RESEARCH_API_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expected || !url || !serviceKey) return json({ error: "Function not fully configured" }, 500);

  const key = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (key !== expected) return json({ error: "Unauthorized" }, 401);

  const params = new URL(req.url).searchParams;
  const category = params.get("category");
  const status = params.get("status");

  const supabase = createClient(url, serviceKey);
  let q = supabase
    .from("competitor_research")
    .select("id, title, category, status, our_product_name, competitor_company_id, competitor_product_id, summary, researcher, researched_at, created_at")
    .order("researched_at", { ascending: false })
    .limit(200);
  if (category) q = q.eq("category", category);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, count: data?.length ?? 0, research: data ?? [] });
});
