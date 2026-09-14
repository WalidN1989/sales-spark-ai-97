import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const idInput = z.object({ id: z.string().uuid() });

function normalizeUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

async function firecrawlScrape(url: string) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("Firecrawl is not connected.");
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formats: ["markdown", "summary", "links"],
      onlyMainContent: true,
    }),
  });
  if (res.status === 402) throw new Error("Firecrawl credits exhausted.");
  if (!res.ok) throw new Error(`Firecrawl error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    data?: { markdown?: string; summary?: string; links?: string[]; metadata?: Record<string, unknown> };
  };
  return json.data ?? {};
}

async function googleGeocode(address: string) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmapsKey = process.env.GOOGLE_MAPS_API_KEY_1 ?? process.env.GOOGLE_MAPS_API_KEY;
  if (!lovableKey || !gmapsKey) return null;
  const res = await fetch(
    `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?address=${encodeURIComponent(address)}`,
    { headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": gmapsKey } },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as {
    results?: Array<{ geometry?: { location?: { lat: number; lng: number } }; formatted_address?: string }>;
  };
  const top = json.results?.[0];
  if (!top?.geometry?.location) return null;
  return {
    lat: top.geometry.location.lat,
    lng: top.geometry.location.lng,
    formatted_address: top.formatted_address,
  };
}

export const researchCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ context, data }) => {
    const { data: company, error } = await context.supabase
      .from("companies")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    const url = normalizeUrl(company.domain);
    if (!url) throw new Error("Add a website / domain before running research.");

    const scraped = await firecrawlScrape(url);
    const markdown = (scraped.markdown ?? "").slice(0, 8000);
    const summary = scraped.summary ?? null;
    const links = (scraped.links ?? []).slice(0, 30);

    let geo: { lat: number; lng: number; formatted_address?: string } | null = null;
    if (company.address) {
      try {
        geo = await googleGeocode(company.address);
      } catch (e) {
        console.error("geocode failed", e);
      }
    }

    const research_data = {
      source_url: url,
      summary,
      markdown,
      links,
      scraped_at: new Date().toISOString(),
    };

    const update = {
      research_data,
      last_research_at: new Date().toISOString(),
      ...(geo ? { lat: geo.lat, lng: geo.lng } : {}),
    };

    const { error: upErr } = await context.supabase.from("companies").update(update).eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    await context.supabase.from("activity_log").insert({
      company_id: data.id,
      user_id: context.userId,
      type: "note",
      content: `AI research run on ${url}${geo ? " · location geocoded" : ""}`,
    });

    return { ok: true, research_data, geo };
  });

// Product-aware pitch email for an eTOP / Wacom ME prospect. Leads with the
// prospect's product_service (Wacom STU/BSU, Creative/Cintiq, T&A + access
// control, meal/canteen, visitor management, Emirates ID) — NEVER generic
// logistics/supply-chain fluff. Written by Claude, 60–100 words, and saved on
// the company so it persists until the user regenerates.
const PITCH_SYSTEM = `You write the Pitch Email for a CRM prospect for eTOP / Wacom ME (UAE). The product is NOT fixed — use the prospect's product_service (and notes) to choose the angle.

Product families (pick the one that matches the prospect):
- Wacom BSU / signature pads (STU) — paperless signing for traders or end-users
- Creative (Cintiq / creative displays) — design, education, agencies
- Time & attendance + access control — workforce / door / turnstile
- Meal / canteen management — hotels, catering, campuses
- Visitor management — lobby/reception, Emirates ID capture where relevant
- Emirates ID / HID visitor — Emirates ID readers + visitor workflows

Rules:
1. Output ONLY:
Subject: <one line>
Body: <email>
2. Body 60–100 words. Short, plain, sales-ready. No fluff, no "I was impressed…", no fake logistics/supply-chain pitches.
3. Lead with the correct product for THIS prospect. If product_service is blank, infer from industry/notes; if still unclear, ask which line in one short question instead of inventing.
4. Personalize with the company name + one concrete detail (district, vertical, or trading vs end-user).
5. One CTA: short call or WhatsApp for models/pricing (or a demo for software lines).
6. Sign-off blank (no invented name).
7. Vary wording slightly per prospect; keep the same tight structure.

Structure:
Hi {FirstName or there},
{1 sentence why relevant to their business}. {1 sentence what we offer for that product line — UAE stock/support where true}. {CTA}.
Best regards,`;

export const generatePitchEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ context, data }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: company } = await sb.from("companies").select("*").eq("id", data.id).single();
    if (!company) throw new Error("Company not found");

    const research = (company.research_data ?? {}) as { summary?: string };
    const firstName = (company.contact_person ?? "").toString().trim().split(/\s+/)[0] || "";
    const userContent = `PROSPECT
Company: ${company.name}
Website: ${company.domain ?? "n/a"}
Industry: ${company.industry ?? "n/a"}
Country/City: ${[company.country, (company as { city?: string }).city].filter(Boolean).join(" / ") || "UAE"}
product_service: ${company.product_service ?? "(blank — infer from industry/notes)"}
Contact first name: ${firstName || "(unknown)"}
Notes: ${research.summary ? research.summary.slice(0, 800) : (company.address ? String(company.address) : "(none)")}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 500,
        system: PITCH_SYSTEM,
        messages: [{ role: "user", content: userContent }],
      }),
    });
    if (res.status === 429) throw new Error("Rate limit. Try again shortly.");
    if (!res.ok) throw new Error(`AI error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { content?: Array<{ text?: string }> };
    const text = (json.content ?? []).map((c) => c.text ?? "").join("").trim();
    if (!text) throw new Error("AI did not return an email");

    const subjMatch = text.match(/Subject:\s*(.+)/i);
    const bodyMatch = text.match(/Body:\s*([\s\S]+)/i);
    const subject = (subjMatch?.[1] ?? "").trim() || `${company.name} — a quick note`;
    const body = (bodyMatch?.[1] ?? text).trim();

    // Persist on the company so it survives and is only overwritten on regenerate.
    await sb
      .from("companies")
      .update({ pitch_subject: subject, pitch_body: body, pitch_at: new Date().toISOString() })
      .eq("id", data.id);

    return { subject, body };
  });
