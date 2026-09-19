import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { productKey } from "@/lib/pricebook-import";

const productSchema = z.object({
  brand: z.string().max(200).optional().nullable(),
  name: z.string().min(1).max(300),
  part_number: z.string().max(120).optional().nullable(),
  category: z.string().max(120).optional().nullable(),
  cost_price_cents: z.number().int().min(0).max(1_000_000_000).optional().nullable(),
  selling_price_cents: z.number().int().min(0).max(1_000_000_000).optional().nullable(),
  margin_l1_pct: z.number().min(-100).max(1000).optional().nullable(),
  margin_l2_pct: z.number().min(-100).max(1000).optional().nullable(),
  currency: z.string().min(1).max(8).default("AED"),
  warranty: z.string().max(120).optional().nullable(),
  stock_status: z.string().max(80).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

// Name / part-number typeahead for the quotation builder. RLS scopes results to
// the caller's own products (or all, for an admin).
export const searchProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ q: z.string().trim().max(200), limit: z.number().int().min(1).max(50).default(20) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const q = data.q.trim();
    if (q.length < 2) return [];
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const { data: rows, error } = await context.supabase
      .from("products")
      .select("*")
      .or(`name.ilike.${like},part_number.ilike.${like},brand.ilike.${like}`)
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getProduct = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("products")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        patch: productSchema,
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    if (data.id) {
      const { error } = await context.supabase
        .from("products")
        .update(data.patch)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("products")
      .insert({ ...data.patch, user_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export function extractPartNumberCandidates(text: string): string[] {
  const re = /\b[A-Z][A-Z0-9-]{4,}\b/g;
  const upper = text.toUpperCase();
  const set = new Set<string>();
  for (const m of upper.matchAll(re)) {
    const v = m[0];
    // skip common words written in caps
    if (/^(EMAIL|PHONE|FROM|SUBJECT|HELLO|REGARDS|THANKS|PLEASE|QUOTE|PRICE|TOTAL|UAE|JAFZA|KSA|KAUST|VAT)$/.test(v))
      continue;
    set.add(v);
  }
  return Array.from(set);
}

export const matchProductsByText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ text: z.string().max(20000) }).parse(d))
  .handler(async ({ context, data }) => {
    const candidates = extractPartNumberCandidates(data.text);
    if (candidates.length === 0) return { detected: [], products: [] };
    const { data: rows, error } = await context.supabase
      .from("products")
      .select("*")
      .in("part_number", candidates);
    if (error) throw new Error(error.message);
    // Also case-insensitive fallback
    const matched = rows ?? [];
    const matchedSet = new Set(matched.map((p) => (p.part_number ?? "").toUpperCase()));
    const detected = candidates.filter((c) => matchedSet.has(c));
    return { detected, products: matched };
  });

// Bulk import from an uploaded price book. De-duplicates against the caller's
// existing products by (part_number + name); inserts new rows, updates only rows
// whose mapped fields actually changed, and skips identical rows — so re-uploading
// the same file is a no-op. RLS keeps everything scoped to the caller.
const importRowSchema = z.object({
  part_number: z.string().max(120).nullable().optional(),
  name: z.string().min(1).max(300),
  brand: z.string().max(200).nullable().optional(),
  category: z.string().max(120).nullable().optional(),
  cost_price_cents: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  selling_price_cents: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  currency: z.string().min(1).max(8).default("AED"),
  stock_status: z.string().max(80).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

const COMPARE_FIELDS = [
  "part_number",
  "name",
  "brand",
  "category",
  "cost_price_cents",
  "selling_price_cents",
  "currency",
  "stock_status",
  "notes",
] as const;

function norm(v: unknown): string {
  return v == null ? "" : String(v);
}

export const importProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ rows: z.array(importRowSchema).min(1).max(5000) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: existing, error: exErr } = await context.supabase
      .from("products")
      .select(
        "id, part_number, name, brand, category, cost_price_cents, selling_price_cents, currency, stock_status, notes",
      );
    if (exErr) throw new Error(exErr.message);

    const byKey = new Map<string, (typeof existing)[number]>();
    for (const p of existing ?? []) byKey.set(productKey(p), p);

    // Collapse duplicate rows WITHIN the upload (the same part#+name can appear on
    // more than one sheet) so we never insert a duplicate — last occurrence wins.
    const uniqueRows = Array.from(
      data.rows
        .reduce((m, r) => m.set(productKey(r), r), new Map<string, (typeof data.rows)[number]>())
        .values(),
    );

    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: { id: string; patch: Record<string, unknown> }[] = [];
    let skipped = 0;

    for (const row of uniqueRows) {
      const key = productKey(row);
      const current = byKey.get(key);
      const mapped: Record<string, unknown> = {
        part_number: row.part_number ?? null,
        name: row.name,
        brand: row.brand ?? null,
        category: row.category ?? null,
        cost_price_cents: row.cost_price_cents ?? null,
        selling_price_cents: row.selling_price_cents ?? null,
        currency: row.currency ?? "AED",
        stock_status: row.stock_status ?? null,
        notes: row.notes ?? null,
      };
      if (!current) {
        toInsert.push({ ...mapped, user_id: context.userId });
        continue;
      }
      const patch: Record<string, unknown> = {};
      for (const f of COMPARE_FIELDS) {
        if (norm(mapped[f]) !== norm((current as Record<string, unknown>)[f])) {
          patch[f] = mapped[f];
        }
      }
      if (Object.keys(patch).length > 0) toUpdate.push({ id: current.id, patch });
      else skipped++;
    }

    // Rows are built dynamically, so use the loosely-typed client for writes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    // Insert in chunks to stay well within request limits.
    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200);
      const { error } = await sb.from("products").insert(chunk);
      if (error) throw new Error(error.message);
    }
    for (const u of toUpdate) {
      const { error } = await sb.from("products").update(u.patch).eq("id", u.id);
      if (error) throw new Error(error.message);
    }

    return { created: toInsert.length, updated: toUpdate.length, skipped };
  });
