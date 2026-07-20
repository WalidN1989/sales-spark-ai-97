import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowLeft, Building2, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { listLeadsByCompany, resolveCompanyIdByGroupKey, addContactToCompany } from "@/lib/leads.functions";
import { setCompanyStatus, getCompany } from "@/lib/companies.functions";
import { EntityNotesRail } from "@/components/notes/EntityNotesRail";
import { LeadWorkspace, type WorkspaceContact } from "@/components/leads/LeadWorkspace";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CompanyStatusPill } from "@/routes/_authenticated/app.prospects.$id";
import { fmtMoneyCents, type LeadStatus } from "@/lib/leads-ui";
import { type CompanyStatus } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/leads/group/$companyId")({
  head: () => ({ meta: [{ title: "Company — Sales Insights" }] }),
  component: GroupView,
});

type Lead = WorkspaceContact & {
  company_id: string | null;
  prospect_id: string | null;
  company_name: string | null;
  website: string | null;
  reseller_company_id?: string | null;
  companies: { name: string; domain: string | null; country: string | null; industry: string | null } | null;
};

function GroupView() {
  const { companyId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listLeadsByCompany);
  const resolveFn = useServerFn(resolveCompanyIdByGroupKey);
  const getCompanyFn = useServerFn(getCompany);
  const setStatusFn = useServerFn(setCompanyStatus);
  const addContactFn = useServerFn(addContactToCompany);
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["leads-group", companyId],
    queryFn: () => listFn({ data: { companyId } }),
  });
  const { data: resolved } = useQuery({
    queryKey: ["leads-group-company", companyId],
    queryFn: () => resolveFn({ data: { key: companyId } }),
  });
  const resolvedCompanyId = resolved?.companyId ?? null;
  const leads = (data ?? []) as unknown as Lead[];

  const { data: companyData } = useQuery({
    queryKey: ["company", resolvedCompanyId],
    queryFn: () => getCompanyFn({ data: { id: resolvedCompanyId! } }),
    enabled: !!resolvedCompanyId,
  });
  const company = companyData?.company as
    | { status?: CompanyStatus; industry?: string | null; country?: string | null; city?: string | null; domain?: string | null; website?: string | null; address?: string | null }
    | undefined;
  const companyStatus = (company?.status ?? "warm") as CompanyStatus;

  const groupNotesCompanyId =
    resolvedCompanyId ??
    leads.find((l) => l.company_id)?.company_id ??
    leads.find((l) => l.prospect_id)?.prospect_id ??
    null;

  const anchorId = useMemo(() => {
    if (leads.length === 0) return "";
    const primary =
      leads.find((l) => l.is_primary) ??
      [...leads].sort((a, b) => (a.contact_person ?? "").localeCompare(b.contact_person ?? ""))[0];
    return primary.id;
  }, [leads]);

  const companyName = leads[0]?.company_name ?? leads[0]?.companies?.name ?? company?.industry ?? "Company";
  const industry = company?.industry ?? leads[0]?.companies?.industry ?? null;
  const country = company?.country ?? leads[0]?.companies?.country ?? null;
  const website = company?.website ?? company?.domain ?? leads[0]?.website ?? leads[0]?.companies?.domain ?? null;
  const totalValue = leads.reduce((a, l) => a + (l.pipeline_value_cents ?? 0), 0);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading company…</p>;
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

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/app/leads" className="hover:text-foreground">
          Leads
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">{companyName}</span>
        {resolvedCompanyId && (
          <Link
            to="/app/prospects/$id"
            params={{ id: resolvedCompanyId }}
            className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-primary"
            title="Open prospect card"
          >
            <Building2 className="h-3.5 w-3.5" />
          </Link>
        )}
        {resolvedCompanyId && (
          <span className="ml-1">
            <CompanyStatusPill
              status={companyStatus}
              onChange={async (s) => {
                try {
                  await setStatusFn({ data: { id: resolvedCompanyId, status: s } });
                  qc.invalidateQueries({ queryKey: ["company", resolvedCompanyId] });
                  toast.success(`Status: ${s}`);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                }
              }}
            />
          </span>
        )}
      </nav>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          const emails = leads.map((l) => l.contact_email).filter((e): e is string => !!e);
          if (emails.length === 0) return toast.warning("No emails to copy");
          await navigator.clipboard.writeText(emails.join(", "));
          toast.success(`Copied ${emails.length} email${emails.length === 1 ? "" : "s"}`);
        }}
        title="Copy all emails (Outlook-ready)"
      >
        <Copy className="mr-1 h-4 w-4" /> Copy emails
      </Button>
    </div>
  );

  return (
    <>
      <LeadWorkspace
        companyName={companyName}
        industry={industry}
        country={country}
        city={company?.city ?? null}
        website={website}
        contacts={leads}
        anchorId={anchorId}
        onSelectContact={(id) => navigate({ to: "/app/leads/$id", params: { id } })}
        onAddContact={resolvedCompanyId ? () => setAddOpen(true) : undefined}
        header={header}
        onChanged={() => {
          qc.invalidateQueries({ queryKey: ["leads-group", companyId] });
          qc.invalidateQueries({ queryKey: ["leads"] });
        }}
        companyInfo={
          <dl className="space-y-2 text-sm">
            {[
              ["Industry", industry],
              ["Country", country],
              ["City", company?.city],
              ["Address", company?.address],
              ["Pipeline value", totalValue > 0 ? fmtMoneyCents(totalValue) : null],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium">{v as string}</dd>
                </div>
              ))}
            {website && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Website</dt>
                <dd>
                  <a
                    href={`https://${website.replace(/^https?:\/\//, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    {website.replace(/^https?:\/\//, "")} <ExternalLink className="h-3 w-3" />
                  </a>
                </dd>
              </div>
            )}
            {resolvedCompanyId && (
              <Link
                to="/app/prospects/$id"
                params={{ id: resolvedCompanyId }}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Full company details <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </dl>
        }
        notesRail={
          <EntityNotesRail entityType="prospect" entityId={groupNotesCompanyId} title="Company notes" />
        }
      />

      {resolvedCompanyId && (
        <AddContactDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          companyId={resolvedCompanyId}
          onCreated={() => {
            setAddOpen(false);
            qc.invalidateQueries({ queryKey: ["leads-group", companyId] });
            qc.invalidateQueries({ queryKey: ["leads"] });
            toast.success("Contact added");
          }}
          addContactFn={addContactFn}
        />
      )}
    </>
  );
}

// ---------- Add Contact dialog ----------

type AddContactInput = {
  companyId: string;
  contact_person: string;
  contact_email: string | null;
  whatsapp: string | null;
  job_title: string | null;
  department: string | null;
};

function AddContactDialog({
  open,
  onClose,
  companyId,
  onCreated,
  addContactFn,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  onCreated: (id: string) => void;
  addContactFn: (args: { data: AddContactInput }) => Promise<{ id: string }>;
}) {
  const [name, setName] = useState("");
  const [emailAddr, setEmailAddr] = useState("");
  const [wa, setWa] = useState("");
  const [title, setTitle] = useState("");
  const [dept, setDept] = useState("");

  const reset = () => {
    setName("");
    setEmailAddr("");
    setWa("");
    setTitle("");
    setDept("");
  };

  const create = useMutation({
    mutationFn: () =>
      addContactFn({
        data: {
          companyId,
          contact_person: name.trim(),
          contact_email: emailAddr.trim() || null,
          whatsapp: wa.trim() || null,
          job_title: title.trim() || null,
          department: dept.trim() || null,
        },
      }),
    onSuccess: (r: { id: string }) => {
      reset();
      onCreated(r.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add contact to this company</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Contact name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </div>
          <div>
            <Label>Job title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Procurement Manager" />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={emailAddr} onChange={(e) => setEmailAddr(e.target.value)} maxLength={200} type="email" />
          </div>
          <div>
            <Label>WhatsApp / phone</Label>
            <Input value={wa} onChange={(e) => setWa(e.target.value)} maxLength={30} placeholder="+9715…" />
          </div>
          <div className="sm:col-span-2">
            <Label>Department</Label>
            <Input value={dept} onChange={(e) => setDept(e.target.value)} maxLength={120} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Adding…" : "Add contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
