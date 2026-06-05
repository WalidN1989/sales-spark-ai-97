import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Types ----------

export type HunterContact = {
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  email: string;
  position: string | null;
  department: string | null;
  seniority: string | null;
  linkedin: string | null;
  confidence: number | null;
  provider: "hunter.io";
};

export type EmailStatus = "valid" | "risky" | "invalid" | "unknown";
export type LeadStatus = "hot" | "warm" | "cold" | "frozen" | "dead";

// ---------- Hunter API ----------

const HUNTER_BASE = "https://api.hunter.io/v2";

function getApiKey(): string {
  const key = process.env.HUNTER_API_KEY;
  if (!key) throw new Error("Hunter is not configured. Add HUNTER_API_KEY in Project Settings.");
  return key;
}

async function hunterFetch(path: string, params: Record<string, string>) {
  const url = new URL(`${HUNTER_BASE}${path}`);
  url.searchParams.set("api_key", getApiKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (res.status === 401) throw new Error("Hunter API key is invalid. Update HUNTER_API_KEY in Project Settings.");
  if (res.status === 402 || res.status === 429) {
    throw new Error("Hunter monthly quota exhausted. Please upgrade Hunter plan or wait for quota reset.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Hunter error ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as { data: Record<string, unknown>; meta?: { results?: number } };
}

// ---------- Title / score helpers ----------

export function titleBucket(title: string | null | undefined): {
  bucket: "c_level" | "director" | "manager" | "other";
  status: LeadStatus;
  score: number;
} {
  const t = (title ?? "").toLowerCase();
  if (/(^|\b)(ceo|cto|cfo|coo|cmo|founder|owner|chief|president)\b/.test(t)) {
    return { bucket: "c_level", status: "hot", score: 70 };
  }
  if (/(director|vp|vice president|head of)/.test(t)) {
    return { bucket: "director", status: "warm", score: 50 };
  }
  if (/(manager|lead|supervisor)/.test(t)) {
    return { bucket: "manager", status: "warm", score: 30 };
  }
  return { bucket: "other", status: "cold", score: 0 };
}

function emailScoreFromStatus(status: EmailStatus | null): number {
  if (status === "valid") return 20;
  if (status === "risky") return 5;
  return 0;
}

function mapHunterStatus(s: string | null | undefined): EmailStatus {
  switch ((s ?? "").toLowerCase()) {
    case "valid":
      return "valid";
    case "invalid":
    case "disposable":
      return "invalid";
    case "accept_all":
    case "webmail":
      return "risky";
    default:
      return "unknown";
  }
}

// ---------- Dedup ----------

function normWa(s: string | null | undefined): string {
  return (s ?? "").replace(/\D+/g, "");
}

type DupMatch = { leadId: string; reason: "email" | "whatsapp" | "name_company" } | null;

async function findDupForContact(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  companyId: string,
  companyName: string | null,
  c: HunterContact,
): Promise<DupMatch> {
  // 1) email match
  if (c.email) {
    const { data } = await supabase
      .from("leads")
      .select("id")
      .eq("user_id", userId)
      .ilike("contact_email", c.email)
      .limit(1)
      .maybeSingle();
    if (data) return { leadId: data.id, reason: "email" };
  }
  // 2) name+company match
  if (c.full_name) {
    const { data } = await supabase
      .from("leads")
      .select("id, company_name, company_id")
      .eq("user_id", userId)
      .ilike("contact_person", c.full_name)
      .limit(5);
    const match = (data ?? []).find(
      (r: { company_id: string | null; company_name: string | null }) =>
        r.company_id === companyId ||
        (companyName && r.company_name && r.company_name.toLowerCase() === companyName.toLowerCase()),
    );
    if (match) return { leadId: match.id, reason: "name_company" };
  }
  return null;
}

// ---------- Server functions ----------

export const hunterFindContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ companyId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: company, error } = await context.supabase
      .from("companies")
      .select("id, name, domain, email")
      .eq("id", data.companyId)
      .single();
    if (error) throw new Error(error.message);

    // resolve domain (domain field, or fallback to email)
    let domain = (company.domain ?? "").trim();
    if (!domain && company.email) {
      const m = company.email.match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
      if (m) domain = m[1];
    }
    domain = domain.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "");
    if (!domain) throw new Error("No domain on this prospect. Add a website or business email first.");

    const json = await hunterFetch("/domain-search", { domain, limit: "10" });
    type HunterEmail = {
      value?: string;
      first_name?: string | null;
      last_name?: string | null;
      position?: string | null;
      department?: string | null;
      seniority?: string | null;
      linkedin?: string | null;
      confidence?: number | null;
    };
    const emails = ((json.data?.emails as HunterEmail[]) ?? []).filter((e) => !!e.value);
    const org = {
      organization: (json.data?.organization as string | null) ?? null,
      country: (json.data?.country as string | null) ?? null,
      linkedin: (json.data?.linkedin as string | null) ?? null,
    };

    const contacts: HunterContact[] = emails.map((e) => {
      const fn = (e.first_name ?? "").trim();
      const ln = (e.last_name ?? "").trim();
      const full = [fn, ln].filter(Boolean).join(" ") || (e.value ?? "");
      return {
        first_name: fn || null,
        last_name: ln || null,
        full_name: full,
        email: e.value as string,
        position: e.position ?? null,
        department: e.department ?? null,
        seniority: e.seniority ?? null,
        linkedin: e.linkedin ?? null,
        confidence: typeof e.confidence === "number" ? e.confidence : null,
        provider: "hunter.io",
      };
    });

    // dedup check per contact
    const dupes: Record<string, DupMatch> = {};
    for (const c of contacts) {
      dupes[c.email] = await findDupForContact(context.supabase, context.userId, data.companyId, company.name, c);
    }

    // sync prospect
    await context.supabase
      .from("companies")
      .update({
        hunter_last_sync: new Date().toISOString(),
        linkedin_url: org.linkedin ?? undefined,
      })
      .eq("id", data.companyId);

    return { contacts, organization: org, duplicates: dupes };
  });

export const hunterImportLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        contacts: z
          .array(
            z.object({
              first_name: z.string().nullable(),
              last_name: z.string().nullable(),
              full_name: z.string().min(1).max(200),
              email: z.string().email().max(200),
              position: z.string().nullable(),
              department: z.string().nullable(),
              seniority: z.string().nullable(),
              linkedin: z.string().nullable(),
              confidence: z.number().nullable(),
              provider: z.literal("hunter.io"),
            }),
          )
          .min(1)
          .max(50),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: company, error: cErr } = await context.supabase
      .from("companies")
      .select("id, name, domain")
      .eq("id", data.companyId)
      .single();
    if (cErr) throw new Error(cErr.message);

    let created = 0;
    let skipped = 0;
    const leadIds: string[] = [];

    for (const c of data.contacts) {
      const dup = await findDupForContact(context.supabase, context.userId, data.companyId, company.name, c);
      if (dup) {
        skipped++;
        continue;
      }
      const bucket = titleBucket(c.position);
      const lead_score = bucket.score; // email not verified yet
      const { data: row, error } = await context.supabase
        .from("leads")
        .insert({
          user_id: context.userId,
          company_id: data.companyId,
          prospect_id: data.companyId,
          contact_person: c.full_name,
          contact_email: c.email,
          company_name: company.name,
          website: company.domain,
          job_title: c.position,
          status: bucket.status,
          source: "hunter.io",
          lead_score,
        })
        .select("id")
        .single();
      if (error) {
        // unique-conflict on (user_id, company_id) — skip silently
        if (/duplicate key|leads_user_company_unique/i.test(error.message)) {
          skipped++;
          continue;
        }
        throw new Error(error.message);
      }
      created++;
      leadIds.push(row.id);
      await context.supabase.from("lead_activities").insert({
        lead_id: row.id,
        user_id: context.userId,
        kind: "log",
        body: `Imported from Hunter: ${c.full_name}${c.position ? ` · ${c.position}` : ""}`,
      });
    }

    return { created, skipped, leadIds };
  });

export const hunterVerifyEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: lead, error } = await context.supabase
      .from("leads")
      .select("id, contact_email, job_title, contact_person, status, lead_score_manual_override")
      .eq("id", data.leadId)
      .single();
    if (error) throw new Error(error.message);
    if (!lead.contact_email) throw new Error("No email on this lead.");

    const json = await hunterFetch("/email-verifier", { email: lead.contact_email });
    type Verifier = { status?: string; score?: number };
    const v = json.data as Verifier;
    const email_status = mapHunterStatus(v.status);
    const email_score = typeof v.score === "number" ? v.score : null;

    const bucket = titleBucket(lead.job_title ?? lead.contact_person);
    const lead_score = bucket.score + emailScoreFromStatus(email_status);

    const update: {
      email_status: EmailStatus;
      email_score: number | null;
      last_verified_at: string;
      lead_score: number;
      status?: LeadStatus;
    } = {
      email_status,
      email_score,
      last_verified_at: new Date().toISOString(),
      lead_score,
    };
    if (!lead.lead_score_manual_override) update.status = bucket.status;

    const { error: uErr } = await context.supabase.from("leads").update(update).eq("id", data.leadId);
    if (uErr) throw new Error(uErr.message);

    await context.supabase.from("lead_activities").insert({
      lead_id: data.leadId,
      user_id: context.userId,
      kind: "log",
      body: `Email verified via Hunter: ${email_status}${email_score != null ? ` (${email_score})` : ""}`,
    });

    return { email_status, email_score, lead_score, status: lead.lead_score_manual_override ? lead.status : bucket.status };
  });
