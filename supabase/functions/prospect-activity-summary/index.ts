// Activity fill-rate for a slice of prospects, for gate logic such as the
// Monday Canteen gate.
//
// GET /functions/v1/prospect-activity-summary?product_service=Canteen%20Management%20System&country=UAE
//     optional: industry, since=<ISO date>  (only count activity on/after it)
//
// Rules, stated once:
//   with_activity            prospects whose leads carry at least one activity
//   positive_activity_count  activities with a positive outcome, or of kind
//                            meeting / quotation / visit
//   fill_rate_pct            round(with_activity / total * 100), 0 when total is 0
//   gate_open                fill_rate_pct >= 50 AND positive_activity_count >= 1
//
// Positive outcomes are the ones the database allows that mean progress:
// interested, need_quotation, decision_pending, won. The app has no
// "callback" / "demo" / "quote_sent" outcomes; a demo or a quote is logged as
// kind meeting / quotation, which is why those kinds also count.
//
// Auth: AGENT_API_KEY or PROSPECT_WEBHOOK_KEY.
import { authorize, fail, gate, json, POSITIVE_OUTCOMES, readInput, str } from "../_shared/agent.ts";

const POSITIVE_KINDS = ["meeting", "quotation", "visit"];
const FILL_RATE_THRESHOLD = 50;

Deno.serve(async (req) => {
  const blocked = gate(req, ["GET", "POST"]);
  if (blocked) return blocked;
  const ctx = authorize(req, "PROSPECT_WEBHOOK_KEY");
  if (ctx instanceof Response) return ctx;

  const input = await readInput(req);
  const product = str(input.product_service);
  const country = str(input.country);
  const industry = str(input.industry);
  const since = str(input.since);
  if (since && Number.isNaN(Date.parse(since))) return fail("since must be an ISO date", 400);

  let q = ctx.supabase.from("companies").select("id, name").eq("user_id", ctx.owner).limit(5000);
  if (product) q = q.ilike("product_service", `%${product}%`);
  if (country) q = q.ilike("country", country);
  if (industry) q = q.ilike("industry", `%${industry}%`);
  const { data: companies, error } = await q;
  if (error) return fail(error.message, 500);

  const byId = new Map((companies ?? []).map((c) => [c.id as string, c.name as string]));
  const total = byId.size;
  const touched = new Set<string>();
  let positive = 0;
  const sampled: { company_id: string; company: string; kind: string; outcome: string | null; at: string }[] = [];

  const ids = [...byId.keys()];
  // Chunked: a long IN list overflows the request URL.
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    const { data: leads, error: leadErr } = await ctx.supabase
      .from("leads")
      .select("id, company_id, prospect_id")
      .or(`company_id.in.(${chunk.join(",")}),prospect_id.in.(${chunk.join(",")})`);
    if (leadErr) return fail(leadErr.message, 500);
    const leadToCompany = new Map(
      (leads ?? []).map((l) => [l.id as string, (l.company_id ?? l.prospect_id) as string]),
    );
    if (!leadToCompany.size) continue;

    let aq = ctx.supabase
      .from("lead_activities")
      .select("lead_id, kind, outcome, created_at")
      .in("lead_id", [...leadToCompany.keys()])
      .order("created_at", { ascending: false });
    if (since) aq = aq.gte("created_at", since);
    const { data: activities, error: actErr } = await aq;
    if (actErr) return fail(actErr.message, 500);

    for (const a of activities ?? []) {
      const companyId = leadToCompany.get(a.lead_id as string);
      if (!companyId || !byId.has(companyId)) continue;
      touched.add(companyId);
      const isPositive =
        POSITIVE_OUTCOMES.includes((a.outcome ?? "") as string) || POSITIVE_KINDS.includes(a.kind as string);
      if (isPositive) {
        positive++;
        if (sampled.length < 10) {
          sampled.push({
            company_id: companyId,
            company: byId.get(companyId) ?? "",
            kind: a.kind as string,
            outcome: (a.outcome ?? null) as string | null,
            at: a.created_at as string,
          });
        }
      }
    }
  }

  const fillRate = total === 0 ? 0 : Math.round((touched.size / total) * 100);
  return json({
    ok: true,
    filters: { product_service: product, country, industry, since },
    total,
    with_activity: touched.size,
    without_activity: total - touched.size,
    fill_rate_pct: fillRate,
    positive_activity_count: positive,
    gate_open: fillRate >= FILL_RATE_THRESHOLD && positive >= 1,
    gate_rule: `gate_open = fill_rate_pct >= ${FILL_RATE_THRESHOLD} AND positive_activity_count >= 1`,
    positive_rule: {
      outcomes: POSITIVE_OUTCOMES,
      kinds: POSITIVE_KINDS,
    },
    sampled,
  });
});
