import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { notify } from "@/lib/notifications.server";
import type { ReceptionAiPlan } from "@/lib/reception-ai.functions";

export type ReceptionChannel = "voice" | "whatsapp" | "email" | "manual";
export type ReceptionStatus = "new" | "active" | "qualified" | "handed_off" | "closed";
export type ReceptionPriority = "low" | "normal" | "high" | "urgent";
export type InquiryType = "product" | "service" | "general";

export type ReceptionConversation = {
  id: string;
  owner_id: string;
  assigned_to: string | null;
  lead_id: string | null;
  company_id: string | null;
  channel: ReceptionChannel;
  direction: "inbound" | "outbound";
  status: ReceptionStatus;
  priority: ReceptionPriority;
  inquiry_type: InquiryType;
  contact_name: string | null;
  company_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  follow_up_number: string | null;
  follow_up_number_confirmed: boolean;
  product_interest: string | null;
  service_interest: string | null;
  summary: string | null;
  location: string | null;
  recording_url: string | null;
  recording_duration_seconds: number;
  ai_status: "not_run" | "processing" | "ready" | "failed";
  ai_provider: "anthropic" | "openai" | "elevenlabs" | null;
  ai_plan: ReceptionAiPlan | null;
  ai_analyzed_at: string | null;
  started_at: string;
  last_message_at: string;
  handed_off_at: string | null;
  closed_at: string | null;
  created_at: string;
};

export type ReceptionMessage = {
  id: string;
  conversation_id: string;
  channel: "voice" | "whatsapp" | "email" | "internal" | "system";
  direction: "in" | "out" | "internal";
  sender_role: "customer" | "agent" | "staff" | "system";
  content: string;
  subject: string | null;
  delivery_status: "draft" | "queued" | "sent" | "delivered" | "failed" | "recorded";
  created_by: string | null;
  created_at: string;
};

const conversationSelect =
  "id, owner_id, assigned_to, lead_id, company_id, channel, direction, status, priority, inquiry_type, contact_name, company_name, phone, whatsapp, email, follow_up_number, follow_up_number_confirmed, product_interest, service_interest, summary, location, recording_url, recording_duration_seconds, ai_status, ai_provider, ai_plan, ai_analyzed_at, started_at, last_message_at, handed_off_at, closed_at, created_at";

// Reception tables are intentionally accessed through an untyped handle until
// Lovable applies the migration and regenerates Supabase types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (context: { supabase: unknown }) => context.supabase as any;

const missingReceptionTable = (message: string) =>
  /reception_conversations|reception_messages|does not exist|relation/i.test(message);

export const listReceptionConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReceptionConversation[]> => {
    const { data, error } = await db(context)
      .from("reception_conversations")
      .select(conversationSelect)
      .or("external_provider.is.null,external_provider.neq.sinhala_lab")
      .order("last_message_at", { ascending: false })
      .limit(500);
    if (error) {
      if (missingReceptionTable(error.message)) return [];
      throw new Error(error.message);
    }
    return (data ?? []) as ReceptionConversation[];
  });

export const listReceptionMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ conversationId: z.string().uuid() }).parse(value))
  .handler(async ({ context, data }): Promise<ReceptionMessage[]> => {
    const { data: rows, error } = await db(context)
      .from("reception_messages")
      .select("id, conversation_id, channel, direction, sender_role, content, subject, delivery_status, created_by, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });
    if (error) {
      if (missingReceptionTable(error.message)) return [];
      throw new Error(error.message);
    }
    return (rows ?? []) as ReceptionMessage[];
  });

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const createSchema = z.object({
  channel: z.enum(["voice", "whatsapp", "email", "manual"]).default("voice"),
  direction: z.enum(["inbound", "outbound"]).default("inbound"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  inquiry_type: z.enum(["product", "service", "general"]).default("general"),
  contact_name: optionalText(200),
  company_name: optionalText(200),
  phone: optionalText(60),
  whatsapp: optionalText(60),
  email: z.string().trim().email().max(200).nullable().optional().or(z.literal("")),
  follow_up_number: optionalText(60),
  follow_up_number_confirmed: z.boolean().default(false),
  product_interest: optionalText(500),
  service_interest: optionalText(500),
  summary: optionalText(4000),
  location: optionalText(300),
  recording_url: optionalText(2000),
  recording_duration_seconds: z.number().int().min(0).max(86400).default(0),
  initial_message: optionalText(8000),
});

export const createReceptionConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => createSchema.parse(value))
  .handler(async ({ context, data }) => {
    const row = {
      owner_id: context.userId,
      channel: data.channel,
      direction: data.direction,
      priority: data.priority,
      inquiry_type: data.inquiry_type,
      contact_name: data.contact_name || null,
      company_name: data.company_name || null,
      phone: data.phone || null,
      whatsapp: data.whatsapp || null,
      email: data.email || null,
      follow_up_number: data.follow_up_number || data.whatsapp || data.phone || null,
      follow_up_number_confirmed: data.follow_up_number_confirmed,
      product_interest: data.product_interest || null,
      service_interest: data.service_interest || null,
      summary: data.summary || null,
      location: data.location || null,
      recording_url: data.recording_url || null,
      recording_duration_seconds: data.recording_duration_seconds,
      status: "new",
    };
    const { data: created, error } = await db(context)
      .from("reception_conversations")
      .insert(row)
      .select("id")
      .single();
    if (error) {
      if (missingReceptionTable(error.message)) {
        throw new Error("Reception is ready in code, but its database migration has not been applied yet.");
      }
      throw new Error(error.message);
    }
    const interest = data.product_interest || data.service_interest || "General inquiry";
    const normalizedPhone = (data.follow_up_number || data.whatsapp || data.phone || "").replace(/\D/g, "");
    let leadId: string | null = null;

    // Reception must feed the sales pipeline. Reuse a matching lead when the
    // caller is already known; otherwise create a converted warm lead and put
    // the call summary into its Activity Journal.
    let existingLeadQuery = db(context).from("leads").select("id").limit(1);
    if (normalizedPhone) {
      existingLeadQuery = existingLeadQuery.or(`whatsapp.ilike.%${normalizedPhone.slice(-9)}%,phone.ilike.%${normalizedPhone.slice(-9)}%`);
    } else if (data.email) {
      existingLeadQuery = existingLeadQuery.ilike("contact_email", data.email);
    } else {
      existingLeadQuery = existingLeadQuery.eq("id", "00000000-0000-0000-0000-000000000000");
    }
    const { data: existingLeads } = await existingLeadQuery;
    leadId = existingLeads?.[0]?.id ?? null;

    if (!leadId) {
      const { data: lead, error: leadError } = await db(context)
        .from("leads")
        .insert({
          user_id: context.userId,
          assigned_to: context.userId,
          company_id: null,
          contact_person: data.contact_name || null,
          contact_email: data.email || null,
          whatsapp: data.follow_up_number || data.whatsapp || data.phone || null,
          phone: data.phone || data.follow_up_number || null,
          company_name: data.company_name || data.contact_name || "Reception inquiry",
          products_services: [interest.slice(0, 80)],
          notes: data.summary || null,
          status: "warm",
          source: "reception",
          priority: data.priority === "urgent" ? "critical" : data.priority === "normal" ? "medium" : data.priority,
          pipeline_stage: "prospect",
          is_converted: true,
        })
        .select("id")
        .single();
      if (leadError) throw new Error(`Reception saved, but lead creation failed: ${leadError.message}`);
      leadId = lead.id as string;
    }

    await db(context).from("reception_conversations").update({ lead_id: leadId }).eq("id", created.id);
    await db(context).from("lead_activities").insert({
      lead_id: leadId,
      user_id: context.userId,
      kind: data.channel === "voice" ? "call" : data.channel === "manual" ? "note" : data.channel,
      body: [
        `Reception ${data.channel} inquiry: ${interest}`,
        data.summary,
        data.follow_up_number_confirmed ? `Follow-up number confirmed: ${data.follow_up_number || data.phone || "captured"}` : null,
      ].filter(Boolean).join("\n\n"),
    });

    const initial = data.initial_message || data.summary;
    if (initial) {
      await db(context).from("reception_messages").insert({
        conversation_id: created.id,
        channel: data.channel === "manual" ? "internal" : data.channel,
        direction: data.direction === "inbound" ? "in" : "out",
        sender_role: data.direction === "inbound" ? "customer" : "staff",
        content: initial,
        created_by: context.userId,
        delivery_status: "recorded",
      });
    }
    return { ok: true, id: created.id as string, leadId };
  });

const patchSchema = z
  .object({
    status: z.enum(["new", "active", "qualified", "handed_off", "closed"]).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    inquiry_type: z.enum(["product", "service", "general"]).optional(),
    contact_name: optionalText(200),
    company_name: optionalText(200),
    phone: optionalText(60),
    whatsapp: optionalText(60),
    email: z.string().trim().email().max(200).nullable().optional().or(z.literal("")),
    follow_up_number: optionalText(60),
    follow_up_number_confirmed: z.boolean().optional(),
    product_interest: optionalText(500),
    service_interest: optionalText(500),
    summary: optionalText(4000),
    location: optionalText(300),
    assigned_to: z.string().uuid().nullable().optional(),
    lead_id: z.string().uuid().nullable().optional(),
    company_id: z.string().uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");

export type ReceptionPatch = z.infer<typeof patchSchema>;

export const updateReceptionConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z.object({ id: z.string().uuid(), patch: patchSchema }).parse(value),
  )
  .handler(async ({ context, data }) => {
    const patch: Record<string, unknown> = { ...data.patch };
    if (data.patch.email === "") patch.email = null;
    if (data.patch.status === "closed") patch.closed_at = new Date().toISOString();
    if (data.patch.status && data.patch.status !== "closed") patch.closed_at = null;
    if (data.patch.status === "handed_off") patch.handed_off_at = new Date().toISOString();
    const { error } = await db(context).from("reception_conversations").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);

    if (data.patch.assigned_to) {
      await db(context).from("reception_messages").insert({
        conversation_id: data.id,
        channel: "system",
        direction: "internal",
        sender_role: "system",
        content: "Conversation assigned to a sales team member.",
        created_by: context.userId,
      });
      await notify([
        {
          user_id: data.patch.assigned_to,
          actor_id: context.userId,
          type: "reception_handoff",
          title: "New reception handoff",
          body: "A customer inquiry has been assigned to you.",
          lead_id: data.patch.lead_id ?? null,
        },
      ]);
    }
    return { ok: true };
  });

const messageSchema = z.object({
  conversation_id: z.string().uuid(),
  channel: z.enum(["voice", "whatsapp", "email", "internal", "system"]),
  direction: z.enum(["in", "out", "internal"]),
  sender_role: z.enum(["customer", "agent", "staff", "system"]),
  content: z.string().trim().min(1).max(12000),
  subject: optionalText(300),
  delivery_status: z.enum(["draft", "queued", "sent", "delivered", "failed", "recorded"]).default("recorded"),
});

export const addReceptionMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => messageSchema.parse(value))
  .handler(async ({ context, data }) => {
    const { data: created, error } = await db(context)
      .from("reception_messages")
      .insert({ ...data, subject: data.subject || null, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: created.id as string };
  });

export const getReceptionIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AGENT_ID),
    twilioVoice: Boolean(
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER,
    ),
    whatsapp: Boolean(
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM,
    ),
    email: Boolean(
      (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) || process.env.SMTP_URL,
    ),
    ai: Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY),
    aiProvider: process.env.RECEPTION_AI_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : process.env.OPENAI_API_KEY ? "openai" : null),
  }));
