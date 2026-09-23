import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });

type Provider = "azure" | "openai" | "elevenlabs";

const sinhalaElevenLabsVoiceName = "Anika - Warm and Intimate";
const sinhalaElevenLabsModel = "eleven_v3";
const sinhalaElevenLabsStability = 0.8;

function provider(): Provider | null {
  if (Deno.env.get("AZURE_SPEECH_KEY") && Deno.env.get("AZURE_SPEECH_REGION")) return "azure";
  if (Deno.env.get("OPENAI_API_KEY")) return "openai";
  if (Deno.env.get("ELEVENLABS_API_KEY") && Deno.env.get("ELEVENLABS_AGENT_ID")) {
    return "elevenlabs";
  }
  return null;
}

async function requireUser(req: Request) {
  const authorization = req.headers.get("authorization");
  if (!authorization) throw new Error("Unauthorized");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) throw new Error("Supabase authentication is unavailable");
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Unauthorized");
}

function escapeXml(text: string) {
  return text.replace(
    /[<>&'"]/g,
    (character) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character]!,
  );
}

async function azureSpeech(text: string) {
  const region = Deno.env.get("AZURE_SPEECH_REGION")!;
  return fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": Deno.env.get("AZURE_SPEECH_KEY")!,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "eTOP-Sinhala-Voice-Lab",
    },
    body: `<speak version="1.0" xml:lang="si-LK"><voice name="${Deno.env.get("AZURE_SINHALA_VOICE") || "si-LK-ThiliniNeural"}">${escapeXml(text)}</voice></speak>`,
  });
}

async function openAiSpeech(text: string) {
  return fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("SINHALA_OPENAI_TTS_MODEL") || "gpt-4o-mini-tts",
      voice: Deno.env.get("SINHALA_OPENAI_VOICE") || "coral",
      input: text,
      instructions: "Speak clearly in natural Sri Lankan Sinhala with a warm receptionist tone.",
      response_format: "mp3",
    }),
  });
}

async function elevenLabsSpeech(text: string) {
  const apiKey = Deno.env.get("ELEVENLABS_API_KEY")!;
  let voiceId = Deno.env.get("SINHALA_ELEVENLABS_VOICE_ID");

  if (!voiceId) {
    const voicesResponse = await fetch(
      `https://api.elevenlabs.io/v1/shared-voices?page_size=30&search=${encodeURIComponent(sinhalaElevenLabsVoiceName)}`,
      { headers: { "xi-api-key": apiKey } },
    );
    if (!voicesResponse.ok) return voicesResponse;
    const result = (await voicesResponse.json()) as {
      voices?: Array<{ voice_id?: string; name?: string }>;
    };
    voiceId = result.voices?.find((voice) => voice.name === sinhalaElevenLabsVoiceName)?.voice_id;
  }

  if (!voiceId) {
    return json({ error: `ElevenLabs voice '${sinhalaElevenLabsVoiceName}' was not found.` }, 503);
  }

  return fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({
        text,
        model_id: Deno.env.get("SINHALA_ELEVENLABS_MODEL_ID") || sinhalaElevenLabsModel,
        voice_settings: { stability: sinhalaElevenLabsStability },
      }),
    },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  try {
    await requireUser(req);
    const body = (await req.json()) as { action?: string; text?: string };
    const selected = provider();
    if (body.action === "status") {
      return json({
        provider: selected,
        ...(selected === "elevenlabs"
          ? {
              voice: sinhalaElevenLabsVoiceName,
              model: Deno.env.get("SINHALA_ELEVENLABS_MODEL_ID") || sinhalaElevenLabsModel,
              stability: sinhalaElevenLabsStability,
            }
          : {}),
      });
    }
    const text = body.text?.trim();
    if (!text || text.length > 1200)
      return json({ error: "Text must contain 1–1200 characters." }, 400);
    if (!selected) return json({ error: "No Sinhala speech provider is connected." }, 503);

    const response =
      selected === "azure"
        ? await azureSpeech(text)
        : selected === "openai"
          ? await openAiSpeech(text)
          : await elevenLabsSpeech(text);
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      return json({ error: `${selected} speech failed (${response.status}). ${detail}` }, 502);
    }
    return new Response(await response.arrayBuffer(), {
      headers: {
        ...corsHeaders,
        // Supabase FunctionsClient only preserves binary responses as Blob for
        // application/octet-stream (audio/mpeg is otherwise decoded as text).
        "content-type": "application/octet-stream",
        "x-audio-content-type": "audio/mpeg",
        "cache-control": "no-store",
        "x-speech-provider": selected,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Speech request failed";
    return json({ error: message }, message === "Unauthorized" ? 401 : 500);
  }
});
