import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const idInput = z.object({ id: z.string().uuid() });

function normalizeUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

async function firecrawlScrape(url: string) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("Firecrawl is not connected.");
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formats: ["markdown", "summary", "links"],
      onlyMainContent: true,
    }),
  });
  if (res.status === 402) throw new Error("Firecrawl credits exhausted.");
  if (!res.ok) throw new Error(`Firecrawl error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    data?: { markdown?: string; summary?: string; links?: string[]; metadata?: Record<string, unknown> };
  };
  return json.data ?? {};
}

async function googleGeocode(address: string) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmapsKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!lovableKey || !gmapsKey) return null;
  const res = await fetch(
    `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?address=${encodeURIComponent(address)}`,
    { headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": gmapsKey } },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as {
    results?: Array<{ geometry?: { location?: { lat: number; lng: number } }; formatted_address?: string }>;
  };
  const top = json.results?.[0];
  if (!top?.geometry?.location) return null;
  return {
    lat: top.geometry.location.lat,
    lng: top.geometry.location.lng,
    formatted_address: top.formatted_address,
  };
}

export const researchCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ context, data }) => {
    const { data: company, error } = await context.supabase
      .from("companies")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    const url = normalizeUrl(company.domain);
    if (!url) throw new Error("Add a website / domain before running research.");

    const scraped = await firecrawlScrape(url);
    const markdown = (scraped.markdown ?? "").slice(0, 8000);
    const summary = scraped.summary ?? null;
    const links = (scraped.links ?? []).slice(0, 30);

    let geo: { lat: number; lng: number; formatted_address?: string } | null = null;
    if (company.address) {
      try {
        geo = await googleGeocode(company.address);
      } catch (e) {
        console.error("geocode failed", e);
      }
    }

    const research_data = {
      source_url: url,
      summary,
      markdown,
      links,
      scraped_at: new Date().toISOString(),
    };

    const update = {
      research_data,
      last_research_at: new Date().toISOString(),
      ...(geo ? { lat: geo.lat, lng: geo.lng } : {}),
    };

    const { error: upErr } = await context.supabase.from("companies").update(update).eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    await context.supabase.from("activity_log").insert({
      company_id: data.id,
      user_id: context.userId,
      type: "note",
      content: `AI research run on ${url}${geo ? " · location geocoded" : ""}`,
    });

    return { ok: true, research_data, geo };
  });

export const generatePitchEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ context, data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const [{ data: company }, { data: mine }] = await Promise.all([
      context.supabase.from("companies").select("*").eq("id", data.id).single(),
      context.supabase.from("my_company").select("*").eq("user_id", context.userId).maybeSingle(),
    ]);
    if (!company) throw new Error("Company not found");

    const research = (company.research_data ?? {}) as { summary?: string; markdown?: string };

    const system = `You write concise, warm B2B outreach emails. Output JSON via the tool. Keep body under 160 words. Reference 1-2 specific facts from the prospect's research. Avoid fluff and generic phrasing.`;

    const user = `MY COMPANY:
${mine ? JSON.stringify(mine, null, 2) : "(not yet set in Settings → My Company)"}

PROSPECT:
Name: ${company.name}
Industry: ${company.industry ?? "n/a"}
Contact: ${company.contact_person ?? "there"}
Website: ${company.domain ?? "n/a"}

RESEARCH SUMMARY:
${research.summary ?? "(no research yet — write a short cold intro)"}

RESEARCH EXCERPT:
${(research.markdown ?? "").slice(0, 4000)}`;

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
              name: "write_email",
              parameters: {
                type: "object",
                additionalProperties: false,
                properties: {
                  subject: { type: "string" },
                  body: { type: "string" },
                },
                required: ["subject", "body"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "write_email" } },
      }),
    });
    if (res.status === 429) throw new Error("Rate limit. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      choices: Array<{ message: { tool_calls?: Array<{ function: { arguments: string } }> } }>;
    };
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI did not return an email");
    return JSON.parse(args) as { subject: string; body: string };
  });
