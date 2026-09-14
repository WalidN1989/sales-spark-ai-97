// One competitor research snapshot with everything under it: the competitor
// company and product, feature matrix, strengths, weaknesses and gaps.
//
// GET /functions/v1/get-competitor-research?id=<uuid>
// Auth: AGENT_API_KEY or COMPETITOR_RESEARCH_API_KEY.
// Competitor data is shared team data (no owner column), so no owner filter.
import { authorize, fail, gate, json, readInput, str } from "../_shared/agent.ts";

Deno.serve(async (req) => {
  const blocked = gate(req, ["GET", "POST"]);
  if (blocked) return blocked;
  const ctx = authorize(req, "COMPETITOR_RESEARCH_API_KEY");
  if (ctx instanceof Response) return ctx;

  const input = await readInput(req);
  const id = str(input.id);
  if (!id) return fail("id is required", 400);

  const { data: research, error } = await ctx.supabase
    .from("competitor_research")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!research) return fail("Research not found", 404);

  const byResearch = (table: string) =>
    ctx.supabase.from(table).select("*").eq("research_id", id).order("sort_order", { ascending: true });

  const [company, product, features, strengths, weaknesses, gaps] = await Promise.all([
    research.competitor_company_id
      ? ctx.supabase.from("competitor_companies").select("*").eq("id", research.competitor_company_id).maybeSingle()
      : Promise.resolve({ data: null }),
    research.competitor_product_id
      ? ctx.supabase.from("competitor_products").select("*").eq("id", research.competitor_product_id).maybeSingle()
      : Promise.resolve({ data: null }),
    byResearch("competitor_feature_rows"),
    byResearch("competitor_strengths"),
    byResearch("competitor_weaknesses"),
    byResearch("competitor_gaps"),
  ]);

  return json({
    ok: true,
    research,
    competitor_company: company.data ?? null,
    competitor_product: product.data ?? null,
    feature_rows: features.data ?? [],
    strengths: strengths.data ?? [],
    weaknesses: weaknesses.data ?? [],
    gaps: gaps.data ?? [],
  });
});
