import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
