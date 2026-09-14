// Update a prospect (companies row). Only the fields sent are changed; send an
// empty string to clear a text field.
//
// POST|PATCH /functions/v1/update-prospect
// { "id": "<uuid>" | "company": "<name>", "patch": { ... } }
// Allowed patch fields: name, domain, country, industry, contact_person, email,
// phone, mobile, product_service, address, status, is_reseller, employee_count,
// linkedin_url.
// Auth: AGENT_API_KEY or PROSPECT_WEBHOOK_KEY.
import { authorize, COMPANY_STATUSES, fail, findCompany, gate, json, readInput, str } from "../_shared/agent.ts";

const TEXT_FIELDS = [
  "name", "domain", "country", "industry", "contact_person", "email",
  "phone", "mobile", "product_service", "address", "linkedin_url",
];

Deno.serve(async (req) => {
  const blocked = gate(req, ["POST", "PATCH"]);
  if (blocked) return blocked;
  const ctx = authorize(req, "PROSPECT_WEBHOOK_KEY");
  if (ctx instanceof Response) return ctx;

  const input = await readInput(req);
  const raw = (input.patch ?? {}) as Record<string, unknown>;
  if (typeof raw !== "object" || Array.isArray(raw)) return fail("patch must be an object", 400);

  const patch: Record<string, unknown> = {};
  const ignored: string[] = [];
  for (const [field, value] of Object.entries(raw)) {
    if (TEXT_FIELDS.includes(field)) {
      patch[field] = str(value);
    } else if (field === "status") {
      const status = str(value);
      if (!status || !COMPANY_STATUSES.includes(status)) {
        return fail(`status must be one of ${COMPANY_STATUSES.join(", ")}`, 400);
      }
      patch.status = status;
      patch.status_updated_at = new Date().toISOString();
    } else if (field === "is_reseller") {
      patch.is_reseller = value === true || value === "true";
    } else if (field === "employee_count") {
      const n = Number(value);
      patch.employee_count = value === null || value === "" ? null : Number.isFinite(n) ? Math.round(n) : null;
    } else {
      ignored.push(field);
    }
  }
  if (patch.name === null) return fail("name cannot be empty", 400);
  if (!Object.keys(patch).length) {
    return fail(`Nothing to update.${ignored.length ? ` Unknown fields: ${ignored.join(", ")}` : ""}`, 400);
  }

  const found = await findCompany(ctx, { id: str(input.id), company: str(input.company) }, "id, name");
  if (found.error) return fail(found.error, found.error.startsWith("More than one") ? 400 : 500);
  if (!found.row) return fail("Prospect not found", 404);

  const { data, error } = await ctx.supabase
    .from("companies")
    .update(patch)
    .eq("id", found.row.id as string)
    .eq("user_id", ctx.owner)
    .select("*")
    .single();
  if (error) return fail(error.message, 500);

  return json({ ok: true, updated: 1, id: data.id, prospect: data, ignored });
});
