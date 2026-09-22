import { elevenLabsClient, ingestElevenLabsConversation } from "../_shared/elevenlabs-reception.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  const expected = Deno.env.get("RECEPTION_SYNC_KEY") ?? Deno.env.get("AGENT_API_KEY");
  const supplied =
    req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || supplied !== expected) return json({ error: "Unauthorized" }, 401);
  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  const agentId = Deno.env.get("ELEVENLABS_AGENT_ID");
  if (!apiKey || !agentId) return json({ error: "ElevenLabs API secrets are not configured" }, 503);

  const url = new URL("https://api.elevenlabs.io/v1/convai/conversations");
  url.searchParams.set("agent_id", agentId);
  url.searchParams.set("page_size", "100");
  const response = await fetch(url, { headers: { "xi-api-key": apiKey } });
  if (!response.ok) return json({ error: `ElevenLabs list failed (${response.status})` }, 502);
  const listing = (await response.json()) as {
    conversations?: Array<{ conversation_id?: string }>;
  };
  const ids = (listing.conversations ?? [])
    .map((row) => row.conversation_id)
    .filter(Boolean) as string[];
  const supabase = elevenLabsClient();
  const results: Array<Record<string, unknown>> = [];

  for (const conversationId of ids) {
    const detail = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
      {
        headers: { "xi-api-key": apiKey },
      },
    );
    if (!detail.ok) {
      results.push({ conversationId, ok: false, error: `detail ${detail.status}` });
      continue;
    }
    try {
      const data = (await detail.json()) as Record<string, unknown>;
      const result = await ingestElevenLabsConversation(supabase, {
        type: "post_call_transcription",
        data,
      });
      results.push({
        conversationId,
        ok: true,
        receptionId: result.receptionId,
        leadId: result.leadId,
      });
    } catch (error) {
      results.push({
        conversationId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return json({ ok: true, scanned: ids.length, results });
});
