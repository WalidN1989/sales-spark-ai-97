import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const turnSchema = z.object({
  role: z.enum(["caller", "receptionist"]),
  text: z.string().min(1).max(2500),
});

const responseSchema = z.object({
  sinhala: z.string().min(1).max(1200),
  english: z.string().min(1).max(1200),
  intent: z.string().min(1).max(120),
});

export type SinhalaLabReply = z.infer<typeof responseSchema>;

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}

async function callAnthropic(prompt: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.RECEPTION_ANTHROPIC_MODEL || "claude-sonnet-4-5",
      max_tokens: 700,
      system:
        "You are Maya, eTOP's warm professional receptionist. Return only valid JSON. Speak natural Sri Lankan Sinhala. Never claim to be an AI. Never invent prices, stock, delivery dates, product specifications, or contact details.",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic request failed (${response.status}).`);
  const body = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = body.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("Anthropic returned no response.");
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
        {
          role: "system",
          content:
            "You are Maya, eTOP's warm professional receptionist. Speak natural Sri Lankan Sinhala. Never claim to be an AI. Never invent prices, stock, delivery dates, product specifications, or contact details.",
        },
        { role: "user", content: prompt },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "sinhala_reception_reply",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["sinhala", "english", "intent"],
            properties: {
              sinhala: { type: "string" },
              english: { type: "string" },
              intent: { type: "string" },
            },
          },
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}).`);
  const body = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  const text =
    body.output_text ||
    body.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")
      ?.text;
  if (!text) throw new Error("OpenAI returned no response.");
  return text;
}

function chooseProvider() {
  const requested = process.env.RECEPTION_AI_PROVIDER?.toLowerCase();
  if (requested === "anthropic" || requested === "openai") return requested;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  throw new Error("Connect Anthropic or OpenAI to test the Sinhala receptionist.");
}

export const replyInSinhala = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z
      .object({
        message: z.string().min(1).max(2500),
        turns: z.array(turnSchema).max(12).default([]),
      })
      .parse(value),
  )
  .handler(async ({ data }) => {
    const provider = chooseProvider();
    const prompt = [
      "Continue this reception call in Sinhala.",
      "The caller may understand Sinhala only. Use simple, respectful, conversational Sri Lankan Sinhala with short sentences.",
      "Your goals are to understand the inquiry, collect the caller's name, company and preferred callback number, and promise a sales follow-up.",
      "eTOP supplies ID card printers, biometric devices, access control, time attendance, signature pads, software and accessories in the UAE.",
      "If a price or technical fact is not supplied, say the sales team will confirm it. Ask only one useful question at a time.",
      "Return JSON with exactly: sinhala (the reply in Sinhala script), english (an accurate internal translation), intent (a short English label).",
      `Conversation so far: ${JSON.stringify(data.turns)}`,
      `Latest caller message: ${data.message}`,
    ].join("\n\n");

    const raw = provider === "anthropic" ? await callAnthropic(prompt) : await callOpenAi(prompt);
    return { provider, reply: responseSchema.parse(JSON.parse(stripJsonFence(raw))) };
  });
