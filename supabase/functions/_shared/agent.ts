// Shared plumbing for every agent-facing Edge Function.
//
// One credential for agents: AGENT_API_KEY. Each module's older key keeps
// working on the routes it always worked on, so nothing Grok has today breaks
// while it moves over. A route says which module key it also accepts.
//
// Rows an agent writes belong to PROSPECT_WEBHOOK_USER_ID, the same owner the
// existing webhooks use, so the UI (manager sees all) and the agent (filters on
// that owner) always agree on what exists.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, x-agent-name, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });

export const fail = (error: string, status: number) => json({ ok: false, error }, status);

export const str = (v: unknown): string | null => {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
};

export type AgentContext = {
  supabase: SupabaseClient;
  owner: string;
  /** From x-agent-name, for audit columns that exist (e.g. researcher). */
  agentName: string | null;
};

type ModuleKey =
  | "PROSPECT_WEBHOOK_KEY"
  | "PAYMENT_FOLLOWUP_API_KEY"
  | "COMPETITOR_RESEARCH_API_KEY";

/**
 * Authenticate an agent request. Returns a context or a ready Response.
 *
 * Accepts AGENT_API_KEY, or the module key named by the route. Missing or wrong
 * key is 401; a route whose secrets are not set is 500, so a misconfiguration
 * is never mistaken for a bad key.
 */
export function authorize(
  req: Request,
  moduleKey?: ModuleKey,
): AgentContext | Response {
  const agentKey = Deno.env.get("AGENT_API_KEY");
  const routeKey = moduleKey ? Deno.env.get(moduleKey) : undefined;
  const owner = Deno.env.get("PROSPECT_WEBHOOK_USER_ID");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if ((!agentKey && !routeKey) || !owner || !url || !serviceKey) {
    return fail("Function not fully configured", 500);
  }

  const presented =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const valid =
    (agentKey && presented === agentKey) || (routeKey && presented === routeKey);
  if (!valid) return fail("Unauthorized", 401);

  return {
    supabase: createClient(url, serviceKey),
    owner,
    agentName: str(req.headers.get("x-agent-name"))?.slice(0, 80) ?? null,
  };
}

/** Preflight and method gate in one line. Returns a Response to send, or null. */
export function gate(req: Request, methods: string[]): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!methods.includes(req.method)) return fail(`Use ${methods.join(" or ")}`, 405);
  return null;
}

/** Query params for GET, JSON body for POST/PATCH, merged into one record. */
export async function readInput(req: Request): Promise<Record<string, unknown>> {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  if (req.method === "GET" || req.method === "DELETE") return params;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    return { ...params, ...(body && typeof body === "object" ? body : {}) };
  } catch {
    return params;
  }
}

export function pageOf(input: Record<string, unknown>, defaultLimit = 100, max = 500) {
  const limit = Math.min(max, Math.max(1, Number(input.limit) || defaultLimit));
  const offset = Math.max(0, Number(input.offset) || 0);
  return { limit, offset };
}

// Vocabulary the DB enforces. Kept here so every route validates the same way
// and the docs can quote one list.
export const ACTIVITY_KINDS = ["note", "email", "call", "meeting", "log", "whatsapp", "quotation", "visit"];
export const ACTIVITY_OUTCOMES = [
  "interested", "waiting", "not_interested", "need_quotation", "need_followup",
  "decision_pending", "lost", "won", "no_response", "ignoring",
];
/** Outcomes that count as a positive signal for gate logic. */
export const POSITIVE_OUTCOMES = ["interested", "need_quotation", "decision_pending", "won"];
export const COMPANY_STATUSES = ["hot", "warm", "cold", "won", "lost"];
export const LEAD_STATUSES = ["hot", "warm", "cold", "frozen", "dead", "won"];
export const PIPELINE_STAGES = [
  "prospect", "qualified", "meeting", "quotation", "negotiation", "purchase_order", "won", "lost",
];
export const PRIORITIES = ["critical", "high", "medium", "low"];

/** Split a messy phone string into clean numbers; first is the mobile. */
export const extractNumbers = (raw: string | null): string[] => {
  if (!raw) return [];
  let s = String(raw).replace(/\b(?:ext|extension|x)\b\.?:?\s*\d+/gi, " ");
  s = s.replace(/(?!^)\s*\+/g, " |+");
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of s.split(/[|/,;\n]+|\s{2,}/)) {
    const cleaned = part.replace(/[^\d+]/g, "");
    const digits = cleaned.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) continue;
    const val = (cleaned.startsWith("+") ? "+" : "") + digits;
    if (!seen.has(val)) {
      seen.add(val);
      out.push(val);
    }
  }
  return out;
};

/**
 * Find a company for this owner by id, or by name (exact, case-insensitive,
 * then a contains match if exactly one row matches).
 */
export async function findCompany(
  ctx: AgentContext,
  ref: { id?: string | null; company?: string | null },
  columns = "*",
): Promise<{ row: Record<string, unknown> | null; error: string | null }> {
  if (ref.id) {
    const { data, error } = await ctx.supabase
      .from("companies").select(columns).eq("id", ref.id).eq("user_id", ctx.owner).maybeSingle();
    return { row: (data as unknown as Record<string, unknown> | null) ?? null, error: error?.message ?? null };
  }
  if (ref.company) {
    const exact = await ctx.supabase
      .from("companies").select(columns).eq("user_id", ctx.owner).ilike("name", ref.company).limit(2);
    if (exact.error) return { row: null, error: exact.error.message };
    if (exact.data?.length === 1) return { row: exact.data[0] as unknown as Record<string, unknown>, error: null };
    const loose = await ctx.supabase
      .from("companies").select(columns).eq("user_id", ctx.owner).ilike("name", `%${ref.company}%`).limit(2);
    if (loose.error) return { row: null, error: loose.error.message };
    if (loose.data?.length === 1) return { row: loose.data[0] as unknown as Record<string, unknown>, error: null };
    if ((loose.data?.length ?? 0) > 1) return { row: null, error: "More than one company matches that name; pass id" };
  }
  return { row: null, error: null };
}

/** The company's primary lead (or oldest), or null. */
export async function primaryLead(ctx: AgentContext, companyId: string, columns = "id") {
  const { data } = await ctx.supabase
    .from("leads")
    .select(columns)
    .or(`company_id.eq.${companyId},prospect_id.eq.${companyId}`)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);
  return (data?.[0] as unknown as Record<string, unknown> | undefined) ?? null;
}
