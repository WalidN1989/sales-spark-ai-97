import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- helpers ----------

function emptyToNull(s: unknown): string | null {
  if (s === null || s === undefined) return null;
  const v = String(s).trim();
  return v === "" ? null : v;
}

function parsePgArray(s: unknown): string[] {
  const v = emptyToNull(s);
  if (!v) return [];
  if (v === "{}") return [];
  if (!(v.startsWith("{") && v.endsWith("}"))) {
    // maybe JSON array
    try {
      const j = JSON.parse(v);
      if (Array.isArray(j)) return j.map((x) => String(x));
    } catch {}
    return [v];
  }
  const inner = v.slice(1, -1);
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (inQuotes) {
      if (c === "\\" && inner[i + 1] !== undefined) {
        cur += inner[i + 1];
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  if (cur.length || out.length) out.push(cur);
  return out.map((x) => x.trim()).filter((x) => x.length > 0);
}

function parseJsonish(s: unknown): unknown | null {
  const v = emptyToNull(s);
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function parseIntish(s: unknown): number | null {
  const v = emptyToNull(s);
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function parseFloatish(s: unknown): number | null {
  const v = emptyToNull(s);
  if (!v) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function parseBoolish(s: unknown): boolean {
  const v = emptyToNull(s);
  if (!v) return false;
  return ["t", "true", "1", "yes", "y"].includes(v.toLowerCase());
}

function parseTs(s: unknown): string | null {
  const v = emptyToNull(s);
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const rowSchema = z.record(z.string(), z.any());
const inputSchema = z.object({ rows: z.array(rowSchema).max(50000) });
const leadsInputSchema = z.object({
  rows: z.array(rowSchema).max(50000),
  prospectIdMap: z.record(z.string(), z.string()),
});

// ---------- importProspects ----------

export const importProspects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const failed: { index: number; error: string }[] = [];
    const skipped: { index: number; reason: string }[] = [];
    const prospectIdMap: Record<string, string> = {};

    const { data: existing } = await supabase
      .from("companies")
      .select("name")
      .eq("user_id", userId);
    const existingNames = new Set(
      (existing ?? []).map((r) => (r.name ?? "").toLowerCase().trim()),
    );

    const toInsert: any[] = [];
    data.rows.forEach((row, idx) => {
      const name = emptyToNull(row.name);
      if (!name) {
        skipped.push({ index: idx, reason: "missing name" });
        return;
      }
      const key = name.toLowerCase().trim();
      if (existingNames.has(key)) {
        skipped.push({ index: idx, reason: `duplicate name: ${name}` });
        return;
      }
      existingNames.add(key);
      const newId = crypto.randomUUID();
      const oldId = emptyToNull(row.id);
      if (oldId) prospectIdMap[oldId] = newId;
      toInsert.push({
        id: newId,
        user_id: userId,
        name,
        domain: emptyToNull(row.domain),
        country: emptyToNull(row.country) ?? "UAE",
        industry: emptyToNull(row.industry),
        contact_person: emptyToNull(row.contact_person),
        email: emptyToNull(row.email),
        phone: emptyToNull(row.phone),
        product_service: emptyToNull(row.product_service),
        address: emptyToNull(row.address),
        lat: parseFloatish(row.lat),
        lng: parseFloatish(row.lng),
        research_data: parseJsonish(row.research_data),
        last_research_at: parseTs(row.last_research_at),
        created_at: parseTs(row.created_at) ?? new Date().toISOString(),
        market_seed_urls: parsePgArray(row.market_seed_urls),
        market_insight: parseJsonish(row.market_insight),
        market_insight_at: parseTs(row.market_insight_at),
        hunter_last_sync: parseTs(row.hunter_last_sync),
        employee_count: parseIntish(row.employee_count),
        linkedin_url: emptyToNull(row.linkedin_url),
        enrichment_status: emptyToNull(row.enrichment_status),
      });
    });

    let inserted = 0;
    for (const batch of chunk(toInsert, 500)) {
      const { error, data: ins } = await supabase
        .from("companies")
        .insert(batch)
        .select("id");
      if (error) {
        failed.push({ index: -1, error: error.message });
      } else {
        inserted += ins?.length ?? batch.length;
      }
    }

    return { inserted, skipped, failed, prospectIdMap };
  });

// ---------- importLeads ----------

export const importLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => leadsInputSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const failed: { index: number; error: string }[] = [];
    const skipped: { index: number; reason: string }[] = [];

    const { data: existing } = await supabase
      .from("leads")
      .select("contact_email, whatsapp")
      .eq("user_id", userId);
    const emails = new Set<string>();
    const phones = new Set<string>();
    for (const r of existing ?? []) {
      if (r.contact_email) emails.add(r.contact_email.toLowerCase().trim());
      if (r.whatsapp) phones.add(r.whatsapp.trim());
    }

    const toInsert: any[] = [];
    data.rows.forEach((row, idx) => {
      const email = emptyToNull(row.contact_email);
      const wa = emptyToNull(row.whatsapp);
      const companyName = emptyToNull(row.company_name);
      if (!email && !wa && !companyName) {
        skipped.push({ index: idx, reason: "no email/whatsapp/company" });
        return;
      }
      const emailKey = email?.toLowerCase().trim();
      const waKey = wa?.trim();
      if (emailKey && emails.has(emailKey)) {
        skipped.push({ index: idx, reason: `duplicate email: ${email}` });
        return;
      }
      if (waKey && phones.has(waKey)) {
        skipped.push({ index: idx, reason: `duplicate whatsapp: ${wa}` });
        return;
      }
      if (emailKey) emails.add(emailKey);
      if (waKey) phones.add(waKey);

      const oldCompanyId = emptyToNull(row.company_id);
      const oldProspectId = emptyToNull(row.prospect_id);
      const newCompanyId = oldCompanyId
        ? data.prospectIdMap[oldCompanyId] ?? null
        : null;
      const newProspectId = oldProspectId
        ? data.prospectIdMap[oldProspectId] ?? null
        : null;

      toInsert.push({
        id: crypto.randomUUID(),
        user_id: userId,
        company_id: newCompanyId,
        prospect_id: newProspectId,
        contact_person: emptyToNull(row.contact_person),
        contact_email: email,
        whatsapp: wa,
        status: emptyToNull(row.status) ?? "warm",
        pipeline_value_cents: parseIntish(row.pipeline_value_cents) ?? 0,
        last_activity_kind: emptyToNull(row.last_activity_kind),
        last_activity_at: parseTs(row.last_activity_at),
        last_activity_note: emptyToNull(row.last_activity_note),
        company_name: companyName,
        website: emptyToNull(row.website),
        brands: parsePgArray(row.brands),
        products_services: parsePgArray(row.products_services),
        notes: emptyToNull(row.notes),
        job_title: emptyToNull(row.job_title),
        source: emptyToNull(row.source) ?? "manual",
        email_status: emptyToNull(row.email_status),
        email_score: parseIntish(row.email_score),
        last_verified_at: parseTs(row.last_verified_at),
        lead_score: parseIntish(row.lead_score) ?? 0,
        lead_score_manual_override: parseBoolish(row.lead_score_manual_override),
        created_at: parseTs(row.created_at) ?? new Date().toISOString(),
        updated_at: parseTs(row.updated_at) ?? new Date().toISOString(),
      });
    });

    let inserted = 0;
    for (const batch of chunk(toInsert, 500)) {
      const { error, data: ins } = await supabase
        .from("leads")
        .insert(batch)
        .select("id");
      if (error) {
        failed.push({ index: -1, error: error.message });
      } else {
        inserted += ins?.length ?? batch.length;
      }
    }

    return { inserted, skipped, failed };
  });
