import { useEffect, useRef } from "react";

type Match = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isLead: boolean;
};

type Props = {
  origin: { lat: number; lng: number } | null;
  radiusKm: number;
  matches: Match[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const SCRIPT_ID = "google-maps-js";

let loadPromise: Promise<void> | null = null;
function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as unknown as { google?: { maps?: unknown } }).google?.maps) return Promise.resolve();
  if (loadPromise) return loadPromise;
  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  const tracking = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;
  if (!key) return Promise.reject(new Error("Google Maps browser key is missing."));
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

export function NearbyMap({ origin, radiusKm, matches, selectedId, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const originMarker = useRef<google.maps.Marker | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then(() => {
        if (cancelled || !ref.current || mapRef.current) return;
        mapRef.current = new google.maps.Map(ref.current, {
          center: origin ?? { lat: 25.2048, lng: 55.2708 },
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, []);

  // Origin marker + radius circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !origin) return;
    if (!originMarker.current) {
      originMarker.current = new google.maps.Marker({
        map,
        position: origin,
        title: "You are here",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#2563eb",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });
    } else {
      originMarker.current.setPosition(origin);
    }
    if (!circleRef.current) {
      circleRef.current = new google.maps.Circle({
        map,
        center: origin,
        radius: radiusKm * 1000,
        strokeColor: "#2563eb",
        strokeOpacity: 0.6,
        strokeWeight: 1,
        fillColor: "#2563eb",
        fillOpacity: 0.08,
      });
    } else {
      circleRef.current.setCenter(origin);
      circleRef.current.setRadius(radiusKm * 1000);
    }
    map.panTo(origin);
    const bounds = circleRef.current.getBounds();
    if (bounds) map.fitBounds(bounds);
  }, [origin, radiusKm]);

  // Match markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const next = new Set(matches.map((m) => m.id));
    markersRef.current.forEach((mk, id) => {
      if (!next.has(id)) {
        mk.setMap(null);
        markersRef.current.delete(id);
      }
    });
    matches.forEach((m) => {
      let mk = markersRef.current.get(m.id);
      const isSelected = m.id === selectedId;
      const color = m.isLead ? "#f97316" : "#10b981";
      if (!mk) {
        mk = new google.maps.Marker({
          map,
          position: { lat: m.lat, lng: m.lng },
          title: m.name,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: isSelected ? 10 : 7,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
        });
        mk.addListener("click", () => onSelectRef.current(m.id));
        markersRef.current.set(m.id, mk);
      } else {
        mk.setPosition({ lat: m.lat, lng: m.lng });
        mk.setIcon({
          path: google.maps.SymbolPath.CIRCLE,
          scale: isSelected ? 10 : 7,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        });
      }
    });
  }, [matches, selectedId]);

  return <div ref={ref} className="h-[500px] w-full rounded-md border" />;
}
