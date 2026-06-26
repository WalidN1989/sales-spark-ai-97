import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Company = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  country: string | null;
  employee_count: number | null;
  product_service: string | null;
  research_data: { summary?: string } | null;
};

function tokenize(text: string | null | undefined): Set<string> {
  if (!text) return new Set();
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function sizeBand(n: number | null): string {
  if (!n) return "unknown";
  if (n <= 50) return "small";
  if (n <= 200) return "mid";
  return "large";
}

type LookalikResult = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  country: string | null;
  score: number;
  reasons: string[];
};

function scorePair(seed: Company, candidate: Company): LookalikResult | null {
  let score = 0;
  const reasons: string[] = [];

  // Same industry (35 pts)
  if (
    seed.industry &&
    candidate.industry &&
    seed.industry.toLowerCase().trim() === candidate.industry.toLowerCase().trim()
  ) {
    score += 35;
    reasons.push(`Same industry (${candidate.industry})`);
  } else if (seed.industry && candidate.industry) {
    // Partial: one contains the other
    const a = seed.industry.toLowerCase();
    const b = candidate.industry.toLowerCase();
    if (a.includes(b) || b.includes(a)) {
      score += 18;
      reasons.push(`Related industry (${candidate.industry})`);
    }
  }

  // Same country (25 pts)
  if (
    seed.country &&
    candidate.country &&
    seed.country.toLowerCase().trim() === candidate.country.toLowerCase().trim()
  ) {
    score += 25;
    reasons.push(`Same country (${candidate.country})`);
  }

  // Keyword overlap across summary + product_service (30 pts)
  const seedText = `${seed.product_service ?? ""} ${(seed.research_data as { summary?: string } | null)?.summary ?? ""}`;
  const candText = `${candidate.product_service ?? ""} ${(candidate.research_data as { summary?: string } | null)?.summary ?? ""}`;
  const seedTokens = tokenize(seedText);
  const candTokens = tokenize(candText);
  if (seedTokens.size > 0 && candTokens.size > 0) {
    const overlap = [...seedTokens].filter((t) => candTokens.has(t));
    const overlapRatio = overlap.length / Math.min(seedTokens.size, candTokens.size);
    const kw = Math.round(overlapRatio * 30);
    if (kw > 0) {
      score += kw;
      const sample = overlap.slice(0, 3).join(", ");
      if (sample) reasons.push(`Similar focus (${sample}…)`);
    }
  }

  // Same employee size band (10 pts)
  if (
    seed.employee_count !== null &&
    candidate.employee_count !== null &&
    sizeBand(seed.employee_count) === sizeBand(candidate.employee_count)
  ) {
    score += 10;
    reasons.push(`Similar size (~${candidate.employee_count} employees)`);
  }

  if (score < 20) return null;
  return { id: candidate.id, name: candidate.name, domain: candidate.domain, industry: candidate.industry, country: candidate.country, score, reasons };
}

export const findLookalikes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ companyId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    // Load the seed company
    const { data: seed, error: sErr } = await context.supabase
      .from("companies")
      .select("id, name, domain, industry, country, employee_count, product_service, research_data")
      .eq("id", data.companyId)
      .single();
    if (sErr) throw new Error(sErr.message);

    // Load all other companies for this user
    const { data: candidates, error: cErr } = await context.supabase
      .from("companies")
      .select("id, name, domain, industry, country, employee_count, product_service, research_data")
      .eq("user_id", context.userId)
      .neq("id", data.companyId);
    if (cErr) throw new Error(cErr.message);

    // Fetch existing qualifying target competitor_ids so we can flag them
    const { data: existing } = await context.supabase
      .from("qualifying_targets")
      .select("competitor_id, source_company_id")
      .eq("user_id", context.userId)
      .eq("source_company_id", data.companyId);
    const alreadyQualifying = new Set(
      (existing ?? []).map((r: { competitor_id: string }) => r.competitor_id),
    );

    // Score all candidates
    const results = (candidates ?? [])
      .map((c) => scorePair(seed as Company, c as Company))
      .filter((r): r is LookalikResult => r !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((r) => ({ ...r, alreadyInQualifying: alreadyQualifying.has(r.id) }));

    return { seed: { id: seed.id, name: seed.name }, results };
  });
