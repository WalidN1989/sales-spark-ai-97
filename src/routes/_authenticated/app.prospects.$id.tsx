import { createFileRoute, Link, Outlet, useChildMatches, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Mail, Phone, Smartphone, Globe, MapPin, Trash2, Sparkles, Loader2, Copy, ScanSearch, Plus, Search, Pencil, MessageCircle, Users } from "lucide-react";
import { FindContactsDialog } from "@/components/prospects/FindContactsDialog";
import { EditCompanyDialog } from "@/components/prospects/EditCompanyDialog";
import { PinLocationButton } from "@/components/location/PinLocationButton";
import { EntityNotesRail } from "@/components/notes/EntityNotesRail";

import { RespondTab } from "@/components/respond/RespondTab";
import { getCompany, deleteCompany, setCompanyStatus } from "@/lib/companies.functions";
import { researchCompany, generatePitchEmail } from "@/lib/research.functions";
import { scanMarketInsight, applyIndustry } from "@/lib/market.functions";
import { slugifyCompetitor } from "@/lib/competitor-email.functions";
import { SocialIcons } from "@/routes/_authenticated/app.prospects.$id.competitor.$slug";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COMPANY_STATUSES, COMPANY_STATUS_STYLES, type CompanyStatus, cn } from "@/lib/utils";
import { waHref } from "@/lib/leads-ui";

import { useAccess } from "@/hooks/use-access";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/prospects/$id")({
  head: () => ({ meta: [{ title: "Company — Sales Insights" }] }),
  component: CompanyProfile,
});

function CompanyProfile() {
  const { id } = Route.useParams();
  const childMatches = useChildMatches();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fn = useServerFn(getCompany);
  const del = useServerFn(deleteCompany);
  const setStatus = useServerFn(setCompanyStatus);

  const research = useServerFn(researchCompany);
  const pitch = useServerFn(generatePitchEmail);
  const scan = useServerFn(scanMarketInsight);
  const applyInd = useServerFn(applyIndustry);
  const { can } = useAccess();

  const { data, isLoading } = useQuery({ queryKey: ["company", id], queryFn: () => fn({ data: { id } }) });
  const [researching, setResearching] = useState(false);
  const [pitching, setPitching] = useState(false);
  const [email, setEmail] = useState<{ subject: string; body: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [seedDraft, setSeedDraft] = useState<string | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  if (childMatches.length > 0) return <Outlet />;
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data) return null;
  const c = data.company;

  const handleDelete = async () => {
    if (!confirm(`Delete ${c.name}? This can't be undone.`)) return;
    await del({ data: { id } });
    toast.success("Company deleted");
    navigate({ to: "/app/prospects" });
  };


  const handleResearch = async () => {
    setResearching(true);
    try {
      await research({ data: { id } });
      qc.invalidateQueries({ queryKey: ["company", id] });
      toast.success("Research complete");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Research failed");
    } finally {
      setResearching(false);
    }
  };

  const handlePitch = async () => {
    setPitching(true);
    try {
      const result = await pitch({ data: { id } });
      setEmail(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Pitch generation failed");
    } finally {
      setPitching(false);
    }
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  const handleScan = async () => {
    const raw = seedDraft ?? (((c as { market_seed_urls?: string[] }).market_seed_urls ?? []).join("\n"));
    const seedUrls = raw
      .split(/\r?\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    setScanning(true);
    try {
      await scan({ data: { companyId: id, seedUrls } });
      qc.invalidateQueries({ queryKey: ["company", id] });
      setSeedDraft(null);
      toast.success("Market scan complete");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const handleApplyIndustry = async (industry: string) => {
    try {
      await applyInd({ data: { companyId: id, industry } });
      qc.invalidateQueries({ queryKey: ["company", id] });
      toast.success(`Industry set to "${industry}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update industry");
    }
  };

  return (
    <div className="mx-auto grid max-w-[1400px] gap-6 min-w-0 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4 min-w-0">

      <div className="grid grid-cols-[auto_1fr] items-center gap-2 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link to="/app/prospects"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-primary"
            title="Open leads for this company"
          >
            <Link to="/app/leads/group/$companyId" params={{ companyId: id }}>
              <Users className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <PinLocationButton
            companyId={id}
            companyName={c.name}
            currentLat={c.lat}
            currentLng={c.lng}
          />
          <Button variant="outline" size="sm" onClick={() => setFindOpen(true)} className="shrink-0">
            <Search className="mr-1 h-4 w-4" />
            <span className="hidden sm:inline">{qc.getQueryData(["hunter-find", id]) ? "Show Contacts" : "Find Contacts"}</span>
            <span className="sm:hidden">Contacts</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="shrink-0">
            <Pencil className="mr-1 h-4 w-4" /> Edit
          </Button>
          {can("prospects", "delete") && (
            <Button variant="ghost" size="sm" onClick={handleDelete} className="shrink-0 text-destructive">
              <Trash2 className="mr-1 h-4 w-4" /> <span className="hidden sm:inline">Delete</span>
            </Button>
          )}
        </div>
      </div>
      <FindContactsDialog open={findOpen} onOpenChange={setFindOpen} companyId={id} />
      <EditCompanyDialog open={editOpen} onOpenChange={setEditOpen} company={c as Parameters<typeof EditCompanyDialog>[0]["company"]} />


      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-xl break-words sm:text-2xl">{c.name}</CardTitle>
              <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                {c.industry && <span className="rounded bg-secondary px-2 py-0.5">{c.industry}</span>}
                {c.country && <span className="rounded bg-secondary px-2 py-0.5">{c.country}</span>}
                <CompanyStatusPill
                  status={((c as { status?: CompanyStatus }).status ?? "warm") as CompanyStatus}
                  onChange={async (s) => {
                    try {
                      await setStatus({ data: { id, status: s } });
                      qc.invalidateQueries({ queryKey: ["company", id] });
                      qc.invalidateQueries({ queryKey: ["leads-group", id] });
                      toast.success(`Status: ${s}`);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed");
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          {c.domain && <Row icon={Globe} label={c.domain} />}
          {c.email && <Row icon={Mail} label={c.email} />}
          {c.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a>
              <span className="text-[10px] text-muted-foreground">landline</span>
            </div>
          )}
          {(c as { mobile?: string | null }).mobile && (() => {
            const mobile = (c as { mobile?: string | null }).mobile!;
            const wa = waHref(mobile);
            return (
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <a href={`tel:${mobile}`} className="hover:underline">{mobile}</a>
                {wa && (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noreferrer"
                    title="WhatsApp"
                    className="inline-flex h-5 w-5 items-center justify-center rounded bg-[#25D366] text-white hover:bg-[#1ebc59]"
                  >
                    <MessageCircle className="h-3 w-3" />
                  </a>
                )}
              </div>
            );
          })()}
          {c.address && <Row icon={MapPin} label={c.address} />}
          {c.contact_person && <div><span className="text-muted-foreground">Contact: </span>{c.contact_person}</div>}
          {c.product_service && <div><span className="text-muted-foreground">Product: </span>{c.product_service}</div>}
        </CardContent>
      </Card>

      <Tabs defaultValue={can("prospects", "research") ? "research" : "respond"}>
        <TabsList className="w-full overflow-x-auto justify-start">
          {can("prospects", "research") && <TabsTrigger value="research">AI research</TabsTrigger>}
          {can("prospects", "pitch") && <TabsTrigger value="pitch">Pitch email</TabsTrigger>}
          <TabsTrigger value="respond">Respond</TabsTrigger>
          <TabsTrigger value="market">Market insight</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
        </TabsList>


        <TabsContent value="research">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  {c.last_research_at
                    ? `Last run: ${new Date(c.last_research_at).toLocaleString()}`
                    : "No research yet."}
                </div>
                <Button onClick={handleResearch} disabled={researching || !c.domain}>
                  {researching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  {c.last_research_at ? "Re-run research" : "Run AI research"}
                </Button>
              </div>
              {!c.domain && (
                <p className="text-xs text-muted-foreground">Add a website/domain to enable scraping.</p>
              )}
              {c.research_data && (() => {
                const r = c.research_data as { summary?: string; markdown?: string; source_url?: string; links?: string[] };
                return (
                  <div className="space-y-3">
                    {r.source_url && (
                      <a href={r.source_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                        {r.source_url}
                      </a>
                    )}
                    {r.summary && (
                      <div>
                        <h4 className="mb-1 text-sm font-semibold">Summary</h4>
                        <p className="whitespace-pre-wrap text-sm">{r.summary}</p>
                      </div>
                    )}
                    {r.markdown && (
                      <div>
                        <h4 className="mb-1 text-sm font-semibold">Extracted content</h4>
                        <div className="max-h-64 overflow-auto rounded border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
                          {r.markdown.slice(0, 3000)}
                        </div>
                      </div>
                    )}
                    {c.lat && c.lng && (
                      <div className="text-xs text-muted-foreground">
                        Geocoded: {c.lat.toFixed(4)}, {c.lng.toFixed(4)}
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="pitch">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="flex justify-end">
                <Button onClick={handlePitch} disabled={pitching}>
                  {pitching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  {email ? "Regenerate" : "Generate pitch email"}
                </Button>
              </div>
              {!c.research_data && (
                <p className="text-xs text-muted-foreground">Tip: run AI research first for a more tailored email.</p>
              )}
              {email && (
                <div className="space-y-2">
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-xs font-semibold text-muted-foreground">Subject</label>
                      <Button variant="ghost" size="sm" onClick={() => copy(email.subject)}>
                        <Copy className="mr-1 h-3 w-3" /> Copy
                      </Button>
                    </div>
                    <Input value={email.subject} onChange={(e) => setEmail({ ...email, subject: e.target.value })} />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-xs font-semibold text-muted-foreground">Body</label>
                      <Button variant="ghost" size="sm" onClick={() => copy(email.body)}>
                        <Copy className="mr-1 h-3 w-3" /> Copy
                      </Button>
                    </div>
                    <Textarea
                      value={email.body}
                      onChange={(e) => setEmail({ ...email, body: e.target.value })}
                      rows={12}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="respond">
          <RespondTab companyId={id} />
        </TabsContent>
        <TabsContent value="market">
          {(() => {
            const cm = c as typeof c & {
              market_insight?: {
                industries?: Array<{ name: string; confidence: number }>;
                competitors?: Array<{
                  name: string;
                  website: string | null;
                  country: string | null;
                  description: string | null;
                  source: "seeded" | "ai";
                  socials?: {
                    linkedin?: string;
                    twitter?: string;
                    facebook?: string;
                    instagram?: string;
                    youtube?: string;
                  };
                }>;
                generated_at?: string;
              } | null;
              market_insight_at?: string | null;
              market_seed_urls?: string[] | null;
            };
            const insight = cm.market_insight;
            const seedsValue =
              seedDraft ?? (cm.market_seed_urls ?? []).join("\n");
            return (
              <div className="space-y-4">
                <Card className="border-0 bg-slate-900 text-slate-100">
                  <CardContent className="space-y-4 pt-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold">Market Insight</h3>
                        <p className="text-sm text-slate-300">
                          Analyze competitive positioning and similar companies for this sector.
                        </p>
                      </div>
                      <Button onClick={handleScan} disabled={scanning}>
                        {scanning ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <ScanSearch className="mr-2 h-4 w-4" />
                        )}
                        {insight ? "Re-scan" : "Scan"}
                      </Button>
                    </div>
                    <div className="rounded-md bg-slate-800/60 px-3 py-2 text-xs text-slate-300">
                      Last scan:{" "}
                      {cm.market_insight_at
                        ? new Date(cm.market_insight_at).toLocaleString()
                        : "never"}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Competitors</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {insight?.competitors?.length ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Website</TableHead>
                              <TableHead>Country</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead>Social</TableHead>
                              <TableHead>Source</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {insight.competitors.map((cp, i) => {
                              const slug = slugifyCompetitor(cp.name);
                              return (
                                <TableRow
                                  key={`${cp.name}-${i}`}
                                  className="cursor-pointer"
                                  onClick={() =>
                                    navigate({
                                      to: "/app/prospects/$id/competitor/$slug",
                                      params: { id, slug },
                                    })
                                  }
                                >
                                  <TableCell className="font-medium">{cp.name}</TableCell>
                                  <TableCell onClick={(e) => e.stopPropagation()}>
                                    {cp.website ? (
                                      <a
                                        href={
                                          /^https?:\/\//i.test(cp.website)
                                            ? cp.website
                                            : `https://${cp.website}`
                                        }
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-primary underline"
                                      >
                                        {cp.website}
                                      </a>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                  <TableCell>{cp.country ?? "—"}</TableCell>
                                  <TableCell className="max-w-md text-sm text-muted-foreground">
                                    {cp.description ?? "—"}
                                  </TableCell>
                                  <TableCell onClick={(e) => e.stopPropagation()}>
                                    <SocialIcons socials={cp.socials} />
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={cp.source === "seeded" ? "default" : "secondary"}>
                                      {cp.source}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No competitors yet. Add seed URLs below and run a scan.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Suggested industries</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {insight?.industries?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {insight.industries.map((ind) => (
                          <button
                            key={ind.name}
                            type="button"
                            onClick={() => handleApplyIndustry(ind.name)}
                            className="group inline-flex items-center gap-2 rounded-full border bg-secondary px-3 py-1 text-sm hover:bg-secondary/70"
                            title={`Apply "${ind.name}" as the company industry`}
                          >
                            <span>{ind.name}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {Math.round(ind.confidence * 100)}%
                            </Badge>
                            <Plus className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Run a scan to see suggested industries.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Seed competitor URLs</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Textarea
                      rows={4}
                      placeholder={"https://competitor-1.com\nhttps://competitor-2.com"}
                      value={seedsValue}
                      onChange={(e) => setSeedDraft(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      One URL per line. Saved with the next scan. Up to 5 are scraped.
                    </p>
                  </CardContent>
                </Card>
              </div>
            );
          })()}
        </TabsContent>
        <TabsContent value="sales">
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Sales history for this company will appear here once the Sales module is wired up.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
      <aside className="hidden lg:block">
        <div className="sticky top-4 h-[calc(100vh-2rem)]">
          <EntityNotesRail entityType="prospect" entityId={id} title="Notes" />
        </div>
      </aside>
    </div>
  );
}


function Row({ icon: Icon, label }: { icon: typeof Mail; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span>{label}</span>
    </div>
  );
}

export function CompanyStatusPill({
  status,
  onChange,
}: {
  status: CompanyStatus;
  onChange: (s: CompanyStatus) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-opacity hover:opacity-80",
            COMPANY_STATUS_STYLES[status],
          )}
          title="Change company status"
        >
          {status}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[120px]">
        {COMPANY_STATUSES.map((s) => (
          <DropdownMenuItem
            key={s}
            onClick={() => onChange(s)}
            className="flex items-center gap-2 capitalize"
          >
            <span className={cn("h-2.5 w-2.5 rounded-full", COMPANY_STATUS_STYLES[s])} />
            {s}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
