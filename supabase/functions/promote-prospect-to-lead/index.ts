// Deliberately convert a prospect into a pipeline lead, as "Promote to Lead"
// does in the UI. Idempotent: an existing lead for the company is returned and
// marked converted instead of creating a second one.
//
// POST /functions/v1/promote-prospect-to-lead
// { "company_id": "<uuid>" | "company": "<name>",
//   "contact_person"?, "job_title"?, "contact_email"?, "whatsapp"?, "phone"?,
//   "pipeline_stage"?, "priority"?, "next_action"?, "next_action_due"? (YYYY-MM-DD) }
// Phone is never required.
// Auth: AGENT_API_KEY or PROSPECT_WEBHOOK_KEY.
import {
  authorize, extractNumbers, fail, findCompany, gate, json, PIPELINE_STAGES, PRIORITIES, primaryLead, readInput, str,
} from "../_shared/agent.ts";

Deno.serve(async (req) => {
  const blocked = gate(req, ["POST"]);
  if (blocked) return blocked;
  const ctx = authorize(req, "PROSPECT_WEBHOOK_KEY");
  if (ctx instanceof Response) return ctx;

  const input = await readInput(req);
  const stage = str(input.pipeline_stage);
  if (stage && !PIPELINE_STAGES.includes(stage)) return fail(`pipeline_stage must be one of ${PIPELINE_STAGES.join(", ")}`, 400);
  const priority = str(input.priority);
  if (priority && !PRIORITIES.includes(priority)) return fail(`priority must be one of ${PRIORITIES.join(", ")}`, 400);
  const due = str(input.next_action_due);
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return fail("next_action_due must be YYYY-MM-DD", 400);

  const found = await findCompany(
    ctx,
    { id: str(input.company_id), company: str(input.company) },
    "id, name, domain, contact_person, email, phone, mobile, product_service",
  );
  if (found.error) return fail(found.error, found.error.startsWith("More than one") ? 400 : 500);
  if (!found.row) return fail("Prospect not found", 404);
  const company = found.row;
  const companyId = company.id as string;

  const numbers = extractNumbers(str(input.whatsapp) ?? str(input.phone) ?? ((company.mobile ?? company.phone) as string | null));
  const optional: Record<string, unknown> = {};
  if (stage) optional.pipeline_stage = stage;
  if (priority) optional.priority = priority;
  if (str(input.next_action)) optional.next_action = str(input.next_action);
  if (due) optional.next_action_due = due;
  if (str(input.job_title)) optional.job_title = str(input.job_title);

  const existing = await primaryLead(ctx, companyId, "id, is_converted");
  if (existing) {
    const { error } = await ctx.supabase
      .from("leads")
      .update({ is_converted: true, ...optional })
      .eq("id", existing.id as string);
    if (error) return fail(error.message, 500);
    return json({ ok: true, created: false, lead_id: existing.id, was_converted: existing.is_converted === true });
  }

  const { data, error } = await ctx.supabase
    .from("leads")
    .insert({
      user_id: ctx.owner,
      company_id: companyId,
      company_name: company.name,
      website: company.domain,
      contact_person: str(input.contact_person) ?? company.contact_person ?? company.name,
      contact_email: str(input.contact_email) ?? company.email,
      whatsapp: numbers[0] ?? null,
      phone: numbers[1] ?? numbers[0] ?? null,
      products_services: company.product_service ? [String(company.product_service).slice(0, 80)] : [],
      status: "warm",
      pipeline_stage: stage ?? "prospect",
      is_primary: true,
      is_converted: true,
      source: "agent",
      ...optional,
    })
    .select("id")
    .single();
  if (error) return fail(error.message, 500);

  return json({ ok: true, created: true, lead_id: data.id });
});
