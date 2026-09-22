import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

const text = (value: unknown): string | null => {
  if (typeof value === "string" || typeof value === "number") {
    const cleaned = String(value).trim();
    return cleaned || null;
  }
  if (value && typeof value === "object" && "value" in value) {
    return text((value as Json).value);
  }
  return null;
};

const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

function collectValues(value: unknown, out = new Map<string, unknown[]>()): Map<string, unknown[]> {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    for (const item of value) collectValues(item, out);
    return out;
  }
  for (const [key, child] of Object.entries(value as Json)) {
    const normalized = normalizeKey(key);
    const values = out.get(normalized) ?? [];
    values.push(child);
    out.set(normalized, values);
    collectValues(child, out);
  }
  return out;
}

function pick(map: Map<string, unknown[]>, ...keys: string[]): string | null {
  for (const key of keys) {
    for (const value of map.get(normalizeKey(key)) ?? []) {
      const found = text(value);
      if (found) return found;
    }
  }
  return null;
}

const cleanPhone = (value: string | null): string | null => {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9+()\-\s]/g, "").trim();
  return cleaned.replace(/\D/g, "").length >= 7 ? cleaned : null;
};

const phoneNeedle = (value: string | null) => (value ?? "").replace(/\D/g, "").slice(-9);

const isoFromUnix = (value: unknown): string | null => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n > 10_000_000_000 ? n : n * 1000).toISOString();
};

function transcriptText(transcript: unknown): string {
  if (!Array.isArray(transcript)) return "";
  return transcript
    .map((turn) => {
      const row = (turn ?? {}) as Json;
      const message = text(row.message) ?? text(row.text);
      if (!message) return null;
      return `${row.role === "agent" ? "Maya" : "Caller"}: ${message}`;
    })
    .filter(Boolean)
    .join("\n");
}

function deriveCall(payload: Json) {
  const data = (payload.data ?? payload) as Json;
  const metadata = (data.metadata ?? {}) as Json;
  const analysis = (data.analysis ?? {}) as Json;
  const initiation = (data.conversation_initiation_client_data ?? {}) as Json;
  const collected = collectValues({ metadata, analysis, initiation });
  const transcript = Array.isArray(data.transcript) ? data.transcript : [];

  const externalConversationId = text(data.conversation_id) ?? text(payload.conversation_id);
  const contactName = pick(collected, "contact_name", "caller_name", "customer_name", "name");
  const companyName = pick(collected, "company_name", "business_name", "organization", "company");
  const email = pick(collected, "email", "email_address");
  const externalNumber = cleanPhone(
    pick(collected, "external_number", "caller_number", "phone_number", "phone"),
  );
  const whatsapp = cleanPhone(
    pick(collected, "whatsapp", "whatsapp_number", "follow_up_number", "callback_number"),
  );
  const productInterest = pick(
    collected,
    "product_interest",
    "product",
    "products",
    "product_name",
  );
  const serviceInterest = pick(collected, "service_interest", "service", "services");
  const location = pick(collected, "location", "city", "country");
  const language = pick(collected, "main_language", "detected_language", "language");
  const transcriptSummary = transcriptText(transcript).slice(0, 4000);
  const summary =
    text(analysis.transcript_summary) ?? text(analysis.summary) ?? (transcriptSummary || null);
  const startedAt =
    isoFromUnix(metadata.start_time_unix_secs) ?? isoFromUnix(data.start_time_unix_secs);
  const duration = Math.max(
    0,
    Math.round(Number(metadata.call_duration_secs ?? data.call_duration_secs ?? 0) || 0),
  );
  const endedAt = startedAt
    ? new Date(new Date(startedAt).getTime() + duration * 1000).toISOString()
    : null;
  const directionText = (pick(collected, "direction", "call_direction") ?? "inbound").toLowerCase();

  return {
    data,
    metadata,
    analysis,
    transcript,
    externalConversationId,
    agentId: text(data.agent_id) ?? text(payload.agent_id),
    contactName,
    companyName,
    email,
    phone: externalNumber ?? whatsapp,
    whatsapp: whatsapp ?? externalNumber,
    productInterest,
    serviceInterest,
    location,
    language,
    summary,
    startedAt,
    endedAt,
    duration,
    direction: directionText.includes("out") ? "outbound" : "inbound",
    successful: typeof analysis.call_successful === "boolean" ? analysis.call_successful : null,
  };
}

async function resolveOwner(supabase: SupabaseClient) {
  const ownerId =
    Deno.env.get("RECEPTION_OWNER_USER_ID") ?? Deno.env.get("PROSPECT_WEBHOOK_USER_ID");
  if (!ownerId) throw new Error("RECEPTION_OWNER_USER_ID or PROSPECT_WEBHOOK_USER_ID is required");
  const { data, error } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", ownerId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.org_id) throw new Error("Reception owner has no active organization membership");
  return { ownerId, orgId: data.org_id as string };
}

async function findLead(
  supabase: SupabaseClient,
  ownerId: string,
  phone: string | null,
  email: string | null,
) {
  const needle = phoneNeedle(phone);
  let query = supabase.from("leads").select("id").eq("user_id", ownerId).limit(1);
  if (needle) query = query.or(`whatsapp.ilike.%${needle}%,phone.ilike.%${needle}%`);
  else if (email) query = query.ilike("contact_email", email);
  else return null;
  const { data, error } = await query;
  if (error) throw error;
  return (data?.[0]?.id as string | undefined) ?? null;
}

async function ensureLead(
  supabase: SupabaseClient,
  ownerId: string,
  call: ReturnType<typeof deriveCall>,
  currentLeadId: string | null,
) {
  if (currentLeadId) return currentLeadId;
  const existing = await findLead(supabase, ownerId, call.phone, call.email);
  if (existing) return existing;
  const interest = call.productInterest ?? call.serviceInterest ?? "Voice inquiry";
  const fallbackName =
    call.contactName ?? `Reception caller ${call.externalConversationId?.slice(-6) ?? "unknown"}`;
  const { data, error } = await supabase
    .from("leads")
    .insert({
      user_id: ownerId,
      assigned_to: ownerId,
      company_id: null,
      company_name: call.companyName ?? fallbackName,
      contact_person: call.contactName,
      contact_email: call.email,
      whatsapp: call.whatsapp,
      phone: call.phone,
      products_services: [interest.slice(0, 80)],
      notes: call.summary,
      status: "warm",
      source: "reception",
      priority: "medium",
      pipeline_stage: "prospect",
      is_converted: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export function elevenLabsClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase service configuration is missing");
  return createClient(url, serviceKey);
}

export async function ingestElevenLabsConversation(supabase: SupabaseClient, payload: Json) {
  const call = deriveCall(payload);
  if (!call.externalConversationId) throw new Error("ElevenLabs conversation_id is missing");
  const expectedAgent = Deno.env.get("ELEVENLABS_AGENT_ID");
  if (expectedAgent && call.agentId && call.agentId !== expectedAgent) {
    return {
      ignored: true,
      reason: "agent_id does not match",
      conversationId: call.externalConversationId,
    };
  }

  const { ownerId, orgId } = await resolveOwner(supabase);
  const { data: existing, error: existingError } = await supabase
    .from("reception_conversations")
    .select(
      "id, lead_id, contact_name, company_name, phone, whatsapp, email, product_interest, service_interest, summary",
    )
    .eq("external_provider", "elevenlabs")
    .eq("external_conversation_id", call.externalConversationId)
    .maybeSingle();
  if (existingError) throw existingError;

  const row = {
    org_id: orgId,
    owner_id: ownerId,
    channel: "voice",
    direction: call.direction,
    status: "new",
    priority: "normal",
    inquiry_type: call.productInterest ? "product" : call.serviceInterest ? "service" : "general",
    contact_name: call.contactName ?? existing?.contact_name ?? null,
    company_name: call.companyName ?? existing?.company_name ?? null,
    phone: call.phone ?? existing?.phone ?? null,
    whatsapp: call.whatsapp ?? existing?.whatsapp ?? null,
    follow_up_number: call.whatsapp ?? call.phone ?? existing?.whatsapp ?? existing?.phone ?? null,
    email: call.email ?? existing?.email ?? null,
    product_interest: call.productInterest ?? existing?.product_interest ?? null,
    service_interest: call.serviceInterest ?? existing?.service_interest ?? null,
    summary: call.summary ?? existing?.summary ?? null,
    location: call.location,
    recording_duration_seconds: call.duration,
    ai_status: "ready",
    ai_provider: "elevenlabs",
    ai_plan: {
      intent: call.productInterest ? "product" : call.serviceInterest ? "service" : "general",
      urgency: "normal",
      summary: call.summary ?? "Voice conversation captured by Reception.",
      customer_need: call.productInterest ?? call.serviceInterest ?? "General inquiry",
      suggested_response: "Review the call and contact the customer using the captured follow-up details.",
      products: call.productInterest ? [{ query: call.productInterest, quantity: null }] : [],
      missing_information: [],
      actions: ["upsert_lead", ...(call.productInterest ? ["lookup_product"] : []), "assign_sales"],
      product_matches: [],
    },
    ai_analyzed_at: new Date().toISOString(),
    external_provider: "elevenlabs",
    external_conversation_id: call.externalConversationId,
    provider_metadata: { agent_id: call.agentId, metadata: call.metadata, analysis: call.analysis },
    call_successful: call.successful,
    language: call.language,
    started_at: call.startedAt ?? new Date().toISOString(),
    ended_at: call.endedAt,
    last_message_at: call.endedAt ?? call.startedAt ?? new Date().toISOString(),
  };

  let receptionId: string;
  if (existing?.id) {
    const { error } = await supabase
      .from("reception_conversations")
      .update(row)
      .eq("id", existing.id);
    if (error) throw error;
    receptionId = existing.id as string;
  } else {
    const { data, error } = await supabase
      .from("reception_conversations")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    receptionId = data.id as string;
  }

  const leadId = await ensureLead(
    supabase,
    ownerId,
    call,
    (existing?.lead_id as string | null | undefined) ?? null,
  );
  const { error: linkError } = await supabase
    .from("reception_conversations")
    .update({ lead_id: leadId })
    .eq("id", receptionId);
  if (linkError) throw linkError;

  if (Array.isArray(call.transcript) && call.transcript.length) {
    const base = new Date(call.startedAt ?? new Date().toISOString()).getTime();
    const messages = call.transcript.flatMap((turn, index) => {
      const item = (turn ?? {}) as Json;
      const content = text(item.message) ?? text(item.text);
      if (!content) return [];
      const isAgent = item.role === "agent";
      const offsetSeconds = Math.max(
        0,
        Number(item.time_in_call_secs ?? item.time_in_call_seconds ?? index) || index,
      );
      return [
        {
          conversation_id: receptionId,
          channel: "voice",
          direction: isAgent ? "out" : "in",
          sender_role: isAgent ? "agent" : "customer",
          content,
          delivery_status: "recorded",
          external_message_id: `${call.externalConversationId}:${index}`,
          metadata: item,
          created_at: new Date(base + offsetSeconds * 1000).toISOString(),
        },
      ];
    });
    if (messages.length) {
      const { error } = await supabase.from("reception_messages").upsert(messages, {
        onConflict: "conversation_id,external_message_id",
      });
      if (error) throw error;
    }
  }

  const marker = `[ElevenLabs:${call.externalConversationId}]`;
  const { data: activity } = await supabase
    .from("lead_activities")
    .select("id")
    .eq("lead_id", leadId)
    .ilike("body", `%${marker}%`)
    .limit(1)
    .maybeSingle();
  if (!activity) {
    const body = [
      "Reception call recorded",
      call.summary,
      call.language ? `Language: ${call.language}` : null,
      call.duration ? `Duration: ${Math.floor(call.duration / 60)}m ${call.duration % 60}s` : null,
      marker,
    ]
      .filter(Boolean)
      .join("\n\n");
    const { error } = await supabase.from("lead_activities").insert({
      lead_id: leadId,
      user_id: ownerId,
      kind: "call",
      body,
    });
    if (error) throw error;
  }

  return { ignored: false, receptionId, leadId, conversationId: call.externalConversationId };
}
