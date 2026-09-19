import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export type DdpConfig = {
  enabled: boolean;
  boq_fixed: number; // AED, flat per shipment
  per_kg: number; // AED per kg
  per_unit: number; // AED per unit
  weight: number; // total shipment weight, kg
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

export type QuotationWithItems = Quotation & { items: QuotationItem[] };

const QUOTE_SELECT =
  "id, quote_number, lead_id, company_name, contact_name, currency, exchange_rate, vat_rate, ddp, items_total_cents, vat_cents, grand_total_cents, category, status, notes, assigned_to, created_by, created_at, updated_at";
const ITEM_SELECT =
  "id, quotation_id, position, product_id, part_number, description, qty, unit_price_cents";

// ---------------------------------------------------------------------------
// Money / DDP math — the single source of truth, ported from the quote tool.
// Base line prices are stored in AED cents; DDP is spread per-unit and baked in,
// then the whole thing is converted to the quote currency. Totals are frozen in
// cents in the quote's currency.
// ---------------------------------------------------------------------------

const DEFAULT_DDP: DdpConfig = {
  enabled: false,
  boq_fixed: 0,
  per_kg: 0,
  per_unit: 0,
  weight: 0,
};

function ddpPerUnitAedCents(
  items: { qty: number }[],
  ddp: DdpConfig,
): number {
  if (!ddp.enabled) return 0;
  const totalUnits = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  if (totalUnits <= 0) return 0;
  const totalAed =
    (Number(ddp.boq_fixed) || 0) +
    (Number(ddp.per_kg) || 0) * (Number(ddp.weight) || 0) +
    (Number(ddp.per_unit) || 0) * totalUnits;
  return Math.round((totalAed / totalUnits) * 100); // AED cents per unit
}

export function computeQuoteTotals(
  items: { qty: number; unit_price_cents: number }[],
  currency: string,
  exchangeRate: number,
  vatRate: number,
  ddp: DdpConfig,
): { items_total_cents: number; vat_cents: number; grand_total_cents: number } {
  const rate = Number(exchangeRate) || 1;
  const ddpUnit = ddpPerUnitAedCents(items, ddp);
  let itemsTotal = 0;
  for (const it of items) {
    const qty = Number(it.qty) || 0;
    const baseAedCents = Number(it.unit_price_cents) || 0;
    const finalUnitCurCents = Math.round((baseAedCents + ddpUnit) * rate);
    itemsTotal += finalUnitCurCents * qty;
  }
  const vat = Math.round(itemsTotal * ((Number(vatRate) || 0) / 100));
  return {
    items_total_cents: itemsTotal,
    vat_cents: vat,
    grand_total_cents: itemsTotal + vat,
  };
}

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
    return { ...(quote as Quotation), items: (items ?? []) as QuotationItem[] };
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

export const createQuotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
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
    return { ok: true, id: created.id as string, quote_number: created.quote_number as number };
  });

export const updateQuotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), patch: patchSchema }).parse(d),
  )
  .handler(async ({ context, data }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const patch = data.patch as Partial<z.infer<typeof createSchema>>;

    // Load current quote so we can recompute totals from whichever of
    // {items, currency, rate, vat, ddp} changed.
    const { data: current, error: loadErr } = await sb
      .from("quotations")
      .select("currency, exchange_rate, vat_rate, ddp")
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

    return { ok: true };
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
