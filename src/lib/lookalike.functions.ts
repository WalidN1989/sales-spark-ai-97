import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─── skip lists ──────────────────────────────────────────────────────────────

const SKIP_DOMAIN_SUBSTRINGS = [
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
  "youtube.com", "tiktok.com", "yelp.com", "tripadvisor.com", "yellowpages.com",
  "foursquare.com", "zomato.com", "trustpilot.com", "google.com", "maps.google.com",
  "booking.com", "expedia.com", "wikipedia.org", "reddit.com", "quora.com",
  "amazonaws.com", "cloudfront.net", "wordpress.com", "blogspot.com", "medium.com",
  "healthgrades.com", "webmd.com", "zocdoc.com", "practo.com", "bayt.com",
  "indeed.com", "glassdoor.com", "crunchbase.com", "bloomberg.com", "reuters.com",
];

const RESELLER_TERMS = [
  "wholesale", "distributor", "supplier", "buy online", "add to cart",
  "shop now", "price list", "catalogue", "catalog", "amazon", "ebay", "noon.com",
];

const BLOG_TERMS = [
  " blog", "how to ", "top 10", "best ", "guide to", "tips for",
  "magazine", " journal", "press release", " news ", "article",
];

const BUSINESS_SIGNALS = [
  "contact us", "about us", "our services", "appointment", "book now",
  "clinic", "centre", "center", "company", "ltd", "llc", "fzco", "pvt",
  "hospital", "institute", "group", "agency", "solutions", "consulting",
];

// ─── country → TLD / keyword map ─────────────────────────────────────────────

const COUNTRY_SIGNALS: Record<string, { tlds: string[]; keywords: string[] }> = {
  uae:        { tlds: ["ae"],       keywords: ["uae", "dubai", "abu dhabi", "sharjah", "emirates"] },
  "united arab emirates": { tlds: ["ae"], keywords: ["uae", "dubai", "abu dhabi", "sharjah", "emirates"] },
  "sri lanka": { tlds: ["lk"],     keywords: ["sri lanka", "colombo", "lk"] },
  saudi:       { tlds: ["sa"],     keywords: ["saudi", "ksa", "riyadh", "jeddah"] },
  "saudi arabia": { tlds: ["sa"], keywords: ["saudi", "ksa", "riyadh", "jeddah"] },
  qatar:       { tlds: ["qa"],     keywords: ["qatar", "doha"] },
  kuwait:      { tlds: ["kw"],     keywords: ["kuwait"] },
  bahrain:     { tlds: ["bh"],     keywords: ["bahrain", "manama"] },
  oman:        { tlds: ["om"],     keywords: ["oman", "muscat"] },
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase();
  }
}

function cleanName(title: string, domain: string): string {
  const cleaned = title.split(/[|\-–—]/)[0].trim();
  if (cleaned.length < 3 || /^(home|welcome|index)/i.test(cleaned)) {
    return domain.split(".")[0].replace(/-/g, " ");
  }
  return cleaned;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function extractIndustryTerms(company: {
  industry: string | null;
  product_service: string | null;
  research_data: { summary?: string } | null;
}): string[] {
  const src = [
    company.industry,
    company.product_service,
    (company.research_data as { summary?: string } | null)?.summary?.slice(0, 200),
  ]
    .filter(Boolean)
    .join(" ");
  // Return meaningful tokens (>4 chars), deduplicated, top 12
  return [...new Set(tokenize(src))].slice(0, 12);
}

function buildQueries(company: {
  name: string;
  industry: string | null;
  country: string | null;
  product_service: string | null;
  research_data: { summary?: string } | null;
}): string[] {
  const country = company.country ?? "";
  const queries: string[] = [];

  if (company.industry) {
    queries.push(`${company.industry} ${country}`.trim());
  }

  const ps = company.product_service;
  if (ps) {
    const words = tokenize(ps).slice(0, 4).join(" ");
    if (words) queries.push(`${words} ${country}`.trim());
  }

  // Fallback: name-derived + country
  if (queries.length === 0) {
    queries.push(`${company.name} similar companies ${country}`.trim());
  }

  return [...new Set(queries)].slice(0, 2);
}

// ─── confidence scoring ───────────────────────────────────────────────────────

type RawResult = { url: string; title: string; description: string };

type ScoredResult = {
  name: string;
  domain: string;
  url: string;
  description: string;
  confidence: number;
  label: "Likely match" | "Possible match" | "Review needed";
  reasons: string[];
  flags: string[];
  alreadyInProspects: boolean;
  searchQuery: string;
};

function scoreResult(
  raw: RawResult,
  industryTerms: string[],
  country: string | null,
  query: string,
): ScoredResult | null {
  const domain = extractDomain(raw.url);
  const text = `${raw.title} ${raw.description}`.toLowerCase();
  const name = cleanName(raw.title, domain);

  // Hard skip: directories, social, aggregators
  if (SKIP_DOMAIN_SUBSTRINGS.some((s) => domain.includes(s) || raw.url.includes(s))) {
    return null;
  }

  let confidence = 0;
  const reasons: string[] = [];
  const flags: string[] = [];

  // 1. Own website (not a shared platform) — 15 pts
  confidence += 15;

  // 2. Country signal — 20 pts
  if (country) {
    const key = country.toLowerCase();
    const signals = COUNTRY_SIGNALS[key] ?? { tlds: [], keywords: [] };
    const tld = domain.split(".").pop() ?? "";
    const tldMatch = signals.tlds.includes(tld);
    const textMatch = signals.keywords.some((k) => text.includes(k));
    if (tldMatch) {
      confidence += 20;
      reasons.push(`Local domain (.${tld})`);
    } else if (textMatch) {
      confidence += 12;
      reasons.push(`Country mention (${country})`);
    }
  }

  // 3. Industry keyword match — up to 25 pts
  const matched = industryTerms.filter((t) => text.includes(t));
  const matchRatio = industryTerms.length ? matched.length / industryTerms.length : 0;
  const kwScore = Math.round(matchRatio * 25);
  if (kwScore >= 15) {
    confidence += kwScore;
    reasons.push(`Strong keyword match (${matched.slice(0, 3).join(", ")})`);
  } else if (kwScore > 0) {
    confidence += kwScore;
    reasons.push(`Partial keyword match (${matched.slice(0, 2).join(", ")})`);
  }

  // 4. Looks like a real business — 20 pts
  const hasBlogSignal = BLOG_TERMS.some((t) => text.includes(t));
  const hasBizSignal = BUSINESS_SIGNALS.some((s) => text.includes(s));
  if (hasBizSignal && !hasBlogSignal) {
    confidence += 20;
    reasons.push("Business profile detected");
  } else if (hasBlogSignal) {
    confidence -= 10;
    flags.push("May be editorial / blog content");
  }

  // 5. Not a reseller/supplier — 10 pts
  const resellerSignals = RESELLER_TERMS.filter((t) => text.includes(t));
  if (resellerSignals.length === 0) {
    confidence += 10;
  } else {
    flags.push(`May be reseller / supplier (${resellerSignals.slice(0, 2).join(", ")})`);
  }

  confidence = Math.max(0, Math.min(100, confidence));

  const label: ScoredResult["label"] =
    confidence >= 65
      ? "Likely match"
      : confidence >= 40
        ? "Possible match"
        : "Review needed";

  if (confidence < 20) return null; // too low — skip entirely

  return {
    name,
    domain,
    url: raw.url,
    description: raw.description,
    confidence,
    label,
    reasons,
    flags,
    alreadyInProspects: false, // filled in later
    searchQuery: query,
  };
}

// ─── server function ──────────────────────────────────────────────────────────

export const findLookalikes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ companyId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const fcKey = process.env.FIRECRAWL_API_KEY;
    if (!fcKey) throw new Error("FIRECRAWL_API_KEY is not configured.");

    // Load seed company
    const { data: seed, error: sErr } = await context.supabase
      .from("companies")
      .select("id, name, domain, industry, country, product_service, research_data")
      .eq("id", data.companyId)
      .single();
    if (sErr) throw new Error(sErr.message);

    const industryTerms = extractIndustryTerms(
      seed as {
        industry: string | null;
        product_service: string | null;
        research_data: { summary?: string } | null;
      },
    );
    const queries = buildQueries(
      seed as {
        name: string;
        industry: string | null;
        country: string | null;
        product_service: string | null;
        research_data: { summary?: string } | null;
      },
    );

    // Run Firecrawl /v1/search for each query (sequential to respect rate limits)
    const rawByDomain = new Map<string, RawResult & { query: string }>();

    for (const query of queries) {
      const res = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: { Authorization: `Bearer ${fcKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 8 }),
      });
      if (res.status === 402) throw new Error("Firecrawl credits exhausted.");
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Firecrawl search error ${res.status}: ${txt}`);
      }
      const json = (await res.json()) as {
        data?: Array<{ url: string; title: string; description: string }>;
      };
      for (const r of json.data ?? []) {
        const domain = extractDomain(r.url);
        if (!rawByDomain.has(domain)) {
          rawByDomain.set(domain, { ...r, query });
        }
      }
    }

    // Score and filter
    const scored = [...rawByDomain.values()]
      .map((r) =>
        scoreResult(r, industryTerms, seed.country, r.query),
      )
      .filter((r): r is ScoredResult => r !== null)
      // exclude the seed company's own domain
      .filter((r) => !seed.domain || !r.domain.includes(extractDomain(seed.domain)))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);

    // Flag results already in user's prospects (by domain match)
    if (scored.length > 0) {
      const { data: existing } = await context.supabase
        .from("companies")
        .select("domain")
        .eq("user_id", context.userId);
      const existingDomains = new Set(
        (existing ?? [])
          .map((c: { domain: string | null }) => extractDomain(c.domain ?? ""))
          .filter(Boolean),
      );
      for (const r of scored) {
        r.alreadyInProspects = existingDomains.has(r.domain);
      }
    }

    // Persist results to research_data.lookalike_cache so the panel
    // can reload them without re-running the search.
    const existingRd = (seed.research_data as Record<string, unknown>) ?? {};
    await context.supabase
      .from("companies")
      .update({
        research_data: {
          ...existingRd,
          lookalike_cache: {
            results: scored,
            queries,
            industry_terms: industryTerms,
            cached_at: new Date().toISOString(),
          },
        },
      })
      .eq("id", data.companyId);

    return {
      seed: { id: seed.id, name: seed.name, country: seed.country },
      queries,
      industryTerms,
      results: scored,
      cached_at: new Date().toISOString(),
    };
  });

export const getLookalikeCache = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ companyId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: company } = await context.supabase
      .from("companies")
      .select("research_data")
      .eq("id", data.companyId)
      .single();
    const rd = (company?.research_data as Record<string, unknown>) ?? {};
    const cache = rd.lookalike_cache as {
      results: ScoredResult[];
      queries: string[];
      industry_terms: string[];
      cached_at: string;
    } | undefined;
    if (!cache) return null;
    // Re-check alreadyInProspects flag against current companies (may have changed)
    const { data: existing } = await context.supabase
      .from("companies")
      .select("domain")
      .eq("user_id", context.userId);
    const existingDomains = new Set(
      (existing ?? [])
        .map((c: { domain: string | null }) => extractDomain(c.domain ?? ""))
        .filter(Boolean),
    );
    for (const r of cache.results) {
      r.alreadyInProspects = existingDomains.has(r.domain);
    }
    return cache;
  });
