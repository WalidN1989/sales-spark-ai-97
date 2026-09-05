// Edit or delete a competitor-research snapshot from an external assistant.
// Auth: x-api-key (COMPETITOR_RESEARCH_API_KEY) — SAME key as the other
// competitor functions; no new secret. POST body:
//   { "action": "update", "id": "uuid", "patch": { title, summary, status, category, our_product_name, our_product_url } }
//   { "action": "delete", "id": "uuid" }   (child rows cascade)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });
const str = (v: unknown): string | null => {
  const x = (v ?? "").toString().trim();
  return x.length ? x : null;
};

const STATUSES = ["draft", "published", "archived"];
const CATEGORIES = ["visitor_management", "time_attendance", "meal_management", "access_control", "turnstile", "other"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const expected = Deno.env.get("COMPETITOR_RESEARCH_API_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expected || !url || !serviceKey) return json({ error: "Function not fully configured" }, 500);
  const key = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (key !== expected) return json({ error: "Unauthorized" }, 401);

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  const action = str(b.action);
  if (action !== "update" && action !== "delete") return json({ error: 'action must be "update" or "delete"' }, 400);
  const id = str(b.id);
  if (!id) return json({ error: "id is required" }, 400);

  const supabase = createClient(url, serviceKey);

  if (action === "delete") {
    const { error } = await supabase.from("competitor_research").delete().eq("id", id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, action, id });
  }

  const p = (b.patch ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("title" in p) patch.title = str(p.title);
  if ("summary" in p) patch.summary = str(p.summary);
  if ("our_product_name" in p) patch.our_product_name = str(p.our_product_name);
  if ("our_product_url" in p) patch.our_product_url = str(p.our_product_url);
  if ("status" in p && STATUSES.includes(String(p.status))) patch.status = String(p.status);
  if ("category" in p && CATEGORIES.includes(String(p.category))) patch.category = String(p.category);
  if (Object.keys(patch).length === 1) return json({ error: "patch has no valid fields" }, 400);

  const { error } = await supabase.from("competitor_research").update(patch).eq("id", id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, action, id });
});
