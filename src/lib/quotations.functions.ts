import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_DDP, computeQuoteTotals, fmtMoney, type DdpConfig } from "@/lib/quote-math";

export type { DdpConfig } from "@/lib/quote-math";
export { computeQuoteTotals } from "@/lib/quote-math";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QuotationItem = {
  id: string;
  quotation_id: string;
  position: number;
  product_id: string | null;
  part_number: string | null;
  description: string | null;
  qty: number;
  unit_price_cents: number; // BASE price in AED (pre-DDP, pre-conversion)
};

export type Quotation = {
  id: string;
  quote_number: number;
  lead_id: string | null;
  company_name: string | null;
  contact_name: string | null;
  currency: string;
  exchange_rate: number; // 1 AED = exchange_rate * currency
  vat_rate: number; // percent
  ddp: DdpConfig;
  items_total_cents: number; // final customer totals, in `currency`
  vat_cents: number;
  grand_total_cents: number;
  category: string | null;
  status: "draft" | "sent" | "accepted" | "rejected";
  notes: string | null;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type QuotationWithItems = Quotation & {
  items: QuotationItem[];
  // Display name of the linked CRM lead (company · contact), when lead_id is set.
  lead_label?: string | null;
};

// A CRM target the quote can be linked to: an existing lead, or a prospect
// (company) that has no lead yet — the editor resolves its primary lead.
export type QuoteTarget = {
  kind: "lead" | "prospect";
  lead_id: string | null;
  company_id: string | null;
  company: string;
  contact: string | null;
  converted: boolean;
};

const QUOTE_SELECT =
  "id, quote_number, lead_id, company_name, contact_name, currency, exchange_rate, vat_rate, ddp, items_total_cents, vat_cents, grand_total_cents, category, status, notes, assigned_to, created_by, created_at, updated_at";
const ITEM_SELECT =
  "id, quotation_id, position, product_id, part_number, description, qty, unit_price_cents";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const ddpSchema = z
  .object({
    enabled: z.boolean().default(false),
    boq_fixed: z.number().min(0).max(10_000_000).default(0),
    per_kg: z.number().min(0).max(10_000_000).default(0),
    per_unit: z.number().min(0).max(10_000_000).default(0),
    weight: z.number().min(0).max(10_000_000).default(0),
  })
  .default(DEFAULT_DDP);

const itemSchema = z.object({
  product_id: z.string().uuid().nullable().optional(),
  part_number: z.string().max(120).nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  qty: z.number().min(0).max(1_000_000).default(1),
  unit_price_cents: z.number().int().min(0).max(1_000_000_000).default(0),
});

const baseFields = {
  lead_id: z.string().uuid().nullable().optional(),
  company_name: z.string().max(300).nullable().optional(),
  contact_name: z.string().max(300).nullable().optional(),
  currency: z.string().min(1).max(8).default("AED"),
  exchange_rate: z.number().positive().max(1_000_000).default(1),
  vat_rate: z.number().min(0).max(100).default(5),
  ddp: ddpSchema,
  category: z.string().max(120).nullable().optional(),
  status: z.enum(["draft", "sent", "accepted", "rejected"]).default("draft"),
  notes: z.string().max(8000).nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
};

const createSchema = z.object({
  ...baseFields,
  items: z.array(itemSchema).min(1).max(200),
});

// What the user just did — drives the Activity Journal entry on the linked lead.
const logEventSchema = z.enum(["saved", "copied"]).optional();

const patchSchema = z.object({
  lead_id: z.string().uuid().nullable().optional(),
  company_name: z.string().max(300).nullable().optional(),
  contact_name: z.string().max(300).nullable().optional(),
  currency: z.string().min(1).max(8).optional(),
  exchange_rate: z.number().positive().max(1_000_000).optional(),
  vat_rate: z.number().min(0).max(100).optional(),
  ddp: ddpSchema.optional(),
  category: z.string().max(120).nullable().optional(),
  status: z.enum(["draft", "sent", "accepted", "rejected"]).optional(),
  notes: z.string().max(8000).nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  items: z.array(itemSchema).min(1).max(200).optional(),
});

// ---------------------------------------------------------------------------
// Server functions (RLS scopes reads: rep sees own, manager sees all)
// ---------------------------------------------------------------------------

export const listQuotations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Quotation[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("quotations")
      .select(QUOTE_SELECT)
      .order("quote_number", { ascending: false })
      .limit(1000);
    if (error) {
      // Works before the migration is applied.
      if (/quotation|does not exist|relation/i.test(error.message)) return [];
      throw new Error(error.message);
    }
    return (data ?? []) as Quotation[];
  });

export const getQuotation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<QuotationWithItems | null> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: quote, error } = await sb
      .from("quotations")
      .select(QUOTE_SELECT)
      .eq("id", data.id)
      .single();
    if (error) {
      if (/no rows/i.test(error.message)) return null;
      throw new Error(error.message);
    }
    const { data: items, error: itemsErr } = await sb
      .from("quotation_items")
      .select(ITEM_SELECT)
      .eq("quotation_id", data.id)
      .order("position", { ascending: true });
    if (itemsErr) throw new Error(itemsErr.message);
    let lead_label: string | null = null;
    if ((quote as Quotation).lead_id) {
      const { data: lead } = await sb
        .from("leads")
        .select("company_name, contact_person, companies!leads_company_id_fkey(name)")
        .eq("id", (quote as Quotation).lead_id)
        .maybeSingle();
      if (lead) {
        const co = lead.company_name || lead.companies?.name || "Lead";
        lead_label = lead.contact_person ? `${co} · ${lead.contact_person}` : co;
      }
    }
    return { ...(quote as Quotation), items: (items ?? []) as QuotationItem[], lead_label };
  });

async function insertItems(
  sb: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  quotationId: string,
  items: z.infer<typeof itemSchema>[],
) {
  if (items.length === 0) return;
  const rows = items.map((it, idx) => ({
    quotation_id: quotationId,
    position: idx,
    product_id: it.product_id ?? null,
    part_number: it.part_number ?? null,
    description: it.description ?? null,
    qty: it.qty ?? 1,
    unit_price_cents: it.unit_price_cents ?? 0,
  }));
  const { error } = await sb.from("quotation_items").insert(rows);
  if (error) throw new Error(error.message);
}


// ---------------------------------------------------------------------------
// Lead sync — a quote linked to a lead keeps the CRM in step:
//   * logs a `quotation` entry in the lead's Activity Journal (the
//     lead_activities_rollup trigger bumps last_activity_at, so the lead
//     floats to the top of Leads' smart order);
//   * advances pipeline_stage to 'quotation' (forward only — never from
//     negotiation / purchase_order / won / lost);
//   * fills pipeline_value_cents with the ex-VAT total in AED, only if empty;
//   * merges quoted products into products_services;
//   * converts a prospect into Leads (is_converted = true on the company's
//     contacts, same as Convert-to-Lead) — a quote means a live deal.
// Best-effort: a failure here never fails the save itself.
// ---------------------------------------------------------------------------
const PRE_QUOTE_STAGES = new Set<string | null>([null, "", "prospect", "qualified", "meeting"]);

type SyncItem = { part_number?: string | null; description?: string | null; qty?: number | null };

function itemLabel(i: SyncItem): string {
  return ((i.description ?? "").split("\n")[0].trim() || (i.part_number ?? "").trim() || "item").slice(0, 60);
}

function itemsSummary(items: SyncItem[]): string {
  const head = items.slice(0, 3).map((i) => `${Number(i.qty) || 0} × ${itemLabel(i)}`);
  const more = items.length > 3 ? ` +${items.length - 3} more` : "";
  return head.join(", ") + more;
}

async function syncLeadFromQuote(
  sb: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  userId: string,
  leadId: string,
  q: {
    quoteNumber: number;
    verb: string;
    currency: string;
    exchangeRate: number;
    itemsTotalCents: number;
    grandTotalCents: number;
    items: SyncItem[];
  },
): Promise<boolean> {
  try {
    const body =
      `Quotation #${q.quoteNumber} ${q.verb} · ${q.currency} ${fmtMoney(q.grandTotalCents)} (incl. VAT)` +
      (q.items.length ? ` — ${itemsSummary(q.items)}` : "");
    const { error: actErr } = await sb
      .from("lead_activities")
      .insert({ lead_id: leadId, user_id: userId, kind: "quotation", body });
    if (actErr) {
      console.error("quote activity failed", actErr.message);
      return false;
    }

    const { data: lead } = await sb
      .from("leads")
      .select("pipeline_stage, pipeline_value_cents, products_services, is_converted, company_id, prospect_id")
      .eq("id", leadId)
      .single();
    if (!lead) return true;
    const patch: Record<string, unknown> = {};
    if (lead.is_converted === false) {
      patch.is_converted = true;
      const companyId = lead.company_id ?? lead.prospect_id;
      if (companyId) {
        await sb
          .from("leads")
          .update({ is_converted: true })
          .or(`company_id.eq.${companyId},prospect_id.eq.${companyId}`)
          .eq("is_converted", false);
      }
    }
    if (PRE_QUOTE_STAGES.has(lead.pipeline_stage ?? null)) patch.pipeline_stage = "quotation";
    if (!lead.pipeline_value_cents) {
      const rate = Number(q.exchangeRate) || 1; // 1 AED = rate * currency
      patch.pipeline_value_cents = Math.round(q.itemsTotalCents / rate);
    }
    const existing: string[] = Array.isArray(lead.products_services) ? lead.products_services : [];
    const seen = new Set(existing.map((x) => x.toLowerCase()));
    const merged = [...existing];
    for (const it of q.items) {
      const tag = ((it.description ?? "").split("\n")[0].trim() || (it.part_number ?? "").trim()).slice(0, 80);
      if (tag && !seen.has(tag.toLowerCase()) && merged.length < 12) {
        seen.add(tag.toLowerCase());
        merged.push(tag);
      }
    }
    if (merged.length !== existing.length) patch.products_services = merged;
    if (Object.keys(patch).length) await sb.from("leads").update(patch).eq("id", leadId);
    return true;
  } catch (e) {
    console.error("syncLeadFromQuote failed", e);
    return false;
  }
}

export const createQuotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.extend({ log_event: logEventSchema }).parse(d))
  .handler(async ({ context, data }) => {
    const ddp: DdpConfig = { ...DEFAULT_DDP, ...data.ddp };
    const totals = computeQuoteTotals(
      data.items,
      data.currency,
      data.exchange_rate,
      data.vat_rate,
      ddp,
    );
    const row = {
      lead_id: data.lead_id ?? null,
      company_name: data.company_name ?? null,
      contact_name: data.contact_name ?? null,
      currency: data.currency,
      exchange_rate: data.exchange_rate,
      vat_rate: data.vat_rate,
      ddp,
      category: data.category ?? null,
      status: data.status ?? "draft",
      notes: data.notes ?? null,
      assigned_to: data.assigned_to ?? context.userId,
      created_by: context.userId,
      ...totals,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: created, error } = await sb
      .from("quotations")
      .insert(row)
      .select("id, quote_number")
      .single();
    if (error) throw new Error(error.message);
    await insertItems(sb, created.id, data.items);
    let logged = false;
    if (row.lead_id) {
      logged = await syncLeadFromQuote(sb, context.userId, row.lead_id, {
        quoteNumber: created.quote_number as number,
        verb: data.log_event === "copied" ? "created & copied for email / WhatsApp" : "created",
        currency: row.currency,
        exchangeRate: row.exchange_rate,
        itemsTotalCents: totals.items_total_cents,
        grandTotalCents: totals.grand_total_cents,
        items: data.items,
      });
    }
    return { ok: true, id: created.id as string, quote_number: created.quote_number as number, logged };
  });

export const updateQuotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), patch: patchSchema, log_event: logEventSchema }).parse(d),
  )
  .handler(async ({ context, data }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const patch = data.patch as Partial<z.infer<typeof createSchema>>;

    // Load current quote so we can recompute totals from whichever of
    // {items, currency, rate, vat, ddp} changed.
    const { data: current, error: loadErr } = await sb
      .from("quotations")
      .select("currency, exchange_rate, vat_rate, ddp, lead_id, quote_number, items_total_cents, grand_total_cents")
      .eq("id", data.id)
      .single();
    if (loadErr) throw new Error(loadErr.message);

    const update: Record<string, unknown> = {};
    for (const k of [
      "lead_id",
      "company_name",
      "contact_name",
      "currency",
      "exchange_rate",
      "vat_rate",
      "category",
      "status",
      "notes",
      "assigned_to",
    ] as const) {
      if (patch[k] !== undefined) update[k] = patch[k];
    }
    if (patch.ddp !== undefined) update.ddp = { ...DEFAULT_DDP, ...patch.ddp };

    // If items or any money input changed, recompute frozen totals.
    if (
      patch.items !== undefined ||
      patch.currency !== undefined ||
      patch.exchange_rate !== undefined ||
      patch.vat_rate !== undefined ||
      patch.ddp !== undefined
    ) {
      let items = patch.items;
      if (items === undefined) {
        const { data: existing, error: exErr } = await sb
          .from("quotation_items")
          .select("qty, unit_price_cents")
          .eq("quotation_id", data.id);
        if (exErr) throw new Error(exErr.message);
        items = (existing ?? []) as z.infer<typeof itemSchema>[];
      }
      const currency = (patch.currency ?? current.currency) as string;
      const rate = (patch.exchange_rate ?? current.exchange_rate) as number;
      const vat = (patch.vat_rate ?? current.vat_rate) as number;
      const ddp = { ...DEFAULT_DDP, ...(patch.ddp ?? current.ddp) };
      Object.assign(update, computeQuoteTotals(items, currency, rate, vat, ddp));
    }

    if (Object.keys(update).length > 0) {
      const { error } = await sb.from("quotations").update(update).eq("id", data.id);
      if (error) throw new Error(error.message);
    }

    // Replace line items wholesale when provided.
    if (patch.items !== undefined) {
      const { error: delErr } = await sb
        .from("quotation_items")
        .delete()
        .eq("quotation_id", data.id);
      if (delErr) throw new Error(delErr.message);
      await insertItems(sb, data.id, patch.items);
    }

    // Keep the linked lead in sync — only when something meaningful happened
    // (a copy/send, a changed total, or a newly linked lead), so repeated
    // Saves of an unchanged quote don't spam the Activity Journal.
    const leadId = (patch.lead_id !== undefined ? patch.lead_id : current.lead_id) as string | null;
    const newGrand = (update.grand_total_cents ?? current.grand_total_cents) as number;
    const newItemsTotal = (update.items_total_cents ?? current.items_total_cents) as number;
    const newlyLinked = !!patch.lead_id && patch.lead_id !== current.lead_id;
    const totalChanged = newGrand !== current.grand_total_cents;
    let logged = false;
    if (leadId && (data.log_event === "copied" || totalChanged || newlyLinked)) {
      let items: SyncItem[] | undefined = patch.items;
      if (!items) {
        const { data: ex } = await sb
          .from("quotation_items")
          .select("part_number, description, qty")
          .eq("quotation_id", data.id)
          .order("position", { ascending: true });
        items = (ex ?? []) as SyncItem[];
      }
      logged = await syncLeadFromQuote(sb, context.userId, leadId, {
        quoteNumber: current.quote_number as number,
        verb:
          data.log_event === "copied"
            ? "copied for email / WhatsApp"
            : newlyLinked
              ? "linked to this lead"
              : "updated",
        currency: (patch.currency ?? current.currency) as string,
        exchangeRate: (patch.exchange_rate ?? current.exchange_rate) as number,
        itemsTotalCents: newItemsTotal,
        grandTotalCents: newGrand,
        items,
      });
    }

    return { ok: true, logged };
  });

export const deleteQuotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    // quotation_items cascade-delete via FK.
    const { error } = await sb.from("quotations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// ---------------------------------------------------------------------------
// CRM linking
// ---------------------------------------------------------------------------

// Find leads / prospects to link a quote to. Token match on a squashed name so
// "Blue Ocean" finds "BlueOcean Technologies & Trading DMCC". RLS scopes rows.
export const searchQuoteTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(2).max(120) }).parse(d))
  .handler(async ({ context, data }): Promise<QuoteTarget[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const squash = (v: string | null | undefined) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const tokens = data.q.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
    if (!tokens.length) return [];
    const probe = [...tokens].sort((a, b) => b.length - a.length)[0]; // most selective
    const matches = (...fields: Array<string | null | undefined>) => {
      const hay = fields.map(squash).join("|");
      return tokens.every((t) => hay.includes(t));
    };

    type LeadRow = {
      id: string;
      company_id: string | null;
      company_name: string | null;
      contact_person: string | null;
      is_converted: boolean | null;
      updated_at: string | null;
      companies: { name: string | null } | null;
    };
    const LEAD_COLS =
      "id, company_id, company_name, contact_person, is_converted, updated_at, companies!leads_company_id_fkey(name)";

    const [{ data: leadHits }, { data: coHits }] = await Promise.all([
      sb
        .from("leads")
        .select(LEAD_COLS)
        .or(`company_name.ilike.%${probe}%,contact_person.ilike.%${probe}%`)
        .limit(60),
      sb.from("companies").select("id, name, contact_person").ilike("name", `%${probe}%`).limit(40),
    ]);

    // Leads belonging to matched companies (their own company_name may be blank).
    const coIds = ((coHits ?? []) as Array<{ id: string }>).map((c) => c.id);
    const { data: coLeads } = coIds.length
      ? await sb.from("leads").select(LEAD_COLS).in("company_id", coIds).limit(80)
      : { data: [] };

    const byLead = new Map<string, QuoteTarget & { _ts: string }>();
    for (const l of [...((leadHits ?? []) as LeadRow[]), ...((coLeads ?? []) as LeadRow[])]) {
      const company = l.company_name || l.companies?.name || "";
      if (!matches(company, l.companies?.name, l.contact_person)) continue;
      byLead.set(l.id, {
        kind: "lead",
        lead_id: l.id,
        company_id: l.company_id,
        company: company || "Lead",
        contact: l.contact_person,
        converted: !!l.is_converted,
        _ts: l.updated_at ?? "",
      });
    }
    const coveredCompanies = new Set([...byLead.values()].map((t) => t.company_id).filter(Boolean));
    const prospects: QuoteTarget[] = [];
    for (const c of (coHits ?? []) as Array<{ id: string; name: string | null; contact_person: string | null }>) {
      if (coveredCompanies.has(c.id) || !matches(c.name)) continue;
      prospects.push({
        kind: "prospect",
        lead_id: null,
        company_id: c.id,
        company: c.name ?? "Prospect",
        contact: c.contact_person,
        converted: false,
      });
    }
    const leads = [...byLead.values()]
      .sort((a, b) => Number(b.converted) - Number(a.converted) || b._ts.localeCompare(a._ts))
      .map(({ _ts, ...t }) => t);
    return [...leads, ...prospects].slice(0, 10);
  });

// Quotations linked to any of these leads (lead page / prospect page panel).
export const listQuotationsForLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadIds: z.array(z.string().uuid()).min(1).max(100) }).parse(d))
  .handler(async ({ context, data }): Promise<Quotation[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("quotations")
      .select(QUOTE_SELECT)
      .in("lead_id", data.leadIds)
      .order("quote_number", { ascending: false })
      .limit(50);
    if (error) {
      if (/quotation|does not exist|relation/i.test(error.message)) return [];
      throw new Error(error.message);
    }
    return (rows ?? []) as Quotation[];
  });
