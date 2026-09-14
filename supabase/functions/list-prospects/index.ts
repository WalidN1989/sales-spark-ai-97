// List prospects (companies) for the agent owner, with the primary lead's
// last-activity rollup so an agent can tell worked from untouched.
//
// GET  /functions/v1/list-prospects?product_service=&country=&industry=&status=&q=&has_activity=true|false&limit=&offset=
// POST same fields as JSON.
// Auth: AGENT_API_KEY or PROSPECT_WEBHOOK_KEY.
import { authorize, COMPANY_STATUSES, fail, gate, json, pageOf, readInput, str } from "../_shared/agent.ts";

const COLUMNS =
  "id, name, domain, country, industry, contact_person, email, phone, mobile, product_service, status, status_updated_at, is_reseller, employee_count, linkedin_url, created_at, updated_at";

Deno.serve(async (req) => {
  const blocked = gate(req, ["GET", "POST"]);
  if (blocked) return blocked;
  const ctx = authorize(req, "PROSPECT_WEBHOOK_KEY");
  if (ctx instanceof Response) return ctx;

  const input = await readInput(req);
  const { limit, offset } = pageOf(input);
  const status = str(input.status);
  if (status && !COMPANY_STATUSES.includes(status)) {
    return fail(`status must be one of ${COMPANY_STATUSES.join(", ")}`, 400);
  }

  let q = ctx.supabase
    .from("companies")
    .select(COLUMNS, { count: "exact" })
    .eq("user_id", ctx.owner)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const product = str(input.product_service);
  const country = str(input.country);
  const industry = str(input.industry);
  // Commas and parentheses are PostgREST filter syntax; strip them from free text.
  const text = str(input.q)?.replace(/[,()%*]/g, " ").trim() || null;
  if (product) q = q.ilike("product_service", `%${product}%`);
  if (country) q = q.ilike("country", country);
  if (industry) q = q.ilike("industry", `%${industry}%`);
  if (status) q = q.eq("status", status);
  if (text) q = q.or(`name.ilike.%${text}%,domain.ilike.%${text}%,contact_person.ilike.%${text}%`);

  const { data, error, count } = await q;
  if (error) return fail(error.message, 500);
  const companies = (data ?? []) as Record<string, unknown>[];

  // One query for every company's leads, reduced to the primary lead's rollup.
  const ids = companies.map((c) => c.id as string);
  const activity = new Map<string, Record<string, unknown>>();
  if (ids.length) {
    const { data: leads } = await ctx.supabase
      .from("leads")
      .select("id, company_id, prospect_id, is_primary, status, pipeline_stage, last_activity_kind, last_activity_at, created_at")
      .or(`company_id.in.(${ids.join(",")}),prospect_id.in.(${ids.join(",")})`)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    for (const lead of (leads ?? []) as Record<string, unknown>[]) {
      const companyId = (lead.company_id ?? lead.prospect_id) as string;
      if (!activity.has(companyId)) activity.set(companyId, lead);
    }
  }

  const hasActivity = str(input.has_activity);
  let rows = companies.map((c) => {
    const lead = activity.get(c.id as string);
    return {
      ...c,
      primary_lead_id: lead?.id ?? null,
      lead_status: lead?.status ?? null,
      pipeline_stage: lead?.pipeline_stage ?? null,
      last_activity_kind: lead?.last_activity_kind ?? null,
      last_activity_at: lead?.last_activity_at ?? null,
      has_activity: Boolean(lead?.last_activity_at),
    };
  });
  // Applied after the page is fetched, so it narrows the page rather than the
  // count. Documented: use activity_summary for exact gate numbers.
  if (hasActivity === "true") rows = rows.filter((r) => r.has_activity);
  if (hasActivity === "false") rows = rows.filter((r) => !r.has_activity);

  return json({ ok: true, count: rows.length, total: count ?? rows.length, limit, offset, prospects: rows });
});
