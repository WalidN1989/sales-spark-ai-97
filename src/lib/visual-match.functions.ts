import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "visual-match-uploads";

function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

type LensMatch = {
  position?: number;
  title?: string;
  link?: string;
  source?: string;
  source_icon?: string;
  thumbnail?: string;
};

export const listVisualSearches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("visual_searches")
      .select("id, image_path, label, status, error, match_count, created_at")
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    // Sign thumbnails
    const signed = await Promise.all(
      rows.map(async (r) => {
        const { data: s } = await context.supabase.storage
          .from(BUCKET)
          .createSignedUrl(r.image_path, 600);
        return { ...r, image_url: s?.signedUrl ?? null };
      }),
    );
    return signed;
  });

export const getVisualSearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: search, error } = await context.supabase
      .from("visual_searches")
      .select("id, image_path, label, status, error, match_count, created_at")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    const { data: matches } = await context.supabase
      .from("visual_matches")
      .select(
        "id, position, title, source, source_domain, link, thumbnail_url, saved_lead_id, saved_company_id",
      )
      .eq("search_id", data.id)
      .order("position", { ascending: true });

    const { data: signed } = await context.supabase.storage
      .from(BUCKET)
      .createSignedUrl(search.image_path, 600);

    return {
      search: { ...search, image_url: signed?.signedUrl ?? null },
      matches: matches ?? [],
    };
  });

export const runVisualSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        imagePath: z.string().min(1).max(500),
        label: z.string().max(200).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) throw new Error("SERPAPI_KEY is not configured");

    // Verify image belongs to this user (path starts with userId/)
    const prefix = data.imagePath.split("/")[0];
    if (prefix !== context.userId) {
      throw new Error("Image path does not belong to current user");
    }

    // Create search row (pending)
    const { data: created, error: insErr } = await context.supabase
      .from("visual_searches")
      .insert({
        user_id: context.userId,
        image_path: data.imagePath,
        label: data.label ?? null,
        status: "pending",
      })
      .select("id, image_path")
      .single();
    if (insErr) throw new Error(insErr.message);
    const searchId = created.id;

    try {
      // Sign URL so SerpApi can fetch
      const { data: signed, error: signErr } = await context.supabase.storage
        .from(BUCKET)
        .createSignedUrl(data.imagePath, 120);
      if (signErr || !signed?.signedUrl) {
        throw new Error(signErr?.message || "Failed to sign image URL");
      }

      const url = new URL("https://serpapi.com/search.json");
      url.searchParams.set("engine", "google_lens");
      url.searchParams.set("url", signed.signedUrl);
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("hl", "en");
      url.searchParams.set("country", "ae");

      const res = await fetch(url.toString());
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`SerpApi error ${res.status}: ${txt.slice(0, 300)}`);
      }
      const payload = (await res.json()) as {
        visual_matches?: LensMatch[];
        error?: string;
      };
      if (payload.error) throw new Error(payload.error);

      const matches = (payload.visual_matches ?? []).slice(0, 60);
      const rows = matches
        .filter((m) => !!m.link)
        .map((m, i) => ({
          search_id: searchId,
          user_id: context.userId,
          position: m.position ?? i + 1,
          title: m.title ?? null,
          source: m.source ?? null,
          source_domain: domainOf(m.link),
          link: m.link!,
          thumbnail_url: m.thumbnail ?? null,
        }));

      if (rows.length > 0) {
        const { error: mErr } = await context.supabase
          .from("visual_matches")
          .insert(rows);
        if (mErr) throw new Error(mErr.message);
      }

      await context.supabase
        .from("visual_searches")
        .update({ status: "done", match_count: rows.length, error: null })
        .eq("id", searchId);

      return { id: searchId, count: rows.length };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await context.supabase
        .from("visual_searches")
        .update({ status: "error", error: msg.slice(0, 500) })
        .eq("id", searchId);
      throw new Error(msg);
    }
  });

export const deleteVisualSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row } = await context.supabase
      .from("visual_searches")
      .select("image_path")
      .eq("id", data.id)
      .single();
    if (row?.image_path) {
      await context.supabase.storage.from(BUCKET).remove([row.image_path]);
    }
    const { error } = await context.supabase
      .from("visual_searches")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const saveAsInput = z.object({
  matchId: z.string().uuid(),
  name: z.string().min(1).max(200),
  notes: z.string().max(2000).optional().nullable(),
});

export const saveMatchAsProspect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveAsInput.parse(d))
  .handler(async ({ context, data }) => {
    const { data: match, error: mErr } = await context.supabase
      .from("visual_matches")
      .select("id, link, source_domain, title, source")
      .eq("id", data.matchId)
      .single();
    if (mErr) throw new Error(mErr.message);

    const { data: company, error: cErr } = await context.supabase
      .from("companies")
      .insert({
        user_id: context.userId,
        name: data.name,
        domain: match.source_domain ?? null,
        notes: data.notes ?? `Saved from Visual Match — ${match.link}`,
      })
      .select("id")
      .single();
    if (cErr) throw new Error(cErr.message);

    await context.supabase
      .from("visual_matches")
      .update({ saved_company_id: company.id })
      .eq("id", data.matchId);

    return { companyId: company.id };
  });

export const saveMatchAsLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveAsInput.parse(d))
  .handler(async ({ context, data }) => {
    const { data: match, error: mErr } = await context.supabase
      .from("visual_matches")
      .select("id, link, source_domain, title, source")
      .eq("id", data.matchId)
      .single();
    if (mErr) throw new Error(mErr.message);

    const { data: lead, error: lErr } = await context.supabase
      .from("leads")
      .insert({
        user_id: context.userId,
        contact_person: data.name,
        company_name: match.source_domain ?? match.source ?? null,
        website: match.source_domain ? `https://${match.source_domain}` : null,
        linkedin_url: /linkedin\.com/i.test(match.link) ? match.link : null,
        source: "visual_match",
        status: "cold",
        notes: data.notes ?? `Saved from Visual Match — ${match.link}`,
        is_primary: true,
      })
      .select("id")
      .single();
    if (lErr) throw new Error(lErr.message);

    await context.supabase
      .from("visual_matches")
      .update({ saved_lead_id: lead.id })
      .eq("id", data.matchId);

    return { leadId: lead.id };
  });
