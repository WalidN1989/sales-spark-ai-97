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

const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

// Send a WhatsApp message via Twilio and record it on the lead. Fails cleanly
// with a helpful message until the Twilio secrets are configured.
export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ leadId: z.string().uuid(), body: z.string().trim().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromRaw = process.env.TWILIO_WHATSAPP_FROM;
    if (!sid || !authToken || !fromRaw) {
      throw new Error("WhatsApp isn't connected yet — add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM in Lovable secrets.");
    }

    const { data: lead, error: lErr } = await sb(context)
      .from("leads")
      .select("id, user_id, whatsapp, phone")
      .eq("id", data.leadId)
      .single();
    if (lErr) throw new Error(lErr.message);
    const toDigits = digits(lead.whatsapp ?? lead.phone);
    if (!toDigits) throw new Error("This lead has no WhatsApp / phone number.");

    const from = `whatsapp:+${digits(fromRaw)}`;
    const to = `whatsapp:+${toDigits}`;
    const statusCallback = process.env.TWILIO_WHATSAPP_STATUS_CALLBACK;
    const auth = btoa(`${sid}:${authToken}`);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        From: from,
        To: to,
        Body: data.body,
        ...(statusCallback ? { StatusCallback: statusCallback } : {}),
      }),
    });
    const payload = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
    if (!res.ok) throw new Error(payload.message ? `Twilio: ${payload.message}` : `Twilio error ${res.status}`);

    await sb(context).from("whatsapp_messages").insert({
      lead_id: data.leadId,
      direction: "out",
      from_number: from,
      to_number: to,
      body: data.body,
      message_sid: payload.sid ?? null,
      status: "sent",
      created_by: context.userId,
    });
    await sb(context).from("lead_activities").insert({
      lead_id: data.leadId,
      user_id: context.userId,
      kind: "whatsapp",
      body: `WhatsApp out: ${data.body.slice(0, 500)}`,
    });

    return { ok: true, sid: payload.sid ?? null };
  });
