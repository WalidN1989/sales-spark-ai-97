import { createFileRoute, Link, Outlet, useChildMatches, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Mail,
  Phone,
  Smartphone,
  Globe,
  MapPin,
  Trash2,
  Sparkles,
  Loader2,
  Copy,
  ScanSearch,
  Plus,
  Search,
  Pencil,
  MessageCircle,
  Users,
  ChevronDown,
} from "lucide-react";
import { FindContactsDialog } from "@/components/prospects/FindContactsDialog";
import { EditCompanyDialog } from "@/components/prospects/EditCompanyDialog";
import { PinLocationButton } from "@/components/location/PinLocationButton";
import { RespondTab } from "@/components/respond/RespondTab";
import { getCompany, deleteCompany, setCompanyStatus } from "@/lib/companies.functions";
import { getOrCreatePrimaryLeadForCompany, listLeadsByCompany } from "@/lib/leads.functions";
import { LeadPurchaseDialog } from "@/components/leads/LeadPurchaseDialog";
import { LookalikesPanel } from "@/components/prospects/LookalikesPanel";
import { LeadWorkspace, type WorkspaceContact } from "@/components/leads/LeadWorkspace";
import { researchCompany, generatePitchEmail } from "@/lib/research.functions";
import { scanMarketInsight, applyIndustry } from "@/lib/market.functions";
import { slugifyCompetitor } from "@/lib/competitor-email.functions";
import { SocialIcons } from "@/routes/_authenticated/app.prospects.$id.competitor.$slug";
import { Button } from "@/components/ui/button";
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

// Collapsible section for the secondary tools (research, pitch, market…).
function Section({ title, icon, children, defaultOpen = false }: { title: string; icon?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 p-3 text-sm font-semibold">
        {icon}
        {title}
        <ChevronDown className={cn("ml-auto h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t p-3">{children}</div>}
    </div>
  );
}

function CompanyProfile() {
  const { id } = Route.useParams();
  const childMatches = useChildMatches();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fn = useServerFn(getCompany);
  const del = useServerFn(deleteCompany);
  const setStatus = useServerFn(setCompanyStatus);
  const getOrCreateLead = useServerFn(getOrCreatePrimaryLeadForCompany);
  const listLeadsFn = useServerFn(listLeadsByCompany);

  const research = useServerFn(researchCompany);
  const pitch = useServerFn(generatePitchEmail);
  const scan = useServerFn(scanMarketInsight);
  const applyInd = useServerFn(applyIndustry);
  const { can } = useAccess();

  const { data, isLoading } = useQuery({ queryKey: ["company", id], queryFn: () => fn({ data: { id } }) });
  const { data: leadsData } = useQuery({
    queryKey: ["leads-group", id],
    queryFn: () => listLeadsFn({ data: { companyId: id } }),
  });

  const [researching, setResearching] = useState(false);
  const [pitching, setPitching] = useState(false);
  const [email, setEmail] = useState<{ subject: string; body: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [seedDraft, setSeedDraft] = useState<string | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [purchaseDialog, setPurchaseDialog] = useState<null | { leadId: string; trigger: "won" | "hot" | "warm" }>(null);

  if (childMatches.length > 0) return <Outlet />;
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data) return null;
  const c = data.company;

  const leads = (leadsData ?? []) as unknown as (WorkspaceContact & { is_primary?: boolean | null; created_at?: string | null })[];
  const anchorId =
    leads.find((l) => l.is_primary)?.id ??
    [...leads].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))[0]?.id ??
    "";

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
      setEmail(await pitch({ data: { id } }));
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
    const raw = seedDraft ?? ((c as { market_seed_urls?: string[] }).market_seed_urls ?? []).join("\n");
    const seedUrls = raw.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);
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

  const mobile = (c as { mobile?: string | null }).mobile ?? null;

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/app/prospects" className="inline-flex items-center hover:text-foreground">
          <ArrowLeft className="mr-1 h-4 w-4" /> Prospects
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">{c.name}</span>
        <Link
          to="/app/leads/group/$companyId"
          params={{ companyId: id }}
          className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-primary"
          title="Open leads for this company"
        >
          <Users className="h-3.5 w-3.5" />
        </Link>
        <span className="ml-1">
          <CompanyStatusPill
            status={((c as { status?: CompanyStatus }).status ?? "warm") as CompanyStatus}
            onChange={async (s) => {
              const current = (c as { status?: CompanyStatus }).status;
              try {
                await setStatus({ data: { id, status: s } });
                qc.invalidateQueries({ queryKey: ["company", id] });
                qc.invalidateQueries({ queryKey: ["leads-group", id] });
                toast.success(`Status: ${s}`);
                if ((s === "won" || s === "hot" || s === "warm") && s !== current) {
                  const { leadId } = await getOrCreateLead({ data: { companyId: id } });
                  setPurchaseDialog({ leadId, trigger: s });
                }
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed");
              }
            }}
          />
        </span>
      </nav>
      <div className="flex flex-wrap items-center gap-1">
        <PinLocationButton companyId={id} companyName={c.name} currentLat={c.lat} currentLng={c.lng} />
        <Button variant="ghost" size="sm" onClick={() => setFindOpen(true)}>
          <Search className="mr-1 h-4 w-4" /> <span className="hidden sm:inline">Find Contacts</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="mr-1 h-4 w-4" /> Edit
        </Button>
        {can("prospects", "delete") && (
          <Button variant="ghost" size="icon" onClick={handleDelete} className="text-destructive" title="Delete company">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );

  const cm = c as typeof c & {
    market_insight?: {
      industries?: Array<{ name: string; confidence: number }>;
      competitors?: Array<{
        name: string;
        website: string | null;
        country: string | null;
        description: string | null;
        source: "seeded" | "ai";
        socials?: { linkedin?: string; twitter?: string; facebook?: string; instagram?: string; youtube?: string };
      }>;
      generated_at?: string;
    } | null;
    market_insight_at?: string | null;
    market_seed_urls?: string[] | null;
  };
  const insight = cm.market_insight;
  const seedsValue = seedDraft ?? (cm.market_seed_urls ?? []).join("\n");

  return (
    <>
      <LeadWorkspace
        companyName={c.name}
        industry={c.industry}
        country={c.country}
        city={(c as { city?: string | null }).city ?? null}
        website={c.domain}
        contacts={leads}
        anchorId={anchorId}
        extraProducts={c.product_service ? [c.product_service] : []}
        onSelectContact={(cid) => navigate({ to: "/app/leads/$id", params: { id: cid } })}
        onAddContact={() => setFindOpen(true)}
        resolveAnchor={async () => {
          const { leadId } = await getOrCreateLead({ data: { companyId: id } });
          qc.invalidateQueries({ queryKey: ["leads-group", id] });
          return leadId;
        }}
        header={header}
        notesEntityType="prospect"
        notesEntityId={id}
        onChanged={() => {
          qc.invalidateQueries({ queryKey: ["leads-group", id] });
          qc.invalidateQueries({ queryKey: ["company", id] });
        }}
        companyInfo={
          <div className="space-y-2 text-sm">
            {c.domain && (
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                <a href={`https://${c.domain.replace(/^https?:\/\//, "")}`} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">
                  {c.domain}
                </a>
              </div>
            )}
            {c.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                <a href={`mailto:${c.email}`} className="truncate hover:underline">{c.email}</a>
              </div>
            )}
            {c.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a>
                <span className="text-[10px] text-muted-foreground">landline</span>
              </div>
            )}
            {mobile && (
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                <a href={`tel:${mobile}`} className="hover:underline">{mobile}</a>
                {waHref(mobile) && (
                  <a href={waHref(mobile)!} target="_blank" rel="noreferrer" title="WhatsApp" className="inline-flex h-5 w-5 items-center justify-center rounded bg-[#25D366] text-white hover:bg-[#1ebc59]">
                    <MessageCircle className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
            {c.address && (
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{c.address}</span>
              </div>
            )}
            {c.contact_person && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Contact</span>
                <span className="text-right font-medium">{c.contact_person}</span>
              </div>
            )}
            {c.product_service && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Product</span>
                <span className="text-right font-medium">{c.product_service}</span>
              </div>
            )}
            {c.lat && c.lng && (
              <div className="text-xs text-muted-foreground">
                Geocoded: {c.lat.toFixed(4)}, {c.lng.toFixed(4)}
              </div>
            )}
          </div>
        }
        secondary={
          <>
            {can("prospects", "research") && (
              <Section title="AI Research" icon={<Sparkles className="h-4 w-4" />}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    {c.last_research_at ? `Last run: ${new Date(c.last_research_at).toLocaleString()}` : "No research yet."}
                  </div>
                  <Button size="sm" onClick={handleResearch} disabled={researching || !c.domain}>
                    {researching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    {c.last_research_at ? "Re-run" : "Run research"}
                  </Button>
                </div>
                {!c.domain && <p className="text-xs text-muted-foreground">Add a website/domain to enable scraping.</p>}
                {c.research_data && (() => {
                  const r = c.research_data as { summary?: string; markdown?: string; source_url?: string };
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
                          <div className="max-h-64 overflow-auto whitespace-pre-wrap rounded border bg-muted/40 p-3 text-xs">
                            {r.markdown.slice(0, 3000)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </Section>
            )}

            {can("prospects", "pitch") && (
              <Section title="Pitch Email" icon={<Mail className="h-4 w-4" />}>
                <div className="mb-2 flex justify-end">
                  <Button size="sm" onClick={handlePitch} disabled={pitching}>
                    {pitching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    {email ? "Regenerate" : "Generate"}
                  </Button>
                </div>
                {!c.research_data && <p className="text-xs text-muted-foreground">Tip: run AI research first for a more tailored email.</p>}
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
                      <Textarea value={email.body} onChange={(e) => setEmail({ ...email, body: e.target.value })} rows={12} />
                    </div>
                  </div>
                )}
              </Section>
            )}

            <Section title="Respond" icon={<MessageCircle className="h-4 w-4" />}>
              <RespondTab companyId={id} />
            </Section>

            <Section title="Market Insight" icon={<ScanSearch className="h-4 w-4" />}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  Last scan: {cm.market_insight_at ? new Date(cm.market_insight_at).toLocaleString() : "never"}
                </div>
                <Button size="sm" onClick={handleScan} disabled={scanning}>
                  {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}
                  {insight ? "Re-scan" : "Scan"}
                </Button>
              </div>

              {insight?.competitors?.length ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Website</TableHead>
                        <TableHead>Country</TableHead>
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
                            onClick={() => navigate({ to: "/app/prospects/$id/competitor/$slug", params: { id, slug } })}
                          >
                            <TableCell className="font-medium">{cp.name}</TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {cp.website ? (
                                <a href={/^https?:\/\//i.test(cp.website) ? cp.website : `https://${cp.website}`} target="_blank" rel="noreferrer" className="text-primary underline">
                                  {cp.website}
                                </a>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>{cp.country ?? "—"}</TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <SocialIcons socials={cp.socials} />
                            </TableCell>
                            <TableCell>
                              <Badge variant={cp.source === "seeded" ? "default" : "secondary"}>{cp.source}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No competitors yet. Add seed URLs below and run a scan.</p>
              )}

              {insight?.industries?.length ? (
                <div className="mt-3">
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">Suggested industries</div>
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
                        <Badge variant="outline" className="text-[10px]">{Math.round(ind.confidence * 100)}%</Badge>
                        <Plus className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-3">
                <div className="mb-1 text-xs font-semibold text-muted-foreground">Seed competitor URLs</div>
                <Textarea rows={3} placeholder={"https://competitor-1.com\nhttps://competitor-2.com"} value={seedsValue} onChange={(e) => setSeedDraft(e.target.value)} />
                <p className="mt-1 text-xs text-muted-foreground">One URL per line. Saved with the next scan. Up to 5 are scraped.</p>
              </div>
            </Section>

            <Section title="Lookalikes" icon={<Users className="h-4 w-4" />}>
              <LookalikesPanel companyId={id} companyName={c.name} />
            </Section>
          </>
        }
      />

      <FindContactsDialog open={findOpen} onOpenChange={setFindOpen} companyId={id} />
      <EditCompanyDialog open={editOpen} onOpenChange={setEditOpen} company={c as Parameters<typeof EditCompanyDialog>[0]["company"]} />
      {purchaseDialog && (
        <LeadPurchaseDialog
          open
          onOpenChange={(v) => {
            if (!v) setPurchaseDialog(null);
          }}
          leadId={purchaseDialog.leadId}
          trigger={purchaseDialog.trigger}
          optional
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["purchases-by-source", id] });
            qc.invalidateQueries({ queryKey: ["company", id] });
          }}
        />
      )}
    </>
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
          <DropdownMenuItem key={s} onClick={() => onChange(s)} className="flex items-center gap-2 capitalize">
            <span className={cn("h-2.5 w-2.5 rounded-full", COMPANY_STATUS_STYLES[s])} />
            {s}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
