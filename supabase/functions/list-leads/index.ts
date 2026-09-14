// List pipeline leads for the agent owner.
//
// GET /functions/v1/list-leads?status=&pipeline_stage=&priority=&q=&converted=true|false|all&due_before=YYYY-MM-DD&limit=&offset=
// converted defaults to true: the Leads pipeline shows converted leads only.
// Auth: AGENT_API_KEY or PROSPECT_WEBHOOK_KEY.
import {
  authorize, fail, gate, json, LEAD_STATUSES, pageOf, PIPELINE_STAGES, PRIORITIES, readInput, str,
} from "../_shared/agent.ts";

const COLUMNS =
  "id, company_id, prospect_id, company_name, website, contact_person, job_title, contact_email, whatsapp, phone, status, pipeline_stage, priority, next_action, next_action_due, pipeline_value_cents, products_services, lead_type, is_primary, is_converted, source, last_activity_kind, last_activity_at, last_activity_note, created_at, updated_at";

Deno.serve(async (req) => {
  const blocked = gate(req, ["GET", "POST"]);
  if (blocked) return blocked;
  const ctx = authorize(req, "PROSPECT_WEBHOOK_KEY");
  if (ctx instanceof Response) return ctx;

  const input = await readInput(req);
  const { limit, offset } = pageOf(input);
  const status = str(input.status);
  const stage = str(input.pipeline_stage);
  const priority = str(input.priority);
  if (status && !LEAD_STATUSES.includes(status)) return fail(`status must be one of ${LEAD_STATUSES.join(", ")}`, 400);
  if (stage && !PIPELINE_STAGES.includes(stage)) return fail(`pipeline_stage must be one of ${PIPELINE_STAGES.join(", ")}`, 400);
  if (priority && !PRIORITIES.includes(priority)) return fail(`priority must be one of ${PRIORITIES.join(", ")}`, 400);

  let q = ctx.supabase
    .from("leads")
    .select(COLUMNS, { count: "exact" })
    .eq("user_id", ctx.owner)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const converted = str(input.converted) ?? "true";
  if (converted !== "all") q = q.eq("is_converted", converted !== "false");
  if (status) q = q.eq("status", status);
  if (stage) q = q.eq("pipeline_stage", stage);
  if (priority) q = q.eq("priority", priority);
  const dueBefore = str(input.due_before);
  if (dueBefore) q = q.lte("next_action_due", dueBefore);
  // Commas and parentheses are PostgREST filter syntax; strip them from free text.
  const text = str(input.q)?.replace(/[,()%*]/g, " ").trim() || null;
  if (text) q = q.or(`company_name.ilike.%${text}%,contact_person.ilike.%${text}%,contact_email.ilike.%${text}%`);

  const { data, error, count } = await q;
  if (error) return fail(error.message, 500);
  return json({ ok: true, count: data?.length ?? 0, total: count ?? 0, limit, offset, leads: data ?? [] });
});
