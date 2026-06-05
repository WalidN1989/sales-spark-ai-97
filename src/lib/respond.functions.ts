import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RESPOND_ENGINES, type EngineId } from "@/lib/respond-engines";
import { extractPartNumberCandidates } from "@/lib/products.functions";

const ENGINE_IDS = RESPOND_ENGINES.map((e) => e.id) as [EngineId, ...EngineId[]];

const generateSchema = z
  .object({
    companyId: z.string().uuid().optional().nullable(),
    leadId: z.string().uuid().optional().nullable(),
    engine: z.enum(ENGINE_IDS),
    inputText: z.string().max(20000).default(""),
    notes: z.string().max(5000).optional().nullable(),
    ocrText: z.string().max(40000).optional().nullable(),
    attachments: z
      .array(z.object({ path: z.string(), name: z.string().optional() }))
      .max(10)
      .default([]),
  })
  .refine((d) => !!d.companyId || !!d.leadId, {
    message: "companyId or leadId is required",
  });

async function callAI(apiKey: string, system: string, user: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "write_reply",
            description: "Return the drafted sales reply.",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: {
                subject: { type: ["string", "null"] },
                body: { type: "string" },
              },
              required: ["subject", "body"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "write_reply" } },
    }),
  });
  if (res.status === 429) throw new Error("Rate limited. Try again shortly.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Settings → Workspace → Usage.");
  if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    choices: Array<{ message: { tool_calls?: Array<{ function: { arguments: string } }> } }>;
  };
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI did not return a draft");
  return JSON.parse(args) as { subject: string | null; body: string };
}

export const ocrImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ storagePath: z.string().min(1).max(500) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const { data: signed, error: signErr } = await context.supabase.storage
      .from("respond-uploads")
      .createSignedUrl(data.storagePath, 300);
    if (signErr || !signed?.signedUrl) throw new Error(signErr?.message || "Could not access uploaded image");

    const imgRes = await fetch(signed.signedUrl);
    if (!imgRes.ok) throw new Error(`Failed to read image: ${imgRes.status}`);
    const ct = imgRes.headers.get("content-type") || "image/png";
    const buf = new Uint8Array(await imgRes.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);
    const dataUrl = `data:${ct};base64,${b64}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are an OCR engine. Return only the readable text from the image, preserving line breaks. Do not add commentary.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract all text from this image." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
    if (res.status === 429) throw new Error("Rate limited. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    if (!res.ok) throw new Error(`OCR error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    return { text };
  });

export const generateResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => generateSchema.parse(d))
  .handler(async ({ context, data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const engine = RESPOND_ENGINES.find((e) => e.id === data.engine)!;

    // Resolve target — company or lead
    type TargetInfo = {
      name: string;
      contact: string | null;
      industry: string | null;
      country: string | null;
      website: string | null;
      extras: string;
    };
    let target: TargetInfo;
    let activityLines: string[] = [];

    if (data.companyId) {
      const [{ data: company }, { data: activities }] = await Promise.all([
        context.supabase.from("companies").select("*").eq("id", data.companyId).single(),
        context.supabase
          .from("activity_log")
          .select("type, content, logged_at")
          .eq("company_id", data.companyId)
          .order("logged_at", { ascending: false })
          .limit(10),
      ]);
      if (!company) throw new Error("Prospect not found");
      target = {
        name: company.name,
        contact: company.contact_person ?? null,
        industry: company.industry ?? null,
        country: company.country ?? null,
        website: company.domain ?? null,
        extras: "",
      };
      activityLines = (activities ?? []).map(
        (a) => `- [${a.type}] ${new Date(a.logged_at).toLocaleDateString()} — ${a.content}`,
      );
    } else if (data.leadId) {
      const [{ data: lead }, { data: activities }] = await Promise.all([
        context.supabase.from("leads").select("*").eq("id", data.leadId).single(),
        context.supabase
          .from("lead_activities")
          .select("kind, body, created_at")
          .eq("lead_id", data.leadId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      if (!lead) throw new Error("Lead not found");
      const brandList = Array.isArray(lead.brands) ? lead.brands.join(", ") : "";
      const prodList = Array.isArray(lead.products_services)
        ? lead.products_services.join(", ")
        : "";
      target = {
        name: lead.company_name || lead.contact_person || "Lead",
        contact: lead.contact_person ?? null,
        industry: null,
        country: null,
        website: lead.website ?? null,
        extras: [
          lead.job_title ? `Job title: ${lead.job_title}` : null,
          lead.whatsapp ? `WhatsApp: ${lead.whatsapp}` : null,
          lead.contact_email ? `Email: ${lead.contact_email}` : null,
          brandList ? `Brands: ${brandList}` : null,
          prodList ? `Products/services: ${prodList}` : null,
          lead.notes ? `Notes: ${lead.notes}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      };
      activityLines = (activities ?? []).map(
        (a) => `- [${a.kind}] ${new Date(a.created_at).toLocaleDateString()} — ${a.body}`,
      );
    } else {
      throw new Error("Missing target");
    }

    const { data: mine } = await context.supabase
      .from("my_company")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();

    // Product detection
    const combinedInput = `${data.inputText}\n${data.ocrText ?? ""}`;
    const partCandidates = extractPartNumberCandidates(combinedInput);
    type MatchedProduct = {
      id: string;
      brand: string | null;
      name: string;
      part_number: string | null;
      currency: string | null;
      selling_price_cents: number | null;
      warranty: string | null;
      stock_status: string | null;
    };
    let matchedProducts: MatchedProduct[] = [];
    let detectedParts: string[] = [];
    if (partCandidates.length > 0) {
      const { data: prods } = await context.supabase
        .from("products")
        .select("id, brand, name, part_number, currency, selling_price_cents, warranty, stock_status")
        .in("part_number", partCandidates);
      matchedProducts = (prods ?? []) as MatchedProduct[];
      const matchedSet = new Set(matchedProducts.map((p) => (p.part_number ?? "").toUpperCase()));
      detectedParts = partCandidates.filter((c) => matchedSet.has(c));
    }

    // Learning context
    const { data: learning } = await context.supabase
      .from("learning_entries")
      .select("category, title, content, situation, tags, engine");
    const inputLower = combinedInput.toLowerCase();
    const ranked = (learning ?? [])
      .map((l) => {
        let score = 0;
        if (l.engine === data.engine) score += 5;
        if (data.engine === "negotiation" && l.category === "negotiation") score += 3;
        if (data.engine === "credit_request" && l.category === "business_rule") score += 3;
        if (data.engine === "payment_terms" && l.category === "business_rule") score += 3;
        if (l.category === "writing_style") score += 1;
        for (const t of l.tags ?? []) if (inputLower.includes(t.toLowerCase())) score += 2;
        if (l.title && inputLower.includes(l.title.toLowerCase())) score += 2;
        return { l, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .filter((x) => x.score > 0)
      .map((x) => x.l);

    const productBlock =
      matchedProducts.length > 0
        ? `MATCHED PRODUCTS:\n${matchedProducts
            .map((p) => {
              const sell =
                typeof p.selling_price_cents === "number"
                  ? `${(p.selling_price_cents as number) / 100} ${p.currency ?? ""}`
                  : "n/a";
              return `- ${p.brand ?? ""} ${p.name} (PN: ${p.part_number ?? "-"}, sell: ${sell}, warranty: ${p.warranty ?? "-"}, stock: ${p.stock_status ?? "-"})`;
            })
            .join("\n")}`
        : "MATCHED PRODUCTS: (none)";

    const learningBlock =
      ranked.length > 0
        ? `RELEVANT KNOWLEDGE:\n${ranked
            .map(
              (l) =>
                `- [${l.category}] ${l.title}${l.situation ? ` — situation: ${l.situation}` : ""}\n  ${l.content}`,
            )
            .join("\n")}`
        : "RELEVANT KNOWLEDGE: (none yet)";

    const activityBlock =
      activityLines.length > 0
        ? `RECENT ACTIVITY:\n${activityLines.join("\n")}`
        : "RECENT ACTIVITY: (none)";

    const system = `You are an experienced B2B sales rep drafting a reply for the user to review and send manually.
Engine: ${engine.label}
${engine.systemPrompt}
Rules:
- Keep it under 200 words unless explicitly negotiating multi-line points.
- Never invent prices or specs that aren't in MATCHED PRODUCTS or the user's notes.
- Use part numbers verbatim when present.
- Apply business rules from RELEVANT KNOWLEDGE verbatim where applicable.
- Output via the write_reply tool.`;

    const user = `MY COMPANY:
${mine ? JSON.stringify(mine, null, 2) : "(not set)"}

PROSPECT / LEAD:
Name: ${target.name}
Contact: ${target.contact ?? "n/a"}
Industry: ${target.industry ?? "n/a"}
Country: ${target.country ?? "n/a"}
Website: ${target.website ?? "n/a"}
${target.extras ? target.extras + "\n" : ""}
${activityBlock}

${productBlock}

${learningBlock}

CUSTOMER INPUT:
${data.inputText || "(none)"}

OCR FROM SCREENSHOTS:
${data.ocrText || "(none)"}

USER NOTES:
${data.notes || "(none)"}`;

    const reply = await callAI(apiKey, system, user);

    const draft = reply.subject ? `Subject: ${reply.subject}\n\n${reply.body}` : reply.body;

    const { data: inserted, error: insErr } = await context.supabase
      .from("responses")
      .insert({
        user_id: context.userId,
        company_id: data.companyId ?? null,
        lead_id: data.leadId ?? null,
        engine: data.engine,
        input_text: data.inputText,
        input_notes: data.notes ?? null,
        ocr_text: data.ocrText ?? null,
        attachments: data.attachments,
        detected_part_numbers: detectedParts,
        draft,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    return {
      responseId: inserted.id,
      draft,
      matchedProducts,
      usedLearning: ranked,
      detectedParts,
    };
  });

export const saveResponseToActivityLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        responseId: z.string().uuid(),
        finalText: z.string().min(1).max(20000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("responses")
      .select("company_id, lead_id, engine")
      .eq("id", data.responseId)
      .single();
    if (error) throw new Error(error.message);

    await context.supabase
      .from("responses")
      .update({ final: data.finalText })
      .eq("id", data.responseId);

    if (row.company_id) {
      const { error: actErr } = await context.supabase.from("activity_log").insert({
        company_id: row.company_id,
        user_id: context.userId,
        type: "email",
        content: `[Respond · ${row.engine}]\n${data.finalText}`,
      });
      if (actErr) throw new Error(actErr.message);
    } else if (row.lead_id) {
      const { error: actErr } = await context.supabase.from("lead_activities").insert({
        lead_id: row.lead_id,
        user_id: context.userId,
        kind: "email",
        body: `[Respond · ${row.engine}]\n${data.finalText}`,
      });
      if (actErr) throw new Error(actErr.message);
    }
    return { ok: true };
  });

export const saveResponseToLearning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        responseId: z.string().uuid(),
        title: z.string().min(1).max(200),
        category: z.enum(["writing_style", "business_rule", "objection", "negotiation"]),
        tags: z.array(z.string().min(1).max(60)).max(30).default([]),
        finalText: z.string().max(20000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("responses")
      .select("company_id, engine, input_text, draft")
      .eq("id", data.responseId)
      .single();
    if (error) throw new Error(error.message);

    const { error: insErr } = await context.supabase.from("learning_entries").insert({
      user_id: context.userId,
      category: data.category,
      title: data.title,
      content: data.finalText ?? row.draft ?? "",
      tags: data.tags,
      engine: row.engine,
      original_input: row.input_text,
      ai_response: row.draft,
      final_response: data.finalText ?? null,
      company_id: row.company_id,
    });
    if (insErr) throw new Error(insErr.message);
    return { ok: true };
  });
