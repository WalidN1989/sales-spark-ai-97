import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugifyCompetitor } from "@/lib/competitor-email.functions";

function normalizeDomain(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "");
}

type Competitor = {
  name: string;
  website: string | null;
  country: string | null;
  description: string | null;
  source: "seeded" | "ai";
  socials?: Record<string, string | undefined>;
};

async function resolveCompetitor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  sourceCompanyId: string,
  competitorSlug: string,
) {
  const { data: src, error } = await supabase
    .from("companies")
    .select("id, name, market_insight")
    .eq("id", sourceCompanyId)
    .single();
  if (error) throw new Error(error.message);
  const insight = src.market_insight as { competitors?: Competitor[] } | null;
  const comp = insight?.competitors?.find(
    (c) => slugifyCompetitor(c.name) === competitorSlug,
  );
  if (!comp) throw new Error("Competitor not found in market insight");
  const domain_norm = normalizeDomain(comp.website ?? comp.name);
  // upsert competitor_profiles
  const { data: existing } = await supabase
    .from("competitor_profiles")
    .select("*")
    .eq("user_id", userId)
    .eq("domain_norm", domain_norm)
    .maybeSingle();
  if (existing) return { profile: existing, source: src, competitor: comp };
  const { data: created, error: cErr } = await supabase
    .from("competitor_profiles")
    .insert({
      user_id: userId,
      domain_norm,
      name: comp.name,
      website: comp.website,
      country: comp.country,
      description: comp.description,
      socials: comp.socials ?? {},
    })
    .select("*")
    .single();
  if (cErr) throw new Error(cErr.message);
  return { profile: created, source: src, competitor: comp };
}

export const getOrCreateCompetitorProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sourceCompanyId: z.string().uuid(),
        competitorSlug: z.string().min(1).max(120),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const r = await resolveCompetitor(
      context.supabase,
      context.userId,
      data.sourceCompanyId,
      data.competitorSlug,
    );
    return r.profile;
  });

export const updateCompetitorProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z.object({
          name: z.string().max(300).optional(),
          website: z.string().max(500).nullable().optional(),
          country: z.string().max(120).nullable().optional(),
          description: z.string().max(2000).nullable().optional(),
          phone: z.string().max(60).nullable().optional(),
          mobile: z.string().max(60).nullable().optional(),
          email: z.string().max(200).nullable().optional(),
          contact_person: z.string().max(200).nullable().optional(),
          address: z.string().max(500).nullable().optional(),
          lat: z.number().nullable().optional(),
          lng: z.number().nullable().optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("competitor_profiles")
      .update(data.patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- Firecrawl enrichment ----------

async function firecrawlScrape(url: string) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("Firecrawl is not connected.");
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formats: ["markdown", "summary", "links"],
      onlyMainContent: true,
    }),
  });
  if (res.status === 402) throw new Error("Firecrawl credits exhausted.");
  if (!res.ok) throw new Error(`Firecrawl error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    data?: { markdown?: string; summary?: string; links?: string[] };
  };
  return json.data ?? {};
}

export const enrichCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sourceCompanyId: z.string().uuid(),
        competitorSlug: z.string().min(1).max(120),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const r = await resolveCompetitor(
      context.supabase,
      context.userId,
      data.sourceCompanyId,
      data.competitorSlug,
    );
    const url = r.profile.website
      ? /^https?:\/\//i.test(r.profile.website)
        ? r.profile.website
        : `https://${r.profile.website}`
      : null;
    if (!url) throw new Error("This competitor has no website to enrich.");
    const scraped = await firecrawlScrape(url);
    const research_data = {
      source_url: url,
      summary: scraped.summary ?? null,
      markdown: (scraped.markdown ?? "").slice(0, 8000),
      links: (scraped.links ?? []).slice(0, 30),
      scraped_at: new Date().toISOString(),
    };
    const { data: updated, error } = await context.supabase
      .from("competitor_profiles")
      .update({
        research_data,
        last_enriched_at: new Date().toISOString(),
        description: r.profile.description ?? scraped.summary ?? null,
      })
      .eq("id", r.profile.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

// ---------- Hunter for competitor ----------

const HUNTER_BASE = "https://api.hunter.io/v2";

export const findCompetitorContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sourceCompanyId: z.string().uuid(),
        competitorSlug: z.string().min(1).max(120),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const key = process.env.HUNTER_API_KEY;
    if (!key) throw new Error("Hunter is not configured. Add HUNTER_API_KEY in Project Settings.");
    const r = await resolveCompetitor(
      context.supabase,
      context.userId,
      data.sourceCompanyId,
      data.competitorSlug,
    );
    const domain = normalizeDomain(r.profile.website ?? r.profile.domain_norm);
    if (!domain) throw new Error("Competitor has no domain.");

    const url = new URL(`${HUNTER_BASE}/domain-search`);
    url.searchParams.set("api_key", key);
    url.searchParams.set("domain", domain);
    url.searchParams.set("limit", "10");
    const res = await fetch(url.toString());
    if (res.status === 401) throw new Error("Hunter API key is invalid.");
    if (res.status === 402 || res.status === 429)
      throw new Error("Hunter quota exhausted. Upgrade your plan or wait.");
    if (!res.ok) throw new Error(`Hunter error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      data?: {
        emails?: Array<{
          value?: string;
          first_name?: string | null;
          last_name?: string | null;
          position?: string | null;
          linkedin?: string | null;
          confidence?: number | null;
          phone_number?: string | null;
        }>;
      };
    };
    const emails = json.data?.emails ?? [];

    // wipe & re-insert for this (source, competitor) pair
    await context.supabase
      .from("competitor_contacts")
      .delete()
      .eq("user_id", context.userId)
      .eq("source_company_id", data.sourceCompanyId)
      .eq("competitor_id", r.profile.id);

    const rows = emails
      .filter((e) => !!e.value)
      .map((e) => ({
        user_id: context.userId,
        source_company_id: data.sourceCompanyId,
        competitor_id: r.profile.id,
        email: e.value!,
        first_name: e.first_name ?? null,
        last_name: e.last_name ?? null,
        position: e.position ?? null,
        linkedin_url: e.linkedin ?? null,
        confidence: e.confidence ?? null,
        phone: e.phone_number ?? null,
      }));
    if (rows.length) {
      const { error } = await context.supabase.from("competitor_contacts").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { count: rows.length };
  });

export const listCompetitorContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sourceCompanyId: z.string().uuid(),
        competitorId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("competitor_contacts")
      .select("*")
      .eq("source_company_id", data.sourceCompanyId)
      .eq("competitor_id", data.competitorId)
      .order("confidence", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- Qualifying targets ----------

export const addToQualifying = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sourceCompanyId: z.string().uuid(),
        competitorSlug: z.string().min(1).max(120),
        sourceLeadPurchaseId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const r = await resolveCompetitor(
      context.supabase,
      context.userId,
      data.sourceCompanyId,
      data.competitorSlug,
    );
    // upsert (user, source, competitor) — one row per source per requirement
    const { data: existing } = await context.supabase
      .from("qualifying_targets")
      .select("id")
      .eq("user_id", context.userId)
      .eq("source_company_id", data.sourceCompanyId)
      .eq("competitor_id", r.profile.id)
      .maybeSingle();
    if (existing) {
      if (data.sourceLeadPurchaseId) {
        await context.supabase
          .from("qualifying_targets")
          .update({ source_lead_purchase_id: data.sourceLeadPurchaseId })
          .eq("id", existing.id);
      }
      return { id: existing.id, created: false };
    }
    const { data: row, error } = await context.supabase
      .from("qualifying_targets")
      .insert({
        user_id: context.userId,
        source_company_id: data.sourceCompanyId,
        competitor_id: r.profile.id,
        source_lead_purchase_id: data.sourceLeadPurchaseId ?? null,
        status: "new",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, created: true };
  });

// Add a raw SERP lookalike result to qualifying.
// Creates/reuses a competitor_profile from the name+domain discovered via search.
export const addSerpResultToQualifying = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sourceCompanyId: z.string().uuid(),
        name: z.string().min(1).max(200),
        domain: z.string().min(1).max(300),
        country: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const domain_norm = data.domain
      .toLowerCase()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/.*$/, "")
      .trim();

    // Upsert competitor_profile
    const { data: existing_profile } = await context.supabase
      .from("competitor_profiles")
      .select("id")
      .eq("user_id", context.userId)
      .eq("domain_norm", domain_norm)
      .maybeSingle();

    let profileId: string;
    if (existing_profile) {
      profileId = existing_profile.id;
    } else {
      const { data: created, error: pErr } = await context.supabase
        .from("competitor_profiles")
        .insert({
          user_id: context.userId,
          domain_norm,
          name: data.name,
          website: `https://${domain_norm}`,
          country: data.country ?? null,
          description: data.description ?? null,
          socials: {},
        })
        .select("id")
        .single();
      if (pErr) throw new Error(pErr.message);
      profileId = created.id;
    }

    // Upsert qualifying_target
    const { data: existing_target } = await context.supabase
      .from("qualifying_targets")
      .select("id")
      .eq("user_id", context.userId)
      .eq("source_company_id", data.sourceCompanyId)
      .eq("competitor_id", profileId)
      .maybeSingle();

    if (existing_target) return { id: existing_target.id, created: false };

    const { data: row, error } = await context.supabase
      .from("qualifying_targets")
      .insert({
        user_id: context.userId,
        source_company_id: data.sourceCompanyId,
        competitor_id: profileId,
        source_lead_purchase_id: null,
        status: "new",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, created: true };
  });

// Add a prospect (company) directly to qualifying as a lookalike target.
// Creates/reuses a competitor_profile from the company row.
export const addLookalikeToQualifying = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sourceCompanyId: z.string().uuid(),
        targetCompanyId: z.string().uuid(),
        sourceLeadPurchaseId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: company, error: cErr } = await context.supabase
      .from("companies")
      .select("id, name, domain, country, industry, product_service, research_data")
      .eq("id", data.targetCompanyId)
      .single();
    if (cErr) throw new Error(cErr.message);

    const domain_norm = (company.domain ?? company.name)
      .toLowerCase()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/.*$/, "")
      .trim() || company.name.toLowerCase().replace(/[^a-z0-9]/g, "-");

    // Upsert competitor_profile
    const { data: existing_profile } = await context.supabase
      .from("competitor_profiles")
      .select("id")
      .eq("user_id", context.userId)
      .eq("domain_norm", domain_norm)
      .maybeSingle();

    let profileId: string;
    if (existing_profile) {
      profileId = existing_profile.id;
    } else {
      const research = company.research_data as { summary?: string } | null;
      const { data: created, error: pErr } = await context.supabase
        .from("competitor_profiles")
        .insert({
          user_id: context.userId,
          domain_norm,
          name: company.name,
          website: company.domain,
          country: company.country,
          description: research?.summary ?? company.product_service ?? null,
          socials: {},
        })
        .select("id")
        .single();
      if (pErr) throw new Error(pErr.message);
      profileId = created.id;
    }

    // Upsert qualifying_target
    const { data: existing_target } = await context.supabase
      .from("qualifying_targets")
      .select("id")
      .eq("user_id", context.userId)
      .eq("source_company_id", data.sourceCompanyId)
      .eq("competitor_id", profileId)
      .maybeSingle();

    if (existing_target) {
      if (data.sourceLeadPurchaseId) {
        await context.supabase
          .from("qualifying_targets")
          .update({ source_lead_purchase_id: data.sourceLeadPurchaseId })
          .eq("id", existing_target.id);
      }
      return { id: existing_target.id, created: false };
    }

    const { data: row, error } = await context.supabase
      .from("qualifying_targets")
      .insert({
        user_id: context.userId,
        source_company_id: data.sourceCompanyId,
        competitor_id: profileId,
        source_lead_purchase_id: data.sourceLeadPurchaseId ?? null,
        status: "new",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, created: true };
  });

export const listQualifyingTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("qualifying_targets")
      .select(`
        id, status, last_activity_at, last_activity_note, created_at,
        source_company_id, competitor_id, converted_lead_id, source_lead_purchase_id,
        cached_email_subject, cached_email_body, cached_email_at,
        competitor:competitor_profiles ( id, name, website, country, phone, email, domain_norm ),
        source:companies!qualifying_targets_source_company_id_fkey ( id, name ),
        purchase:lead_purchases ( id, brand, model_no, model_name )
      `)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    // Attach all known competitor_contacts emails for each target
    const rows = data ?? [];
    if (rows.length === 0) return rows;
    const ids = rows.map((r: { id: string }) => r.id);
    const { data: contacts } = await context.supabase
      .from("competitor_contacts")
      .select("source_company_id, competitor_id, email, first_name, last_name, position")
      .in(
        "competitor_id",
        Array.from(new Set(rows.map((r: { competitor_id: string }) => r.competitor_id))),
      );
    const byKey = new Map<string, Array<{ email: string; name: string | null; position: string | null }>>();
    for (const c of contacts ?? []) {
      if (!c.email) continue;
      const k = `${c.source_company_id}::${c.competitor_id}`;
      const list = byKey.get(k) ?? [];
      list.push({
        email: c.email as string,
        name: [c.first_name, c.last_name].filter(Boolean).join(" ") || null,
        position: c.position ?? null,
      });
      byKey.set(k, list);
    }
    void ids;

    // Fallback bought-product: for targets without an explicitly linked purchase,
    // use the most recent purchase recorded on the source prospect's leads.
    const fallbackByCompany = await purchasesBySourceCompany(
      context.supabase,
      rows
        .filter((r) => !(r as { purchase: unknown }).purchase)
        .map((r) => (r as { source_company_id: string }).source_company_id),
    );

    return rows.map((r) => ({
      ...r,
      purchase:
        (r as { purchase: unknown }).purchase ??
        fallbackByCompany.get((r as { source_company_id: string }).source_company_id) ??
        null,
      contact_emails:
        byKey.get(`${(r as { source_company_id: string }).source_company_id}::${(r as { competitor_id: string }).competitor_id}`) ?? [],
    }));
  });

// Shared helper: most-recent lead_purchase per source company (across its leads,
// matched by company_id OR prospect_id). Used to fall back when a qualifying
// target has no explicitly linked source_lead_purchase_id.
async function purchasesBySourceCompany(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  companyIds: string[],
): Promise<
  Map<string, { id: string; brand: string | null; model_no: string | null; model_name: string | null; description?: string | null }>
> {
  const out = new Map<
    string,
    { id: string; brand: string | null; model_no: string | null; model_name: string | null; description?: string | null }
  >();
  const uniq = Array.from(new Set(companyIds)).filter(Boolean);
  if (!uniq.length) return out;
  const { data: leads } = await supabase
    .from("leads")
    .select("id, company_id, prospect_id")
    .or(`company_id.in.(${uniq.join(",")}),prospect_id.in.(${uniq.join(",")})`);
  const leadToCompany = new Map<string, string>();
  for (const l of (leads ?? []) as Array<{ id: string; company_id: string | null; prospect_id: string | null }>) {
    const cid = uniq.includes(l.company_id ?? "") ? l.company_id : l.prospect_id;
    if (cid) leadToCompany.set(l.id, cid);
  }
  const leadIds = Array.from(leadToCompany.keys());
  if (!leadIds.length) return out;
  const { data: purchases } = await supabase
    .from("lead_purchases")
    .select("id, lead_id, brand, model_no, model_name, description, created_at")
    .in("lead_id", leadIds)
    .order("created_at", { ascending: false });
  for (const p of (purchases ?? []) as Array<{
    id: string;
    lead_id: string;
    brand: string | null;
    model_no: string | null;
    model_name: string | null;
    description: string | null;
  }>) {
    const cid = leadToCompany.get(p.lead_id);
    if (cid && !out.has(cid)) {
      out.set(cid, {
        id: p.id,
        brand: p.brand,
        model_no: p.model_no,
        model_name: p.model_name,
        description: p.description,
      });
    }
  }
  return out;
}

export const updateQualifyingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum([
          "new",
          "researching",
          "contacted",
          "no_response",
          "interested",
          "not_fit",
          "converted",
        ]),
        note: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("qualifying_targets")
      .update({
        status: data.status,
        last_activity_at: new Date().toISOString(),
        last_activity_note: data.note ?? `Status → ${data.status}`,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteQualifyingTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("qualifying_targets")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const convertQualifyingToLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: target, error } = await context.supabase
      .from("qualifying_targets")
      .select(`
        id, status, source_company_id, last_activity_note, notes, converted_lead_id,
        competitor:competitor_profiles ( id, name, website, country, phone, mobile, email, contact_person, address, lat, lng )
      `)
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    if ((target as { converted_lead_id: string | null }).converted_lead_id)
      throw new Error("Already converted");
    const comp = (target as unknown as { competitor: {
      id: string; name: string; website: string | null; country: string | null;
      phone: string | null; mobile: string | null; email: string | null;
      contact_person: string | null; address: string | null; lat: number | null; lng: number | null;
    } }).competitor;

    // Create a company shell for the new lead so the prospect detail works.
    const { data: newCompany, error: ccErr } = await context.supabase
      .from("companies")
      .insert({
        user_id: context.userId,
        name: comp.name,
        domain: comp.website,
        country: comp.country,
        phone: comp.phone,
        mobile: comp.mobile,
        email: comp.email,
        contact_person: comp.contact_person,
        address: comp.address,
        lat: comp.lat,
        lng: comp.lng,
        status: "warm",
      })
      .select("id")
      .single();
    if (ccErr) throw new Error(ccErr.message);

    // Carry over Qualifying touches → status starts at "contacted" if any activity, else "warm"
    const leadStatus = target.last_activity_note ? "warm" : "warm";

    const { data: lead, error: lErr } = await context.supabase
      .from("leads")
      .insert({
        user_id: context.userId,
        company_id: newCompany.id,
        contact_person: comp.contact_person,
        contact_email: comp.email,
        phone: comp.phone,
        whatsapp: comp.mobile,
        company_name: comp.name,
        website: comp.website,
        status: leadStatus,
        source: "qualifying",
        notes: target.notes ?? null,
      })
      .select("id")
      .single();
    if (lErr) throw new Error(lErr.message);

    // Carry-over activity log + qualifying notes (notes table) as a single activity entry
    await context.supabase.from("lead_activities").insert({
      lead_id: lead.id,
      user_id: context.userId,
      kind: "log",
      body: `Converted from Qualifying${target.last_activity_note ? ` · ${target.last_activity_note}` : ""}`,
    });

    // Notes carry-over: notes attached to qualifying entity types will be moved
    // here once the note_entity_type enum is extended. Activities + the
    // last_activity_note above already preserve touch history.

    await context.supabase
      .from("qualifying_targets")
      .update({ status: "converted", converted_lead_id: lead.id })
      .eq("id", data.id);

    return { leadId: lead.id, companyId: newCompany.id };
  });

// ---------- AI Draft email for qualifying target ----------

export const draftQualifyingEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), force: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    // 1) Return cached draft instantly unless caller forced a regenerate.
    if (!data.force) {
      const { data: cached } = await context.supabase
        .from("qualifying_targets")
        .select("cached_email_subject, cached_email_body, cached_email_at")
        .eq("id", data.id)
        .maybeSingle();
      if (cached?.cached_email_subject && cached?.cached_email_body) {
        return {
          subject: cached.cached_email_subject as string,
          body: cached.cached_email_body as string,
          cached: true,
          cachedAt: cached.cached_email_at as string | null,
        };
      }
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const { data: target, error } = await context.supabase
      .from("qualifying_targets")
      .select(`
        id, source_company_id,
        competitor:competitor_profiles ( name, website, country, description, research_data ),
        source:companies!qualifying_targets_source_company_id_fkey ( name, industry, country ),
        purchase:lead_purchases ( brand, model_no, model_name, description )
      `)
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    const { data: mine } = await context.supabase
      .from("my_company")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();

    const t = target as unknown as {
      source_company_id: string;
      competitor: { name: string; website: string | null; country: string | null; description: string | null; research_data: { summary?: string } | null };
      source: { name: string; industry: string | null; country: string | null } | null;
      purchase: { brand: string | null; model_no: string | null; model_name: string; description: string | null } | null;
    };

    // Fall back to the source prospect's most recent purchase when this target
    // has no explicitly linked one, so the draft still pitches the right product.
    if (!t.purchase && t.source_company_id) {
      const fb = await purchasesBySourceCompany(context.supabase, [t.source_company_id]);
      const p = fb.get(t.source_company_id);
      if (p) {
        t.purchase = {
          brand: p.brand,
          model_no: p.model_no,
          model_name: p.model_name ?? "Product",
          description: p.description ?? null,
        };
      }
    }

    const system = `You write concise, warm B2B outreach emails. Output JSON via the write_email tool. Keep body 120-180 words. No placeholders. Reference 1 specific fact about the recipient. Mention (without naming the source customer) that businesses similar to theirs already use our product. Tone: confident, helpful, not pushy.`;

    const user = `SENDER (my company):
${mine ? JSON.stringify(mine, null, 2) : "(not set in Settings → My Company)"}

RECIPIENT (competitor we want to win):
Name: ${t.competitor.name}
Website: ${t.competitor.website ?? "n/a"}
Country: ${t.competitor.country ?? "n/a"}
Description: ${t.competitor.description ?? t.competitor.research_data?.summary ?? "n/a"}

PROVEN PRODUCT (already bought by a peer in the same space — DO NOT name the peer):
${t.purchase ? `${t.purchase.brand ?? ""} ${t.purchase.model_no ?? ""} ${t.purchase.model_name}${t.purchase.description ? ` — ${t.purchase.description}` : ""}` : "(no specific product context)"}

PEER CONTEXT (for your reasoning only, do not name them):
${t.source ? `A ${t.source.industry ?? "similar"} business${t.source.country ? ` in ${t.source.country}` : ""} adopted the product above.` : ""}

GOAL: Open a conversation; position the product as proven in their segment.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "write_email",
              parameters: {
                type: "object",
                additionalProperties: false,
                properties: {
                  subject: { type: "string" },
                  body: { type: "string" },
                },
                required: ["subject", "body"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "write_email" } },
      }),
    });
    if (res.status === 429) throw new Error("Rate limit. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      choices: Array<{ message: { tool_calls?: Array<{ function: { arguments: string } }> } }>;
    };
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI did not return an email");
    const parsed = JSON.parse(args) as { subject: string; body: string };

    // Cache so future opens are instant + free.
    const cachedAt = new Date().toISOString();
    await context.supabase
      .from("qualifying_targets")
      .update({
        cached_email_subject: parsed.subject,
        cached_email_body: parsed.body,
        cached_email_at: cachedAt,
      })
      .eq("id", data.id);

    return { ...parsed, cached: false, cachedAt };
  });
