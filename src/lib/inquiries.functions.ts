import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const statusEnum = z.enum(["open", "won", "lost", "cancelled"]);
const activityKindEnum = z.enum(["note", "update", "status", "won", "lost"]);

export const listInquiries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("inquiries")
      .select(
        "id, title, description, product, target_value_cents, status, won_lead_id, created_at, updated_at, inquiry_leads(lead_id, leads(id, contact_person, company_name, status, lead_score, pipeline_value_cents))",
      )
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getInquiry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: inq, error } = await context.supabase
      .from("inquiries")
      .select(
        "id, title, description, product, target_value_cents, status, won_lead_id, created_at, updated_at",
      )
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    const { data: links } = await context.supabase
      .from("inquiry_leads")
      .select(
        "lead_id, role, joined_at, leads(id, contact_person, contact_email, company_name, status, lead_score, pipeline_value_cents, last_activity_at, last_activity_note, linkedin_url, job_title)",
      )
      .eq("inquiry_id", data.id);

    const { data: activities } = await context.supabase
      .from("inquiry_activities")
      .select("id, kind, body, lead_id, created_at")
      .eq("inquiry_id", data.id)
      .order("created_at", { ascending: false });

    return { inquiry: inq, links: links ?? [], activities: activities ?? [] };
  });

export const createInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(2000).optional().nullable(),
        product: z.string().trim().max(200).optional().nullable(),
        target_value_cents: z.number().int().min(0).max(1_000_000_000_00).optional(),
        leadIds: z.array(z.string().uuid()).max(50).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("inquiries")
      .insert({
        user_id: context.userId,
        title: data.title,
        description: data.description ?? null,
        product: data.product ?? null,
        target_value_cents: data.target_value_cents ?? 0,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (data.leadIds?.length) {
      const links = data.leadIds.map((lead_id) => ({
        inquiry_id: row.id,
        lead_id,
        user_id: context.userId,
        role: "competitor",
      }));
      await context.supabase.from("inquiry_leads").insert(links);
    }
    return { id: row.id };
  });

export const updateInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z
          .object({
            title: z.string().trim().min(1).max(200).optional(),
            description: z.string().trim().max(2000).nullable().optional(),
            product: z.string().trim().max(200).nullable().optional(),
            target_value_cents: z.number().int().min(0).max(1_000_000_000_00).optional(),
            status: statusEnum.optional(),
          })
          .strict(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("inquiries").update(data.patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("inquiries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const linkLeadToInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        inquiryId: z.string().uuid(),
        leadId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("inquiry_leads").insert({
      inquiry_id: data.inquiryId,
      lead_id: data.leadId,
      user_id: context.userId,
      role: "competitor",
    });
    if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
    return { ok: true };
  });

export const unlinkLeadFromInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        inquiryId: z.string().uuid(),
        leadId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("inquiry_leads")
      .delete()
      .eq("inquiry_id", data.inquiryId)
      .eq("lead_id", data.leadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addInquiryActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        inquiryId: z.string().uuid(),
        leadId: z.string().uuid().optional().nullable(),
        kind: activityKindEnum,
        body: z.string().trim().min(1).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("inquiry_activities")
      .insert({
        inquiry_id: data.inquiryId,
        user_id: context.userId,
        lead_id: data.leadId ?? null,
        kind: data.kind,
        body: data.body,
      })
      .select("id, kind, body, lead_id, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const markInquiryWinner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        inquiryId: z.string().uuid(),
        winnerLeadId: z.string().uuid(),
        markOthersDead: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("inquiries")
      .update({ status: "won", won_lead_id: data.winnerLeadId })
      .eq("id", data.inquiryId);
    if (error) throw new Error(error.message);

    await context.supabase.from("inquiry_activities").insert({
      inquiry_id: data.inquiryId,
      user_id: context.userId,
      lead_id: data.winnerLeadId,
      kind: "won",
      body: "Inquiry marked as won",
    });

    if (data.markOthersDead) {
      const { data: links } = await context.supabase
        .from("inquiry_leads")
        .select("lead_id")
        .eq("inquiry_id", data.inquiryId);
      const ids = (links ?? []).map((l: { lead_id: string }) => l.lead_id).filter((id) => id !== data.winnerLeadId);
      if (ids.length) {
        await context.supabase.from("leads").update({ status: "dead" }).in("id", ids);
      }
    }
    return { ok: true };
  });

export const listInquiriesForLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("inquiry_leads")
      .select("inquiry_id, inquiries(id, title, status)")
      .eq("lead_id", data.leadId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
