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

const scoresSchema = z.object({
  recognition: z.number().int().min(0).max(5),
  understanding: z.number().int().min(0).max(5),
  pronunciation: z.number().int().min(0).max(5),
  naturalness: z.number().int().min(0).max(5),
});

export type SinhalaLabScores = z.infer<typeof scoresSchema>;
export type StoredSinhalaLabTurn = {
  role: "caller" | "receptionist";
  text: string;
  english?: string;
  latency?: number;
  intent?: string;
};

// Reception types are regenerated separately after schema changes. These
// functions intentionally use the already-deployed Reception tables directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (context: { supabase: unknown }) => context.supabase as any;

const greeting = "eTOP වෙත ඇමතීම ගැන ස්තූතියි. මම මායා. ඔබට උදව් කරන්නේ කොහොමද?";
const greetingEnglish = "Thank you for calling eTOP. Maya with you. How can I help?";

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

export const beginSinhalaLabTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: conversation, error } = await db(context)
      .from("reception_conversations")
      .insert({
        owner_id: context.userId,
        channel: "voice",
        direction: "inbound",
        status: "active",
        priority: "normal",
        inquiry_type: "general",
        contact_name: "Native speaker test",
        company_name: "Sinhala Voice Lab",
        summary: "Sinhala browser voice reliability test",
        external_provider: "sinhala_lab",
        external_conversation_id: crypto.randomUUID(),
        ai_plan: {
          lab_type: "sinhala_voice",
          scores: scoresSchema.parse({
            recognition: 0,
            understanding: 0,
            pronunciation: 0,
            naturalness: 0,
          }),
        },
      })
      .select("id")
      .single();
    if (error) throw new Error(`Could not save the Sinhala test: ${error.message}`);

    const { error: messageError } = await db(context)
      .from("reception_messages")
      .insert({
        conversation_id: conversation.id,
        channel: "voice",
        direction: "out",
        sender_role: "agent",
        content: greeting,
        delivery_status: "recorded",
        created_by: context.userId,
        metadata: { source: "sinhala_lab", english: greetingEnglish },
      });
    if (messageError)
      throw new Error(`Could not save the Sinhala greeting: ${messageError.message}`);
    return { id: conversation.id as string };
  });

export const loadLatestSinhalaLabTest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: conversations, error } = await db(context)
      .from("reception_conversations")
      .select("id,ai_plan,created_at")
      .eq("external_provider", "sinhala_lab")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const conversation = conversations?.[0];
    if (!conversation) return null;

    const { data: messages, error: messagesError } = await db(context)
      .from("reception_messages")
      .select("content,sender_role,metadata,created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true });
    if (messagesError) throw new Error(messagesError.message);

    const turns: StoredSinhalaLabTurn[] = (messages ?? [])
      .filter((message: { sender_role: string }) =>
        ["customer", "agent"].includes(message.sender_role),
      )
      .map(
        (message: {
          content: string;
          sender_role: string;
          metadata?: Record<string, unknown>;
        }) => ({
          role: message.sender_role === "customer" ? "caller" : "receptionist",
          text: message.content,
          english:
            typeof message.metadata?.english === "string" ? message.metadata.english : undefined,
          latency:
            typeof message.metadata?.latency === "number" ? message.metadata.latency : undefined,
          intent:
            typeof message.metadata?.intent === "string" ? message.metadata.intent : undefined,
        }),
      );
    const rawScores = conversation.ai_plan?.scores;
    const scores = scoresSchema.safeParse(rawScores);
    return {
      id: conversation.id as string,
      createdAt: conversation.created_at as string,
      turns,
      scores: scores.success
        ? scores.data
        : scoresSchema.parse({
            recognition: 0,
            understanding: 0,
            pronunciation: 0,
            naturalness: 0,
          }),
    };
  });

export const saveSinhalaLabScores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z.object({ sessionId: z.string().uuid(), scores: scoresSchema }).parse(value),
  )
  .handler(async ({ context, data }) => {
    const { error } = await db(context)
      .from("reception_conversations")
      .update({ ai_plan: { lab_type: "sinhala_voice", scores: data.scores } })
      .eq("id", data.sessionId)
      .eq("external_provider", "sinhala_lab");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const replyInSinhala = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        message: z.string().min(1).max(2500),
        turns: z.array(turnSchema).max(12).default([]),
      })
      .parse(value),
  )
  .handler(async ({ context, data }) => {
    const { error: callerSaveError } = await db(context)
      .from("reception_messages")
      .insert({
        conversation_id: data.sessionId,
        channel: "voice",
        direction: "in",
        sender_role: "customer",
        content: data.message,
        delivery_status: "recorded",
        created_by: context.userId,
        metadata: { source: "sinhala_lab" },
      });
    if (callerSaveError)
      throw new Error(`The caller message could not be saved: ${callerSaveError.message}`);

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

    const started = Date.now();
    const raw = provider === "anthropic" ? await callAnthropic(prompt) : await callOpenAi(prompt);
    const reply = responseSchema.parse(JSON.parse(stripJsonFence(raw)));
    const latency = Date.now() - started;
    const { error: replySaveError } = await db(context)
      .from("reception_messages")
      .insert({
        conversation_id: data.sessionId,
        channel: "voice",
        direction: "out",
        sender_role: "agent",
        content: reply.sinhala,
        delivery_status: "recorded",
        created_by: context.userId,
        metadata: {
          source: "sinhala_lab",
          english: reply.english,
          intent: reply.intent,
          latency,
          provider,
        },
      });
    if (replySaveError)
      throw new Error(
        `Maya replied, but the response could not be saved: ${replySaveError.message}`,
      );
    return { provider, reply, latency };
  });

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

function speechProvider() {
  if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) return "azure" as const;
  if (process.env.OPENAI_API_KEY) return "openai" as const;
  if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AGENT_ID)
    return "elevenlabs" as const;
  return null;
}

export const getSinhalaSpeechStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ provider: speechProvider() }));

async function synthesizeWithAzure(text: string) {
  const key = process.env.AZURE_SPEECH_KEY!;
  const region = process.env.AZURE_SPEECH_REGION!;
  const escaped = text.replace(
    /[<>&'"]/g,
    (character) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character]!,
  );
  const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "eTOP-Sinhala-Voice-Lab",
    },
    body: `<speak version="1.0" xml:lang="si-LK"><voice name="${process.env.AZURE_SINHALA_VOICE || "si-LK-ThiliniNeural"}">${escaped}</voice></speak>`,
  });
  if (!response.ok) throw new Error(`Azure Sinhala speech failed (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

async function synthesizeWithOpenAi(text: string) {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.SINHALA_OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
      voice: process.env.SINHALA_OPENAI_VOICE || "coral",
      input: text,
      instructions:
        "Speak clearly in natural Sri Lankan Sinhala with a warm professional receptionist tone.",
      response_format: "mp3",
    }),
  });
  if (!response.ok) throw new Error(`OpenAI Sinhala speech failed (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

async function synthesizeWithElevenLabs(text: string) {
  const apiKey = process.env.ELEVENLABS_API_KEY!;
  const agentId = process.env.ELEVENLABS_AGENT_ID!;
  const agentResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    headers: { "xi-api-key": apiKey },
  });
  if (!agentResponse.ok)
    throw new Error(`Could not read the ElevenLabs agent voice (${agentResponse.status}).`);
  const agent = (await agentResponse.json()) as {
    conversation_config?: { tts?: { voice_id?: string } };
  };
  const voiceId = agent.conversation_config?.tts?.voice_id;
  if (!voiceId) throw new Error("The ElevenLabs agent has no voice configured.");
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
    },
  );
  if (!response.ok)
    throw new Error(`ElevenLabs experimental Sinhala speech failed (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

export const synthesizeSinhalaSpeech = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ text: z.string().min(1).max(1200) }).parse(value))
  .handler(async ({ data }) => {
    const provider = speechProvider();
    if (!provider)
      throw new Error(
        "No Sinhala speech provider is connected. Add Azure Speech or OpenAI credentials.",
      );
    const bytes =
      provider === "azure"
        ? await synthesizeWithAzure(data.text)
        : provider === "openai"
          ? await synthesizeWithOpenAi(data.text)
          : await synthesizeWithElevenLabs(data.text);
    return { provider, mimeType: "audio/mpeg", audioBase64: bytesToBase64(bytes) };
  });
