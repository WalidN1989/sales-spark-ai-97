// One prospect with its leads, recent activity and open reminders.
//
// GET /functions/v1/get-prospect?id=<uuid>        or  ?company=<name>
// Auth: AGENT_API_KEY or PROSPECT_WEBHOOK_KEY.
import { authorize, fail, findCompany, gate, json, readInput, str } from "../_shared/agent.ts";

Deno.serve(async (req) => {
  const blocked = gate(req, ["GET", "POST"]);
  if (blocked) return blocked;
  const ctx = authorize(req, "PROSPECT_WEBHOOK_KEY");
  if (ctx instanceof Response) return ctx;

  const input = await readInput(req);
  const id = str(input.id);
  const company = str(input.company);
  if (!id && !company) return fail("id or company is required", 400);

  const found = await findCompany(ctx, { id, company });
  if (found.error) return fail(found.error, found.error.startsWith("More than one") ? 400 : 500);
  if (!found.row) return fail("Prospect not found", 404);
  const companyId = found.row.id as string;

  const { data: leads } = await ctx.supabase
    .from("leads")
    .select("id, contact_person, job_title, contact_email, whatsapp, phone, status, pipeline_stage, priority, next_action, next_action_due, is_primary, is_converted, last_activity_kind, last_activity_at, last_activity_note, created_at, updated_at")
    .or(`company_id.eq.${companyId},prospect_id.eq.${companyId}`)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  const leadIds = (leads ?? []).map((l) => l.id as string);
  const { data: activities } = leadIds.length
    ? await ctx.supabase
        .from("lead_activities")
        .select("id, lead_id, kind, outcome, body, created_at")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [] };

  const { data: reminders } = await ctx.supabase
    .from("reminders")
    .select("id, title, note, remind_at, status")
    .eq("entity_type", "prospect")
    .eq("entity_id", companyId)
    .eq("status", "pending")
    .order("remind_at", { ascending: true });

  return json({
    ok: true,
    prospect: found.row,
    leads: leads ?? [],
    activities: activities ?? [],
    open_reminders: reminders ?? [],
  });
});
