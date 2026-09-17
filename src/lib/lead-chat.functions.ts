import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { notify } from "@/lib/notifications.server";

export type LeadMessage = {
  id: string;
  lead_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender_name: string;
};

// Resolve display names for a set of user ids (service role — profiles aren't
// broadly readable by reps). Falls back to email, then "Member".
async function namesFor(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin as any)
    .from("profiles")
    .select("id, full_name, email")
    .in("id", unique);
  const map = new Map<string, string>();
  for (const p of (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
    map.set(p.id, p.full_name || p.email || "Member");
  }
  return map;
}

export const listLeadMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<LeadMessage[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (context.supabase as any)
      .from("lead_messages")
      .select("id, lead_id, sender_id, body, created_at")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) {
      if (/lead_messages|does not exist|relation/i.test(error.message)) return [];
      throw new Error(error.message);
    }
    const list = (rows ?? []) as Array<Omit<LeadMessage, "sender_name">>;
    const names = await namesFor(list.map((m) => m.sender_id));
    return list.map((m) => ({ ...m, sender_name: names.get(m.sender_id) ?? "Member" }));
  });

export const sendLeadMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ leadId: z.string().uuid(), body: z.string().trim().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ context, data }): Promise<LeadMessage> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (context.supabase as any)
      .from("lead_messages")
      .insert({ lead_id: data.leadId, sender_id: context.userId, body: data.body })
      .select("id, lead_id, sender_id, body, created_at")
      .single();
    if (error) throw new Error(error.message);

    // Notify the other people on this lead (assignee + owner), minus the sender.
    const { data: lead } = await context.supabase
      .from("leads")
      .select("assigned_to, user_id, company_name, companies!leads_company_id_fkey(name)")
      .eq("id", data.leadId)
      .single();
    const l = (lead ?? {}) as {
      assigned_to?: string | null;
      user_id?: string | null;
      company_name?: string | null;
      companies?: { name?: string | null } | null;
    };
    const leadName = l.company_name || l.companies?.name || "a lead";
    const names = await namesFor([context.userId]);
    const senderName = names.get(context.userId) ?? "A teammate";
    const recipients = [...new Set([l.assigned_to, l.user_id].filter(Boolean) as string[])];
    await notify(
      recipients.map((uid) => ({
        user_id: uid,
        actor_id: context.userId,
        type: "chat",
        title: `${senderName} · ${leadName}`,
        body: data.body.slice(0, 140),
        lead_id: data.leadId,
      })),
    );

    return { ...(row as Omit<LeadMessage, "sender_name">), sender_name: senderName };
  });
