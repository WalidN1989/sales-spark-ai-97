// One lead with its activity journal and open reminders.
//
// GET /functions/v1/get-lead?id=<uuid>
// Auth: AGENT_API_KEY or PROSPECT_WEBHOOK_KEY.
import { authorize, fail, gate, json, readInput, str } from "../_shared/agent.ts";

Deno.serve(async (req) => {
  const blocked = gate(req, ["GET", "POST"]);
  if (blocked) return blocked;
  const ctx = authorize(req, "PROSPECT_WEBHOOK_KEY");
  if (ctx instanceof Response) return ctx;

  const input = await readInput(req);
  const id = str(input.id);
  if (!id) return fail("id is required", 400);

  const { data: lead, error } = await ctx.supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("user_id", ctx.owner)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!lead) return fail("Lead not found", 404);

  const [{ data: activities }, { data: reminders }] = await Promise.all([
    ctx.supabase
      .from("lead_activities")
      .select("id, kind, outcome, body, created_at")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    ctx.supabase
      .from("reminders")
      .select("id, title, note, remind_at, status")
      .eq("entity_type", "lead")
      .eq("entity_id", id)
      .eq("status", "pending")
      .order("remind_at", { ascending: true }),
  ]);

  return json({ ok: true, lead, activities: activities ?? [], open_reminders: reminders ?? [] });
});
