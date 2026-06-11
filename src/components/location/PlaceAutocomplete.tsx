/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { Search, Loader2, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const SCRIPT_ID = "google-maps-js";
let loadPromise: Promise<void> | null = null;
function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as unknown as { google?: { maps?: unknown } }).google?.maps)
    return Promise.resolve();
  if (loadPromise) return loadPromise;
  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as
    | string
    | undefined;
  const tracking = import.meta.env
    .VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;
  if (!key) return Promise.reject(new Error("Google Maps browser key missing."));
  loadPromise = new Promise<void>((resolve, reject) => {
    (window as unknown as Record<string, unknown>).__nearbyMapInit = () => resolve();
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&libraries=places&callback=__nearbyMapInit${
      tracking ? `&channel=${tracking}` : ""
    }`;
    s.onerror = () => reject(new Error("Failed to load Google Maps."));
    document.head.appendChild(s);
  });
  return loadPromise;
}

export type PlacePick = {
  lat: number;
  lng: number;
  address: string;
  name?: string;
};

type Suggestion = {
  placeId: string;
  primary: string;
  secondary: string;
};

export function PlaceAutocomplete({
  onPick,
  placeholder = "Search for a venue, business, or address…",
  bias,
}: {
  onPick: (p: PlacePick) => void;
  placeholder?: string;
  bias?: { lat: number; lng: number } | null;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!q.trim()) {
      setItems([]);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        await loadMaps();
        const { AutocompleteSuggestion, AutocompleteSessionToken } =
          (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
        if (!tokenRef.current) tokenRef.current = new AutocompleteSessionToken();
        const req: google.maps.places.AutocompleteRequest = {
          input: q,
          sessionToken: tokenRef.current,
        };
        if (bias) {
          req.locationBias = {
            center: { lat: bias.lat, lng: bias.lng },
            radius: 50000,
          };
        }
        const { suggestions } =
          await AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
        setItems(
          suggestions
            .map((s) => {
              const p = s.placePrediction;
              if (!p) return null;
              return {
                placeId: p.placeId,
                primary: p.mainText?.toString() ?? p.text?.toString() ?? "",
                secondary: p.secondaryText?.toString() ?? "",
              } as Suggestion;
            })
            .filter((x): x is Suggestion => !!x),
        );
        setOpen(true);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, bias?.lat, bias?.lng]);

  const choose = async (s: Suggestion) => {
    try {
      await loadMaps();
      const { Place } = (await google.maps.importLibrary(
        "places",
      )) as google.maps.PlacesLibrary;
      const place = new Place({ id: s.placeId });
      await place.fetchFields({
        fields: ["location", "formattedAddress", "displayName"],
      });
      const loc = place.location;
      if (!loc) throw new Error("No location returned");
      onPick({
        lat: typeof loc.lat === "function" ? loc.lat() : (loc as unknown as { lat: number }).lat,
        lng: typeof loc.lng === "function" ? loc.lng() : (loc as unknown as { lng: number }).lng,
        address: place.formattedAddress ?? `${s.primary}, ${s.secondary}`.trim(),
        name: place.displayName ?? s.primary,
      });
      setQ(place.displayName ?? s.primary);
      setOpen(false);
      tokenRef.current = null; // end session
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load place");
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="pl-8"
        />
        {loading && (
          <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && items.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover shadow-lg">
          {items.map((s) => (
            <button
              key={s.placeId}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(s)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{s.primary}</span>
                {s.secondary && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {s.secondary}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
