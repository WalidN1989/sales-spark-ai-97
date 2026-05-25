import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rowSchema = z.object({
  order_date: z.string().nullable().optional(), // ISO yyyy-mm-dd
  invoice_no: z.string().max(200).nullable().optional(),
  company_name: z.string().max(500).nullable().optional(),
  rep_walid: z.number().nullable().optional(),
  rep_javid: z.number().nullable().optional(),
  vat: z.number().nullable().optional(),
  value: z.number().nullable().optional(),
  source_sheet: z.string().max(100).nullable().optional(),
  // legacy/optional
  order_ref: z.string().max(200).nullable().optional(),
  brand: z.string().max(200).nullable().optional(),
  model: z.string().max(200).nullable().optional(),
  product: z.string().max(500).nullable().optional(),
});

export const listSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sales")
      .select(
        "id, order_date, invoice_no, company_name, rep_walid, rep_javid, vat, value, source_sheet, brand, model, product, created_at",
      )
      .order("order_date", { ascending: false, nullsFirst: false })
      .limit(5000);
    if (error) throw new Error(error.message);
    return data;
  });

export const importSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ rows: z.array(rowSchema).min(1).max(10000) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const userId = context.userId;
    const enriched = data.rows.map((r) => ({ ...r, user_id: userId }));

    const BATCH = 500;
    let inserted = 0;
    let skipped = 0;
    for (let i = 0; i < enriched.length; i += BATCH) {
      const batch = enriched.slice(i, i + BATCH);
      const { error, count } = await context.supabase
        .from("sales")
        .upsert(batch, {
          onConflict: "user_id,order_date,invoice_no",
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
