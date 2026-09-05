/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CATEGORY = z.enum([
  "visitor_management",
  "time_attendance",
  "meal_management",
  "access_control",
  "turnstile",
  "other",
]);

// ---------- Reads ----------

export const listCompetitorResearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("competitor_research")
      .select(
        "id, title, category, status, summary, our_product_name, researcher, researched_at, created_at, competitor_companies:competitor_company_id(name, website), competitor_products:competitor_product_id(name)",
      )
      .order("researched_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getCompetitorResearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: research, error } = await (context.supabase as any)
      .from("competitor_research")
      .select(
        "*, competitor_companies:competitor_company_id(*), competitor_products:competitor_product_id(*)",
      )
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    const [features, strengths, weaknesses, gaps] = await Promise.all([
      (context.supabase as any).from("competitor_feature_rows").select("*").eq("research_id", data.id).order("sort_order"),
      (context.supabase as any).from("competitor_strengths").select("*").eq("research_id", data.id).order("sort_order"),
      (context.supabase as any).from("competitor_weaknesses").select("*").eq("research_id", data.id).order("sort_order"),
      (context.supabase as any).from("competitor_gaps").select("*").eq("research_id", data.id).order("sort_order"),
    ]);
    return {
      research,
      features: features.data ?? [],
      strengths: strengths.data ?? [],
      weaknesses: weaknesses.data ?? [],
      gaps: gaps.data ?? [],
    };
  });

export const listCompetitorCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("competitor_companies")
      .select("*, competitor_products(id, name, category, product_url, status)")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- Writes ----------

export const setResearchStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["draft", "published", "archived"]) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await (context.supabase as any)
      .from("competitor_research")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCompetitorResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await (context.supabase as any).from("competitor_research").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Manual create from the UI — mirrors the ingest webhook: upsert company +
// product by name, then append a research snapshot with its child rows.
const manualSchema = z.object({
  title: z.string().trim().min(1).max(300),
  our_product_name: z.string().trim().max(200).nullable().optional(),
  our_product_url: z.string().trim().max(500).nullable().optional(),
  category: CATEGORY,
  summary: z.string().trim().max(4000).nullable().optional(),
  researcher: z.string().trim().max(200).nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).default("published"),
  company: z.object({
    name: z.string().trim().min(1).max(200),
    website: z.string().trim().max(300).nullable().optional(),
    regions: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
    hardware_brands: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
    is_distributor: z.boolean().default(false),
    software_strength: z.enum(["low", "medium", "high"]).nullable().optional(),
    positioning: z.string().trim().max(1000).nullable().optional(),
  }),
  product: z
    .object({
      name: z.string().trim().max(200).nullable().optional(),
      product_url: z.string().trim().max(500).nullable().optional(),
    })
    .optional(),
  feature_matrix: z
    .array(
      z.object({
        capability: z.string().trim().min(1).max(300),
        our_assessment: z.string().trim().max(1000).nullable().optional(),
        their_assessment: z.string().trim().max(1000).nullable().optional(),
        leader: z.enum(["us", "them", "even", "unknown"]).nullable().optional(),
      }),
    )
    .max(100)
    .default([]),
  strengths: z.object({ us: z.array(z.string().trim().min(1).max(500)).default([]), them: z.array(z.string().trim().min(1).max(500)).default([]) }).default({ us: [], them: [] }),
  weaknesses: z.object({ us: z.array(z.string().trim().min(1).max(500)).default([]), them: z.array(z.string().trim().min(1).max(500)).default([]) }).default({ us: [], them: [] }),
  gaps: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(300),
        why_it_hurts: z.string().trim().max(1000).nullable().optional(),
        recommended_action: z.string().trim().max(1000).nullable().optional(),
        priority: z.enum(["p0", "p1", "p2"]).default("p1"),
        status: z.enum(["open", "in_progress", "done", "wont_do"]).default("open"),
      }),
    )
    .max(50)
    .default([]),
});

export const createCompetitorResearchManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => manualSchema.parse(d))
  .handler(async ({ context, data }) => {
    const sb = (context.supabase as any);

    // Upsert company by case-insensitive name.
    const { data: existingCo } = await sb
      .from("competitor_companies")
      .select("id")
      .ilike("name", data.company.name)
      .maybeSingle();
    const coFields = {
      name: data.company.name,
      website: data.company.website ?? null,
      regions: data.company.regions,
      hardware_brands: data.company.hardware_brands,
      is_distributor: data.company.is_distributor,
      software_strength: data.company.software_strength ?? null,
      positioning: data.company.positioning ?? null,
      updated_at: new Date().toISOString(),
    };
    let companyId: string;
    if (existingCo) {
      companyId = existingCo.id;
      await sb.from("competitor_companies").update(coFields).eq("id", companyId);
    } else {
      const { data: row, error } = await sb
        .from("competitor_companies")
        .insert({ ...coFields, created_by: context.userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      companyId = row.id;
    }

    // Upsert product (optional).
    let productId: string | null = null;
    if (data.product?.name) {
      const { data: existingProd } = await sb
        .from("competitor_products")
        .select("id")
        .eq("company_id", companyId)
        .ilike("name", data.product.name)
        .eq("category", data.category)
        .maybeSingle();
      const prodFields = {
        company_id: companyId,
        name: data.product.name,
        category: data.category,
        product_url: data.product.product_url ?? null,
        updated_at: new Date().toISOString(),
      };
      if (existingProd) {
        productId = existingProd.id;
        await sb.from("competitor_products").update(prodFields).eq("id", productId);
      } else {
        const { data: row, error } = await sb.from("competitor_products").insert(prodFields).select("id").single();
        if (error) throw new Error(error.message);
        productId = row.id;
      }
    }

    const { data: research, error: resErr } = await sb
      .from("competitor_research")
      .insert({
        title: data.title,
        our_product_name: data.our_product_name ?? null,
        our_product_url: data.our_product_url ?? null,
        competitor_company_id: companyId,
        competitor_product_id: productId,
        category: data.category,
        summary: data.summary ?? null,
        researcher: data.researcher ?? null,
        researched_at: new Date().toISOString(),
        status: data.status,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (resErr) throw new Error(resErr.message);
    const rid = research.id;

    if (data.feature_matrix.length) {
      await sb.from("competitor_feature_rows").insert(
        data.feature_matrix.map((f, i) => ({
          research_id: rid,
          capability: f.capability,
          our_assessment: f.our_assessment ?? null,
          their_assessment: f.their_assessment ?? null,
          leader: f.leader ?? null,
          sort_order: i + 1,
        })),
      );
    }
    const sideRows = (o: { us: string[]; them: string[] }) =>
      [
        ...o.us.map((point, i) => ({ side: "us" as const, point, sort_order: i + 1 })),
        ...o.them.map((point, i) => ({ side: "them" as const, point, sort_order: i + 1 })),
      ].map((r) => ({ ...r, research_id: rid }));
    if (data.strengths.us.length || data.strengths.them.length)
      await sb.from("competitor_strengths").insert(sideRows(data.strengths));
    if (data.weaknesses.us.length || data.weaknesses.them.length)
      await sb.from("competitor_weaknesses").insert(sideRows(data.weaknesses));
    if (data.gaps.length) {
      await sb.from("competitor_gaps").insert(
        data.gaps.map((g, i) => ({
          research_id: rid,
          title: g.title,
          why_it_hurts: g.why_it_hurts ?? null,
          recommended_action: g.recommended_action ?? null,
          priority: g.priority,
          status: g.status,
          sort_order: i + 1,
        })),
      );
    }

    return { id: rid, companyId, productId };
  });
