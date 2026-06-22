import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Mail, MessageCircle, Linkedin, ExternalLink, Copy, Building2 } from "lucide-react";
import { toast } from "sonner";

import { listLeadsByReseller } from "@/lib/leads.functions";
import { setCompanyStatus, getCompany } from "@/lib/companies.functions";
import { EntityNotesRail } from "@/components/notes/EntityNotesRail";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CompanyStatusPill } from "@/routes/_authenticated/app.prospects.$id";
import {
  type LeadStatus,
  leadInitials,
  waHref,
  fmtMoneyCents,
  scoreBucket,
  timeAgo,
  LEAD_STATUS_STYLES,
} from "@/lib/leads-ui";
import { cn, type CompanyStatus } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/leads/reseller/$resellerId")({
  head: () => ({ meta: [{ title: "Reseller — Sales Insights" }] }),
  component: ResellerView,
});

type Lead = {
  id: string;
  contact_person: string | null;
  contact_email: string | null;
  whatsapp: string | null;
  status: LeadStatus;
  pipeline_value_cents: number;
  job_title: string | null;
  lead_score: number | null;
  company_name: string | null;
  linkedin_url: string | null;
  department: string | null;
  seniority: string | null;
  end_user_project: string | null;
  last_activity_at: string | null;
  last_activity_note: string | null;
};

function ResellerView() {
  const { resellerId } = Route.useParams();
  const qc = useQueryClient();

  const listFn = useServerFn(listLeadsByReseller);
  const getCompanyFn = useServerFn(getCompany);
  const setStatusFn = useServerFn(setCompanyStatus);

  const { data, isLoading } = useQuery({
    queryKey: ["leads-reseller", resellerId],
    queryFn: () => listFn({ data: { resellerId } }),
  });
  const leads = (data ?? []) as unknown as Lead[];

  const { data: companyData } = useQuery({
    queryKey: ["company", resellerId],
    queryFn: () => getCompanyFn({ data: { id: resellerId } }),
  });
  const company = companyData?.company as
    | { name: string; status?: CompanyStatus | null; domain?: string | null }
    | undefined;
  const companyStatus = (company?.status ?? "warm") as CompanyStatus;

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading reseller…</p>;

  const total = leads.reduce((a, l) => a + (l.pipeline_value_cents || 0), 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav className="flex items-center gap-1 text-sm text-muted-foreground">
            <Link to="/app/leads" className="hover:text-foreground inline-flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Leads
            </Link>
            <span>/</span>
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <Building2 className="h-3.5 w-3.5 text-amber-600" />
              {company?.name ?? "Reseller"}
            </span>
            <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
              Reseller
            </span>
            <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              {leads.length} contact{leads.length === 1 ? "" : "s"}
            </span>
            <span className="ml-2">
              <CompanyStatusPill
                status={companyStatus}
                onChange={async (s) => {
                  try {
                    await setStatusFn({ data: { id: resellerId, status: s } });
                    qc.invalidateQueries({ queryKey: ["company", resellerId] });
                    toast.success(`Status: ${s}`);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed");
                  }
                }}
              />
            </span>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const emails = leads.map((l) => l.contact_email).filter((e): e is string => !!e);
                if (emails.length === 0) return toast.warning("No emails to copy");
                await navigator.clipboard.writeText(emails.join(", "));
                toast.success(`Copied ${emails.length} email${emails.length === 1 ? "" : "s"}`);
              }}
            >
              <Copy className="mr-1 h-4 w-4" /> Copy emails
            </Button>
          </div>
        </div>

        {total > 0 && (
          <Card className="p-3 text-sm">
            Total pipeline · <span className="font-semibold">{fmtMoneyCents(total)}</span>
          </Card>
        )}

        {leads.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No contacts under this reseller yet.
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {leads.map((l) => (
              <ContactCard key={l.id} l={l} />
            ))}
          </div>
        )}
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-4 max-h-[calc(100vh-2rem)]">
          <EntityNotesRail entityType="prospect" entityId={resellerId} title="Company notes" />
        </div>
      </aside>
    </div>
  );
}

function ContactCard({ l }: { l: Lead }) {
  const wa = waHref(l.whatsapp);
  const sb = scoreBucket(l.lead_score);
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-secondary text-sm font-semibold">
          {leadInitials(l.contact_person, l.company_name ?? "?")}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{l.contact_person || l.contact_email || "—"}</div>
          {l.job_title && (
            <div className="truncate text-xs text-muted-foreground">{l.job_title}</div>
          )}
        </div>
        <span
          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${LEAD_STATUS_STYLES[l.status]}`}
        >
          {l.status}
        </span>
      </div>

      {l.end_user_project && (
        <div className="rounded-md bg-muted/40 p-2 text-xs">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            End user / project
          </div>
          <div className="text-foreground whitespace-pre-wrap">{l.end_user_project}</div>
        </div>
      )}

      <div className="space-y-0.5 text-xs text-muted-foreground">
        {l.contact_email && <div className="truncate">✉ {l.contact_email}</div>}
        {l.whatsapp && <div className="truncate">☎ {l.whatsapp}</div>}
        {l.pipeline_value_cents > 0 && (
          <div className="text-foreground font-semibold">{fmtMoneyCents(l.pipeline_value_cents)}</div>
        )}
        {l.last_activity_at && <div>Last activity · {timeAgo(l.last_activity_at)}</div>}
      </div>

      {(l.lead_score ?? 0) > 0 && (
        <span className={cn("inline-block rounded px-1.5 py-0.5 text-[10px] font-bold", sb.className)}>
          Score {l.lead_score}
        </span>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {l.linkedin_url && (
          <Button asChild size="sm" className="bg-[#0A66C2] text-white hover:bg-[#0a4f96]">
            <a href={l.linkedin_url} target="_blank" rel="noopener noreferrer">
              <Linkedin className="mr-1 h-3.5 w-3.5" /> LinkedIn
            </a>
          </Button>
        )}
        {wa && (
          <Button asChild size="sm" className="bg-[#25D366] text-white hover:bg-[#1ebc59]">
            <a href={wa} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-1 h-3.5 w-3.5" /> WhatsApp
            </a>
          </Button>
        )}
        {l.contact_email && (
          <Button asChild size="sm" variant="outline">
            <a href={`mailto:${l.contact_email}`}>
              <Mail className="mr-1 h-3.5 w-3.5" /> Email
            </a>
          </Button>
        )}
        <Button asChild size="sm" variant="outline" className="ml-auto">
          <Link to="/app/leads/$id" params={{ id: l.id }}>
            Open <ExternalLink className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
