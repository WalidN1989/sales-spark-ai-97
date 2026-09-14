// Log an activity (call, WhatsApp, email, visit, meeting, note ...) against a
// prospect or a lead, with an optional outcome and follow-up reminder.
//
// The Activity Journal reads lead_activities, which is keyed by lead. So for a
// prospect this resolves the company's primary lead, creating one if none
// exists yet, exactly as log-quote-activity does. Pass lead_id to log straight
// onto a specific lead.
//
// POST /functions/v1/log-prospect-activity
// {
//   "company_id": "<uuid>" | "company": "<name>" | "lead_id": "<uuid>",
//   "kind": "call",                 // note|email|call|meeting|log|whatsapp|quotation|visit
//   "body": "Spoke to facilities manager, wants a demo",
//   "outcome": "interested",        // optional, see agent-describe docs
//   "followup_hours": 48            // optional; creates a pending reminder
// }
// Auth: AGENT_API_KEY or PROSPECT_WEBHOOK_KEY.
import {
  ACTIVITY_KINDS, ACTIVITY_OUTCOMES, authorize, fail, findCompany, gate, json, primaryLead, readInput, str,
} from "../_shared/agent.ts";

Deno.serve(async (req) => {
  const blocked = gate(req, ["POST"]);
  if (blocked) return blocked;
  const ctx = authorize(req, "PROSPECT_WEBHOOK_KEY");
  if (ctx instanceof Response) return ctx;

  const input = await readInput(req);
  const kind = str(input.kind) ?? "note";
  if (!ACTIVITY_KINDS.includes(kind)) return fail(`kind must be one of ${ACTIVITY_KINDS.join(", ")}`, 400);
  const outcome = str(input.outcome);
  if (outcome && !ACTIVITY_OUTCOMES.includes(outcome)) {
    return fail(`outcome must be one of ${ACTIVITY_OUTCOMES.join(", ")}`, 400);
  }
  const body = str(input.body);
  if (!body) return fail("body is required", 400);

  let leadId = str(input.lead_id);
  let entity: { type: "lead" | "prospect"; id: string; label: string } | null = null;

  if (leadId) {
    const { data: lead, error } = await ctx.supabase
      .from("leads")
      .select("id, company_name, contact_person")
      .eq("id", leadId)
      .eq("user_id", ctx.owner)
      .maybeSingle();
    if (error) return fail(error.message, 500);
    if (!lead) return fail("Lead not found", 404);
    entity = { type: "lead", id: leadId, label: (lead.company_name ?? lead.contact_person ?? "Lead") as string };
  } else {
    const found = await findCompany(
      ctx,
      { id: str(input.company_id), company: str(input.company) },
      "id, name, domain, contact_person, email, phone, mobile, product_service",
    );
    if (found.error) return fail(found.error, found.error.startsWith("More than one") ? 400 : 500);
    if (!found.row) return fail("Prospect not found (pass company_id, company or lead_id)", 404);
    const company = found.row;
    const companyId = company.id as string;
    entity = { type: "prospect", id: companyId, label: company.name as string };

    const lead = await primaryLead(ctx, companyId);
    if (lead) {
      leadId = lead.id as string;
    } else {
      const phone = ((company.mobile ?? company.phone ?? "") as string).replace(/[^0-9+\-\s()]/g, "").trim() || null;
      const { data: created, error } = await ctx.supabase
        .from("leads")
        .insert({
          user_id: ctx.owner,
          company_id: companyId,
          company_name: company.name,
          website: company.domain,
          contact_person: company.contact_person ?? company.name,
          contact_email: company.email,
          whatsapp: phone,
          phone,
          products_services: company.product_service ? [String(company.product_service).slice(0, 80)] : [],
          status: "warm",
          is_primary: true,
          // Created only to carry the journal; not a deliberate conversion.
          is_converted: false,
          source: "auto",
        })
        .select("id")
        .single();
      if (error) return fail(error.message, 500);
      leadId = created.id as string;
    }
  }

  const { data: activity, error: actErr } = await ctx.supabase
    .from("lead_activities")
    .insert({ lead_id: leadId, user_id: ctx.owner, kind, body, outcome })
    .select("id, created_at")
    .single();
  if (actErr) return fail(actErr.message, 500);

  // Touch the prospect so it sorts to the top of the list it came from.
  if (entity.type === "prospect") {
    await ctx.supabase.from("companies").update({ updated_at: new Date().toISOString() }).eq("id", entity.id);
  }

  let reminderId: string | null = null;
  const hours = Number(input.followup_hours);
  if (Number.isFinite(hours) && hours > 0) {
    const { data: reminder, error: remErr } = await ctx.supabase
      .from("reminders")
      .insert({
        user_id: ctx.owner,
        title: `Follow up — ${entity.label}`,
        note: body.slice(0, 200),
        remind_at: new Date(Date.now() + hours * 3_600_000).toISOString(),
        entity_type: entity.type,
        entity_id: entity.id,
        entity_label: entity.label,
        status: "pending",
      })
      .select("id")
      .single();
    if (remErr) return fail(remErr.message, 500);
    reminderId = reminder.id as string;
  }

  return json({
    ok: true,
    lead_id: leadId,
    activity_id: activity.id,
    created_at: activity.created_at,
    reminder_id: reminderId,
    logged_by: ctx.agentName,
  });
});
