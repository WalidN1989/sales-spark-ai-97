import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo } from "react";
import {
  ArrowLeft,
  Mail,
  MessageCircle,
  Linkedin,
  Maximize2,
  Minimize2,
  SplitSquareHorizontal,
  ExternalLink,
} from "lucide-react";

import { listLeadsByCompany } from "@/lib/leads.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  LEAD_STATUS_STYLES,
  type LeadStatus,
  leadInitials,
  waHref,
  fmtMoneyCents,
  scoreBucket,
  timeAgo,
} from "@/lib/leads-ui";
import { cn } from "@/lib/utils";

type Search = {
  left?: string;
  right?: string;
  focus?: "left" | "right";
};

export const Route = createFileRoute("/_authenticated/app/leads/group/$companyId")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    left: typeof s.left === "string" ? s.left : undefined,
    right: typeof s.right === "string" ? s.right : undefined,
    focus: s.focus === "left" || s.focus === "right" ? s.focus : undefined,
  }),
  head: () => ({ meta: [{ title: "Lead Group — Sales Insights" }] }),
  component: GroupView,
});

type Lead = {
  id: string;
  company_id: string | null;
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
  hunter_confidence: number | null;
  last_activity_at: string | null;
  last_activity_note: string | null;
  notes: string | null;
  website: string | null;
  companies: { name: string; domain: string | null; country: string | null; industry: string | null } | null;
};

function GroupView() {
  const { companyId } = Route.useParams();
  const { left, right, focus } = Route.useSearch();
  const navigate = useNavigate();
  const listFn = useServerFn(listLeadsByCompany);

  const { data, isLoading } = useQuery({
    queryKey: ["leads-group", companyId],
    queryFn: () => listFn({ data: { companyId } }),
  });
  const leads = (data ?? []) as unknown as Lead[];

  // Default selection: first lead in left pane
  useEffect(() => {
    if (!isLoading && leads.length > 0 && !left) {
      navigate({
        to: "/app/leads/group/$companyId",
        params: { companyId },
        search: { left: leads[0].id, right, focus },
        replace: true,
      });
    }
  }, [isLoading, leads.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const leftLead = left ? leadById.get(left) ?? null : null;
  const rightLead = right ? leadById.get(right) ?? null : null;

  const companyName = leads[0]?.company_name ?? leads[0]?.companies?.name ?? "Company";

  const setLeft = (id: string | undefined) =>
    navigate({ to: "/app/leads/group/$companyId", params: { companyId }, search: { left: id, right, focus } });
  const setRight = (id: string | undefined) =>
    navigate({ to: "/app/leads/group/$companyId", params: { companyId }, search: { left, right: id, focus } });
  const setFocus = (f: "left" | "right" | undefined) =>
    navigate({ to: "/app/leads/group/$companyId", params: { companyId }, search: { left, right, focus: f } });

  const toggleCompare = () => {
    if (right) {
      setRight(undefined);
    } else {
      const other = leads.find((l) => l.id !== left);
      if (other) setRight(other.id);
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading group…</p>;
  if (leads.length === 0)
    return (
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/leads">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to Leads
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">No leads in this group.</p>
      </div>
    );

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between gap-2">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <Link to="/app/leads" className="hover:text-foreground">
            Leads
          </Link>
          <span>/</span>
          <span className="font-medium text-foreground">{companyName}</span>
          <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            {leads.length} leads
          </span>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={toggleCompare} disabled={leads.length < 2}>
            <SplitSquareHorizontal className="mr-1 h-4 w-4" />
            {right ? "Single view" : "Compare"}
          </Button>
        </div>
      </div>

      {/* Carousel of lead mini-cards */}
      <Carousel
        leads={leads}
        leftId={left}
        rightId={right}
        onPickLeft={(id) => setLeft(id)}
        onPickRight={(id) => setRight(id)}
        compareMode={!!right}
      />

      {/* Detail panes */}
      {focus === "left" && leftLead ? (
        <LeadPanel lead={leftLead} side="left" onUnfocus={() => setFocus(undefined)} focused />
      ) : focus === "right" && rightLead ? (
        <LeadPanel lead={rightLead} side="right" onUnfocus={() => setFocus(undefined)} focused />
      ) : right && leftLead && rightLead ? (
        <div className="grid min-h-[480px] gap-3 md:grid-cols-2 rounded-lg border p-2">
          <LeadPanel lead={leftLead} side="left" onFocus={() => setFocus("left")} />
          <LeadPanel lead={rightLead} side="right" onFocus={() => setFocus("right")} />
        </div>
      ) : leftLead ? (
        <LeadPanel lead={leftLead} side="left" />
      ) : null}
    </div>
  );
}

// ---------- Carousel ----------

function Carousel({
  leads,
  leftId,
  rightId,
  onPickLeft,
  onPickRight,
  compareMode,
}: {
  leads: Lead[];
  leftId: string | undefined;
  rightId: string | undefined;
  onPickLeft: (id: string) => void;
  onPickRight: (id: string) => void;
  compareMode: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {leads.map((l) => {
        const isLeft = l.id === leftId;
        const isRight = l.id === rightId;
        return (
          <button
            key={l.id}
            type="button"
            onClick={() => {
              if (compareMode) {
                if (isLeft) return;
                if (isRight) return;
                onPickRight(l.id);
              } else {
                onPickLeft(l.id);
              }
            }}
            className={cn(
              "w-full rounded-lg border p-3 text-left transition-colors",
              isLeft
                ? "border-primary bg-primary/5 ring-2 ring-primary"
                : isRight
                  ? "border-amber-500 bg-amber-50 ring-2 ring-amber-500"
                  : "hover:bg-accent",
            )}
          >
            <div className="flex items-start gap-2">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-secondary text-xs font-bold">
                {leadInitials(l.contact_person, l.company_name ?? "?")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{l.contact_person || l.contact_email || "—"}</div>
                {l.job_title && (
                  <div className="truncate text-[11px] text-muted-foreground">{l.job_title}</div>
                )}
              </div>
              <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold uppercase", LEAD_STATUS_STYLES[l.status])}>
                {l.status}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{isLeft ? "Primary" : isRight ? "Compare" : "Click to view"}</span>
              {l.linkedin_url && <Linkedin className="h-3 w-3 text-[#0A66C2]" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------- Lead Panel ----------

function LeadPanel({
  lead,
  side,
  onFocus,
  onUnfocus,
  focused,
}: {
  lead: Lead;
  side: "left" | "right";
  onFocus?: () => void;
  onUnfocus?: () => void;
  focused?: boolean;
}) {
  const wa = waHref(lead.whatsapp);
  const sb = scoreBucket(lead.lead_score);
  return (
    <Card className="h-full p-4 space-y-3 rounded-none border-0">
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-secondary text-base font-semibold">
          {leadInitials(lead.contact_person, lead.company_name ?? "?")}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-bold">{lead.contact_person || lead.contact_email || "—"}</h2>
            <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase", LEAD_STATUS_STYLES[lead.status])}>
              {lead.status}
            </span>
          </div>
          {lead.job_title && (
            <div className="text-sm font-medium text-muted-foreground">{lead.job_title}</div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {lead.department && <span className="rounded bg-muted px-1.5 py-0.5">{lead.department}</span>}
            {lead.seniority && <span className="rounded bg-muted px-1.5 py-0.5 capitalize">{lead.seniority}</span>}
            {lead.hunter_confidence != null && (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700">
                {lead.hunter_confidence}%
              </span>
            )}
            {(lead.lead_score ?? 0) > 0 && (
              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", sb.className)}>
                Score {lead.lead_score}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {onFocus && (
            <Button size="icon" variant="ghost" onClick={onFocus} title="Focus pane">
              <Maximize2 className="h-4 w-4" />
            </Button>
          )}
          {onUnfocus && (
            <Button size="icon" variant="ghost" onClick={onUnfocus} title="Exit focus">
              <Minimize2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-1 text-xs text-muted-foreground">
        {lead.contact_email && <div>✉ {lead.contact_email}</div>}
        {lead.whatsapp && <div>☎ {lead.whatsapp}</div>}
        {lead.pipeline_value_cents > 0 && (
          <div className="text-foreground font-semibold">Value · {fmtMoneyCents(lead.pipeline_value_cents)}</div>
        )}
        {lead.last_activity_at && <div>Last activity · {timeAgo(lead.last_activity_at)}</div>}
      </div>

      {lead.last_activity_note && (
        <div className="border-l-2 border-muted pl-2 text-xs italic text-muted-foreground line-clamp-3">
          "{lead.last_activity_note}"
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {lead.linkedin_url && (
          <Button asChild size="sm" className="bg-[#0A66C2] text-white hover:bg-[#0a4f96]">
            <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer">
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
        {lead.contact_email && (
          <Button asChild size="sm" variant="outline">
            <a href={`mailto:${lead.contact_email}`}>
              <Mail className="mr-1 h-3.5 w-3.5" /> Email
            </a>
          </Button>
        )}
        <Button asChild size="sm" variant="outline" className="ml-auto">
          <Link to="/app/leads/$id" params={{ id: lead.id }}>
            Open full <ExternalLink className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {side === "left" ? "Primary" : "Comparison"}
      </div>
    </Card>
  );
}
