// Read-only endpoint for the ICP research agent (Grok). Returns the product ICP
// cards — industries, personas, use cases, existing customers and competitor
// URLs — so the agent can refine each ICP, spot newly-added customers, and hunt
// lookalike leads (which it then pushes back via create-prospect).
//
// GET /functions/v1/list-icp-profiles            → all ICP cards
// GET /functions/v1/list-icp-profiles?name=...   → cards whose name matches (ilike)
// Auth: x-api-key = PROSPECT_WEBHOOK_KEY (same key as create-prospect).
// Owner: PROSPECT_WEBHOOK_USER_ID.
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

  const expected = Deno.env.get("PROSPECT_WEBHOOK_KEY");
  const owner = Deno.env.get("PROSPECT_WEBHOOK_USER_ID");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expected || !owner || !url || !serviceKey) return json({ error: "Function not fully configured" }, 500);

  const key = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (key !== expected) return json({ error: "Unauthorized" }, 401);

  const name = new URL(req.url).searchParams.get("name");

  const supabase = createClient(url, serviceKey);
  let q = supabase
    .from("icp_profiles")
    .select("id, name, category, summary, industries, headcount, personas, use_cases, customers, competitors, notes, updated_at")
    .eq("user_id", owner)
    .order("name", { ascending: true })
    .limit(200);
  if (name) q = q.ilike("name", `%${name}%`);

  const { data, error } = await q;
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, count: data?.length ?? 0, profiles: data ?? [] });
});
