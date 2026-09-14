// Twilio WhatsApp inbound webhook. Configure this URL as the "When a message
// comes in" webhook on your Twilio WhatsApp number:
//   https://<project>.supabase.co/functions/v1/whatsapp-inbound?token=<WHATSAPP_INBOUND_TOKEN>
// Twilio POSTs form-encoded (From, To, Body, MessageSid, NumMedia, MediaUrl0…).
// The message is matched to a lead by phone number, stored, and logged to the
// lead's Activity Journal. Responds with empty TwiML so Twilio is happy.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const xml = (body = TWIML, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/xml" } });

const digits = (v: string | null) => (v ?? "").replace(/\D/g, "");

Deno.serve(async (req) => {
  if (req.method !== "POST") return xml(TWIML, 200);

  const expectedToken = Deno.env.get("WHATSAPP_INBOUND_TOKEN");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return xml(TWIML, 200);
  // Shared-token check (Twilio URL carries ?token=…). If no token is configured
  // we still accept, but configuring one is strongly recommended.
  const token = new URL(req.url).searchParams.get("token");
  if (expectedToken && token !== expectedToken) return xml(TWIML, 200);

  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await req.text());
  } catch {
    return xml(TWIML, 200);
  }

  const from = form.get("From"); // e.g. "whatsapp:+9715…"
  const to = form.get("To");
  const body = form.get("Body") ?? "";
  const sid = form.get("MessageSid");
  const numMedia = Number(form.get("NumMedia") ?? "0");
  const mediaUrl = numMedia > 0 ? form.get("MediaUrl0") : null;
  const fromDigits = digits(from);

  const supabase = createClient(url, serviceKey);

  // Match a lead by the last 9 digits of the sender's number.
  let leadId: string | null = null;
  let leadUserId: string | null = null;
  if (fromDigits.length >= 6) {
    const needle = fromDigits.slice(-9);
    const { data: leads } = await supabase
      .from("leads")
      .select("id, user_id, whatsapp, phone, last_activity_at")
      .or(`whatsapp.ilike.%${needle}%,phone.ilike.%${needle}%`)
      .order("last_activity_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (leads && leads.length) {
      leadId = leads[0].id as string;
      leadUserId = leads[0].user_id as string;
    }
  }

  // Store the message.
  await supabase.from("whatsapp_messages").insert({
    lead_id: leadId,
    direction: "in",
    from_number: from,
    to_number: to,
    body,
    media_url: mediaUrl,
    message_sid: sid,
    status: "received",
  });

  // Mirror to the Activity Journal (a real inbound touch) when matched.
  if (leadId && leadUserId) {
    await supabase.from("lead_activities").insert({
      lead_id: leadId,
      user_id: leadUserId,
      kind: "whatsapp",
      body: body ? `WhatsApp in: ${body.slice(0, 500)}` : "WhatsApp message received",
    });
  }

  return xml();
});
