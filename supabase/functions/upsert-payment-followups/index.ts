// Upsert open payment/logistics follow-up items from an assistant.
// Auth: x-api-key (PAYMENT_FOLLOWUP_API_KEY). Dedupe key: (company_name,
// category, reference) when reference present, else (company_name, category,
// title). Returns { created, updated, skipped, failed, ids }.
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
const CATEGORIES = ["pending_pdc", "pending_collection", "pending_po_payment_advice", "demo_unit", "consignment"];
const STATUSES = ["open", "waiting", "partially_resolved", "resolved", "cancelled"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const expected = Deno.env.get("PAYMENT_FOLLOWUP_API_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expected || !url || !serviceKey) return json({ error: "Function not fully configured" }, 500);
  const key = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (key !== expected) return json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const items = Array.isArray((body as { items?: unknown }).items)
    ? ((body as { items: Record<string, unknown>[] }).items)
    : Array.isArray(body)
      ? (body as Record<string, unknown>[])
      : [body as Record<string, unknown>];
  if (!items.length) return json({ error: "No items" }, 400);
  if (items.length > 500) return json({ error: "Max 500 items" }, 400);

  const supabase = createClient(url, serviceKey);
  let created = 0,
    updated = 0;
  const skipped: { index: number; reason: string }[] = [];
  const failed: { index: number; error: string }[] = [];
  const ids: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const raw = items[i];
    const company = str(raw.company_name);
    const category = str(raw.category);
    const title = str(raw.title);
    if (!company || !category || !title) {
      skipped.push({ index: i, reason: "company_name, category and title are required" });
      continue;
    }
    if (!CATEGORIES.includes(category)) {
      skipped.push({ index: i, reason: `invalid category: ${category}` });
      continue;
    }
    const reference = str(raw.reference);
    const fields = {
      company_name: company,
      category,
      reference,
      title,
      description: str(raw.description),
      amount_aed: num(raw.amount_aed),
      quantity: num(raw.quantity),
      unit_sku: str(raw.unit_sku),
      due_date: str(raw.due_date),
      sent_date: str(raw.sent_date),
      status: STATUSES.includes(String(raw.status)) ? String(raw.status) : "open",
      priority: ["low", "normal", "high"].includes(String(raw.priority)) ? String(raw.priority) : "normal",
      owner: str(raw.owner),
      notes: str(raw.notes),
      updated_at: new Date().toISOString(),
    };

    // Dedupe.
    let q = supabase.from("payment_followups").select("id").eq("company_name", company).eq("category", category);
    q = reference ? q.eq("reference", reference) : q.eq("title", title).is("reference", null);
    const { data: existing, error: exErr } = await q.maybeSingle();
    if (exErr && exErr.code !== "PGRST116") {
      failed.push({ index: i, error: exErr.message });
      continue;
    }

    if (existing) {
      const { error } = await supabase.from("payment_followups").update(fields).eq("id", existing.id);
      if (error) failed.push({ index: i, error: error.message });
      else {
        updated++;
        ids.push(existing.id);
      }
    } else {
      const { data, error } = await supabase.from("payment_followups").insert(fields).select("id").single();
      if (error) failed.push({ index: i, error: error.message });
      else {
        created++;
        ids.push(data.id);
      }
    }
  }

  return json({ ok: true, created, updated, skipped: skipped.length, failed: failed.length, ids, details: { skipped, failed } });
});
