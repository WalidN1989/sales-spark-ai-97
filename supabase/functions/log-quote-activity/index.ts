// Log a quote/WhatsApp activity against a PROSPECT (companies row) so it shows in
// the Activity Journal, and optionally schedule a follow-up reminder.
//
// Activity Journal reads `lead_activities` (keyed by lead_id, not company id), so
// this resolves/creates the company's primary lead first — that's why the entry
// then appears on both the prospect and the lead for that company.
//
// Auth: x-api-key = PROSPECT_WEBHOOK_KEY (same as create-prospect).
// Owner: PROSPECT_WEBHOOK_USER_ID. No migration needed (lead_activities +
// reminders already exist).
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
const KINDS = ["note", "email", "call", "meeting", "log", "whatsapp", "quotation", "visit"];
const OUTCOMES = [
  "interested", "waiting", "not_interested", "need_quotation", "need_followup",
  "decision_pending", "lost", "won", "no_response", "ignoring",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const expected = Deno.env.get("PROSPECT_WEBHOOK_KEY");
  const owner = Deno.env.get("PROSPECT_WEBHOOK_USER_ID");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expected || !owner || !url || !serviceKey) return json({ error: "Function not fully configured" }, 500);
  const key = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (key !== expected) return json({ error: "Unauthorized" }, 401);

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  const companyId = str(b.company_id);
  if (!companyId) return json({ error: "company_id is required" }, 400);

  const kind = KINDS.includes(String(b.kind)) ? String(b.kind) : "quotation";
  const contactName = str(b.contact_name);
  const phone = str(b.phone);
  const product = str(b.product);
  const priceAed = b.price_aed != null && b.price_aed !== "" ? Number(b.price_aed) : null;
  const channel = str(b.channel);

  // body required, or auto-built from the structured fields.
  let body = str(b.body);
  if (!body) {
    const bits = [
      channel === "whatsapp" ? "WhatsApp quote" : "Quote",
      product ? `— ${product}` : "",
      priceAed != null && Number.isFinite(priceAed) ? `@ AED ${priceAed}` : "",
      contactName ? `to ${contactName}` : "",
      phone ? `(${phone})` : "",
    ].filter(Boolean);
    body = bits.join(" ").trim();
  }
  if (!body) return json({ error: "body is required (or provide product/price to auto-build it)" }, 400);

  const createFollowup = b.create_followup !== false; // default true
  const followupHours = Number(b.followup_hours) > 0 ? Number(b.followup_hours) : 24;
  let outcome = str(b.outcome);
  if (outcome && !OUTCOMES.includes(outcome)) outcome = null;
  if (!outcome && createFollowup) outcome = "need_followup";

  const supabase = createClient(url, serviceKey);

  // 1) Load the company (must belong to the owner).
  const { data: company, error: coErr } = await supabase
    .from("companies")
    .select("id, name, domain, contact_person, email, phone, mobile, product_service")
    .eq("id", companyId)
    .eq("user_id", owner)
    .maybeSingle();
  if (coErr) return json({ error: coErr.message }, 500);
  if (!company) return json({ error: "Company not found for this account" }, 404);

  // 2) Get or create the primary lead for the company.
  const { data: leads, error: lErr } = await supabase
    .from("leads")
    .select("id")
    .or(`company_id.eq.${companyId},prospect_id.eq.${companyId}`)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);
  if (lErr) return json({ error: lErr.message }, 500);

  let leadId: string;
  if (leads && leads.length) {
    leadId = leads[0].id;
  } else {
    const cleanPhone = (phone ?? company.mobile ?? company.phone ?? "")
      .toString()
      .replace(/[^0-9+\-\s()]/g, "")
      .trim() || null;
    const { data: newLead, error: insLeadErr } = await supabase
      .from("leads")
      .insert({
        user_id: owner,
        company_id: companyId,
        company_name: company.name,
        website: company.domain,
        contact_person: contactName ?? company.contact_person ?? company.name,
        contact_email: company.email,
        whatsapp: cleanPhone,
        phone: cleanPhone,
        products_services: product ? [product.slice(0, 80)] : company.product_service ? [String(company.product_service).slice(0, 80)] : [],
        status: "warm",
        is_primary: true,
        source: "auto",
      })
      .select("id")
      .single();
    if (insLeadErr) return json({ error: insLeadErr.message }, 500);
    leadId = newLead.id;
  }

  // 3) Insert the activity (retry without outcome if that column is absent).
  const base = { lead_id: leadId, user_id: owner, kind, body };
  let act = await supabase.from("lead_activities").insert({ ...base, outcome }).select("id").single();
  if (act.error && /outcome/i.test(act.error.message)) {
    act = await supabase.from("lead_activities").insert(base).select("id").single();
  }
  if (act.error) return json({ error: act.error.message }, 500);
  const activityId = act.data.id;

  // 4) Optional follow-up reminder on the prospect.
  let reminderId: string | null = null;
  if (createFollowup) {
    const remindAt = new Date(Date.now() + followupHours * 60 * 60 * 1000).toISOString();
    const noteBits = [product, priceAed != null && Number.isFinite(priceAed) ? `AED ${priceAed}` : "", contactName, phone]
      .filter(Boolean)
      .join(" · ");
    const { data: rem, error: remErr } = await supabase
      .from("reminders")
      .insert({
        user_id: owner,
        title: `Follow up quote — ${company.name}`,
        note: noteBits || body.slice(0, 200),
        remind_at: remindAt,
        entity_type: "prospect",
        entity_id: companyId,
        entity_label: company.name,
        status: "pending",
      })
      .select("id")
      .single();
    if (remErr) return json({ error: remErr.message }, 500);
    reminderId = rem.id;
  }

  return json({ ok: true, lead_id: leadId, activity_id: activityId, reminder_id: reminderId });
});
