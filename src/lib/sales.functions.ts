import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rowSchema = z.object({
  order_date: z.string().nullable().optional(), // ISO yyyy-mm-dd
  order_ref: z.string().max(200).nullable().optional(),
  value: z.number().nullable().optional(),
  brand: z.string().max(200).nullable().optional(),
  model: z.string().max(200).nullable().optional(),
  product: z.string().max(500).nullable().optional(),
});

export const listSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sales")
      .select("id, order_date, order_ref, value, brand, model, product, created_at")
      .order("order_date", { ascending: false, nullsFirst: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    return data;
  });

export const importSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ rows: z.array(rowSchema).min(1).max(5000) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const userId = context.userId;
    const enriched = data.rows.map((r) => ({ ...r, user_id: userId }));

    const BATCH = 500;
    let inserted = 0;
    let skipped = 0;
    for (let i = 0; i < enriched.length; i += BATCH) {
      const batch = enriched.slice(i, i + BATCH);
      // Use upsert with the unique index to dedup re-imports
      const { error, count } = await context.supabase
        .from("sales")
        .upsert(batch, {
          onConflict: "user_id,order_date,order_ref,value,product",
          ignoreDuplicates: true,
          count: "exact",
        })
        .select("id");
      if (error) throw new Error(error.message);
      const ins = count ?? 0;
      inserted += ins;
      skipped += batch.length - ins;
    }
    return { attempted: enriched.length, inserted, skipped };
  });
