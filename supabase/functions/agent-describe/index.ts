// Discovery for agents: which modules exist, what each can do, and which
// function serves each capability. Served from the agent_modules table, so a
// new module appears here the moment its row is inserted.
//
// GET /functions/v1/agent-describe      Auth: AGENT_API_KEY (or any module key).
import { authorize, fail, gate, json } from "../_shared/agent.ts";

Deno.serve(async (req) => {
  const blocked = gate(req, ["GET"]);
  if (blocked) return blocked;

  // Any module key may discover; the module routes then enforce their own key.
  const ctx =
    [undefined, "PROSPECT_WEBHOOK_KEY", "PAYMENT_FOLLOWUP_API_KEY", "COMPETITOR_RESEARCH_API_KEY"]
      .map((k) => authorize(req, k as never))
      .find((r) => !(r instanceof Response));
  if (!ctx || ctx instanceof Response) return fail("Unauthorized", 401);

  const { data, error } = await ctx.supabase
    .from("agent_modules")
    .select("id, title, status, capabilities, edge_functions, legacy_key_name, notes, updated_at")
    .eq("status", "active")
    .order("sort_order", { ascending: true });
  if (error) return fail(error.message, 500);

  const base = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
  return json({
    ok: true,
    app: "Sales Insights",
    base_url: base,
    auth: {
      header: "x-api-key",
      preferred_key: "AGENT_API_KEY",
      optional_agent_name_header: "x-agent-name",
      note: "Each module's older key still works on that module's routes.",
    },
    conventions: {
      success: '{ "ok": true, ... }',
      error: '{ "ok": false, "error": "..." } with 400 validation, 401 auth, 404 missing, 500 unexpected',
      pagination: "limit (default 100, max 500) and offset on every list route",
    },
    modules: (data ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      capabilities: m.capabilities,
      routes: m.edge_functions,
      legacy_key: m.legacy_key_name,
      notes: m.notes,
    })),
  });
});
