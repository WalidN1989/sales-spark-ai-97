import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CATEGORY = z.enum([
  "pending_pdc",
  "pending_collection",
  "pending_po_payment_advice",
  "demo_unit",
  "consignment",
]);
const STATUS = z.enum(["open", "waiting", "partially_resolved", "resolved", "cancelled"]);
const PRIORITY = z.enum(["low", "normal", "high"]);
const ACTIVITY_TYPE = z.enum([
  "call",
  "whatsapp",
  "email",
  "visit",
  "note",
  "document_sent",
  "payment_received",
  "collection_done",
  "other",
]);

const SELECT =
  "id, company_name, prospect_id, category, reference, title, description, amount_aed, currency, quantity, unit_sku, due_date, sent_date, status, priority, owner, last_activity_at, resolved_at, notes, created_at, updated_at";

// ---------- Reads ----------

export const listPaymentFollowups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("payment_followups")
      .select(SELECT)
      .order("status", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getPaymentFollowup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: item, error } = await context.supabase
      .from("payment_followups")
      .select(SELECT)
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { data: activities } = await context.supabase
      .from("payment_followup_activities")
      .select("id, activity_type, summary, details, activity_at, created_by, source")
      .eq("followup_id", data.id)
      .order("activity_at", { ascending: false })
      .limit(500);
    return { item, activities: activities ?? [] };
  });

// ---------- Writes ----------

const upsertSchema = z.object({
  company_name: z.string().trim().min(1).max(200),
  category: CATEGORY,
  reference: z.string().trim().max(100).nullable().optional(),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).nullable().optional(),
  amount_aed: z.number().min(0).max(1_000_000_000).nullable().optional(),
  quantity: z.number().min(0).max(1_000_000).nullable().optional(),
  unit_sku: z.string().trim().max(100).nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  sent_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: STATUS.default("open"),
  priority: PRIORITY.default("normal"),
  owner: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const createPaymentFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("payment_followups")
      .insert({ ...data, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updatePaymentFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), patch: upsertSchema.partial() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("payment_followups")
      .update({ ...data.patch, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setPaymentFollowupStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: STATUS }).parse(d))
  .handler(async ({ context, data }) => {
    const patch: { status: string; updated_at: string; resolved_at?: string | null } = {
      status: data.status,
      updated_at: new Date().toISOString(),
    };
    if (data.status === "resolved") patch.resolved_at = new Date().toISOString();
    if (data.status === "open" || data.status === "waiting") patch.resolved_at = null;
    const { error } = await context.supabase.from("payment_followups").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePaymentFollowup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("payment_followups").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const logPaymentActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        followup_id: z.string().uuid(),
        activity_type: ACTIVITY_TYPE,
        summary: z.string().trim().min(1).max(500),
        details: z.string().trim().max(2000).nullable().optional(),
        activity_at: z.string().datetime({ offset: true }).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("payment_followup_activities").insert({
      followup_id: data.followup_id,
      activity_type: data.activity_type,
      summary: data.summary,
      details: data.details ?? null,
      activity_at: data.activity_at ?? new Date().toISOString(),
      created_by: "ui",
      source: "ui",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
