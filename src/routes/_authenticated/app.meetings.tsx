import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, ExternalLink, Globe2, Locate, MapPin, Navigation, Phone, UserRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { listNearbyCompanies, listSiteVisits, type SiteVisit } from "@/lib/meetings.functions";
import { NearbyMap } from "@/components/meetings/NearbyMap";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/meetings")({ head: () => ({ meta: [{ title: "Meetings — Sales Insights" }] }), component: MeetingsPage });

type Match = { id: string; name: string; address: string | null; industry: string | null; lat: number; lng: number; distance_km: number; isLead: boolean; leadStatus: string | null };

function MeetingsPage() {
  const visitsFn = useServerFn(listSiteVisits);
  const { data: visits = [], isLoading, error } = useQuery({ queryKey: ["site-visits"], queryFn: () => visitsFn() });
  const now = Date.now();
  const upcoming = useMemo(() => visits.filter((v) => new Date(v.scheduled_at).getTime() >= now), [visits, now]);
  const past = useMemo(() => visits.filter((v) => new Date(v.scheduled_at).getTime() < now).reverse(), [visits, now]);
  const today = visits.filter((v) => new Date(v.scheduled_at).toDateString() === new Date().toDateString()).length;
  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="text-2xl font-bold tracking-tight">Meetings</h1><p className="text-sm text-muted-foreground">Site visits scheduled from lead and prospect activity journals.</p></div><p className="text-xs text-muted-foreground">Schedule from <b className="text-foreground">Log activity → Site Visit</b></p></div>
    <div className="grid gap-3 sm:grid-cols-3"><Metric icon={CalendarDays} label="Upcoming visits" value={upcoming.length} tone="bg-violet-50 text-violet-600" /><Metric icon={Clock3} label="Today" value={today} tone="bg-sky-50 text-sky-600" /><Metric icon={CheckCircle2} label="Past visits" value={past.length} tone="bg-emerald-50 text-emerald-600" /></div>
    <Tabs defaultValue="upcoming" className="space-y-4"><TabsList><TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger><TabsTrigger value="past">Past ({past.length})</TabsTrigger><TabsTrigger value="nearby">Nearby prospects</TabsTrigger></TabsList>
      <TabsContent value="upcoming"><VisitList visits={upcoming} loading={isLoading} error={error as Error | null} empty="No upcoming site visits. Log a Site Visit from a lead or prospect to schedule one." /></TabsContent>
      <TabsContent value="past"><VisitList visits={past} loading={isLoading} error={error as Error | null} empty="No past site visits yet." /></TabsContent>
      <TabsContent value="nearby"><NearbyScan /></TabsContent>
    </Tabs>
  </div>;
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof CalendarDays; label: string; value: number; tone: string }) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><span className={cn("grid h-10 w-10 place-items-center rounded-xl", tone)}><Icon className="h-5 w-5" /></span><div><div className="text-2xl font-bold leading-none">{value}</div><div className="mt-1 text-xs text-muted-foreground">{label}</div></div></CardContent></Card>;
}

function VisitList({ visits, loading, error, empty }: { visits: SiteVisit[]; loading: boolean; error: Error | null; empty: string }) {
  const navigate = useNavigate();
  if (loading) return <Empty>Loading meetings…</Empty>;
  if (error) return <Empty danger>{error.message}</Empty>;
  if (!visits.length) return <Empty>{empty}</Empty>;
  return <div className="space-y-3">{visits.map((v) => {
    const date = new Date(v.scheduled_at); const isPast = date.getTime() < Date.now();
    const target = v.source_module === "prospect" ? "/app/prospects/$id" : "/app/leads/$id";
    return <button key={v.id} type="button" onClick={() => navigate({ to: target, params: { id: v.source_id } })} className="group w-full text-left"><Card className="overflow-hidden transition hover:border-primary/35 hover:shadow-md"><CardContent className="p-0"><div className="grid md:grid-cols-[145px_1fr_auto]">
      <div className={cn("flex items-center gap-3 border-b p-4 md:flex-col md:items-start md:border-b-0 md:border-r", isPast ? "bg-muted/35" : "bg-primary/[0.04]")}><div className="text-3xl font-bold leading-none">{date.getDate()}</div><div><div className="text-xs font-semibold uppercase">{date.toLocaleDateString("en-AE", { month: "short", year: "numeric" })}</div><div className="mt-1 text-sm">{date.toLocaleTimeString("en-AE", { hour: "numeric", minute: "2-digit" })}</div></div><Badge variant={isPast ? "secondary" : "default"} className="md:mt-auto">{isPast ? "Happened" : "Upcoming"}</Badge></div>
      <div className="space-y-3 p-4"><div><div className="font-semibold group-hover:text-primary">{v.company_name}</div><p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{v.body}</p></div><div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2"><Info icon={UserRound}>Meeting {v.meeting_contact_name}</Info><Info icon={MapPin}>{v.meeting_state}{v.meeting_address ? ` · ${v.meeting_address}` : ""}</Info><Info icon={CalendarDays}>Assigned to <b className="text-foreground">{v.assignee_name}</b></Info><Info icon={Phone}>{v.meeting_contact_phone || v.meeting_contact_email}</Info></div></div>
      <div className="flex items-center gap-2 border-t p-4 md:border-l md:border-t-0">{v.meeting_company_url && <VisitLink href={v.meeting_company_url} label="Company website" icon={Globe2} />}{v.meeting_contact_url && <VisitLink href={v.meeting_contact_url} label="Contact page" icon={ExternalLink} />}<ExternalLink className="ml-1 h-4 w-4 text-muted-foreground group-hover:text-primary" /></div>
    </div></CardContent></Card></button>;
  })}</div>;
}

function Empty({ children, danger = false }: { children: React.ReactNode; danger?: boolean }) { return <Card><CardContent className={cn("p-10 text-center text-sm text-muted-foreground", danger && "text-destructive")}>{children}</CardContent></Card>; }
function Info({ icon: Icon, children }: { icon: typeof UserRound; children: React.ReactNode }) { return <span className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 shrink-0 text-foreground/60" />{children}</span>; }
function VisitLink({ href, label, icon: Icon }: { href: string; label: string; icon: typeof Globe2 }) { return <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="grid h-9 w-9 place-items-center rounded-md border hover:bg-accent" title={label}><Icon className="h-4 w-4" /></a>; }

function NearbyScan() {
  const scanFn = useServerFn(listNearbyCompanies); const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null); const [radiusKm, setRadiusKm] = useState(5); const [selectedId, setSelectedId] = useState<string | null>(null); const [geoError, setGeoError] = useState<string | null>(null);
  const scan = useMutation({ mutationFn: (vars: { lat: number; lng: number; radiusKm: number }) => scanFn({ data: vars }), onError: (e: Error) => toast.error(e.message) });
  const triggerGps = (silent = false) => { if (!navigator.geolocation) return setGeoError("Geolocation not supported."); navigator.geolocation.getCurrentPosition((pos) => { const o = { lat: pos.coords.latitude, lng: pos.coords.longitude }; setOrigin(o); setGeoError(null); scan.mutate({ ...o, radiusKm }); }, (err) => { setGeoError(err.message); if (!silent) toast.error(`Location denied: ${err.message}`); }, { enableHighAccuracy: true, timeout: 10000 }); };
  const bootstrapped = useRef(false); useEffect(() => { if (!bootstrapped.current) { bootstrapped.current = true; triggerGps(true); } }, []);
  const matches = (scan.data?.matches ?? []) as Match[]; const selected = matches.find((m) => m.id === selectedId) ?? null;
  return <div className="space-y-4"><Card><CardContent className="space-y-4 pt-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><Button onClick={() => triggerGps()}><Locate className="mr-2 h-4 w-4" /> Use my location</Button><div className="flex-1"><div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Radius</span><span>{radiusKm} km</span></div><Slider value={[radiusKm]} min={1} max={25} step={1} onValueChange={(v) => setRadiusKm(v[0] ?? 5)} /></div><Button onClick={() => origin ? scan.mutate({ ...origin, radiusKm }) : triggerGps()} disabled={scan.isPending}>{scan.isPending ? "Scanning…" : "Rescan"}</Button></div>{geoError && !origin && <p className="text-xs text-destructive">{geoError} — allow location access.</p>}</CardContent></Card>
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]"><Card><CardContent className="pt-6"><NearbyMap origin={origin} radiusKm={radiusKm} matches={matches} selectedId={selectedId} onSelect={setSelectedId} /></CardContent></Card><div className="space-y-3">{selected && <Card><CardContent className="space-y-3 pt-6"><b>{selected.name}</b><p className="text-xs text-muted-foreground">{selected.address}</p><div className="flex gap-2"><Button asChild size="sm"><Link to="/app/prospects/$id" params={{ id: selected.id }}><ExternalLink className="mr-1 h-3.5 w-3.5" /> Open</Link></Button><Button asChild size="sm" variant="secondary"><a href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`} target="_blank" rel="noreferrer"><Navigation className="mr-1 h-3.5 w-3.5" /> Directions</a></Button></div></CardContent></Card>}<Card><CardContent className="pt-6"><div className="mb-2 text-xs text-muted-foreground">Results ({matches.length})</div><ul className="max-h-[440px] space-y-1 overflow-auto">{matches.map((m) => <li key={m.id}><button onClick={() => setSelectedId(m.id)} className={cn("flex w-full justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-accent", selectedId === m.id && "border-primary bg-accent")}><span className="truncate font-medium">{m.name}</span><span className="text-xs text-muted-foreground">{m.distance_km.toFixed(1)} km</span></button></li>)}</ul></CardContent></Card></div></div></div>;
}
