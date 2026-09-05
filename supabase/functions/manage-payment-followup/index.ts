// Edit or delete a payment follow-up from an external assistant.
// Auth: x-api-key (PAYMENT_FOLLOWUP_API_KEY) — SAME key as the other payment
// functions; no new secret. POST body:
//   { "action": "update", "id": "uuid", "patch": { ...fields } }
//   { "action": "update", "company_name": "...", "category": "...", "reference": "...", "patch": {...} }
//   { "action": "delete", "id": "uuid" }   (or resolve by company/category/reference)
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
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const STATUSES = ["open", "waiting", "partially_resolved", "resolved", "cancelled"];
const CATEGORIES = ["pending_pdc", "pending_collection", "pending_po_payment_advice", "demo_unit", "consignment"];
const PRIORITIES = ["low", "normal", "high"];

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

  const action = str(b.action);
  if (action !== "update" && action !== "delete") return json({ error: 'action must be "update" or "delete"' }, 400);

  const supabase = createClient(url, serviceKey);

  // Resolve the target row.
  let id = str(b.id);
  if (!id) {
    const company = str(b.company_name);
    const category = str(b.category);
    if (!company || !category) return json({ error: "Provide id, or company_name + category (+ reference)" }, 400);
    const reference = str(b.reference);
    let q = supabase.from("payment_followups").select("id").eq("company_name", company).eq("category", category);
    q = reference ? q.eq("reference", reference) : q;
    const { data, error } = await q.order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error && error.code !== "PGRST116") return json({ error: error.message }, 500);
    if (!data) return json({ error: "No matching follow-up found" }, 404);
    id = data.id;
  }

  if (action === "delete") {
    const { error } = await supabase.from("payment_followups").delete().eq("id", id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, action, id });
  }

  // action === "update"
  const p = (b.patch ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("company_name" in p) patch.company_name = str(p.company_name);
  if ("category" in p && CATEGORIES.includes(String(p.category))) patch.category = String(p.category);
  if ("reference" in p) patch.reference = str(p.reference);
  if ("title" in p) patch.title = str(p.title);
  if ("description" in p) patch.description = str(p.description);
  if ("amount_aed" in p) patch.amount_aed = num(p.amount_aed);
  if ("quantity" in p) patch.quantity = num(p.quantity);
  if ("unit_sku" in p) patch.unit_sku = str(p.unit_sku);
  if ("due_date" in p) patch.due_date = str(p.due_date);
  if ("sent_date" in p) patch.sent_date = str(p.sent_date);
  if ("priority" in p && PRIORITIES.includes(String(p.priority))) patch.priority = String(p.priority);
  if ("owner" in p) patch.owner = str(p.owner);
  if ("notes" in p) patch.notes = str(p.notes);
  if ("status" in p && STATUSES.includes(String(p.status))) {
    patch.status = String(p.status);
    if (patch.status === "resolved") patch.resolved_at = new Date().toISOString();
    if (patch.status === "open" || patch.status === "waiting") patch.resolved_at = null;
  }
  if (Object.keys(patch).length === 1) return json({ error: "patch has no valid fields" }, 400);

  const { error } = await supabase.from("payment_followups").update(patch).eq("id", id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, action, id });
});
