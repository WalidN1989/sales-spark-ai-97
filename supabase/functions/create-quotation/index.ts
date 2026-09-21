// create-quotation — one agent call builds a priced quotation from the price
// list, linked to the right lead, and syncs the CRM.
//
// POST /functions/v1/create-quotation
// Auth: x-api-key = AGENT_API_KEY (or PROSPECT_WEBHOOK_KEY). Rows belong to
//       PROSPECT_WEBHOOK_USER_ID. No migration needed beyond quotations.
//
// Body:
//   Target (one of):
//     lead_id      — link to this exact lead
//     company_id   — link to this prospect (its contact / primary lead)
//     company      — a name; matched against EVERY existing prospect and lead
//                    (fuzzy: legal forms, spaces, a typo, "Blue Ocean" ≈
//                    "BlueOcean Technologies & Trading DMCC"). A new prospect +
//                    lead is created ONLY when nothing matches. Two different
//                    matches → 409 with candidates; retry with lead_id/company_id.
//     contact_name, email, phone, website, country, industry, product_service
//                  — used to pick the contact at that company, fill blanks, or
//                    create the prospect.
//   items: [{ part_number? | query? | description?, qty?, unit_price? }]
//     part_number → exact price-list match; query → best price-list search
//     match; unit_price (AED) overrides the list price or prices a custom line.
//   currency (AED|USD|OMR|QAR, default AED), exchange_rate (1 AED = rate ×
//   currency; default the app's rate), vat_rate (default 5), ddp {enabled,
//   boq_fixed, per_kg, per_unit, weight}, notes, status (default draft)
//   dry_run: true → price only; nothing is written (no quote, no prospect).
//
// Pricing runs BEFORE anything is written: if a line can't be priced the call
// fails with 422 + suggestions and no prospect/lead/quote is created.
//
// On save, the lead is synced exactly like the in-app editor: Activity Journal
// entry (kind `quotation`, bumps last activity), stage → Quotation (forward
// only), empty pipeline value → ex-VAT AED total, quoted products merged into
// Products interested, and a prospect is converted into Leads.
import {
  authorize,
  extractNumbers,
  fail,
  gate,
  json,
  readInput,
  str,
  type AgentContext,
} from "../_shared/agent.ts";
import {
  CURRENCIES,
  DEFAULT_RATES,
  categoryBucket,
  computeQuoteTotals,
  fmtMoney,
  type DdpConfig,
} from "../_shared/quote.ts";
import { matchCompany, type NameMatch } from "../_shared/dedupe.ts";

const APP_URL = (Deno.env.get("APP_URL") ?? "https://leads.deepinsights.space").replace(/\/$/, "");
const STATUSES = ["draft", "sent", "accepted", "rejected"];
const PRE_QUOTE_STAGES = new Set<string | null>([null, "", "prospect", "qualified", "meeting"]);
const PRODUCT_COLS = "id, name, part_number, brand, category, selling_price_cents";
const LEAD_COLS =
  "id, company_id, prospect_id, company_name, contact_person, contact_email, whatsapp, assigned_to, is_converted, is_primary, created_at";

type Product = {
  id: string;
  name: string;
  part_number: string | null;
  brand: string | null;
  category: string | null;
  selling_price_cents: number | null;
};
type Lead = {
  id: string;
  company_id: string | null;
  prospect_id: string | null;
  company_name: string | null;
  contact_person: string | null;
  contact_email: string | null;
  whatsapp: string | null;
  assigned_to: string | null;
  is_converted: boolean | null;
  is_primary: boolean | null;
  created_at: string | null;
};
type Company = { id: string; name: string | null; contact_person: string | null };

type Line = {
  product_id: string | null;
  part_number: string | null;
  description: string;
  qty: number;
  unit_price_cents: number; // AED base
  matched_by: "part_number" | "search" | "custom";
  brand: string | null;
  category: string | null;
  alternatives: Array<{ part_number: string | null; name: string; price_aed: string | null }>;
};

const num = (v: unknown, dflt: number) => {
  if (v === null || v === undefined || v === "") return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const squash = (v: string | null | undefined) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const likeEscape = (v: string) => v.replace(/[\\%_]/g, (m) => `\\${m}`);
const brief = (p: Product) => ({
  part_number: p.part_number,
  name: p.name,
  price_aed: p.selling_price_cents != null ? fmtMoney(p.selling_price_cents) : null,
});

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

async function searchProducts(ctx: AgentContext, q: string): Promise<{ full: Product[]; partial: Product[] }> {
  const tokens = q.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  if (!tokens.length) return { full: [], partial: [] };
  const probe = [...tokens].sort((a, b) => b.length - a.length)[0]; // most selective, alnum-only
  const { data } = await ctx.supabase
    .from("products")
    .select(PRODUCT_COLS)
    .or(`name.ilike.%${probe}%,part_number.ilike.%${probe}%,brand.ilike.%${probe}%`)
    .limit(100);
  const qs = squash(q);
  const scored = ((data ?? []) as Product[])
    .map((p) => {
      const hay = squash(`${p.name} ${p.part_number ?? ""} ${p.brand ?? ""}`);
      const hits = tokens.filter((t) => hay.includes(t)).length;
      const exact = squash(p.part_number) === qs || squash(p.name) === qs;
      return { p, hits, exact };
    })
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.hits - a.hits || a.p.name.length - b.p.name.length);
  return {
    full: scored.filter((s) => s.hits === tokens.length).map((s) => s.p),
    partial: scored.filter((s) => s.hits > 0).map((s) => s.p),
  };
}

async function priceItems(ctx: AgentContext, raw: unknown[]) {
  const lines: Line[] = [];
  const problems: Array<{ index: number; input: string | null; reason: string; suggestions?: unknown[] }> = [];

  for (let i = 0; i < raw.length; i++) {
    const it = (raw[i] ?? {}) as Record<string, unknown>;
    const part = str(it.part_number);
    const query = str(it.query);
    const desc = str(it.description);
    const qty = num(it.qty, 1);
    const override = num(it.unit_price, NaN);
    const label = part ?? query ?? desc;

    if (!part && !query && !desc) {
      problems.push({ index: i, input: null, reason: "each item needs part_number, query or description" });
      continue;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      problems.push({ index: i, input: label, reason: "qty must be a number greater than 0" });
      continue;
    }
    if (it.unit_price !== undefined && it.unit_price !== null && it.unit_price !== "" && !(override >= 0)) {
      problems.push({ index: i, input: label, reason: "unit_price must be a number ≥ 0 (AED)" });
      continue;
    }

    let product: Product | null = null;
    let matchedBy: Line["matched_by"] = "custom";
    let alternatives: Product[] = [];
    let suggestions: Product[] = [];

    if (part) {
      const { data } = await ctx.supabase
        .from("products")
        .select(PRODUCT_COLS)
        .ilike("part_number", likeEscape(part))
        .limit(5);
      const exact = (data ?? []) as Product[];
      if (exact.length) {
        product = exact[0];
        matchedBy = "part_number";
        alternatives = exact.slice(1);
      }
    }
    // Search by query / part number, or by the description when no price was
    // given (a priced custom line is taken as-is, not linked to a product).
    const searchTerm = query ?? part ?? (Number.isFinite(override) ? null : desc);
    if (!product && searchTerm) {
      const { full, partial } = await searchProducts(ctx, searchTerm);
      if (full.length) {
        product = full[0];
        matchedBy = "search";
        alternatives = full.slice(1, 4);
      } else {
        suggestions = partial.slice(0, 5);
      }
    }

    const unitCents = Number.isFinite(override)
      ? Math.round(override * 100)
      : product?.selling_price_cents ?? null;

    if (unitCents == null) {
      problems.push({
        index: i,
        input: label,
        reason: product
          ? `"${product.part_number ?? product.name}" has no selling price in the price list — pass unit_price (AED)`
          : "no price-list product matched — pass a part_number, a more specific query, or description + unit_price",
        suggestions: (product ? [] : suggestions).map(brief),
      });
      continue;
    }

    lines.push({
      product_id: product?.id ?? null,
      part_number: product?.part_number ?? part ?? null,
      description: desc ?? product?.name ?? query ?? part ?? "Item",
      qty,
      unit_price_cents: unitCents,
      matched_by: product ? matchedBy : "custom",
      brand: product?.brand ?? null,
      category: product?.category ?? null,
      alternatives: alternatives.map(brief),
    });
  }
  return { lines, problems };
}

// ---------------------------------------------------------------------------
// Target resolution — never duplicate a prospect
// ---------------------------------------------------------------------------

const RANK: Record<Exclude<NameMatch, null>, number> = { exact: 3, near: 2, prefix: 1 };

type Resolved = {
  lead: Lead | null; // null only in dry_run when a new prospect would be created
  company: Company | null;
  resolved: "lead_id" | "company_id" | "existing_prospect" | "existing_lead" | "created" | "would_create";
  match?: { level: NameMatch; name: string | null };
};

function pickContact(leads: Lead[], contact: string | null): Lead | null {
  if (!leads.length) return null;
  if (contact) {
    const c = squash(contact);
    const hit = leads.find((l) => {
      const p = squash(l.contact_person);
      return p && (p === c || p.includes(c) || c.includes(p));
    });
    if (hit) return hit;
  }
  return (
    [...leads].sort(
      (a, b) =>
        Number(!!b.is_primary) - Number(!!a.is_primary) ||
        Number(!!b.is_converted) - Number(!!a.is_converted) ||
        (a.created_at ?? "").localeCompare(b.created_at ?? ""),
    )[0] ?? null
  );
}

async function leadsOfCompany(ctx: AgentContext, companyId: string): Promise<Lead[]> {
  const { data } = await ctx.supabase
    .from("leads")
    .select(LEAD_COLS)
    .or(`company_id.eq.${companyId},prospect_id.eq.${companyId}`)
    .limit(200);
  return (data ?? []) as Lead[];
}

async function createPrimaryLead(ctx: AgentContext, company: Company, input: Record<string, unknown>): Promise<Lead> {
  const nums = extractNumbers(str(input.phone));
  const { data, error } = await ctx.supabase
    .from("leads")
    .insert({
      user_id: ctx.owner,
      assigned_to: ctx.owner,
      company_id: company.id,
      company_name: company.name,
      website: str(input.website),
      contact_person: str(input.contact_name) ?? company.contact_person ?? company.name,
      contact_email: str(input.email),
      whatsapp: nums[0] ?? null,
      phone: nums[1] ?? nums[0] ?? null,
      products_services: [],
      status: "warm",
      is_primary: true,
      source: "agent",
      is_converted: true, // a quote means a live deal
    })
    .select(LEAD_COLS)
    .single();
  if (error) throw new Error(`Could not create lead: ${error.message}`);
  return data as Lead;
}

async function resolveTarget(
  ctx: AgentContext,
  input: Record<string, unknown>,
  dryRun: boolean,
): Promise<Resolved | Response> {
  const contact = str(input.contact_name);

  // 1) Explicit lead.
  const leadId = str(input.lead_id);
  if (leadId) {
    const { data: lead } = await ctx.supabase.from("leads").select(LEAD_COLS).eq("id", leadId).maybeSingle();
    if (!lead) return fail("lead_id not found", 404);
    const cid = (lead as Lead).company_id ?? (lead as Lead).prospect_id;
    const { data: company } = cid
      ? await ctx.supabase.from("companies").select("id, name, contact_person").eq("id", cid).maybeSingle()
      : { data: null };
    return { lead: lead as Lead, company: (company as Company) ?? null, resolved: "lead_id" };
  }

  // 2) Explicit prospect.
  const companyId = str(input.company_id);
  if (companyId) {
    const { data: company } = await ctx.supabase
      .from("companies")
      .select("id, name, contact_person")
      .eq("id", companyId)
      .maybeSingle();
    if (!company) return fail("company_id not found", 404);
    const lead = pickContact(await leadsOfCompany(ctx, companyId), contact);
    if (lead || dryRun) return { lead, company: company as Company, resolved: "company_id" };
    return { lead: await createPrimaryLead(ctx, company as Company, input), company: company as Company, resolved: "company_id" };
  }

  // 3) By name — checked against every prospect AND every lead first.
  const name = str(input.company);
  if (!name) return fail("Pass lead_id, company_id or company", 400);

  const [{ data: companies, error: cErr }, { data: leads, error: lErr }] = await Promise.all([
    ctx.supabase.from("companies").select("id, name, contact_person").limit(10000),
    ctx.supabase.from("leads").select(LEAD_COLS).limit(10000),
  ]);
  if (cErr || lErr) return fail((cErr ?? lErr)!.message, 500);

  // Entities: a prospect (company) or a stand-alone lead with no company.
  type Ent = { key: string; level: number; label: string | null; company: Company | null; lead: Lead | null };
  const ents = new Map<string, Ent>();
  const consider = (key: string, level: NameMatch, label: string | null, company: Company | null, lead: Lead | null) => {
    if (!level) return;
    const cur = ents.get(key);
    if (!cur || RANK[level] > cur.level) ents.set(key, { key, level: RANK[level], label, company, lead });
  };
  const byId = new Map(((companies ?? []) as Company[]).map((c) => [c.id, c]));
  for (const c of (companies ?? []) as Company[]) consider(`c:${c.id}`, matchCompany(name, c.name), c.name, c, null);
  for (const l of (leads ?? []) as Lead[]) {
    const cid = l.company_id ?? l.prospect_id;
    const co = cid ? byId.get(cid) ?? null : null; // company row may be gone
    consider(co ? `c:${co.id}` : `l:${l.id}`, matchCompany(name, l.company_name), co?.name ?? l.company_name, co, co ? null : l);
  }

  if (ents.size) {
    const top = Math.max(...[...ents.values()].map((e) => e.level));
    const best = [...ents.values()].filter((e) => e.level === top);
    if (best.length > 1) {
      return json(
        {
          ok: false,
          error: `"${name}" matches more than one existing company — pass lead_id or company_id`,
          candidates: best.slice(0, 10).map((e) => ({
            type: e.company ? "prospect" : "lead",
            company_id: e.company?.id ?? null,
            lead_id: e.lead?.id ?? null,
            name: e.label,
          })),
        },
        409,
      );
    }
    const hit = best[0];
    const level = (Object.keys(RANK) as Array<keyof typeof RANK>).find((k) => RANK[k] === hit.level) ?? null;
    if (hit.company) {
      const lead = pickContact(await leadsOfCompany(ctx, hit.company.id), contact);
      if (lead || dryRun) {
        return { lead, company: hit.company, resolved: "existing_prospect", match: { level, name: hit.label } };
      }
      return {
        lead: await createPrimaryLead(ctx, hit.company, input),
        company: hit.company,
        resolved: "existing_prospect",
        match: { level, name: hit.label },
      };
    }
    return { lead: hit.lead, company: null, resolved: "existing_lead", match: { level, name: hit.label } };
  }

  // 4) Nothing matches anywhere → create the prospect + its lead.
  if (dryRun) return { lead: null, company: null, resolved: "would_create" };
  const nums = extractNumbers(str(input.phone));
  const { data: created, error } = await ctx.supabase
    .from("companies")
    .insert({
      user_id: ctx.owner,
      name,
      domain: str(input.website),
      country: str(input.country) ?? "UAE",
      industry: str(input.industry),
      contact_person: contact,
      email: str(input.email),
      phone: nums.join(" / ") || str(input.phone),
      product_service: str(input.product_service),
    })
    .select("id, name, contact_person")
    .single();
  if (error) return fail(`Could not create prospect: ${error.message}`, 500);
  const company = created as Company;
  return { lead: await createPrimaryLead(ctx, company, input), company, resolved: "created" };
}

// ---------------------------------------------------------------------------
// CRM sync (mirrors syncLeadFromQuote in src/lib/quotations.functions.ts)
// ---------------------------------------------------------------------------

async function syncLead(
  ctx: AgentContext,
  lead: Lead,
  q: { number: number; currency: string; rate: number; itemsTotal: number; grand: number; lines: Line[] },
  input: Record<string, unknown>,
) {
  const summary =
    q.lines
      .slice(0, 3)
      .map((l) => `${l.qty} × ${(l.description.split("\n")[0] || l.part_number || "item").slice(0, 60)}`)
      .join(", ") + (q.lines.length > 3 ? ` +${q.lines.length - 3} more` : "");
  const via = ctx.agentName ? `via ${ctx.agentName}` : "via agent";
  await ctx.supabase.from("lead_activities").insert({
    lead_id: lead.id,
    user_id: ctx.owner,
    kind: "quotation",
    body: `Quotation #${q.number} created ${via} · ${q.currency} ${fmtMoney(q.grand)} (incl. VAT) — ${summary}`,
  });

  const { data: cur } = await ctx.supabase
    .from("leads")
    .select("pipeline_stage, pipeline_value_cents, products_services, contact_person, contact_email, whatsapp")
    .eq("id", lead.id)
    .single();
  if (!cur) return;
  const patch: Record<string, unknown> = {};
  if (PRE_QUOTE_STAGES.has(cur.pipeline_stage ?? null)) patch.pipeline_stage = "quotation";
  if (!cur.pipeline_value_cents) patch.pipeline_value_cents = Math.round(q.itemsTotal / (q.rate || 1));
  const existing: string[] = Array.isArray(cur.products_services) ? cur.products_services : [];
  const seen = new Set(existing.map((x) => x.toLowerCase()));
  const merged = [...existing];
  for (const l of q.lines) {
    const tag = (l.description.split("\n")[0].trim() || l.part_number || "").slice(0, 80);
    if (tag && !seen.has(tag.toLowerCase()) && merged.length < 12) {
      seen.add(tag.toLowerCase());
      merged.push(tag);
    }
  }
  if (merged.length !== existing.length) patch.products_services = merged;
  // Fill blank contact details from the call — never overwrite.
  const contact = str(input.contact_name);
  const email = str(input.email);
  const wa = extractNumbers(str(input.phone))[0] ?? null;
  if (!cur.contact_person && contact) patch.contact_person = contact;
  if (!cur.contact_email && email) patch.contact_email = email;
  if (!cur.whatsapp && wa) patch.whatsapp = wa;
  if (lead.is_converted === false) patch.is_converted = true;
  if (Object.keys(patch).length) await ctx.supabase.from("leads").update(patch).eq("id", lead.id);

  // Converting the prospect converts all its contacts, like Convert-to-Lead.
  const cid = lead.company_id ?? lead.prospect_id;
  if (lead.is_converted === false && cid) {
    await ctx.supabase
      .from("leads")
      .update({ is_converted: true })
      .or(`company_id.eq.${cid},prospect_id.eq.${cid}`)
      .eq("is_converted", false);
  }
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const blocked = gate(req, ["POST"]);
  if (blocked) return blocked;
  const ctx = authorize(req, "PROSPECT_WEBHOOK_KEY");
  if (ctx instanceof Response) return ctx;

  const input = await readInput(req);
  const dryRun = input.dry_run === true || input.dry_run === "true";

  // ---- validate money settings ----
  const currency = (str(input.currency) ?? "AED").toUpperCase();
  if (!(CURRENCIES as readonly string[]).includes(currency)) {
    return fail(`currency must be one of ${CURRENCIES.join(", ")}`, 400);
  }
  const rate = num(input.exchange_rate, DEFAULT_RATES[currency] ?? 1);
  if (!(rate > 0)) return fail("exchange_rate must be > 0 (1 AED = rate × currency)", 400);
  const vatRate = num(input.vat_rate, 5);
  if (!(vatRate >= 0 && vatRate <= 100)) return fail("vat_rate must be between 0 and 100", 400);
  const ddpIn = (input.ddp ?? {}) as Record<string, unknown>;
  const ddp: DdpConfig = {
    enabled: ddpIn.enabled === true || ddpIn.enabled === "true",
    boq_fixed: Math.max(0, num(ddpIn.boq_fixed, 0) || 0),
    per_kg: Math.max(0, num(ddpIn.per_kg, 0) || 0),
    per_unit: Math.max(0, num(ddpIn.per_unit, 0) || 0),
    weight: Math.max(0, num(ddpIn.weight, 0) || 0),
  };
  const status = str(input.status) ?? "draft";
  if (!STATUSES.includes(status)) return fail(`status must be one of ${STATUSES.join(", ")}`, 400);
  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (rawItems.length === 0) return fail("items must be a non-empty array", 400);
  if (rawItems.length > 100) return fail("max 100 items per quotation", 400);

  // ---- price first: nothing is written if any line can't be priced ----
  const { lines, problems } = await priceItems(ctx, rawItems);
  if (problems.length) {
    return json({ ok: false, error: "Some items could not be priced — nothing was saved", problems, priced: lines.length }, 422);
  }

  const itemsCents = lines.map((l) => ({ qty: l.qty, unit_price_cents: l.unit_price_cents }));
  const totals = computeQuoteTotals(itemsCents, rate, vatRate, ddp);

  // ---- resolve the lead (dedupe before any create) ----
  let target: Resolved | Response;
  try {
    target = await resolveTarget(ctx, input, dryRun);
  } catch (e) {
    return fail((e as Error).message, 500);
  }
  if (target instanceof Response) return target;

  const companyName =
    target.company?.name ?? target.lead?.company_name ?? str(input.company) ?? "Customer";
  const contactName = str(input.contact_name) ?? target.lead?.contact_person ?? null;

  // Category = the most common bucket across lines.
  const counts: Record<string, number> = {};
  for (const l of lines) {
    const b = categoryBucket(l.brand, l.category);
    counts[b] = (counts[b] ?? 0) + 1;
  }
  const category = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Other";

  const outLines = lines.map((l, i) => ({
    part_number: l.part_number,
    description: l.description,
    qty: l.qty,
    unit_price: fmtMoney(totals.lines[i].unit_final_cents),
    line_total: fmtMoney(totals.lines[i].line_total_cents),
    base_unit_price_aed: fmtMoney(l.unit_price_cents),
    matched_by: l.matched_by,
    alternatives: l.alternatives,
  }));
  const moneyOut = {
    currency,
    exchange_rate: rate,
    vat_rate: vatRate,
    items_total: fmtMoney(totals.items_total_cents),
    vat: fmtMoney(totals.vat_cents),
    grand_total: fmtMoney(totals.grand_total_cents),
    items_total_cents: totals.items_total_cents,
    vat_cents: totals.vat_cents,
    grand_total_cents: totals.grand_total_cents,
  };
  const textFor = (n: number | null) =>
    [
      `Quotation${n ? ` #${n}` : ""} — ${companyName}${contactName ? ` (${contactName})` : ""}`,
      ...outLines.map(
        (l, i) =>
          `${i + 1}. ${l.part_number ? `${l.part_number} ` : ""}${l.description.split("\n")[0]} — ${l.qty} × ${currency} ${l.unit_price} = ${currency} ${l.line_total}`,
      ),
      `Items total: ${currency} ${moneyOut.items_total}`,
      `VAT (${vatRate}%): ${currency} ${moneyOut.vat}`,
      `GRAND TOTAL: ${currency} ${moneyOut.grand_total}`,
    ].join("\n");

  const targetOut = {
    resolved: target.resolved,
    match: target.match ?? null,
    lead_id: target.lead?.id ?? null,
    company_id: target.company?.id ?? target.lead?.company_id ?? null,
    company: companyName,
    contact: contactName,
  };

  if (dryRun) {
    return json({ ok: true, dry_run: true, target: targetOut, lines: outLines, ...moneyOut, summary_text: textFor(null) });
  }
  if (!target.lead) return fail("Could not resolve a lead for this quotation", 500);

  // ---- save ----
  const { data: quote, error: qErr } = await ctx.supabase
    .from("quotations")
    .insert({
      lead_id: target.lead.id,
      company_name: companyName,
      contact_name: contactName,
      currency,
      exchange_rate: rate,
      vat_rate: vatRate,
      ddp,
      category,
      status,
      notes: str(input.notes),
      assigned_to: target.lead.assigned_to ?? ctx.owner,
      created_by: ctx.owner,
      items_total_cents: totals.items_total_cents,
      vat_cents: totals.vat_cents,
      grand_total_cents: totals.grand_total_cents,
    })
    .select("id, quote_number")
    .single();
  if (qErr) return fail(`Could not save quotation: ${qErr.message}`, 500);

  const { error: iErr } = await ctx.supabase.from("quotation_items").insert(
    lines.map((l, i) => ({
      quotation_id: quote.id,
      position: i,
      product_id: l.product_id,
      part_number: l.part_number,
      description: l.description,
      qty: l.qty,
      unit_price_cents: l.unit_price_cents,
    })),
  );
  if (iErr) {
    await ctx.supabase.from("quotations").delete().eq("id", quote.id); // no half-saved quotes
    return fail(`Could not save quotation lines: ${iErr.message}`, 500);
  }

  try {
    await syncLead(
      ctx,
      target.lead,
      { number: quote.quote_number, currency, rate, itemsTotal: totals.items_total_cents, grand: totals.grand_total_cents, lines },
      input,
    );
  } catch (e) {
    console.error("create-quotation sync failed", e); // quote is saved; sync is best-effort
  }

  return json({
    ok: true,
    quote_id: quote.id,
    quote_number: quote.quote_number,
    url: `${APP_URL}/app/quotations/${quote.id}`,
    lead_url: `${APP_URL}/app/leads/${target.lead.id}`,
    target: targetOut,
    lines: outLines,
    ...moneyOut,
    summary_text: textFor(quote.quote_number),
  });
});
