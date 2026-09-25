import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WaMessage = {
  id: string;
  lead_id: string | null;
  direction: "in" | "out";
  from_number: string | null;
  to_number: string | null;
  body: string | null;
  media_url: string | null;
  status: string | null;
  created_at: string;
};

export type WaConversation = {
  lead_id: string;
  company_name: string | null;
  contact_person: string | null;
  whatsapp: string | null;
  last_body: string | null;
  last_at: string;
  last_direction: "in" | "out";
  count: number;
};

// whatsapp_messages isn't in the generated types until Lovable regenerates them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = (ctx: { supabase: unknown }) => ctx.supabase as any;

// One row per lead — the latest message + a preview. RLS scopes to the caller.
export const listWhatsappConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WaConversation[]> => {
    const { data, error } = await sb(context)
      .from("whatsapp_messages")
      .select("id, lead_id, direction, body, created_at, leads(company_name, contact_person, whatsapp)")
      .not("lead_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) {
      if (/whatsapp_messages|does not exist|relation/i.test(error.message)) return [];
      throw new Error(error.message);
    }
    const byLead = new Map<string, WaConversation>();
    for (const m of (data ?? []) as Array<Record<string, unknown>>) {
      const leadId = m.lead_id as string;
      const lead = (m.leads ?? {}) as { company_name?: string; contact_person?: string; whatsapp?: string };
      const existing = byLead.get(leadId);
      if (!existing) {
        byLead.set(leadId, {
          lead_id: leadId,
          company_name: lead.company_name ?? null,
          contact_person: lead.contact_person ?? null,
          whatsapp: lead.whatsapp ?? null,
          last_body: (m.body as string) ?? null,
          last_at: m.created_at as string,
          last_direction: m.direction as "in" | "out",
          count: 1,
        });
      } else {
        existing.count += 1;
      }
    }
    return [...byLead.values()];
  });

export const listWhatsappThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<WaMessage[]> => {
    const { data: rows, error } = await sb(context)
      .from("whatsapp_messages")
      .select("id, lead_id, direction, from_number, to_number, body, media_url, status, created_at")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);
    return (rows ?? []) as WaMessage[];
  });

// Send a WhatsApp message via Twilio and record it on the lead. Fails cleanly
// with a helpful message until the Twilio secrets are configured.
export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ leadId: z.string().uuid(), body: z.string().trim().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: result, error } = await sb(context).functions.invoke("whatsapp-send", {
      body: data,
    });
    if (error) throw new Error(error.message || "WhatsApp send failed.");
    if (!result?.ok) throw new Error(result?.error || "WhatsApp send failed.");
    return result as { ok: true; sid: string | null };
  });
