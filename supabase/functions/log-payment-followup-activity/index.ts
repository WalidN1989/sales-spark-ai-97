// Log an activity against a follow-up (bumps last_activity_at via trigger, which
// suppresses the Wed/Fri reminder for that item). Resolve by followup_id, or by
// (company_name, category, reference). Auth: x-api-key (PAYMENT_FOLLOWUP_API_KEY).
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
const TYPES = ["call", "whatsapp", "email", "visit", "note", "document_sent", "payment_received", "collection_done", "other"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const expected = Deno.env.get("PAYMENT_FOLLOWUP_API_KEY");
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

  const activityType = str(b.activity_type);
  const summary = str(b.summary);
  if (!activityType || !TYPES.includes(activityType)) return json({ error: `activity_type must be one of: ${TYPES.join(", ")}` }, 400);
  if (!summary) return json({ error: "summary is required" }, 400);

  const supabase = createClient(url, serviceKey);

  // Resolve the follow-up.
  let followupId = str(b.followup_id);
  if (!followupId) {
    const company = str(b.company_name);
    const category = str(b.category);
    if (!company || !category) return json({ error: "Provide followup_id, or company_name + category (+ reference)" }, 400);
    const reference = str(b.reference);
    let q = supabase.from("payment_followups").select("id").eq("company_name", company).eq("category", category);
    q = reference ? q.eq("reference", reference) : q;
    const { data, error } = await q.order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error && error.code !== "PGRST116") return json({ error: error.message }, 500);
    if (!data) return json({ error: "No matching follow-up found" }, 404);
    followupId = data.id;
  }

  const { error: insErr } = await supabase.from("payment_followup_activities").insert({
    followup_id: followupId,
    activity_type: activityType,
    summary,
    details: str(b.details),
    activity_at: str(b.activity_at) ?? new Date().toISOString(),
    created_by: str(b.created_by) ?? "assistant",
    source: "api",
  });
  if (insErr) return json({ error: insErr.message }, 500);

  return json({ ok: true, followup_id: followupId });
});
