import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const purchaseInput = z.object({
  id: z.string().uuid().optional(),
  lead_id: z.string().uuid(),
  product_id: z.string().uuid().nullable().optional(),
  brand: z.string().max(200).nullable().optional(),
  model_no: z.string().max(200).nullable().optional(),
  model_name: z.string().min(1).max(300),
  description: z.string().max(2000).nullable().optional(),
  url: z.string().max(500).nullable().optional(),
  price_cents: z.number().int().min(0).max(1_000_000_000_000).nullable().optional(),
  currency: z.string().max(8).default("AED"),
  image_path: z.string().max(500).nullable().optional(),
  datasheet_path: z.string().max(500).nullable().optional(),
});

export const listLeadPurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("lead_purchases")
      .select("*")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows;
  });

// All purchases attached to any lead whose company_id OR prospect_id = sourceCompanyId
export const listPurchasesBySourceCompany = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ companyId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: leads, error: lErr } = await context.supabase
      .from("leads")
      .select("id, contact_person")
      .or(`company_id.eq.${data.companyId},prospect_id.eq.${data.companyId}`);
    if (lErr) throw new Error(lErr.message);
    const leadIds = (leads ?? []).map((l) => l.id);
    if (!leadIds.length) return [];
    const { data: rows, error } = await context.supabase
      .from("lead_purchases")
      .select("*")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows;
  });

export const upsertLeadPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => purchaseInput.parse(d))
  .handler(async ({ context, data }) => {
    const payload = { ...data, user_id: context.userId };
    if (data.id) {
      const { id, ...patch } = payload;
      const { data: row, error } = await context.supabase
        .from("lead_purchases")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("lead_purchases")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteLeadPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("lead_purchases")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
