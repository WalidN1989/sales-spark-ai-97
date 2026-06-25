import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Globe,
  Linkedin,
  Twitter,
  Facebook,
  Instagram,
  Youtube,
  Loader2,
  Sparkles,
  Mail,
  Search,
  Sparkle,
  Users as UsersIcon,
} from "lucide-react";
import { getCompany } from "@/lib/companies.functions";
import { draftCompetitorEmail, slugifyCompetitor } from "@/lib/competitor-email.functions";
import {
  enrichCompetitor,
  findCompetitorContacts,
  listCompetitorContacts,
  getOrCreateCompetitorProfile,
} from "@/lib/qualifying.functions";
import { AddToQualifyingDialog } from "@/components/competitor/AddToQualifyingDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/prospects/$id/competitor/$slug")({
  head: () => ({ meta: [{ title: "Competitor — Market Insight" }] }),
  component: CompetitorPanel,
});

type Competitor = {
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
};

function normalizeUrl(u: string) {
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

function CompetitorPanel() {
  const { id, slug } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getCo = useServerFn(getCompany);
  const draft = useServerFn(draftCompetitorEmail);
  const ensureProfileFn = useServerFn(getOrCreateCompetitorProfile);
  const enrichFn = useServerFn(enrichCompetitor);
  const findContactsFn = useServerFn(findCompetitorContacts);
  const listContactsFn = useServerFn(listCompetitorContacts);

  const { data, isLoading } = useQuery({
    queryKey: ["company", id],
    queryFn: () => getCo({ data: { id } }),
  });

  const { data: profile } = useQuery({
    queryKey: ["competitor-profile", id, slug],
    queryFn: () => ensureProfileFn({ data: { sourceCompanyId: id, competitorSlug: slug } }),
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["competitor-contacts", id, profile?.id],
    queryFn: () =>
      listContactsFn({ data: { sourceCompanyId: id, competitorId: profile!.id } }),
    enabled: !!profile?.id,
  });

  const enrich = useMutation({
    mutationFn: () => enrichFn({ data: { sourceCompanyId: id, competitorSlug: slug } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competitor-profile", id, slug] });
      toast.success("Enriched via Firecrawl");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const findContacts = useMutation({
    mutationFn: () =>
      findContactsFn({ data: { sourceCompanyId: id, competitorSlug: slug } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["competitor-contacts", id, profile?.id] });
      toast.success(`Found ${r.count} contact${r.count === 1 ? "" : "s"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [email, setEmail] = useState<{ subject: string; body: string } | null>(null);
  const [drafting, setDrafting] = useState(false);

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (!data) return null;

  const company = data.company as typeof data.company & {
    market_insight?: { competitors?: Competitor[] } | null;
  };
  const competitor = company.market_insight?.competitors?.find(
    (c) => slugifyCompetitor(c.name) === slug,
  );

  if (!competitor) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <p className="text-sm text-muted-foreground">
          Competitor not found. It may have been removed by a re-scan.
        </p>
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/prospects/$id" params={{ id }}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to company
          </Link>
        </Button>
      </div>
    );
  }

  const socials = competitor.socials ?? {};
  const hasSocials = Object.values(socials).some(Boolean);

  const handleDraft = async () => {
    setDrafting(true);
    try {
      const res = await draft({ data: { companyId: id, competitorSlug: slug } });
      setEmail(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to draft email");
    } finally {
      setDrafting(false);
    }
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  const openMail = () => {
    if (!email) return;
    const subject = encodeURIComponent(email.subject);
    const body = encodeURIComponent(email.body);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-2">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/app/prospects">Prospects</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/app/prospects/$id" params={{ id }}>
                {company.name}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <span>Competitors</span>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{competitor.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/app/prospects/$id", params: { id } })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => enrich.mutate()}
            disabled={enrich.isPending || !competitor.website}
            title={!competitor.website ? "No website to enrich" : "Scan website via Firecrawl"}
          >
            {enrich.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Sparkle className="mr-1 h-4 w-4" />
            )}
            Enrich
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => findContacts.mutate()}
            disabled={findContacts.isPending}
          >
            {findContacts.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-1 h-4 w-4" />
            )}
            Find Contacts
          </Button>
          <AddToQualifyingDialog
            sourceCompanyId={id}
            competitorSlug={slug}
            competitorName={competitor.name}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-2xl">{competitor.name}</CardTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                {competitor.country && (
                  <span className="rounded bg-secondary px-2 py-0.5">{competitor.country}</span>
                )}
                <Badge variant={competitor.source === "seeded" ? "default" : "secondary"}>
                  {competitor.source}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {competitor.website && (
                <Button asChild variant="outline" size="sm">
                  <a href={normalizeUrl(competitor.website)} target="_blank" rel="noreferrer">
                    <Globe className="mr-1 h-4 w-4" /> Website
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {hasSocials ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Socials:</span>
              <SocialIcons socials={socials} size="md" />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No social profiles discovered.</p>
          )}
        </CardContent>
      </Card>

      {contacts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UsersIcon className="h-4 w-4" /> Contacts ({contacts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Title</th>
                    <th className="p-2 text-left">Email</th>
                    <th className="p-2 text-left">Conf.</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="p-2 font-medium">
                        {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="p-2 text-xs">{c.position ?? "—"}</td>
                      <td className="p-2 text-xs">{c.email ?? "—"}</td>
                      <td className="p-2 text-xs">{c.confidence ?? "—"}</td>
                      <td className="p-2">
                        {c.linkedin_url && (
                          <a
                            href={c.linkedin_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Linkedin className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {(() => {
        const research = (profile as { research_data?: { summary?: string | null; markdown?: string | null; links?: string[] } | null } | undefined)?.research_data ?? null;
        const lastEnriched = (profile as { last_enriched_at?: string | null } | undefined)?.last_enriched_at ?? null;
        return (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {research?.summary ?? competitor.description ?? "No description available. Click Enrich to fetch from the website."}
                </p>
                {lastEnriched && (
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Enriched · {new Date(lastEnriched).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Products &amp; services</CardTitle>
              </CardHeader>
              <CardContent>
                {research?.markdown ? (
                  <div className="max-h-64 overflow-y-auto rounded border bg-muted/30 p-2 text-xs whitespace-pre-wrap">
                    {research.markdown.slice(0, 2000)}
                    {research.markdown.length > 2000 ? "…" : ""}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Click <strong>Enrich</strong> above to scan {competitor.website ?? "the website"} and extract product/service signals here.
                  </p>
                )}
              </CardContent>
            </Card>

            {email ? (
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Draft cold-outreach email</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-xs font-semibold text-muted-foreground">Subject</label>
                      <Button variant="ghost" size="sm" onClick={() => copy(email.subject)}>
                        <Copy className="mr-1 h-3 w-3" /> Copy
                      </Button>
                    </div>
                    <Input
                      value={email.subject}
                      onChange={(e) => setEmail({ ...email, subject: e.target.value })}
                    />
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
                      rows={10}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={handleDraft} disabled={drafting}>
                      {drafting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      Regenerate
                    </Button>
                    <Button variant="outline" size="sm" onClick={openMail}>
                      <Mail className="mr-2 h-4 w-4" /> Open in mail
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="md:col-span-2">
                <CardContent className="flex items-center justify-between gap-3 py-4">
                  <p className="text-xs text-muted-foreground">
                    Need a starter pitch? Generate a draft using your prospect&apos;s context.
                  </p>
                  <Button onClick={handleDraft} disabled={drafting} size="sm">
                    {drafting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Draft email
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        );
      })()}
    </div>
  );
}

export function SocialIcons({
  socials,
  size = "sm",
}: {
  socials: Competitor["socials"];
  size?: "sm" | "md";
}) {
  const s = socials ?? {};
  const items: Array<{ key: string; href?: string; Icon: typeof Linkedin; label: string }> = [
    { key: "linkedin", href: s.linkedin, Icon: Linkedin, label: "LinkedIn" },
    { key: "twitter", href: s.twitter, Icon: Twitter, label: "Twitter / X" },
    { key: "facebook", href: s.facebook, Icon: Facebook, label: "Facebook" },
    { key: "instagram", href: s.instagram, Icon: Instagram, label: "Instagram" },
    { key: "youtube", href: s.youtube, Icon: Youtube, label: "YouTube" },
  ];
  const present = items.filter((i) => !!i.href);
  if (!present.length) return <span className="text-xs text-muted-foreground">—</span>;
  const iconCls = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  const btnCls =
    size === "md"
      ? "inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-accent"
      : "inline-flex h-6 w-6 items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground";
  return (
    <div className="flex items-center gap-1">
      {present.map(({ key, href, Icon, label }) => (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer"
          title={label}
          aria-label={label}
          className={btnCls}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon className={iconCls} />
        </a>
      ))}
    </div>
  );
}
