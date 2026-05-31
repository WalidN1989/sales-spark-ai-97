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

export type CompetitorSocials = {
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  instagram?: string;
  youtube?: string;
};

const SOCIAL_PATTERNS: Array<{ key: keyof CompetitorSocials; rx: RegExp }> = [
  { key: "linkedin", rx: /^https?:\/\/([a-z0-9-]+\.)*linkedin\.com\//i },
  { key: "twitter", rx: /^https?:\/\/([a-z0-9-]+\.)*(twitter|x)\.com\//i },
  { key: "facebook", rx: /^https?:\/\/([a-z0-9-]+\.)*facebook\.com\//i },
  { key: "instagram", rx: /^https?:\/\/([a-z0-9-]+\.)*instagram\.com\//i },
  { key: "youtube", rx: /^https?:\/\/([a-z0-9-]+\.)*(youtube\.com|youtu\.be)\//i },
];

function extractSocials(urls: string[]): CompetitorSocials {
  const out: CompetitorSocials = {};
  for (const raw of urls) {
    const url = raw.trim();
    if (!url) continue;
    for (const { key, rx } of SOCIAL_PATTERNS) {
      if (out[key]) continue;
      if (rx.test(url)) {
        // Skip generic share/intent links
        if (/\/(share|intent|sharer)(\b|\/|\?)/i.test(url)) continue;
        out[key] = url.split("#")[0].replace(/\/$/, "");
        break;
      }
    }
  }
  return out;
}

async function firecrawlMapSocials(fcKey: string, website: string): Promise<CompetitorSocials> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/map", {
      method: "POST",
      headers: { Authorization: `Bearer ${fcKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: normalizeUrl(website),
        search: "linkedin twitter facebook instagram youtube",
        limit: 50,
        includeSubdomains: false,
      }),
    });
    if (!res.ok) return {};
    const json = (await res.json()) as { links?: Array<string | { url?: string }> };
    const links = (json.links ?? [])
      .map((l) => (typeof l === "string" ? l : l?.url ?? ""))
      .filter(Boolean);
    return extractSocials(links);
  } catch {
    return {};
  }
}

type ScrapedSeed = { url: string; summary: string; markdown: string; links: string[] };

async function scrapeSeed(fcKey: string, url: string): Promise<ScrapedSeed | null> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${fcKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        formats: ["markdown", "summary", "links"],
        onlyMainContent: true,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { markdown?: string; summary?: string; links?: string[] };
    };
    return {
      url,
      summary: json.data?.summary ?? "",
      markdown: (json.data?.markdown ?? "").slice(0, 2500),
      links: json.data?.links ?? [],
    };
  } catch {
    return null;
  }
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

    // Seed-derived socials (from already-scraped pages), bucketed by seed URL host
    const seedSocialByHost = new Map<string, CompetitorSocials>();
    for (const s of scraped) {
      try {
        const host = new URL(s.url).host.replace(/^www\./, "");
        seedSocialByHost.set(host, extractSocials(s.links));
      } catch {
        // ignore bad seed URL
      }
    }

    // Enrich competitors with socials (cap to first 10 to control credits)
    const enriched = await Promise.all(
      parsed.competitors.map(async (cp, idx) => {
        if (!cp.website || idx >= 10) return { ...cp, socials: {} as CompetitorSocials };
        const normalized = normalizeUrl(cp.website);
        let socials: CompetitorSocials = {};
        try {
          const host = new URL(normalized).host.replace(/^www\./, "");
          const seedHit = seedSocialByHost.get(host);
          if (seedHit) socials = { ...seedHit };
        } catch {
          // ignore
        }
        if (fcKey) {
          const mapped = await firecrawlMapSocials(fcKey, normalized);
          socials = { ...mapped, ...socials }; // seed-derived wins
        }
        return { ...cp, socials };
      }),
    );

    const insight = {
      ...parsed,
      competitors: enriched,
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
