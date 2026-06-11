/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, Sparkles, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateCompany } from "@/lib/companies.functions";
import { geocodeAddress } from "@/lib/meetings.functions";
import { PlaceAutocomplete, type PlacePick } from "@/components/location/PlaceAutocomplete";
import { toast } from "sonner";

type CompanyLike = {
  id: string;
  name: string | null;
  domain: string | null;
  country: string | null;
  industry: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  product_service: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
};

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

export function EditCompanyDialog({
  open,
  onOpenChange,
  company,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  company: CompanyLike;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateCompany);
  const geoFn = useServerFn(geocodeAddress);

  const [form, setForm] = useState({
    name: company.name ?? "",
    domain: company.domain ?? "",
    country: company.country ?? "",
    industry: company.industry ?? "",
    contact_person: company.contact_person ?? "",
    email: company.email ?? "",
    phone: company.phone ?? "",
    product_service: company.product_service ?? "",
    address: company.address ?? "",
  });
  const [lat, setLat] = useState<number | null>(company.lat);
  const [lng, setLng] = useState<number | null>(company.lng);

  // reset when company changes
  useEffect(() => {
    setForm({
      name: company.name ?? "",
      domain: company.domain ?? "",
      country: company.country ?? "",
      industry: company.industry ?? "",
      contact_person: company.contact_person ?? "",
      email: company.email ?? "",
      phone: company.phone ?? "",
      product_service: company.product_service ?? "",
      address: company.address ?? "",
    });
    setLat(company.lat);
    setLng(company.lng);
  }, [company.id, company.name, company.domain, company.country, company.industry, company.contact_person, company.email, company.phone, company.product_service, company.address, company.lat, company.lng]);

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const geocode = useMutation({
    mutationFn: (addr: string) => geoFn({ data: { address: addr } }),
    onSuccess: (r) => {
      setLat(r.lat);
      setLng(r.lng);
      toast.success("Address verified — drag the pin if needed.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          id: company.id,
          patch: {
            ...form,
            // empty strings → null
            domain: form.domain || null,
            country: form.country || null,
            industry: form.industry || null,
            contact_person: form.contact_person || null,
            email: form.email || null,
            phone: form.phone || null,
            product_service: form.product_service || null,
            address: form.address || null,
            lat,
            lng,
          },
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company", company.id] });
      qc.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Company updated");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // distance footnote
  const distanceKm =
    company.lat != null && company.lng != null && lat != null && lng != null
      ? haversineKm(company.lat, company.lng, lat, lng)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {company.name}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Company name" v={form.name} on={set("name")} />
          <Field label="Domain" v={form.domain} on={set("domain")} />
          <Field label="Industry" v={form.industry} on={set("industry")} />
          <Field label="Country" v={form.country} on={set("country")} />
          <Field label="Contact" v={form.contact_person} on={set("contact_person")} />
          <Field label="Email" v={form.email} on={set("email")} type="email" />
          <Field label="Phone" v={form.phone} on={set("phone")} />
          <Field label="Product/service" v={form.product_service} on={set("product_service")} />
        </div>

        <div className="space-y-2">
          <Label>Search venue or address</Label>
          <PlaceAutocomplete
            bias={lat != null && lng != null ? { lat, lng } : null}
            onPick={(p: PlacePick) => {
              setLat(p.lat);
              setLng(p.lng);
              setForm((f) => ({ ...f, address: p.address }));
            }}
          />
          <Label className="pt-2">Address</Label>
          <Textarea value={form.address} onChange={set("address")} rows={2} />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={geocode.isPending || !form.address.trim()}
              onClick={() => geocode.mutate(form.address.trim())}
            >
              {geocode.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3.5 w-3.5" />
              )}
              Verify on map
            </Button>
            {lat != null && lng != null && (
              <span className="text-xs text-muted-foreground">
                <MapPin className="mr-1 inline h-3 w-3" />
                {lat.toFixed(5)}, {lng.toFixed(5)}
              </span>
            )}
          </div>
          {distanceKm != null && distanceKm > 0.05 && (
            <p className="text-xs text-amber-600">
              Pin moved {distanceKm.toFixed(2)} km from the previously stored location.
            </p>
          )}
        </div>

        {lat != null && lng != null && (
          <MiniMapPicker
            lat={lat}
            lng={lng}
            onChange={(p) => {
              setLat(p.lat);
              setLng(p.lng);
            }}
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Latitude (manual)</Label>
            <Input
              type="number"
              step="any"
              value={lat ?? ""}
              onChange={(e) =>
                setLat(e.target.value === "" ? null : Number(e.target.value))
              }
            />
          </div>
          <div>
            <Label>Longitude (manual)</Label>
            <Input
              type="number"
              step="any"
              value={lng ?? ""}
              onChange={(e) =>
                setLng(e.target.value === "" ? null : Number(e.target.value))
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim()}>
            {save.isPending ? "Saving…" : "Save changes"}
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
            zoom: 15,
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
        } else {
          mapRef.current.panTo({ lat, lng });
          markerRef.current?.setPosition({ lat, lng });
        }
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  return (
    <div>
      <div ref={ref} className="h-[260px] w-full rounded-md border" />
      <p className="mt-1 text-xs text-muted-foreground">
        Drag the pin to fine-tune the exact location.
      </p>
    </div>
  );
}

function Field({
  label,
  v,
  on,
  type = "text",
}: {
  label: string;
  v: string;
  on: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={v} onChange={on} type={type} />
    </div>
  );
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
