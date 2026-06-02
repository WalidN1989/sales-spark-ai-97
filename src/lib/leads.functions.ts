import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const statusEnum = z.enum(["hot", "warm", "cold", "frozen", "dead"]);

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select(
        "id, company_id, contact_person, contact_email, whatsapp, status, pipeline_value_cents, last_activity_kind, last_activity_at, last_activity_note, created_at, companies:company_id(name, domain, country, industry)",
      )
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const promoteToLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ companyId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    // Idempotent: return existing if present
    const { data: existing } = await context.supabase
      .from("leads")
      .select("id")
      .eq("company_id", data.companyId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) return { id: existing.id, created: false };

    const { data: company, error: cErr } = await context.supabase
      .from("companies")
      .select("contact_person, email")
      .eq("id", data.companyId)
      .single();
    if (cErr) throw new Error(cErr.message);

    const { data: row, error } = await context.supabase
      .from("leads")
      .insert({
        user_id: context.userId,
        company_id: data.companyId,
        contact_person: company.contact_person,
        contact_email: company.email,
        status: "warm",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, created: true };
  });

const patchSchema = z
  .object({
    status: statusEnum.optional(),
    contact_person: z.string().max(200).nullable().optional(),
    contact_email: z.string().max(200).nullable().optional(),
    whatsapp: z
      .string()
      .max(30)
      .regex(/^[0-9+\-\s()]*$/, "Digits and + - ( ) only")
      .nullable()
      .optional(),
    pipeline_value_cents: z.number().int().min(0).max(1_000_000_000_00).optional(),
    last_activity_kind: z.enum(["note", "email", "call", "meeting", "log"]).nullable().optional(),
    last_activity_note: z.string().max(1000).nullable().optional(),
    touch_activity: z.boolean().optional(),
  })
  .strict();

export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), patch: patchSchema }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { touch_activity, ...patch } = data.patch;
    const finalPatch = {
      ...patch,
      ...(touch_activity || patch.last_activity_note || patch.last_activity_kind
        ? { last_activity_at: new Date().toISOString() }
        : {}),
    };
    const { error } = await context.supabase
      .from("leads")
      .update(finalPatch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("leads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Quick add (WhatsApp screenshot) ----

const quickLeadSchema = z.object({
  contact_person: z.string().trim().max(200).optional().nullable(),
  whatsapp: z
    .string()
    .trim()
    .min(4)
    .max(30)
    .regex(/^[0-9+\-\s()]+$/, "Digits and + - ( ) only"),
  contact_email: z
    .string()
    .trim()
    .max(200)
    .email()
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  product: z.string().trim().max(500).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
});

export const createQuickLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => quickLeadSchema.parse(d))
  .handler(async ({ context, data }) => {
    const parts: string[] = [];
    if (data.product) parts.push(`Product: ${data.product}`);
    if (data.note) parts.push(data.note);
    const activityNote = parts.join("\n\n") || null;

    const { data: row, error } = await context.supabase
      .from("leads")
      .insert({
        user_id: context.userId,
        company_id: null,
        contact_person: data.contact_person || null,
        contact_email: data.contact_email || null,
        whatsapp: data.whatsapp,
        status: "warm",
        last_activity_kind: activityNote ? "note" : null,
        last_activity_note: activityNote,
        last_activity_at: activityNote ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

const extractToolSchema = {
  type: "object",
  properties: {
    contact_person: { type: ["string", "null"], description: "Name of the contact if visible, else null" },
    whatsapp: { type: ["string", "null"], description: "Phone/WhatsApp number including country code, digits/+ only, else null" },
    contact_email: { type: ["string", "null"] },
    product: { type: ["string", "null"], description: "Product or service the customer is asking about, if mentioned" },
    note: { type: ["string", "null"], description: "Short summary of the customer's request (one or two sentences)" },
  },
  required: ["contact_person", "whatsapp", "contact_email", "product", "note"],
} as const;

export const extractLeadFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        imageDataUrl: z
          .string()
          .min(20)
          .max(10_000_000)
          .regex(/^data:image\/(png|jpe?g|webp|gif);base64,/i, "Must be an image data URL"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You read screenshots of WhatsApp chats. OCR the image and extract the customer lead details. The phone number is usually at the top of the chat header. The contact name may be a sender name or signature inside a message. Identify the product/service they are asking about from the chat. Always call the extract_lead tool. Use null for any field you cannot find.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the WhatsApp lead details from this screenshot." },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: { name: "extract_lead", description: "Return structured lead details.", parameters: extractToolSchema },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_lead" } },
      }),
    });
    if (res.status === 429) throw new Error("Rate limit exceeded. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Settings → Workspace → Usage.");
    if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      choices: Array<{ message: { tool_calls?: Array<{ function: { arguments: string } }> } }>;
    };
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI did not return structured data");
    return JSON.parse(args) as {
      contact_person: string | null;
      whatsapp: string | null;
      contact_email: string | null;
      product: string | null;
      note: string | null;
    };
  });
