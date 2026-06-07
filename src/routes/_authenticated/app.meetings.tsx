import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Locate, Search, MapPin, Flame, ExternalLink, Navigation } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { listNearbyCompanies, geocodeAddress } from "@/lib/meetings.functions";
import { NearbyMap } from "@/components/meetings/NearbyMap";
import { LEAD_STATUS_STYLES, type LeadStatus } from "@/lib/leads-ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/meetings")({
  head: () => ({ meta: [{ title: "Meetings — Sales Insights" }] }),
  component: MeetingsPage,
});

type Match = {
  id: string;
  name: string;
  address: string | null;
  industry: string | null;
  lat: number;
  lng: number;
  distance_km: number;
  isLead: boolean;
  leadStatus: string | null;
};

function MeetingsPage() {
  const scanFn = useServerFn(listNearbyCompanies);
  const geoFn = useServerFn(geocodeAddress);

  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [originLabel, setOriginLabel] = useState<string>("");
  const [radiusKm, setRadiusKm] = useState(5);
  const [address, setAddress] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const scan = useMutation({
    mutationFn: (vars: { lat: number; lng: number; radiusKm: number }) =>
      scanFn({ data: vars }),
    onError: (e: Error) => toast.error(e.message),
  });

  const geocode = useMutation({
    mutationFn: (addr: string) => geoFn({ data: { address: addr } }),
    onSuccess: (res) => {
      setOrigin({ lat: res.lat, lng: res.lng });
      setOriginLabel(res.formatted_address);
      scan.mutate({ lat: res.lat, lng: res.lng, radiusKm });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function useGps() {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported. Use address search instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const o = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setOrigin(o);
        setOriginLabel("My current location");
        scan.mutate({ ...o, radiusKm });
      },
      (err) => toast.error(`Location denied: ${err.message}`),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function rescan() {
    if (!origin) {
      toast.error("Set an origin first.");
      return;
    }
    scan.mutate({ ...origin, radiusKm });
  }

  const matches: Match[] = (scan.data?.matches ?? []) as Match[];
  const selected = matches.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meetings · Nearby Scan</h1>
        <p className="text-sm text-muted-foreground">
          Find prospects and leads around your current location.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <Button onClick={useGps} variant="default">
              <Locate className="mr-2 h-4 w-4" /> Use my location
            </Button>
            <form
              className="flex flex-1 min-w-[260px] gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (address.trim()) geocode.mutate(address.trim());
              }}
            >
              <Input
                placeholder="…or search an address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
              <Button type="submit" variant="secondary" disabled={geocode.isPending}>
                <Search className="mr-2 h-4 w-4" /> Set
              </Button>
            </form>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[240px]">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>Radius</span>
                <span className="font-medium text-foreground">{radiusKm} km</span>
              </div>
              <Slider
                value={[radiusKm]}
                min={1}
                max={25}
                step={1}
                onValueChange={(v) => setRadiusKm(v[0] ?? 5)}
              />
            </div>
            <Button onClick={rescan} disabled={!origin || scan.isPending}>
              {scan.isPending ? "Scanning…" : "Scan"}
            </Button>
          </div>

          {origin && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              <span>{originLabel}</span>
              <span>·</span>
              <span>
                {origin.lat.toFixed(4)}, {origin.lng.toFixed(4)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardContent className="pt-6">
            <NearbyMap
              origin={origin}
              radiusKm={radiusKm}
              matches={matches}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            {scan.data && (
              <p className="mt-2 text-xs text-muted-foreground">
                {matches.length} match{matches.length === 1 ? "" : "es"} within {radiusKm} km ·{" "}
                {scan.data.withGeo}/{scan.data.total} companies geocoded
                {scan.data.skipped > 0 && (
                  <span> · {scan.data.skipped} skipped (no location — run AI Research)</span>
                )}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3">
          {selected && (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{selected.name}</div>
                    {selected.industry && (
                      <div className="text-xs text-muted-foreground">{selected.industry}</div>
                    )}
                  </div>
                  {selected.isLead && selected.leadStatus && (
                    <Badge className={cn(LEAD_STATUS_STYLES[selected.leadStatus as LeadStatus])}>
                      {selected.leadStatus}
                    </Badge>
                  )}
                </div>
                {selected.address && (
                  <div className="text-xs text-muted-foreground">{selected.address}</div>
                )}
                <div className="text-xs">
                  <span className="font-medium">{selected.distance_km.toFixed(2)} km</span>{" "}
                  <span className="text-muted-foreground">away</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="default">
                    <Link to="/app/prospects/$id" params={{ id: selected.id }}>
                      <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="secondary">
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Navigation className="mr-1 h-3.5 w-3.5" /> Directions
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-6">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Results ({matches.length})
              </div>
              {!origin ? (
                <p className="text-sm text-muted-foreground">
                  Set an origin and hit Scan to see nearby companies.
                </p>
              ) : matches.length === 0 && scan.data ? (
                <p className="text-sm text-muted-foreground">
                  No prospects within {radiusKm} km — try expanding the radius.
                </p>
              ) : (
                <ul className="max-h-[440px] space-y-1 overflow-auto">
                  {matches.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(m.id)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                          selectedId === m.id && "border-primary bg-accent",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 truncate font-medium">
                            {m.isLead && <Flame className="h-3.5 w-3.5 text-orange-500" />}
                            <span className="truncate">{m.name}</span>
                          </div>
                          {m.address && (
                            <div className="truncate text-xs text-muted-foreground">
                              {m.address}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 text-xs font-medium text-muted-foreground">
                          {m.distance_km.toFixed(1)} km
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
