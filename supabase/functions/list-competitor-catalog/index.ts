// The competitor catalog: companies and their products, independent of any one
// research snapshot. Write side: POST with upsert payloads.
//
// GET  /functions/v1/list-competitor-catalog?q=&category=
// POST /functions/v1/list-competitor-catalog
//   { "companies": [ { "name": "...", "website"?, "hq_country"?, "regions"?, "positioning"?,
//                      "software_strength"?, "hardware_brands"?, "is_distributor"?, "notes"?,
//                      "products"?: [ { "name", "category", "product_url"?, "datasheet_url"?,
//                                       "deployment"?, "status"? } ] } ] }
// Upsert keys: company by lower(name); product by (company, lower(name), category).
// Auth: AGENT_API_KEY or COMPETITOR_RESEARCH_API_KEY.
import { authorize, fail, gate, json, readInput, str } from "../_shared/agent.ts";

const CATEGORIES = ["visitor_management", "time_attendance", "meal_management", "access_control", "turnstile", "other"];
const PRODUCT_STATUSES = ["active", "watch", "irrelevant"];
const STRENGTHS = ["low", "medium", "high"];
const strList = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x)).filter((x): x is string => !!x) : undefined);

Deno.serve(async (req) => {
  const blocked = gate(req, ["GET", "POST"]);
  if (blocked) return blocked;
  const ctx = authorize(req, "COMPETITOR_RESEARCH_API_KEY");
  if (ctx instanceof Response) return ctx;

  const input = await readInput(req);

  if (req.method === "GET") {
    let cq = ctx.supabase.from("competitor_companies").select("*").order("name", { ascending: true }).limit(500);
    const text = str(input.q);
    if (text) cq = cq.ilike("name", `%${text}%`);
    const { data: companies, error } = await cq;
    if (error) return fail(error.message, 500);

    const ids = (companies ?? []).map((c) => c.id as string);
    let pq = ctx.supabase.from("competitor_products").select("*").order("name", { ascending: true });
    if (ids.length) pq = pq.in("company_id", ids);
    const category = str(input.category);
    if (category) pq = pq.eq("category", category);
    const { data: products, error: pErr } = ids.length ? await pq : { data: [], error: null };
    if (pErr) return fail(pErr.message, 500);

    const grouped = (companies ?? []).map((c) => ({
      ...c,
      products: (products ?? []).filter((p) => p.company_id === c.id),
    }));
    return json({ ok: true, count: grouped.length, companies: grouped });
  }

  const list = Array.isArray(input.companies) ? (input.companies as Record<string, unknown>[]) : [];
  if (!list.length) return fail("companies[] is required", 400);
  if (list.length > 100) return fail("Max 100 companies per request", 400);

  let created = 0;
  let updated = 0;
  let productsUpserted = 0;
  const ids: string[] = [];
  const failed: { company: string | null; error: string }[] = [];

  for (const c of list) {
    const name = str(c.name);
    if (!name) {
      failed.push({ company: null, error: "name is required" });
      continue;
    }
    const strength = str(c.software_strength);
    if (strength && !STRENGTHS.includes(strength)) {
      failed.push({ company: name, error: `software_strength must be one of ${STRENGTHS.join(", ")}` });
      continue;
    }

    const fields: Record<string, unknown> = { name };
    for (const key of ["website", "hq_country", "positioning", "notes"]) if (key in c) fields[key] = str(c[key]);
    if ("software_strength" in c) fields.software_strength = strength;
    if ("is_distributor" in c) fields.is_distributor = c.is_distributor === true;
    for (const key of ["regions", "hardware_brands", "aka"]) {
      const values = strList(c[key]);
      if (values) fields[key] = values;
    }

    const { data: existing } = await ctx.supabase
      .from("competitor_companies").select("id").ilike("name", name).maybeSingle();
    let companyId: string;
    if (existing) {
      const { error } = await ctx.supabase.from("competitor_companies").update(fields).eq("id", existing.id);
      if (error) {
        failed.push({ company: name, error: error.message });
        continue;
      }
      companyId = existing.id as string;
      updated++;
    } else {
      const { data: row, error } = await ctx.supabase.from("competitor_companies").insert(fields).select("id").single();
      if (error) {
        failed.push({ company: name, error: error.message });
        continue;
      }
      companyId = row.id as string;
      created++;
    }
    ids.push(companyId);

    const products = Array.isArray(c.products) ? (c.products as Record<string, unknown>[]) : [];
    for (const p of products) {
      const productName = str(p.name);
      const category = str(p.category) ?? "other";
      const status = str(p.status);
      if (!productName || !CATEGORIES.includes(category) || (status && !PRODUCT_STATUSES.includes(status))) {
        failed.push({ company: name, error: `invalid product ${productName ?? "(no name)"}` });
        continue;
      }
      const pFields: Record<string, unknown> = { company_id: companyId, name: productName, category };
      for (const key of ["product_url", "datasheet_url"]) if (key in p) pFields[key] = str(p[key]);
      if (status) pFields.status = status;
      const deployment = strList(p.deployment);
      if (deployment) pFields.deployment = deployment;

      const { data: existingProduct } = await ctx.supabase
        .from("competitor_products")
        .select("id")
        .eq("company_id", companyId)
        .eq("category", category)
        .ilike("name", productName)
        .maybeSingle();
      const { error } = existingProduct
        ? await ctx.supabase.from("competitor_products").update(pFields).eq("id", existingProduct.id)
        : await ctx.supabase.from("competitor_products").insert(pFields);
      if (error) failed.push({ company: name, error: `${productName}: ${error.message}` });
      else productsUpserted++;
    }
  }

  return json({
    ok: true,
    created,
    updated,
    products_upserted: productsUpserted,
    failed: failed.length,
    ids,
    details: { failed },
  });
});
