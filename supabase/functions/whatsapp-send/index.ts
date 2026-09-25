import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("authorization");
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!authorization || !url || !anonKey || !serviceKey) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);

    const input = await req.json() as { leadId?: string; body?: string };
    const body = input.body?.trim();
    if (!input.leadId || !body || body.length > 4000) return json({ error: "A valid lead and message are required." }, 400);

    const { data: lead, error: leadError } = await userClient
      .from("leads").select("id, whatsapp, phone").eq("id", input.leadId).single();
    if (leadError || !lead) return json({ error: "Lead not found or unavailable." }, 404);

    const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromRaw = Deno.env.get("TWILIO_WHATSAPP_FROM");
    if (!sid || !authToken || !fromRaw) return json({ error: "WhatsApp sending is not configured." }, 503);

    const toDigits = digits(lead.whatsapp ?? lead.phone);
    if (!toDigits) return json({ error: "This lead has no WhatsApp or phone number." }, 400);
    const from = `whatsapp:+${digits(fromRaw)}`;
    const to = `whatsapp:+${toDigits}`;
    const statusCallback = Deno.env.get("TWILIO_WHATSAPP_STATUS_CALLBACK");
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: from, To: to, Body: body, ...(statusCallback ? { StatusCallback: statusCallback } : {}) }),
    });
    const payload = await response.json().catch(() => ({})) as { sid?: string; message?: string };
    if (!response.ok) return json({ error: payload.message ? `Twilio: ${payload.message}` : `Twilio error ${response.status}` }, 502);

    const admin = createClient(url, serviceKey);
    await admin.from("whatsapp_messages").insert({
      lead_id: lead.id, direction: "out", from_number: from, to_number: to,
      body, message_sid: payload.sid ?? null, status: "queued", created_by: authData.user.id,
    });
    await admin.from("lead_activities").insert({
      lead_id: lead.id, user_id: authData.user.id, kind: "whatsapp", body: `WhatsApp out: ${body.slice(0, 500)}`,
    });
    return json({ ok: true, sid: payload.sid ?? null });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "WhatsApp send failed." }, 500);
  }
});
