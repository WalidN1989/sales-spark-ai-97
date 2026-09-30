import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WhatsAppAgentSettings = {
  enabled: boolean;
  approvedNumbers: string[];
  agentName: string;
  personality: string;
  responseRules: string;
  knowledge: string;
};

// Generated database types update after the migration is applied.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (context: { supabase: unknown }) => context.supabase as any;

async function requireManager(context: { supabase: unknown; userId: string }) {
  const { data, error } = await db(context).rpc("is_org_manager", { _uid: context.userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Only an administrator or manager can configure the WhatsApp agent.");
}

async function orgId(context: { supabase: unknown; userId: string }) {
  const { data, error } = await db(context).rpc("current_org_id");
  if (error || !data) throw new Error(error?.message || "No active organization was found.");
  return data as string;
}

const defaults: WhatsAppAgentSettings = {
  enabled: true,
  approvedNumbers: ["+971501335775"],
  agentName: "eTOP Office Assistant",
  personality: "Professional, calm, concise and commercially aware.",
  responseRules: "Answer only from CRM facts. Be direct. State clearly when information is unavailable. Include dates, assignees, status and priority when relevant.",
  knowledge: "You assist eTOP management with prospects, leads, meetings, quotations, priorities, assignments and follow-ups.",
};

export const getWhatsAppAgentSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WhatsAppAgentSettings> => {
    await requireManager(context);
    const organization = await orgId(context);
    const { data, error } = await db(context).from("whatsapp_agent_settings").select("enabled, approved_numbers, agent_name, personality, response_rules, knowledge").eq("org_id", organization).maybeSingle();
    if (error) throw new Error(/whatsapp_agent_settings/i.test(error.message) ? "Apply the WhatsApp agent configuration migration first." : error.message);
    if (!data) return defaults;
    return { enabled: data.enabled, approvedNumbers: (data.approved_numbers ?? []).map((n: string) => `+${n.replace(/\D/g, "")}`), agentName: data.agent_name, personality: data.personality, responseRules: data.response_rules, knowledge: data.knowledge };
  });

const settingsSchema = z.object({
  enabled: z.boolean(),
  approvedNumbers: z.array(z.string()).min(1).max(20),
  agentName: z.string().trim().min(2).max(80),
  personality: z.string().trim().min(5).max(2000),
  responseRules: z.string().trim().min(5).max(5000),
  knowledge: z.string().trim().min(5).max(10000),
});

export const saveWhatsAppAgentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => settingsSchema.parse(value))
  .handler(async ({ context, data }) => {
    await requireManager(context);
    const organization = await orgId(context);
    const numbers = [...new Set(data.approvedNumbers.map((n) => n.replace(/\D/g, "")).filter((n) => n.length >= 8))];
    if (!numbers.length) throw new Error("Add at least one valid approved WhatsApp number.");
    const { error } = await db(context).from("whatsapp_agent_settings").upsert({ org_id: organization, enabled: data.enabled, approved_numbers: numbers, agent_name: data.agentName, personality: data.personality, response_rules: data.responseRules, knowledge: data.knowledge, updated_by: context.userId, updated_at: new Date().toISOString() }, { onConflict: "org_id" });
    if (error) throw new Error(error.message);
    return { ...data, approvedNumbers: numbers.map((n) => `+${n}`) };
  });
