/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, Crosshair, Loader2, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { updateCompany } from "@/lib/companies.functions";
import { PlaceAutocomplete } from "./PlaceAutocomplete";
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
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__nearbyMapInit${
      tracking ? `&channel=${tracking}` : ""
    }`;
    s.onerror = () => reject(new Error("Failed to load Google Maps."));
    document.head.appendChild(s);
  });
  return loadPromise;
}

type Props = {
  companyId: string;
  companyName?: string | null;
  currentLat?: number | null;
  currentLng?: number | null;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "icon";
  label?: string;
  className?: string;
};

export function PinLocationButton({
  companyId,
  companyName,
  currentLat,
  currentLng,
  variant = "outline",
  size = "sm",
  label,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [lat, setLat] = useState<number | null>(currentLat ?? null);
  const [lng, setLng] = useState<number | null>(currentLng ?? null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const qc = useQueryClient();
  const updateFn = useServerFn(updateCompany);

  const captureGps = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Geolocation not supported on this device.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setAccuracy(pos.coords.accuracy);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        toast.error(err.message || "Could not get your location.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  // When opening, if we have no pin yet, auto-request GPS
  useEffect(() => {
    if (open && lat == null && lng == null) captureGps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = useMutation({
    mutationFn: () => {
      if (lat == null || lng == null) throw new Error("Drop a pin first.");
      return updateFn({ data: { id: companyId, patch: { lat, lng } } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company", companyId] });
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["lead"] });
      qc.invalidateQueries({ queryKey: ["nearby-companies"] });
      toast.success(
        `Location pinned${companyName ? ` — ${companyName} will appear in Nearby Scan.` : "."}`,
      );
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          className={className}
          title="Pin exact location"
        >
          <MapPin className="h-4 w-4" />
          {size !== "icon" && (
            <span className="ml-1">
              {label ??
                (currentLat != null && currentLng != null
                  ? "Update location"
                  : "Pin location")}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pin location {companyName ? `— ${companyName}` : ""}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={captureGps}
              disabled={locating}
            >
              {locating ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Crosshair className="mr-1 h-3.5 w-3.5" />
              )}
              Use my current location
            </Button>
            {lat != null && lng != null && (
              <span className="inline-flex items-center text-xs text-muted-foreground">
                <MapPin className="mr-1 h-3 w-3" />
                {lat.toFixed(5)}, {lng.toFixed(5)}
                {accuracy != null && ` · ±${Math.round(accuracy)} m`}
              </span>
            )}
          </div>

          {lat != null && lng != null ? (
            <MiniMapPicker
              lat={lat}
              lng={lng}
              onChange={(p) => {
                setLat(p.lat);
                setLng(p.lng);
                setAccuracy(null);
              }}
            />
          ) : (
            <p className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
              Tap "Use my current location" to drop a pin where you are right now.
              You can drag the pin to fine-tune.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || lat == null || lng == null}
          >
            {save.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="mr-1 h-3.5 w-3.5" />
            )}
            Save location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MiniMapPicker({
  lat,
  lng,
  onChange,
}: {
  lat: number;
  lng: number;
  onChange: (p: { lat: number; lng: number }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then(() => {
        if (cancelled || !ref.current) return;
        if (!mapRef.current) {
          mapRef.current = new google.maps.Map(ref.current, {
            center: { lat, lng },
            zoom: 17,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          });
          markerRef.current = new google.maps.Marker({
            map: mapRef.current,
            position: { lat, lng },
            draggable: true,
          });
          markerRef.current.addListener("dragend", () => {
            const p = markerRef.current?.getPosition();
            if (p) onChange({ lat: p.lat(), lng: p.lng() });
          });
          mapRef.current.addListener("click", (e: google.maps.MapMouseEvent) => {
            if (!e.latLng) return;
            markerRef.current?.setPosition(e.latLng);
            onChange({ lat: e.latLng.lat(), lng: e.latLng.lng() });
          });
        } else {
          mapRef.current.panTo({ lat, lng });
          markerRef.current?.setPosition({ lat, lng });
        }
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Map failed"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  return (
    <div>
      <div ref={ref} className="h-[280px] w-full rounded-md border" />
      <p className="mt-1 text-xs text-muted-foreground">
        Drag the pin or tap the map to adjust.
      </p>
    </div>
  );
}
