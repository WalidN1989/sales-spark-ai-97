// Webhook: create prospect(s) from an external assistant (e.g. Grok).
//
// Auth:   header  x-api-key: <PROSPECT_WEBHOOK_KEY>
// Owner:  created rows belong to PROSPECT_WEBHOOK_USER_ID
// Body:   a single prospect object, or { "prospects": [ ... ] }
//         fields: company (required), contact_name, industry, country,
//                 product_service, email, phone, website, notes
// Dedupe: skips a company whose (case-insensitive, trimmed) name the owner
//         already has. Phone is never required. `notes` is ignored (the
//         companies table has no notes column).
//
// No SQL migration is required — this inserts into the existing companies table.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Incoming = Record<string, unknown>;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

const str = (v: unknown): string | null => {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
};

// Human header → companies column.
function normalize(row: Incoming): {
  name: string | null;
  domain: string | null;
  country: string | null;
  industry: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  product_service: string | null;
} {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const found = Object.keys(row).find((rk) => rk.trim().toLowerCase() === k);
      if (found) {
        const v = str(row[found]);
        if (v) return v;
      }
    }
    return null;
  };
  return {
    name: pick("company", "company name", "name"),
    domain: pick("website", "domain", "url"),
    country: pick("country"),
    industry: pick("industry", "sector"),
    contact_person: pick("contact_name", "contact name", "contact", "contact_person"),
    email: pick("email", "e-mail"),
    phone: pick("phone", "whatsapp", "mobile", "tel"),
    product_service: pick("product_service", "product/service", "product / service", "product", "service", "interest"),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const expectedKey = Deno.env.get("PROSPECT_WEBHOOK_KEY");
  const ownerId = Deno.env.get("PROSPECT_WEBHOOK_USER_ID");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expectedKey || !ownerId || !url || !serviceKey) {
    return json({ error: "Webhook is not fully configured (missing secrets)." }, 500);
  }

  const key = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (key !== expectedKey) return json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  const list: Incoming[] = Array.isArray(body)
    ? (body as Incoming[])
    : Array.isArray((body as { prospects?: unknown }).prospects)
      ? ((body as { prospects: Incoming[] }).prospects)
      : [body as Incoming];
  if (list.length === 0) return json({ error: "No prospects in body" }, 400);
  if (list.length > 500) return json({ error: "Max 500 prospects per request" }, 400);

  const supabase = createClient(url, serviceKey);

  // Existing names for this owner → dedupe.
  const { data: existing, error: exErr } = await supabase
    .from("companies")
    .select("name")
    .eq("user_id", ownerId);
  if (exErr) return json({ error: exErr.message }, 500);
  const seen = new Set((existing ?? []).map((r) => (r.name ?? "").toLowerCase().trim()));

  const created: string[] = [];
  const skipped: { company: string | null; reason: string }[] = [];
  const failed: { company: string | null; error: string }[] = [];

  for (const raw of list) {
    const f = normalize(raw);
    if (!f.name) {
      skipped.push({ company: null, reason: "missing company name" });
      continue;
    }
    const key = f.name.toLowerCase().trim();
    if (seen.has(key)) {
      skipped.push({ company: f.name, reason: "duplicate" });
      continue;
    }
    seen.add(key);
    const { data, error } = await supabase
      .from("companies")
      .insert({
        user_id: ownerId,
        name: f.name,
        domain: f.domain,
        country: f.country ?? "UAE",
        industry: f.industry,
        contact_person: f.contact_person,
        email: f.email,
        phone: f.phone,
        product_service: f.product_service,
      })
      .select("id")
      .single();
    if (error) failed.push({ company: f.name, error: error.message });
    else created.push(data.id as string);
  }

  return json({
    ok: true,
    created: created.length,
    skipped: skipped.length,
    failed: failed.length,
    ids: created,
    details: { skipped, failed },
  });
});
