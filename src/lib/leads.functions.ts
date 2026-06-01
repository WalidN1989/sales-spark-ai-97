import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const statusEnum = z.enum(["hot", "warm", "cold", "frozen", "dead"]);

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select(
        "id, company_id, contact_person, contact_email, whatsapp, status, pipeline_value_cents, last_activity_kind, last_activity_at, last_activity_note, created_at, companies:company_id(name, domain, country, industry)",
      )
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const promoteToLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ companyId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    // Idempotent: return existing if present
    const { data: existing } = await context.supabase
      .from("leads")
      .select("id")
      .eq("company_id", data.companyId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) return { id: existing.id, created: false };

    const { data: company, error: cErr } = await context.supabase
      .from("companies")
      .select("contact_person, email")
      .eq("id", data.companyId)
      .single();
    if (cErr) throw new Error(cErr.message);

    const { data: row, error } = await context.supabase
      .from("leads")
      .insert({
        user_id: context.userId,
        company_id: data.companyId,
        contact_person: company.contact_person,
        contact_email: company.email,
        status: "warm",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, created: true };
  });

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
    last_activity_kind: z.enum(["note", "email", "call", "meeting", "log"]).nullable().optional(),
    last_activity_note: z.string().max(1000).nullable().optional(),
    touch_activity: z.boolean().optional(),
  })
  .strict();

export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), patch: patchSchema }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { touch_activity, ...patch } = data.patch;
    const finalPatch: Record<string, unknown> = { ...patch };
    if (touch_activity || patch.last_activity_note || patch.last_activity_kind) {
      finalPatch.last_activity_at = new Date().toISOString();
    }
    const { error } = await context.supabase
      .from("leads")
      .update(finalPatch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
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
