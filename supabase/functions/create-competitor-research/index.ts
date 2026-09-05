// Webhook: ingest one competitive-research package from an external research
// agent. Auth via x-api-key (COMPETITOR_RESEARCH_API_KEY). Upserts the
// competitor company + product, then appends a NEW research snapshot (history
// is never overwritten) with its feature matrix, strengths, weaknesses and gaps.
//
// No table is scraped or crawled here — this only stores structured research.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "content-type": "application/json" } });

const str = (v: unknown): string | null => {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
};
const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

const CATEGORIES = ["visitor_management", "time_attendance", "meal_management", "access_control", "turnstile", "other"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const expected = Deno.env.get("COMPETITOR_RESEARCH_API_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expected || !url || !serviceKey) return json({ error: "Function not fully configured" }, 500);

  const key = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (key !== expected) return json({ error: "Unauthorized" }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const r = (payload.research ?? payload) as Record<string, unknown>;

  // ---- validate ----
  const errors: string[] = [];
  const title = str(r.title);
  if (!title) errors.push("research.title is required");
  const category = str(r.category) ?? "other";
  if (!CATEGORIES.includes(category)) errors.push(`category must be one of: ${CATEGORIES.join(", ")}`);
  const compCo = (r.competitor_company ?? {}) as Record<string, unknown>;
  const compCoName = str(compCo.name);
  if (!compCoName) errors.push("competitor_company.name is required");
  if (errors.length) return json({ error: "Validation failed", details: errors }, 400);

  const supabase = createClient(url, serviceKey);

  // ---- upsert company (by case-insensitive name) ----
  const { data: existingCo } = await supabase
    .from("competitor_companies")
    .select("id")
    .ilike("name", compCoName!)
    .maybeSingle();

  const coFields = {
    name: compCoName,
    aka: arr(compCo.aka),
    website: str(compCo.website),
    hq_country: str(compCo.hq_country),
    regions: arr(compCo.regions),
    positioning: str(compCo.positioning),
    software_strength: ["low", "medium", "high"].includes(String(compCo.software_strength))
      ? String(compCo.software_strength)
      : null,
    hardware_brands: arr(compCo.hardware_brands),
    is_distributor: compCo.is_distributor === true,
    notes: str(compCo.notes),
    updated_at: new Date().toISOString(),
  };

  let companyId: string;
  if (existingCo) {
    companyId = existingCo.id;
    await supabase.from("competitor_companies").update(coFields).eq("id", companyId);
  } else {
    const { data, error } = await supabase.from("competitor_companies").insert(coFields).select("id").single();
    if (error) return json({ error: error.message }, 500);
    companyId = data.id;
  }

  // ---- upsert product (by company + name + category) ----
  let productId: string | null = null;
  const compProd = (r.competitor_product ?? {}) as Record<string, unknown>;
  const prodName = str(compProd.name);
  if (prodName) {
    const prodCategory = CATEGORIES.includes(String(compProd.category)) ? String(compProd.category) : category;
    const { data: existingProd } = await supabase
      .from("competitor_products")
      .select("id")
      .eq("company_id", companyId)
      .ilike("name", prodName)
      .eq("category", prodCategory)
      .maybeSingle();
    const prodFields = {
      company_id: companyId,
      name: prodName,
      category: prodCategory,
      product_url: str(compProd.product_url),
      datasheet_url: str(compProd.datasheet_url),
      deployment: arr(compProd.deployment),
      status: ["active", "watch", "irrelevant"].includes(String(compProd.status)) ? String(compProd.status) : "active",
      updated_at: new Date().toISOString(),
    };
    if (existingProd) {
      productId = existingProd.id;
      await supabase.from("competitor_products").update(prodFields).eq("id", productId);
    } else {
      const { data, error } = await supabase.from("competitor_products").insert(prodFields).select("id").single();
      if (error) return json({ error: error.message }, 500);
      productId = data.id;
    }
  }

  // ---- insert research snapshot (append-only) ----
  const { data: research, error: resErr } = await supabase
    .from("competitor_research")
    .insert({
      title,
      our_product_name: str(r.our_product_name),
      our_product_url: str(r.our_product_url),
      competitor_company_id: companyId,
      competitor_product_id: productId,
      category,
      summary: str(r.summary),
      sources: Array.isArray(r.sources) ? r.sources : [],
      researched_at: str(r.researched_at) ?? new Date().toISOString(),
      researcher: str(r.researcher),
      status: ["draft", "published", "archived"].includes(String(r.status)) ? String(r.status) : "published",
      raw_html_artifact_url: str(r.raw_html_artifact_url),
    })
    .select("id")
    .single();
  if (resErr) return json({ error: resErr.message }, 500);
  const researchId = research.id;

  // ---- children ----
  const features = Array.isArray(r.feature_matrix) ? (r.feature_matrix as Record<string, unknown>[]) : [];
  if (features.length) {
    await supabase.from("competitor_feature_rows").insert(
      features.map((f, i) => ({
        research_id: researchId,
        capability: str(f.capability) ?? "—",
        our_assessment: str(f.our_assessment),
        their_assessment: str(f.their_assessment),
        leader: ["us", "them", "even", "unknown"].includes(String(f.leader)) ? String(f.leader) : null,
        sort_order: typeof f.sort_order === "number" ? f.sort_order : i + 1,
      })),
    );
  }

  const sideList = (v: unknown): { side: "us" | "them"; point: string }[] => {
    const o = (v ?? {}) as Record<string, unknown>;
    const out: { side: "us" | "them"; point: string }[] = [];
    for (const side of ["us", "them"] as const) {
      for (const p of arr(o[side])) out.push({ side, point: p });
    }
    return out;
  };
  const strengths = sideList(r.strengths);
  if (strengths.length) {
    await supabase.from("competitor_strengths").insert(
      strengths.map((s, i) => ({ research_id: researchId, side: s.side, point: s.point, sort_order: i + 1 })),
    );
  }
  const weaknesses = sideList(r.weaknesses);
  if (weaknesses.length) {
    await supabase.from("competitor_weaknesses").insert(
      weaknesses.map((s, i) => ({ research_id: researchId, side: s.side, point: s.point, sort_order: i + 1 })),
    );
  }

  const gaps = Array.isArray(r.gaps) ? (r.gaps as Record<string, unknown>[]) : [];
  if (gaps.length) {
    await supabase.from("competitor_gaps").insert(
      gaps.map((g, i) => ({
        research_id: researchId,
        title: str(g.title) ?? "—",
        why_it_hurts: str(g.why_it_hurts),
        recommended_action: str(g.recommended_action),
        priority: ["p0", "p1", "p2"].includes(String(g.priority)) ? String(g.priority) : "p1",
        status: ["open", "in_progress", "done", "wont_do"].includes(String(g.status)) ? String(g.status) : "open",
        owner: str(g.owner),
        sort_order: typeof g.sort_order === "number" ? g.sort_order : i + 1,
      })),
    );
  }

  return json({ ok: true, research_id: researchId, company_id: companyId, product_id: productId, created: true });
});
