// Update a lead. Only the fields sent are changed.
//
// POST|PATCH /functions/v1/update-lead
// { "id": "<uuid>", "patch": { ... } }
// Allowed: contact_person, job_title, contact_email, whatsapp, phone, website,
// status, pipeline_stage, priority, next_action, next_action_due (YYYY-MM-DD),
// pipeline_value_aed (converted to cents), notes, end_user_project.
// Auth: AGENT_API_KEY or PROSPECT_WEBHOOK_KEY.
import {
  authorize, fail, gate, json, LEAD_STATUSES, PIPELINE_STAGES, PRIORITIES, readInput, str,
} from "../_shared/agent.ts";

const TEXT_FIELDS = [
  "contact_person", "job_title", "contact_email", "website", "next_action", "notes", "end_user_project",
];

Deno.serve(async (req) => {
  const blocked = gate(req, ["POST", "PATCH"]);
  if (blocked) return blocked;
  const ctx = authorize(req, "PROSPECT_WEBHOOK_KEY");
  if (ctx instanceof Response) return ctx;

  const input = await readInput(req);
  const id = str(input.id);
  if (!id) return fail("id is required", 400);
  const raw = (input.patch ?? {}) as Record<string, unknown>;
  if (typeof raw !== "object" || Array.isArray(raw)) return fail("patch must be an object", 400);

  const patch: Record<string, unknown> = {};
  const ignored: string[] = [];
  for (const [field, value] of Object.entries(raw)) {
    const text = str(value);
    if (TEXT_FIELDS.includes(field)) {
      patch[field] = text;
    } else if (field === "whatsapp" || field === "phone") {
      patch[field] = text ? text.replace(/[^0-9+\-\s()]/g, "").trim() || null : null;
    } else if (field === "status") {
      if (!text || !LEAD_STATUSES.includes(text)) return fail(`status must be one of ${LEAD_STATUSES.join(", ")}`, 400);
      patch.status = text;
    } else if (field === "pipeline_stage") {
      if (text && !PIPELINE_STAGES.includes(text)) return fail(`pipeline_stage must be one of ${PIPELINE_STAGES.join(", ")}`, 400);
      patch.pipeline_stage = text;
    } else if (field === "priority") {
      if (text && !PRIORITIES.includes(text)) return fail(`priority must be one of ${PRIORITIES.join(", ")}`, 400);
      patch.priority = text;
    } else if (field === "next_action_due") {
      if (text && !/^\d{4}-\d{2}-\d{2}$/.test(text)) return fail("next_action_due must be YYYY-MM-DD", 400);
      patch.next_action_due = text;
    } else if (field === "pipeline_value_aed") {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) return fail("pipeline_value_aed must be a positive number", 400);
      patch.pipeline_value_cents = Math.round(n * 100);
    } else {
      ignored.push(field);
    }
  }
  if (!Object.keys(patch).length) {
    return fail(`Nothing to update.${ignored.length ? ` Unknown fields: ${ignored.join(", ")}` : ""}`, 400);
  }

  const { data, error } = await ctx.supabase
    .from("leads")
    .update(patch)
    .eq("id", id)
    .eq("user_id", ctx.owner)
    .select("*")
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail("Lead not found", 404);

  return json({ ok: true, updated: 1, id, lead: data, ignored });
});
