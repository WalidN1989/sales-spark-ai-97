import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const statusEnum = z.enum(["hot", "warm", "cold", "frozen", "dead", "won"]);
const activityKindEnum = z.enum([
  "note",
  "email",
  "call",
  "meeting",
  "log",
  "whatsapp",
  "quotation",
  "visit",
]);
const outcomeEnum = z.enum([
  "interested",
  "waiting",
  "not_interested",
  "need_quotation",
  "need_followup",
  "decision_pending",
  "lost",
  "won",
]);
const docLabelEnum = z.enum(["trade_license", "vat_certificate", "other"]);

// "*" keeps the query working both before and after the sales-command-center
// migration adds pipeline_stage / next_action / priority / ai_summary columns.
const LEAD_SELECT =
  "*, companies!leads_company_id_fkey(name, domain, country, industry, lat, lng), reseller:companies!leads_reseller_company_id_fkey(id, name, domain, status, is_reseller)";

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select(LEAD_SELECT)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("leads")
      .select(LEAD_SELECT)
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listLeadsByCompany = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ companyId: z.string().min(1).max(300) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    // Accept UUID / id:<uuid>, plus fallback groups built from normalized company name or domain.
    const raw = decodeURIComponent(data.companyId);
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const normalizeName = (n: string | null | undefined) =>
      (n ?? "")
        .trim()
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const normalizeDomain = (d: string | null | undefined) =>
      (d ?? "")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0]
        .trim();

    // Primary contact (is_primary=true) first, then original creation order.
    const ORDER_PRIMARY_FIRST = "is_primary.desc.nullslast,created_at.asc";

    if (uuidRe.test(raw)) {
      // Match either by company_id OR prospect_id (Hunter imports use prospect_id).
      const { data: rows, error } = await context.supabase
        .from("leads")
        .select(LEAD_SELECT)
        .or(`company_id.eq.${raw},prospect_id.eq.${raw}`)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      if ((rows ?? []).length > 0) return rows ?? [];
      // Fallback: prospect company exists but no leads linked by company_id/prospect_id.
      const { data: company } = await context.supabase
        .from("companies")
        .select("name, domain")
        .eq("id", raw)
        .maybeSingle();
      if (!company) return [];
      const { data: all } = await context.supabase
        .from("leads")
        .select(LEAD_SELECT)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });
      const targetDomain = normalizeDomain(company.domain);
      const targetName = normalizeName(company.name);
      return (all ?? []).filter((l) => {
        const ld = normalizeDomain(l.website ?? l.companies?.domain);
        const ln = normalizeName(l.company_name ?? l.companies?.name);
        return (targetDomain && ld === targetDomain) || (targetName && ln === targetName);
      });
    }
    if (raw.startsWith("id:") && uuidRe.test(raw.slice(3))) {
      const cid = raw.slice(3);
      const { data: rows, error } = await context.supabase
        .from("leads")
        .select(LEAD_SELECT)
        .or(`company_id.eq.${cid},prospect_id.eq.${cid}`)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return rows ?? [];
    }
    void ORDER_PRIMARY_FIRST;

    const { data: rows, error } = await context.supabase
      .from("leads")
      .select(LEAD_SELECT)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const all = rows ?? [];
    if (raw.startsWith("domain:")) {
      const domain = normalizeDomain(raw.slice(7));
      return all.filter((l) => normalizeDomain(l.website ?? l.companies?.domain) === domain);
    }
    const name = normalizeName(raw.startsWith("name:") ? raw.slice(5) : raw);
    return all.filter((l) => normalizeName(l.company_name ?? l.companies?.name) === name);
  });

// Add a new contact (lead row) under an existing company - allows multiple
// Direct contacts per company now that the unique index has been dropped.
export const addContactToCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        contact_person: z.string().trim().min(1).max(200),
        contact_email: z
          .string()
          .trim()
          .max(200)
          .email()
          .optional()
          .nullable()
          .or(z.literal("").transform(() => null)),
        whatsapp: z
          .string()
          .trim()
          .max(30)
          .regex(/^[0-9+\-\s()]*$/, "Digits and + - ( ) only")
          .optional()
          .nullable()
          .or(z.literal("").transform(() => null)),
        job_title: z.string().trim().max(200).optional().nullable(),
        department: z.string().trim().max(120).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: company, error: cErr } = await context.supabase
      .from("companies")
      .select("id, name, domain")
      .eq("id", data.companyId)
      .single();
    if (cErr) throw new Error(cErr.message);

    const { data: row, error } = await context.supabase
      .from("leads")
      .insert({
        user_id: context.userId,
        company_id: data.companyId,
        contact_person: data.contact_person,
        contact_email: data.contact_email || null,
        whatsapp: data.whatsapp || null,
        phone: data.whatsapp || null,
        job_title: data.job_title || null,
        department: data.department || null,
        company_name: company.name,
        website: company.domain,
        status: "warm",
        is_primary: false,
        source: "manual",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

// Resolve a representative ("primary") lead for a prospect/company so a purchase
// can be attached to it. Prefers an existing is_primary lead, then the oldest
// lead; creates a lightweight auto lead only when the prospect has none.
export const getOrCreatePrimaryLeadForCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ companyId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: leads, error } = await context.supabase
      .from("leads")
      .select("id, is_primary, created_at")
      .or(`company_id.eq.${data.companyId},prospect_id.eq.${data.companyId}`)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw new Error(error.message);
    if (leads && leads.length) return { leadId: leads[0].id };

    const { data: company, error: cErr } = await context.supabase
      .from("companies")
      .select("id, name, domain")
      .eq("id", data.companyId)
      .single();
    if (cErr) throw new Error(cErr.message);

    const { data: row, error: iErr } = await context.supabase
      .from("leads")
      .insert({
        user_id: context.userId,
        company_id: data.companyId,
        company_name: company.name,
        website: company.domain,
        contact_person: company.name,
        status: "warm",
        is_primary: true,
        source: "auto",
      })
      .select("id")
      .single();
    if (iErr) throw new Error(iErr.message);
    return { leadId: row.id };
  });

export const resolveCompanyIdByGroupKey = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ key: z.string().min(1).max(300) }).parse(d),
  )
  .handler(async ({ context, data }): Promise<{ companyId: string | null }> => {
    const raw = decodeURIComponent(data.key);
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRe.test(raw)) return { companyId: raw };
    if (raw.startsWith("id:") && uuidRe.test(raw.slice(3))) return { companyId: raw.slice(3) };

    const normalizeName = (n: string | null | undefined) =>
      (n ?? "")
        .trim()
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const normalizeDomain = (d: string | null | undefined) =>
      (d ?? "")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0]
        .trim();

    if (raw.startsWith("domain:")) {
      const domain = normalizeDomain(raw.slice(7));
      if (!domain) return { companyId: null };
      const { data: rows } = await context.supabase
        .from("companies")
        .select("id, domain")
        .ilike("domain", `%${domain}%`)
        .limit(20);
      const match = (rows ?? []).find((r) => normalizeDomain(r.domain) === domain);
      return { companyId: match?.id ?? null };
    }

    const name = normalizeName(raw.startsWith("name:") ? raw.slice(5) : raw);
    if (!name) return { companyId: null };
    const { data: rows } = await context.supabase
      .from("companies")
      .select("id, name")
      .limit(1000);
    const match = (rows ?? []).find((r) => normalizeName(r.name) === name);
    return { companyId: match?.id ?? null };
  });




export const promoteToLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ companyId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: existing } = await context.supabase
      .from("leads")
      .select("id")
      .eq("company_id", data.companyId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) return { id: existing.id, created: false };

    const { data: company, error: cErr } = await context.supabase
      .from("companies")
      .select("contact_person, email, name, domain, phone, product_service")
      .eq("id", data.companyId)
      .single();
    if (cErr) throw new Error(cErr.message);

    // Sanitize phone to satisfy leads.whatsapp validation (digits and + - ( ) only)
    const cleanPhone = (company.phone ?? "").toString().replace(/[^0-9+\-\s()]/g, "").trim() || null;

    const productsServices = company.product_service
      ? [company.product_service.toString().slice(0, 80)]
      : [];

    const { data: row, error } = await context.supabase
      .from("leads")
      .insert({
        user_id: context.userId,
        company_id: data.companyId,
        contact_person: company.contact_person,
        contact_email: company.email,
        whatsapp: cleanPhone,
        phone: cleanPhone,
        company_name: company.name,
        website: company.domain,
        products_services: productsServices,
        status: "warm",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, created: true };
  });

// Create a Prospect (companies row) from an existing Lead, copying contact details.
// Returns the prospect company id. If a matching company already exists (by leads.company_id,
// by domain, or by normalized name), returns it instead of creating a duplicate.
export const createProspectFromLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<{ companyId: string; created: boolean }> => {
    const { data: lead, error: lErr } = await context.supabase
      .from("leads")
      .select(
        "id, company_id, contact_person, contact_email, whatsapp, phone, company_name, website",
      )
      .eq("id", data.leadId)
      .single();
    if (lErr) throw new Error(lErr.message);
    if (lead.company_id) return { companyId: lead.company_id, created: false };

    const normalizeName = (n: string | null | undefined) =>
      (n ?? "").trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    const normalizeDomain = (d: string | null | undefined) =>
      (d ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].trim();

    const targetDomain = normalizeDomain(lead.website);
    const targetName = normalizeName(lead.company_name);

    // Search for existing company by domain or name
    if (targetDomain || targetName) {
      const { data: existing } = await context.supabase
        .from("companies")
        .select("id, name, domain")
        .limit(1000);
      const match = (existing ?? []).find((c) => {
        const cd = normalizeDomain(c.domain);
        const cn = normalizeName(c.name);
        return (targetDomain && cd === targetDomain) || (targetName && cn === targetName);
      });
      if (match) {
        await context.supabase.from("leads").update({ company_id: match.id }).eq("id", data.leadId);
        return { companyId: match.id, created: false };
      }
    }

    const name = (lead.company_name ?? lead.contact_person ?? "Untitled Company").slice(0, 200);
    const { data: row, error } = await context.supabase
      .from("companies")
      .insert({
        user_id: context.userId,
        name,
        domain: targetDomain || null,
        contact_person: lead.contact_person,
        email: lead.contact_email,
        phone: lead.phone ?? lead.whatsapp ?? null,
        mobile: lead.whatsapp ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("leads").update({ company_id: row.id }).eq("id", data.leadId);
    return { companyId: row.id, created: true };
  });

const stringTagArray = z.array(z.string().trim().min(1).max(80)).max(50);

const patchSchema = z
  .object({
    status: statusEnum.optional(),
    contact_person: z.string().max(200).nullable().optional(),
    contact_email: z.string().max(200).nullable().optional(),
    whatsapp: z
      .string()
      .max(30)
      .regex(/^[0-9+\-\s()]*$/, "Digits and + - ( ) only")
      .nullable()
      .optional(),
    pipeline_value_cents: z.number().int().min(0).max(1_000_000_000_00).optional(),
    company_name: z.string().max(200).nullable().optional(),
    website: z.string().max(300).nullable().optional(),
    brands: stringTagArray.optional(),
    products_services: stringTagArray.optional(),
    notes: z.string().max(4000).nullable().optional(),
    job_title: z.string().max(200).nullable().optional(),
    linkedin_url: z.string().max(500).nullable().optional(),
    department: z.string().max(120).nullable().optional(),
    seniority: z.string().max(80).nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
    lead_type: z.enum(["direct", "reseller"]).optional(),
    reseller_company_id: z.string().uuid().nullable().optional(),
    end_user_project: z.string().max(1000).nullable().optional(),
    // Sales Command Center fields (require the sales_command_center migration)
    pipeline_stage: z
      .enum(["prospect", "qualified", "meeting", "quotation", "negotiation", "purchase_order", "won", "lost"])
      .nullable()
      .optional(),
    next_action: z.string().max(200).nullable().optional(),
    next_action_due: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
      .nullable()
      .optional(),
    priority: z.enum(["critical", "high", "medium", "low"]).nullable().optional(),
    ai_summary: z.string().max(500).nullable().optional(),
  })
  .strict();

export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), patch: patchSchema }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("leads")
      .update(data.patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Manually set status — sets override flag so future automation won't change status
export const setLeadStatusManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: statusEnum }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({ status: data.status, lead_score_manual_override: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.from("lead_activities").insert({
      lead_id: data.id,
      user_id: context.userId,
      kind: "log",
      body: `Status manually set to ${data.status}`,
    });
    return { ok: true };
  });

export const clearLeadStatusOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({ lead_score_manual_override: false })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.from("lead_activities").insert({
      lead_id: data.id,
      user_id: context.userId,
      kind: "log",
      body: "Manual status override cleared",
    });
    return { ok: true };
  });

// Bulk operations for the Command Center — one round-trip for up to 200 leads.
const bulkPatchSchema = z
  .object({
    status: statusEnum.optional(),
    pipeline_stage: z
      .enum(["prospect", "qualified", "meeting", "quotation", "negotiation", "purchase_order", "won", "lost"])
      .optional(),
    priority: z.enum(["critical", "high", "medium", "low"]).optional(),
    next_action: z.string().max(200).nullable().optional(),
    next_action_due: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
      .nullable()
      .optional(),
  })
  .strict()
  .refine((p) => Object.keys(p).length > 0, "Empty patch");

export const bulkUpdateLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ ids: z.array(z.string().uuid()).min(1).max(200), patch: bulkPatchSchema })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("leads")
      .update(data.patch)
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

export const bulkDeleteLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("leads").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("leads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });




// ---- Activity log ----

export const listLeadActivities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    // `outcome` requires the activity_journal migration — fall back gracefully.
    const full = await context.supabase
      .from("lead_activities")
      .select("id, lead_id, kind, body, outcome, created_at")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (!full.error) return full.data ?? [];
    if (!/outcome/i.test(full.error.message)) throw new Error(full.error.message);
    const base = await context.supabase
      .from("lead_activities")
      .select("id, lead_id, kind, body, created_at")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (base.error) throw new Error(base.error.message);
    return (base.data ?? []).map((r) => ({ ...r, outcome: null as string | null }));
  });

// Merged Activity Journal across every contact (lead row) of a company.
export const listCompanyActivities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ leadIds: z.array(z.string().uuid()).min(1).max(200) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const full = await context.supabase
      .from("lead_activities")
      .select("id, lead_id, kind, body, outcome, created_at")
      .in("lead_id", data.leadIds)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (!full.error) return full.data ?? [];
    if (!/outcome/i.test(full.error.message)) throw new Error(full.error.message);
    const base = await context.supabase
      .from("lead_activities")
      .select("id, lead_id, kind, body, created_at")
      .in("lead_id", data.leadIds)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (base.error) throw new Error(base.error.message);
    return (base.data ?? []).map((r) => ({ ...r, outcome: null as string | null }));
  });

export const addLeadActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        kind: activityKindEnum,
        body: z.string().trim().min(1).max(2000),
        outcome: outcomeEnum.nullable().optional(),
        // When set, the activity also schedules the lead's next follow-up.
        next_action: z.string().trim().max(200).nullable().optional(),
        next_action_due: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
          .nullable()
          .optional(),
        priority: z.enum(["critical", "high", "medium", "low"]).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    // Insert the journal entry. `outcome` requires the activity_journal
    // migration; retry without it so the app still works pre-migration.
    const base = { lead_id: data.leadId, user_id: context.userId, kind: data.kind, body: data.body };
    let insert = await context.supabase
      .from("lead_activities")
      .insert({ ...base, outcome: data.outcome ?? null })
      .select("id, lead_id, kind, body, outcome, created_at")
      .single();
    if (insert.error && /outcome/i.test(insert.error.message)) {
      insert = await context.supabase
        .from("lead_activities")
        .insert(base)
        .select("id, lead_id, kind, body, created_at")
        .single();
    }
    if (insert.error) throw new Error(insert.error.message);

    // Optionally schedule the follow-up on the lead in the same action.
    const leadPatch: {
      next_action_due?: string | null;
      next_action?: string | null;
      priority?: string | null;
    } = {};
    if (data.next_action_due !== undefined) leadPatch.next_action_due = data.next_action_due;
    if (data.next_action !== undefined) leadPatch.next_action = data.next_action;
    if (data.priority !== undefined) leadPatch.priority = data.priority;
    if (Object.keys(leadPatch).length > 0) {
      await context.supabase.from("leads").update(leadPatch).eq("id", data.leadId);
    }
    return insert.data;
  });

export const deleteLeadActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("lead_activities")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Documents ----

const MAX_DOC_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export const listLeadDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("lead_documents")
      .select("id, lead_id, label, file_name, storage_path, mime_type, size_bytes, created_at")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createLeadDocumentUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        fileName: z.string().trim().min(1).max(200),
        mimeType: z.string().trim().min(1).max(120),
        sizeBytes: z.number().int().min(1).max(MAX_DOC_BYTES),
        label: docLabelEnum,
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    if (!ALLOWED_MIME.has(data.mimeType)) {
      throw new Error("Only PDF, PNG, JPG or WebP files are allowed");
    }
    // Verify lead ownership (RLS will also enforce on insert)
    const { data: lead, error: lErr } = await context.supabase
      .from("leads")
      .select("id")
      .eq("id", data.leadId)
      .maybeSingle();
    if (lErr) throw new Error(lErr.message);
    if (!lead) throw new Error("Lead not found");

    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
    const path = `${context.userId}/${data.leadId}/${crypto.randomUUID()}-${safeName}`;
    const { data: signed, error: sErr } = await context.supabase.storage
      .from("lead-documents")
      .createSignedUploadUrl(path);
    if (sErr) throw new Error(sErr.message);
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

export const registerLeadDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        label: docLabelEnum,
        fileName: z.string().min(1).max(200),
        storagePath: z.string().min(1).max(500),
        mimeType: z.string().max(120),
        sizeBytes: z.number().int().min(0).max(MAX_DOC_BYTES),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("lead_documents")
      .insert({
        lead_id: data.leadId,
        user_id: context.userId,
        label: data.label,
        file_name: data.fileName,
        storage_path: data.storagePath,
        mime_type: data.mimeType,
        size_bytes: data.sizeBytes,
      })
      .select("id, lead_id, label, file_name, storage_path, mime_type, size_bytes, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getLeadDocumentDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("lead_documents")
      .select("storage_path")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { data: signed, error: sErr } = await context.supabase.storage
      .from("lead-documents")
      .createSignedUrl(row.storage_path, 60 * 5);
    if (sErr) throw new Error(sErr.message);
    return { url: signed.signedUrl };
  });

export const deleteLeadDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error: gErr } = await context.supabase
      .from("lead_documents")
      .select("storage_path")
      .eq("id", data.id)
      .single();
    if (gErr) throw new Error(gErr.message);
    await context.supabase.storage.from("lead-documents").remove([row.storage_path]);
    const { error } = await context.supabase
      .from("lead_documents")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Quick add (WhatsApp screenshot) ----

const quickLeadSchema = z.object({
  contact_person: z.string().trim().max(200).optional().nullable(),
  whatsapp: z
    .string()
    .trim()
    .min(4)
    .max(30)
    .regex(/^[0-9+\-\s()]+$/, "Digits and + - ( ) only"),
  contact_email: z
    .string()
    .trim()
    .max(200)
    .email()
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  company_name: z.string().trim().max(200).optional().nullable(),
  website: z.string().trim().max(300).optional().nullable(),
  product: z.string().trim().min(1, "Product / service is required").max(500),
  note: z.string().trim().max(1000).optional().nullable(),
  is_reseller: z.boolean().optional(),
  reseller_company_id: z.string().uuid().optional().nullable(),
  reseller_company_name: z.string().trim().max(200).optional().nullable(),
  end_user_project: z.string().trim().max(1000).optional().nullable(),
  pipeline_value_cents: z.number().int().min(0).max(1_000_000_000_00).optional(),
});

export const createQuickLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => quickLeadSchema.parse(d))
  .handler(async ({ context, data }) => {
    const parts: string[] = [];
    if (data.product) parts.push(`Product: ${data.product}`);
    if (data.note) parts.push(data.note);
    const activityBody = parts.join("\n\n");

    // Resolve reseller: either existing id or create new company with is_reseller=true
    let resellerCompanyId: string | null = null;
    if (data.is_reseller) {
      if (data.reseller_company_id) {
        resellerCompanyId = data.reseller_company_id;
      } else if (data.reseller_company_name) {
        const name = data.reseller_company_name.trim();
        // Try existing first (case-insensitive)
        const { data: existing } = await context.supabase
          .from("companies")
          .select("id")
          .eq("user_id", context.userId)
          .ilike("name", name)
          .maybeSingle();
        if (existing) {
          resellerCompanyId = existing.id;
          await context.supabase.from("companies").update({ is_reseller: true }).eq("id", existing.id);
        } else {
          const { data: created, error: cErr } = await context.supabase
            .from("companies")
            .insert({ user_id: context.userId, name, is_reseller: true })
            .select("id")
            .single();
          if (cErr) throw new Error(cErr.message);
          resellerCompanyId = created.id;
        }
      }
    }

    const { data: row, error } = await context.supabase
      .from("leads")
      .insert({
        user_id: context.userId,
        company_id: null,
        contact_person: data.contact_person || null,
        contact_email: data.contact_email || null,
        whatsapp: data.whatsapp,
        company_name: data.company_name || null,
        website: data.website || null,
        products_services: [data.product.slice(0, 80)],
        status: "warm",
        lead_type: data.is_reseller ? "reseller" : "direct",
        reseller_company_id: resellerCompanyId,
        end_user_project: data.end_user_project || null,
        pipeline_value_cents: data.pipeline_value_cents ?? 0,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (activityBody) {
      await context.supabase.from("lead_activities").insert({
        lead_id: row.id,
        user_id: context.userId,
        kind: "note",
        body: activityBody,
      });
    }
    return { id: row.id };
  });

// List leads grouped by reseller company
export const listLeadsByReseller = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ resellerId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("leads")
      .select(LEAD_SELECT)
      .eq("reseller_company_id", data.resellerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });


// ---- AI row summary (one sentence, <=20 words) ----

export const generateLeadAiSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const { data: lead, error: lErr } = await context.supabase
      .from("leads")
      .select(
        "id, contact_person, company_name, products_services, status, pipeline_value_cents, notes, last_activity_note, end_user_project",
      )
      .eq("id", data.leadId)
      .single();
    if (lErr) throw new Error(lErr.message);

    const { data: acts } = await context.supabase
      .from("lead_activities")
      .select("kind, body, created_at")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false })
      .limit(10);

    const contextText = [
      `Company: ${lead.company_name ?? "unknown"}`,
      `Contact: ${lead.contact_person ?? "unknown"}`,
      `Products of interest: ${(lead.products_services ?? []).join(", ") || "unknown"}`,
      lead.end_user_project ? `End-user project: ${lead.end_user_project}` : null,
      lead.notes ? `Notes: ${lead.notes}` : null,
      lead.last_activity_note ? `Last activity note: ${lead.last_activity_note}` : null,
      "Recent activity log (newest first):",
      ...(acts ?? []).map((a) => `- [${a.kind}] ${a.body}`.slice(0, 300)),
    ]
      .filter(Boolean)
      .join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You summarize CRM sales leads. Write ONE sentence of at most 20 words capturing what the customer wants and the current state of the deal. No preamble, no quotes, plain text only.",
          },
          { role: "user", content: contextText.slice(0, 8000) },
        ],
      }),
    });
    if (res.status === 429) throw new Error("Rate limit exceeded. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Settings → Workspace → Usage.");
    if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { choices: Array<{ message: { content?: string } }> };
    const summary = (json.choices?.[0]?.message?.content ?? "").trim().slice(0, 500);
    if (!summary) throw new Error("AI returned an empty summary");

    // Persist when the ai_summary column exists; before the migration we still
    // return the text so the UI can show it for the session.
    const { error: uErr } = await context.supabase
      .from("leads")
      .update({ ai_summary: summary })
      .eq("id", data.leadId);
    return { summary, persisted: !uErr };
  });

const extractToolSchema = {
  type: "object",
  properties: {
    contact_person: { type: ["string", "null"], description: "Name of the contact if visible, else null" },
    whatsapp: { type: ["string", "null"], description: "Phone/WhatsApp number including country code, digits/+ only, else null" },
    contact_email: { type: ["string", "null"] },
    company_name: { type: ["string", "null"], description: "Company / business name if visible" },
    website: { type: ["string", "null"], description: "Company website / domain if visible" },
    product: { type: ["string", "null"], description: "Product or service the customer is asking about, if mentioned" },
    note: { type: ["string", "null"], description: "Short summary of the customer's request (one or two sentences)" },
  },
  required: ["contact_person", "whatsapp", "contact_email", "company_name", "website", "product", "note"],
} as const;

export const extractLeadFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        imageDataUrl: z
          .string()
          .min(20)
          .max(10_000_000)
          .regex(/^data:image\/(png|jpe?g|webp|gif);base64,/i, "Must be an image data URL"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You read screenshots of WhatsApp chats. OCR the image and extract the customer lead details. The phone number is usually at the top of the chat header. The contact name may be a sender name or signature inside a message. Identify the product/service they are asking about. If a company name or website/domain is mentioned in a message, signature, or email, extract it. Always call the extract_lead tool. Use null for any field you cannot find.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the WhatsApp lead details from this screenshot." },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: { name: "extract_lead", description: "Return structured lead details.", parameters: extractToolSchema },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_lead" } },
      }),
    });
    if (res.status === 429) throw new Error("Rate limit exceeded. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Settings → Workspace → Usage.");
    if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      choices: Array<{ message: { tool_calls?: Array<{ function: { arguments: string } }> } }>;
    };
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI did not return structured data");
    return JSON.parse(args) as {
      contact_person: string | null;
      whatsapp: string | null;
      contact_email: string | null;
      company_name: string | null;
      website: string | null;
      product: string | null;
      note: string | null;
    };
  });
