import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const statusEnum = z.enum(["hot", "warm", "cold", "frozen", "dead"]);
const activityKindEnum = z.enum(["note", "email", "call", "meeting", "log"]);
const docLabelEnum = z.enum(["trade_license", "vat_certificate", "other"]);

const LEAD_SELECT =
  "id, company_id, prospect_id, contact_person, contact_email, whatsapp, status, pipeline_value_cents, last_activity_kind, last_activity_at, last_activity_note, company_name, website, brands, products_services, notes, job_title, source, email_status, email_score, last_verified_at, lead_score, lead_score_manual_override, linkedin_url, department, seniority, hunter_confidence, phone, lead_type, reseller_company_id, end_user_project, created_at, updated_at, companies!leads_company_id_fkey(name, domain, country, industry, lat, lng), reseller:companies!leads_reseller_company_id_fkey(id, name, domain, status, is_reseller)";

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

    if (uuidRe.test(raw)) {
      const { data: rows, error } = await context.supabase
        .from("leads")
        .select(LEAD_SELECT)
        .eq("company_id", raw)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return rows ?? [];
    }
    if (raw.startsWith("id:") && uuidRe.test(raw.slice(3))) {
      const { data: rows, error } = await context.supabase
        .from("leads")
        .select(LEAD_SELECT)
        .eq("company_id", raw.slice(3))
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return rows ?? [];
    }

    const { data: rows, error } = await context.supabase
      .from("leads")
      .select(LEAD_SELECT)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const all = rows ?? [];
    if (raw.startsWith("domain:")) {
      const domain = normalizeDomain(raw.slice(7));
      return all.filter((l) => normalizeDomain(l.website ?? l.companies?.domain) === domain);
    }
    const name = normalizeName(raw.startsWith("name:") ? raw.slice(5) : raw);
    return all.filter((l) => normalizeName(l.company_name ?? l.companies?.name) === name);
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
      .select("contact_person, email, name, domain, phone")
      .eq("id", data.companyId)
      .single();
    if (cErr) throw new Error(cErr.message);

    // Sanitize phone to satisfy leads.whatsapp validation (digits and + - ( ) only)
    const cleanPhone = (company.phone ?? "").toString().replace(/[^0-9+\-\s()]/g, "").trim() || null;

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
        status: "warm",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, created: true };
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
    const { data: rows, error } = await context.supabase
      .from("lead_activities")
      .select("id, kind, body, created_at")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addLeadActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        kind: activityKindEnum,
        body: z.string().trim().min(1).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("lead_activities")
      .insert({
        lead_id: data.leadId,
        user_id: context.userId,
        kind: data.kind,
        body: data.body,
      })
      .select("id, kind, body, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
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
  product: z.string().trim().max(500).optional().nullable(),
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
