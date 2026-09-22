import { elevenLabsClient, ingestElevenLabsConversation } from "../_shared/elevenlabs-reception.ts";

type Json = Record<string, unknown>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

async function verifySignature(rawBody: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((part) => part.trim().split("=", 2)));
  const timestamp = parts.t;
  const signature = parts.v0;
  if (!timestamp || !signature) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 30 * 60) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  return safeEqual(hex(digest), signature.toLowerCase());
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const secret = Deno.env.get("ELEVENLABS_WEBHOOK_SECRET");
  if (!secret) return json({ error: "Webhook secret is not configured" }, 503);

  const rawBody = await req.text();
  if (!(await verifySignature(rawBody, req.headers.get("ElevenLabs-Signature"), secret))) {
    return json({ error: "Invalid or expired ElevenLabs signature" }, 401);
  }

  let payload: Json;
  try {
    payload = JSON.parse(rawBody) as Json;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const eventType = String(payload.type ?? "unknown");
  const data = (payload.data ?? {}) as Json;
  const externalId = String(data.conversation_id ?? payload.conversation_id ?? "") || null;
  const supabase = elevenLabsClient();
  // Never persist the separate base64 audio delivery in the receipt ledger.
  // It can be very large and call logging does not depend on it.
  const auditPayload =
    eventType === "post_call_audio"
      ? {
          ...payload,
          data: { ...data, full_audio: undefined, audio_base_64: undefined, audio: undefined },
        }
      : payload;
  const { data: receipt } = await supabase
    .from("reception_webhook_events")
    .insert({
      provider: "elevenlabs",
      event_type: eventType,
      external_conversation_id: externalId,
      payload: auditPayload,
    })
    .select("id")
    .single();

  try {
    if (eventType === "post_call_transcription") {
      const result = await ingestElevenLabsConversation(supabase, payload);
      if (receipt?.id) {
        await supabase
          .from("reception_webhook_events")
          .update({
            processing_status: result.ignored ? "ignored" : "processed",
            processed_at: new Date().toISOString(),
          })
          .eq("id", receipt.id);
      }
      return json({ ok: true, ...result });
    }

    // Audio is intentionally acknowledged separately. The transcript event is
    // the durable CRM record; large audio payloads can be enabled later with a
    // private storage retention policy.
    if (receipt?.id) {
      await supabase
        .from("reception_webhook_events")
        .update({
          processing_status: "ignored",
          processed_at: new Date().toISOString(),
        })
        .eq("id", receipt.id);
    }
    return json({ ok: true, ignored: true, eventType });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (receipt?.id) {
      await supabase
        .from("reception_webhook_events")
        .update({
          processing_status: "failed",
          error_message: message.slice(0, 2000),
          processed_at: new Date().toISOString(),
        })
        .eq("id", receipt.id);
    }
    console.error("ElevenLabs webhook processing failed", message);
    // A non-2xx response tells ElevenLabs to retry the transcription event.
    return json({ error: "Processing failed" }, 500);
  }
});
