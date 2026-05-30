import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const seedUrlsSchema = z
  .array(z.string().min(3).max(500))
  .max(10)
  .default([]);

function normalizeUrl(input: string): string {
  const t = input.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/+/, "")}`;
}

const insightToolSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    industries: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["name", "confidence"],
      },
    },
    competitors: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          website: { type: ["string", "null"] },
          country: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
          source: { type: "string", enum: ["seeded", "ai"] },
        },
        required: ["name", "website", "country", "description", "source"],
      },
    },
  },
  required: ["industries", "competitors"],
} as const;

type ScrapedSeed = { url: string; summary: string; markdown: string };

async function scrapeSeed(fcKey: string, url: string): Promise<ScrapedSeed | null> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${fcKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        formats: ["markdown", "summary"],
        onlyMainContent: true,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { markdown?: string; summary?: string };
    };
    return {
      url,
      summary: json.data?.summary ?? "",
      markdown: (json.data?.markdown ?? "").slice(0, 2500),
    };
  } catch {
    return null;
  }
}

export const scanMarketInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        seedUrls: seedUrlsSchema,
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const { data: company, error: loadErr } = await context.supabase
      .from("companies")
      .select("id, name, domain, industry, country, product_service, research_data")
      .eq("id", data.companyId)
      .single();
    if (loadErr || !company) throw new Error(loadErr?.message ?? "Company not found");

    const seedUrls = data.seedUrls.map(normalizeUrl).filter(Boolean).slice(0, 5);

    // Scrape seed URLs (best effort, only if Firecrawl is configured)
    const fcKey = process.env.FIRECRAWL_API_KEY;
    const scraped: ScrapedSeed[] = [];
    if (fcKey && seedUrls.length) {
      const results = await Promise.all(seedUrls.map((u) => scrapeSeed(fcKey, u)));
      for (const r of results) if (r) scraped.push(r);
    }

    const research = company.research_data as { summary?: string } | null;

    const systemPrompt = `You analyze a company and produce market insights.
1) Suggest 1-3 likely industries (with a confidence 0-1) the company operates in. Be specific (e.g. "Telecom Tower Infrastructure" not just "Telecom").
2) Produce a list of competitors. Mark each as "seeded" if it came from the user-provided seed URLs, or "ai" if you inferred it. Expand the seeded list with additional plausible competitors operating in the same country/region when possible.
Use null for unknown competitor fields. Always call the report_market_insight tool.`;

    const userContent = `TARGET COMPANY
Name: ${company.name}
Domain: ${company.domain ?? "unknown"}
Country: ${company.country ?? "unknown"}
Manually-tagged industry: ${company.industry ?? "unknown"}
Products/Services: ${company.product_service ?? "unknown"}
Prior research summary: ${research?.summary ?? "none"}

SEED COMPETITOR URLS (user-provided):
${seedUrls.length ? seedUrls.join("\n") : "(none)"}

SCRAPED SEED CONTENT:
${
  scraped.length
    ? scraped
        .map(
          (s) =>
            `--- ${s.url}\nSUMMARY: ${s.summary}\nCONTENT:\n${s.markdown}`,
        )
        .join("\n\n")
    : "(no scraped content)"
}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_market_insight",
              description: "Return industries and competitors for the company.",
              parameters: insightToolSchema,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_market_insight" } },
      }),
    });

    if (aiRes.status === 429) throw new Error("Rate limit exceeded. Try again shortly.");
    if (aiRes.status === 402)
      throw new Error("AI credits exhausted. Add credits in Settings → Workspace → Usage.");
    if (!aiRes.ok) throw new Error(`AI error ${aiRes.status}: ${await aiRes.text()}`);

    const aiJson = (await aiRes.json()) as {
      choices: Array<{ message: { tool_calls?: Array<{ function: { arguments: string } }> } }>;
    };
    const args = aiJson.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI did not return structured data");

    const parsed = JSON.parse(args) as {
      industries: Array<{ name: string; confidence: number }>;
      competitors: Array<{
        name: string;
        website: string | null;
        country: string | null;
        description: string | null;
        source: "seeded" | "ai";
      }>;
    };

    const insight = {
      ...parsed,
      generated_at: new Date().toISOString(),
      scraped_seeds: scraped.map((s) => s.url),
    };

    const { error: updErr } = await context.supabase
      .from("companies")
      .update({
        market_seed_urls: seedUrls,
        market_insight: insight,
        market_insight_at: insight.generated_at,
      })
      .eq("id", data.companyId);
    if (updErr) throw new Error(updErr.message);

    return insight;
  });

export const applyIndustry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        industry: z.string().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("companies")
      .update({ industry: data.industry })
      .eq("id", data.companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
