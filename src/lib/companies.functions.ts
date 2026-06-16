import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const companySchema = z.object({
  name: z.string().min(1).max(200),
  domain: z.string().max(200).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  industry: z.string().max(100).optional().nullable(),
  contact_person: z.string().max(200).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  product_service: z.string().max(500).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
});

export const listCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("companies")
      .select("id, name, domain, industry, country, contact_person, email, phone, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const getCompany = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: company, error } = await context.supabase
      .from("companies")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { data: activities } = await context.supabase
      .from("activity_log")
      .select("*")
      .eq("company_id", data.id)
      .order("logged_at", { ascending: false });
    return { company, activities: activities ?? [] };
  });

export const createCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => companySchema.parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("companies")
      .insert({ ...data, user_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), patch: companySchema.partial() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("companies")
      .update(data.patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("companies").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        company_id: z.string().uuid(),
        type: z.enum(["note", "call", "visit", "email"]),
        content: z.string().min(1).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("activity_log")
      .insert({ ...data, user_id: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- AI extraction helpers (shared) ---

const extractToolSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: ["string", "null"] },
    domain: { type: ["string", "null"] },
    country: { type: ["string", "null"] },
    industry: { type: ["string", "null"] },
    contact_person: { type: ["string", "null"] },
    email: { type: ["string", "null"] },
    phone: { type: ["string", "null"] },
    product_service: { type: ["string", "null"] },
    address: { type: ["string", "null"] },
  },
  required: [
    "name",
    "domain",
    "country",
    "industry",
    "contact_person",
    "email",
    "phone",
    "product_service",
    "address",
  ],
} as const;

type Extracted = Record<string, string | null>;

async function callExtract(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: unknown,
): Promise<Extracted> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "extract_company",
            description: "Return structured company contact details.",
            parameters: extractToolSchema,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "extract_company" } },
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
  return JSON.parse(args) as Extracted;
}

// 1) Extract from pasted text (email signature, snippet)
export const extractCompanyFromText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ text: z.string().min(1).max(5000) }).parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");
    return callExtract(
      apiKey,
      "google/gemini-3-flash-preview",
      "You extract company contact info from an email signature or pasted snippet. Always call the extract_company tool. Use null for missing fields. Derive domain from the email address when only the email is present (strip after @).",
      data.text,
    );
  });

// 2) Extract from an uploaded image (business card / email screenshot) — vision model does OCR
export const extractCompanyFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        // data URL like: data:image/png;base64,AAAA...
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
    return callExtract(
      apiKey,
      "google/gemini-2.5-flash",
      "You read business cards and screenshots of emails or signatures. OCR the image and extract company contact info. Always call the extract_company tool. Use null for missing fields. Derive domain from the email address when only the email is present (strip after @). Combine multi-line addresses into one field.",
      [
        { type: "text", text: "Extract the company contact info from this image." },
        { type: "image_url", image_url: { url: data.imageDataUrl } },
      ],
    );
  });

// 3) Extract from a URL — Firecrawl scrape + AI extraction
function normalizeUrl(input: string): string {
  const t = input.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/+/, "")}`;
}

export const extractCompanyFromUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ url: z.string().min(3).max(500) }).parse(d),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    const fcKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");
    if (!fcKey) throw new Error("Firecrawl is not connected. Add it in Connectors.");

    const url = normalizeUrl(data.url);
    const fcRes = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${fcKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        formats: ["markdown", "summary", "links"],
        onlyMainContent: true,
      }),
    });
    if (fcRes.status === 402) throw new Error("Firecrawl credits exhausted.");
    if (!fcRes.ok) throw new Error(`Firecrawl error ${fcRes.status}: ${await fcRes.text()}`);
    const fcJson = (await fcRes.json()) as {
      data?: { markdown?: string; summary?: string; links?: string[] };
    };
    const markdown = (fcJson.data?.markdown ?? "").slice(0, 6000);
    const summary = fcJson.data?.summary ?? "";
    const links = (fcJson.data?.links ?? []).slice(0, 20);

    const extracted = await callExtract(
      apiKey,
      "google/gemini-3-flash-preview",
      "You extract company contact info from a website's scraped content (homepage / about / contact pages). Always call the extract_company tool. Use null for missing fields. Derive the domain from the source URL. Prefer the company's official name, industry, and primary contact details. Combine multi-line addresses into one field.",
      `SOURCE URL: ${url}

SUMMARY:
${summary}

LINKS (first 20):
${links.join("\n")}

MARKDOWN:
${markdown}`,
    );

    // Backfill domain from URL if AI left it null
    if (!extracted.domain) {
      try {
        extracted.domain = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        /* ignore */
      }
    }

    return {
      ...extracted,
      _scrape: {
        source_url: url,
        summary: summary || null,
        markdown,
        links,
        scraped_at: new Date().toISOString(),
      },
    };
  });
