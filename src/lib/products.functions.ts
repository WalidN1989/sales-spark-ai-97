import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
