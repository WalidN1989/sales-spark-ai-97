import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SiteVisitAssignee = { id: string; full_name: string | null; email: string | null };

export const listSiteVisitAssignees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SiteVisitAssignee[]> => {
    const { data: managerRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "manager"])
      .maybeSingle();
    let ids = [context.userId];
    if (managerRole) {
      const { data: members } = await (supabaseAdmin as any)
        .from("org_members")
        .select("user_id")
        .eq("status", "active");
      ids = Array.from(new Set([context.userId, ...((members ?? []).map((m: { user_id: string }) => m.user_id))]));
    }
    const { data } = await (supabaseAdmin as any)
      .from("profiles")
      .select("id, full_name, email, status")
      .in("id", ids);
    return ((data ?? []) as Array<SiteVisitAssignee & { status?: string | null }>)
      .filter((p) => p.status !== "inactive")
      .map(({ id, full_name, email }) => ({ id, full_name, email }));
  });

export type SiteVisit = {
  id: string; lead_id: string; scheduled_at: string; assigned_to: string;
  source_module: "lead" | "prospect"; source_id: string; company_name: string;
  body: string; meeting_contact_name: string; meeting_contact_phone: string | null;
  meeting_contact_email: string | null; meeting_state: string; meeting_address: string;
  meeting_company_url: string; meeting_contact_url: string; assignee_name: string;
};

export const listSiteVisits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SiteVisit[]> => {
    const { data: rows, error } = await (context.supabase as any)
      .from("lead_activities")
      .select("id, lead_id, body, scheduled_at, assigned_to, source_module, meeting_contact_name, meeting_contact_phone, meeting_contact_email, meeting_state, meeting_address, meeting_company_url, meeting_contact_url")
      .eq("kind", "visit")
      .not("scheduled_at", "is", null)
      .order("scheduled_at", { ascending: true });
    if (error) throw new Error(error.message);
    const visits = (rows ?? []) as any[];
    if (!visits.length) return [];
    const leadIds = Array.from(new Set(visits.map((v) => v.lead_id)));
    const assigneeIds = Array.from(new Set(visits.map((v) => v.assigned_to).filter(Boolean)));
    const [{ data: leads }, { data: profiles }] = await Promise.all([
      (context.supabase as any).from("leads").select("id, company_id, prospect_id, company_name").in("id", leadIds),
      (supabaseAdmin as any).from("profiles").select("id, full_name, email").in("id", assigneeIds.length ? assigneeIds : [context.userId]),
    ]);
    const companyIds = Array.from(new Set((leads ?? []).map((l: any) => l.company_id || l.prospect_id).filter(Boolean)));
    const { data: companies } = companyIds.length
      ? await (context.supabase as any).from("companies").select("id, name").in("id", companyIds)
      : { data: [] };
    const leadMap = new Map((leads ?? []).map((l: any) => [l.id, l]));
    const companyMap = new Map((companies ?? []).map((c: any) => [c.id, c]));
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return visits.map((v) => {
      const lead: any = leadMap.get(v.lead_id) ?? {};
      const companyId = lead.company_id || lead.prospect_id;
      const profile: any = profileMap.get(v.assigned_to) ?? {};
      return {
        ...v,
        source_module: v.source_module === "prospect" ? "prospect" : "lead",
        source_id: v.source_module === "prospect" && companyId ? companyId : v.lead_id,
        company_name: lead.company_name || (companyMap.get(companyId) as any)?.name || "Unnamed company",
        assignee_name: profile.full_name || profile.email || "Unassigned",
      } as SiteVisit;
    });
  });

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

const nearbyInput = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusKm: z.number().min(0.1).max(100),
});

export const listNearbyCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => nearbyInput.parse(d))
  .handler(async ({ context, data }) => {
    const { data: companies, error } = await context.supabase
      .from("companies")
      .select("id, name, address, industry, lat, lng");
    if (error) throw new Error(error.message);

    const { data: leads } = await context.supabase
      .from("leads")
      .select("company_id, status");
    const leadByCompany = new Map<string, string>();
    (leads ?? []).forEach((l) => {
      if (l.company_id) leadByCompany.set(l.company_id, l.status);
    });

    const all = companies ?? [];
    const withGeo = all.filter((c) => c.lat != null && c.lng != null);
    const skipped = all.length - withGeo.length;

    const matches = withGeo
      .map((c) => ({
        id: c.id,
        name: c.name,
        address: c.address,
        industry: c.industry,
        lat: c.lat as number,
        lng: c.lng as number,
        distance_km: haversineKm(data.lat, data.lng, c.lat as number, c.lng as number),
        isLead: leadByCompany.has(c.id),
        leadStatus: leadByCompany.get(c.id) ?? null,
      }))
      .filter((c) => c.distance_km <= data.radiusKm)
      .sort((a, b) => a.distance_km - b.distance_km);

    return { matches, total: all.length, withGeo: withGeo.length, skipped };
  });

export const geocodeAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ address: z.string().trim().min(2).max(300) }).parse(d),
  )
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmapsKey = process.env.GOOGLE_MAPS_API_KEY_1 ?? process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !gmapsKey) throw new Error("Google Maps is not connected.");
    const res = await fetch(
      `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?address=${encodeURIComponent(data.address)}`,
      { headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": gmapsKey } },
    );
    if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
    const json = (await res.json()) as {
      results?: Array<{
        geometry?: { location?: { lat: number; lng: number } };
        formatted_address?: string;
      }>;
    };
    const top = json.results?.[0];
    if (!top?.geometry?.location) throw new Error("No results for that address.");
    return {
      lat: top.geometry.location.lat,
      lng: top.geometry.location.lng,
      formatted_address: top.formatted_address ?? data.address,
    };
  });
