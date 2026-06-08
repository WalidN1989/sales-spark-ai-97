import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Locate, MapPin, Flame, ExternalLink, Navigation } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { listNearbyCompanies } from "@/lib/meetings.functions";
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

  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [originLabel, setOriginLabel] = useState<string>("");
  const [radiusKm, setRadiusKm] = useState(5);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const scan = useMutation({
    mutationFn: (vars: { lat: number; lng: number; radiusKm: number }) =>
      scanFn({ data: vars }),
    onError: (e: Error) => toast.error(e.message),
  });

  const triggerGps = (silent = false) => {
    if (!navigator.geolocation) {
      const msg = "Geolocation not supported.";
      setGeoError(msg);
      if (!silent) toast.error(msg);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const o = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setOrigin(o);
        setOriginLabel("My current location");
        setGeoError(null);
        scan.mutate({ ...o, radiusKm });
      },
      (err) => {
        setGeoError(err.message);
        if (!silent) toast.error(`Location denied: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // Auto-trigger geolocation + scan when the module opens
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    triggerGps(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function rescan() {
    if (!origin) {
      triggerGps();
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button onClick={() => triggerGps()} variant="default" className="w-full sm:w-auto">
              <Locate className="mr-2 h-4 w-4" /> Use my location
            </Button>
            <div className="min-w-0 flex-1">
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
            <Button
              onClick={rescan}
              disabled={scan.isPending}
              className="w-full sm:w-auto"
            >
              {scan.isPending ? "Scanning…" : origin ? "Rescan" : "Scan"}
            </Button>
          </div>

          {geoError && !origin && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {geoError} — click "Use my location" to allow access.
            </div>
          )}

          {origin && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
        <Card className="order-2 lg:order-1">
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

        <div className="order-1 space-y-3 lg:order-2">
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
