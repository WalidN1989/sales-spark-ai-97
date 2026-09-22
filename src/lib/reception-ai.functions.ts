import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const planSchema = z.object({
  intent: z.enum(["product", "service", "general"]),
  urgency: z.enum(["low", "normal", "high", "urgent"]),
  summary: z.string().min(1).max(1200),
  customer_need: z.string().min(1).max(1200),
  suggested_response: z.string().min(1).max(2500),
  products: z.array(z.object({
    query: z.string().min(1).max(300),
    quantity: z.number().int().positive().max(1_000_000).nullable(),
  })).max(20),
  missing_information: z.array(z.string().max(300)).max(20),
  actions: z.array(z.enum([
    "upsert_lead",
    "lookup_product",
    "prepare_quotation",
    "prepare_whatsapp",
    "prepare_email",
    "assign_sales",
  ])).max(12),
});

export type ReceptionAiPlan = z.infer<typeof planSchema> & {
  product_matches: Array<{
    query: string;
    quantity: number | null;
    matches: Array<{
      id: string;
      name: string;
      part_number: string | null;
      currency: string;
      selling_price_cents: number | null;
      stock_status: string | null;
    }>;
  }>;
};

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "urgency", "summary", "customer_need", "suggested_response", "products", "missing_information", "actions"],
  properties: {
    intent: { type: "string", enum: ["product", "service", "general"] },
    urgency: { type: "string", enum: ["low", "normal", "high", "urgent"] },
    summary: { type: "string" },
    customer_need: { type: "string" },
    suggested_response: { type: "string" },
    products: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["query", "quantity"],
        properties: { query: { type: "string" }, quantity: { type: ["integer", "null"] } },
      },
    },
    missing_information: { type: "array", items: { type: "string" } },
    actions: {
      type: "array",
      items: { type: "string", enum: ["upsert_lead", "lookup_product", "prepare_quotation", "prepare_whatsapp", "prepare_email", "assign_sales"] },
    },
  },
} as const;

function stripJsonFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

async function callAnthropic(prompt: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.RECEPTION_ANTHROPIC_MODEL || "claude-sonnet-4-5",
      max_tokens: 1800,
      system: "You are a sales-reception analyst. Return only valid JSON matching the requested schema. Never invent prices, stock, contact details, or product specifications.",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic request failed (${response.status}).`);
  const body = await response.json() as { content?: Array<{ type: string; text?: string }> };
  const text = body.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("Anthropic returned no analysis.");
  return text;
}

async function callOpenAi(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.RECEPTION_OPENAI_MODEL || "gpt-5-mini",
      input: [
        { role: "system", content: "You are a sales-reception analyst. Never invent prices, stock, contact details, or product specifications." },
        { role: "user", content: prompt },
      ],
      text: { format: { type: "json_schema", name: "reception_plan", strict: true, schema: jsonSchema } },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}).`);
  const body = await response.json() as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  const text = body.output_text || body.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
  if (!text) throw new Error("OpenAI returned no analysis.");
  return text;
}

function chooseProvider() {
  const requested = process.env.RECEPTION_AI_PROVIDER?.toLowerCase();
  if (requested === "anthropic" || requested === "openai") return requested;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  throw new Error("Connect an Anthropic or OpenAI API key to enable Reception AI.");
}

export const analyzeReceptionConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ conversationId: z.string().uuid() }).parse(value))
  .handler(async ({ context, data }) => {
    // Supabase types are regenerated after Lovable applies the migration.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const database = context.supabase as any;
    const [{ data: conversation, error: conversationError }, { data: messages, error: messagesError }] = await Promise.all([
      database.from("reception_conversations").select("*").eq("id", data.conversationId).single(),
      database.from("reception_messages").select("channel,direction,sender_role,content,subject,created_at").eq("conversation_id", data.conversationId).order("created_at"),
    ]);
    if (conversationError) throw new Error(conversationError.message);
    if (messagesError) throw new Error(messagesError.message);

    const provider = chooseProvider();
    await database.from("reception_conversations").update({ ai_status: "processing", ai_provider: provider }).eq("id", data.conversationId);
    const prompt = [
      "Analyze this customer reception conversation and produce the JSON sales plan.",
      "Use prepare_quotation only when a product and quantity are sufficiently clear. Prices will be looked up by CRM code after your analysis.",
      `Required JSON schema: ${JSON.stringify(jsonSchema)}`,
      `Known reception fields: ${JSON.stringify({
        contact_name: conversation.contact_name,
        company_name: conversation.company_name,
        phone: conversation.phone,
        email: conversation.email,
        product_interest: conversation.product_interest,
        service_interest: conversation.service_interest,
        summary: conversation.summary,
      })}`,
      `Conversation: ${JSON.stringify(messages ?? [])}`,
    ].join("\n\n");

    try {
      const raw = provider === "anthropic" ? await callAnthropic(prompt) : await callOpenAi(prompt);
      const basePlan = planSchema.parse(JSON.parse(stripJsonFence(raw)));
      const productMatches: ReceptionAiPlan["product_matches"] = [];
      for (const product of basePlan.products) {
        const safeQuery = product.query.replace(/[%_,]/g, " ").trim();
        if (!safeQuery) continue;
        const { data: matches } = await database
          .from("products")
          .select("id,name,part_number,currency,selling_price_cents,stock_status")
          .or(`name.ilike.%${safeQuery}%,part_number.ilike.%${safeQuery}%,brand.ilike.%${safeQuery}%`)
          .limit(5);
        productMatches.push({ query: product.query, quantity: product.quantity, matches: matches ?? [] });
      }
      const plan: ReceptionAiPlan = { ...basePlan, product_matches: productMatches };
      const { error: updateError } = await database.from("reception_conversations").update({
        ai_status: "ready",
        ai_provider: provider,
        ai_plan: plan,
        ai_analyzed_at: new Date().toISOString(),
      }).eq("id", data.conversationId);
      if (updateError) throw new Error(updateError.message);
      return { ok: true, provider, plan };
    } catch (error) {
      await database.from("reception_conversations").update({ ai_status: "failed" }).eq("id", data.conversationId);
      throw error;
    }
  });
