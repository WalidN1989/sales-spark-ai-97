import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Trash2,
  Mail,
  MessageCircle,
  Save,
  ExternalLink,
  Globe,
  Upload,
  FileText,
  Download,
  Linkedin,
  Link2,
  Plus,
  X,
  Target,
  Building2,
  ChevronDown,
} from "lucide-react";
import {
  listInquiriesForLead,
  listInquiries,
  linkLeadToInquiry,
  unlinkLeadFromInquiry,
  createInquiry,
} from "@/lib/inquiries.functions";
import {
  getLead,
  updateLead,
  deleteLead,
  setLeadStatusManual,
  clearLeadStatusOverride,
  listLeadDocuments,
  createLeadDocumentUploadUrl,
  registerLeadDocument,
  getLeadDocumentDownloadUrl,
  deleteLeadDocument,
  createProspectFromLead,
} from "@/lib/leads.functions";
import { listResellerCompanies } from "@/lib/companies.functions";
import { Checkbox } from "@/components/ui/checkbox";
import { hunterVerifyEmail } from "@/lib/hunter.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LEAD_STATUSES,
  LEAD_STATUS_STYLES,
  type LeadStatus,
  domainFromEmail,
  normalizeWebsite,
  hostFromWebsite,
  DOC_LABELS,
  type DocLabel,
  fmtFileSize,
  scoreBucket,
  EMAIL_STATUS_STYLES,
  EMAIL_STATUS_LABEL,
  type EmailStatusUI,
} from "@/lib/leads-ui";
import { TagInput } from "@/components/leads/TagInput";
import { RespondTab } from "@/components/respond/RespondTab";
import { PinLocationButton } from "@/components/location/PinLocationButton";
import { LeadPurchaseDialog } from "@/components/leads/LeadPurchaseDialog";
import { listLeadPurchases } from "@/lib/lead-purchases.functions";
import { LeadWorkspace, type WorkspaceContact } from "@/components/leads/LeadWorkspace";

import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/leads/$id")({
  head: () => ({ meta: [{ title: "Lead — Sales Insights" }] }),
  component: LeadDetail,
});

// Collapsible section for the secondary (below-the-fold) tools.
function Section({ title, icon, children, defaultOpen = false }: { title: string; icon?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 p-3 text-sm font-semibold"
      >
        {icon}
        {title}
        <ChevronDown className={cn("ml-auto h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t p-3">{children}</div>}
    </div>
  );
}

function LeadDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const getFn = useServerFn(getLead);
  const updateFn = useServerFn(updateLead);
  const deleteFn = useServerFn(deleteLead);
  const setStatusFn = useServerFn(setLeadStatusManual);
  const clearOverrideFn = useServerFn(clearLeadStatusOverride);
  const verifyFn = useServerFn(hunterVerifyEmail);
  const createProspectFn = useServerFn(createProspectFromLead);

  const { data: lead, isLoading } = useQuery({
    queryKey: ["lead", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [wa, setWa] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [value, setValue] = useState("0");
  const [brands, setBrands] = useState<string[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [isReseller, setIsReseller] = useState(false);
  const [resellerChoice, setResellerChoice] = useState<string>("");
  const [endUserProject, setEndUserProject] = useState("");

  const listResellersFn = useServerFn(listResellerCompanies);
  const { data: resellers = [] } = useQuery({
    queryKey: ["reseller-companies"],
    queryFn: () => listResellersFn(),
  });

  useEffect(() => {
    if (lead) {
      const l = lead as typeof lead & {
        lead_type?: string | null;
        reseller_company_id?: string | null;
        end_user_project?: string | null;
      };
      setContact(lead.contact_person ?? "");
      setEmail(lead.contact_email ?? "");
      setWa(lead.whatsapp ?? "");
      setCompanyName(lead.company_name ?? "");
      setWebsite(lead.website ?? "");
      setJobTitle((lead as { job_title?: string | null }).job_title ?? "");
      setValue(String((lead.pipeline_value_cents ?? 0) / 100));
      setBrands((lead.brands as string[] | null) ?? []);
      setProducts((lead.products_services as string[] | null) ?? []);
      setNotes(lead.notes ?? "");
      setIsReseller(l.lead_type === "reseller");
      setResellerChoice(l.reseller_company_id ?? "");
      setEndUserProject(l.end_user_project ?? "");
    }
  }, [lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  type Patch = {
    status?: LeadStatus;
    contact_person?: string | null;
    contact_email?: string | null;
    whatsapp?: string | null;
    pipeline_value_cents?: number;
    company_name?: string | null;
    website?: string | null;
    brands?: string[];
    products_services?: string[];
    notes?: string | null;
    job_title?: string | null;
    lead_type?: "direct" | "reseller";
    reseller_company_id?: string | null;
    end_user_project?: string | null;
  };

  const update = useMutation({
    mutationFn: (patch: Patch) => updateFn({ data: { id, patch } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead", id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: () => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead removed");
      navigate({ to: "/app/leads" });
    },
  });

  const setStatusManual = useMutation({
    mutationFn: (status: LeadStatus) => setStatusFn({ data: { id, status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead", id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const listPurchasesFn = useServerFn(listLeadPurchases);
  const [purchaseDialog, setPurchaseDialog] = useState<null | {
    trigger: "won" | "hot" | "manual";
    pendingStatus?: LeadStatus;
  }>(null);

  const requestStatusChange = async (next: LeadStatus) => {
    const current = (lead as { status?: LeadStatus } | undefined)?.status;
    if ((next === "won" || next === "hot") && current !== next) {
      const existing = await listPurchasesFn({ data: { leadId: id } });
      setPurchaseDialog({ trigger: next as "won" | "hot", pendingStatus: next });
      void existing;
      return;
    }
    setStatusManual.mutate(next);
  };

  const clearOverride = useMutation({
    mutationFn: () => clearOverrideFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead", id] });
      toast.success("Auto-scoring re-enabled");
    },
  });

  const verify = useMutation({
    mutationFn: () => verifyFn({ data: { leadId: id } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["lead", id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`Email ${r.email_status}${r.email_score != null ? ` · ${r.email_score}` : ""}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const goToProspect = useMutation({
    mutationFn: () => createProspectFn({ data: { leadId: id } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["lead", id] });
      toast.success(r.created ? "Prospect created" : "Opening existing prospect");
      navigate({ to: "/app/prospects/$id", params: { id: r.companyId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!lead) return <p className="text-sm text-muted-foreground">Not found.</p>;

  const l = lead as typeof lead & {
    company_id: string | null;
    prospect_id: string | null;
    status: LeadStatus;
    job_title: string | null;
    lead_score: number | null;
    email_status: EmailStatusUI | null;
    email_score: number | null;
    last_verified_at: string | null;
    lead_score_manual_override: boolean;
    linkedin_url: string | null;
    department: string | null;
    seniority: string | null;
    hunter_confidence: number | null;
  };

  const suggestedDomain = !website.trim() && email ? domainFromEmail(email) : null;
  const effectiveWebsite = website.trim() || suggestedDomain || "";
  const effectiveHost = hostFromWebsite(effectiveWebsite);
  const websiteHref = normalizeWebsite(effectiveWebsite);
  const sb = scoreBucket(l.lead_score);
  const sharedCompanyNoteId = l.company_id ?? l.prospect_id ?? null;
  const notesEntityType = sharedCompanyNoteId ? "prospect" : "lead";
  const notesEntityId = sharedCompanyNoteId ?? id;

  const handleSave = async () => {
    await update.mutateAsync({
      contact_person: contact || null,
      contact_email: email || null,
      whatsapp: wa || null,
      company_name: companyName || null,
      website: website || (suggestedDomain ?? null),
      job_title: jobTitle || null,
      pipeline_value_cents: Math.max(0, Math.round(Number(value || "0") * 100)),
      brands,
      products_services: products,
      notes: notes || null,
      lead_type: isReseller ? "reseller" : "direct",
      reseller_company_id: isReseller && resellerChoice ? resellerChoice : null,
      end_user_project: isReseller ? endUserProject || null : null,
    });
    toast.success("Saved");
  };

  const workspaceContact: WorkspaceContact = {
    id: l.id,
    contact_person: l.contact_person,
    contact_email: l.contact_email,
    whatsapp: l.whatsapp,
    phone: (l as { phone?: string | null }).phone ?? null,
    job_title: l.job_title,
    linkedin_url: l.linkedin_url,
    is_primary: true,
    lead_score: l.lead_score,
    status: l.status,
    pipeline_stage: (l as { pipeline_stage?: string | null }).pipeline_stage ?? null,
    next_action: (l as { next_action?: string | null }).next_action ?? null,
    next_action_due: (l as { next_action_due?: string | null }).next_action_due ?? null,
    priority: (l as { priority?: string | null }).priority ?? null,
    last_activity_at: (l as { last_activity_at?: string | null }).last_activity_at ?? null,
    products_services: (l.products_services as string[] | null) ?? [],
    pipeline_value_cents: l.pipeline_value_cents ?? 0,
  };

  const companyDisplay = l.company_name || l.companies?.name || (l.whatsapp ? "WhatsApp lead" : "Lead");

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/app/leads" className="inline-flex items-center hover:text-foreground">
          <ArrowLeft className="mr-1 h-4 w-4" /> Leads
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">{companyDisplay}</span>
      </nav>
      <div className="flex flex-wrap items-center gap-1">
        {/* Status control (drives scoring + purchase capture) */}
        <div className="flex rounded-md border bg-background p-0.5">
          {LEAD_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => requestStatusChange(s)}
              className={cn(
                "rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
                l.status === s ? LEAD_STATUS_STYLES[s] : "text-muted-foreground hover:bg-muted",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        {(l.lead_score ?? 0) > 0 && (
          <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold", sb.className)}>
            {l.lead_score} · {sb.label}
          </span>
        )}
        {l.company_id && (
          <PinLocationButton
            companyId={l.company_id}
            companyName={l.company_name ?? l.companies?.name ?? null}
            currentLat={(l.companies as { lat?: number | null } | null)?.lat ?? null}
            currentLng={(l.companies as { lng?: number | null } | null)?.lng ?? null}
          />
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => goToProspect.mutate()}
          disabled={goToProspect.isPending}
          title={l.company_id ? "Open prospect" : "Create prospect from this lead"}
        >
          <Building2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPurchaseDialog({ trigger: "manual" })}
          title="Record / edit what this customer bought"
        >
          <Target className="mr-1 h-3.5 w-3.5" /> Purchase
        </Button>
        <Button variant="ghost" size="icon" onClick={() => confirm("Remove this lead?") && del.mutate()} className="text-destructive" title="Delete lead">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <LeadWorkspace
        companyName={companyDisplay}
        industry={l.companies?.industry ?? null}
        country={l.companies?.country ?? null}
        website={effectiveWebsite || null}
        contacts={[workspaceContact]}
        anchorId={id}
        reminderEntity={{ type: "lead", id, label: companyDisplay }}
        header={header}
        onChanged={() => {
          qc.invalidateQueries({ queryKey: ["lead", id] });
          qc.invalidateQueries({ queryKey: ["leads"] });
        }}
        companyInfo={
          <div className="space-y-2 text-sm">
            {websiteHref && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Website</span>
                <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                  {effectiveHost} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
            {l.department && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Department</span>
                <span className="font-medium">{l.department}</span>
              </div>
            )}
            {l.email_status && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Email status</span>
                <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", EMAIL_STATUS_STYLES[l.email_status])}>
                  {EMAIL_STATUS_LABEL[l.email_status]}
                </span>
              </div>
            )}
            {l.lead_score_manual_override ? (
              <button type="button" onClick={() => clearOverride.mutate()} className="text-xs text-muted-foreground hover:text-foreground">
                Status manually set · re-enable auto-scoring
              </button>
            ) : null}
          </div>
        }
        secondary={
          <>
            <Section title="Edit lead details" icon={<Save className="h-4 w-4" />}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Contact name</Label>
                  <Input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} />
                </div>
                <div>
                  <Label>Job title</Label>
                  <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={200} placeholder="e.g. Procurement Manager" />
                </div>
                <div>
                  <Label>WhatsApp number</Label>
                  <Input value={wa} onChange={(e) => setWa(e.target.value)} maxLength={30} placeholder="+971501234567" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} type="email" />
                  {email && (
                    <button type="button" onClick={() => verify.mutate()} disabled={verify.isPending} className="mt-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-60">
                      {verify.isPending ? "Verifying…" : "Verify email"}
                    </button>
                  )}
                </div>
                <div>
                  <Label>Company name</Label>
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} maxLength={200} placeholder="Optional" />
                </div>
                <div>
                  <Label>Website / domain</Label>
                  <Input value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={300} placeholder={suggestedDomain ?? "example.com"} />
                </div>
                <div>
                  <Label>Pipeline value (AED)</Label>
                  <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" type="number" min="0" />
                </div>
              </div>

              <div className="mt-3 rounded-lg border bg-amber-50/40 p-3 dark:bg-amber-950/10">
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox checked={isReseller} onCheckedChange={(c) => setIsReseller(c === true)} />
                  <span className="text-sm font-medium">This is a Reseller lead</span>
                </label>
                {isReseller && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <Label>Primary reseller</Label>
                      <Select value={resellerChoice} onValueChange={setResellerChoice}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick reseller company…" />
                        </SelectTrigger>
                        <SelectContent>
                          {resellers.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>End user / project details</Label>
                      <Textarea value={endUserProject} onChange={(e) => setEndUserProject(e.target.value)} rows={2} maxLength={1000} />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 grid gap-3">
                <div>
                  <Label>Brands they distribute</Label>
                  <TagInput value={brands} onChange={setBrands} placeholder="HP, Logitech… (Enter)" />
                </div>
                <div>
                  <Label>Products & services</Label>
                  <TagInput value={products} onChange={setProducts} placeholder="Signature pads, Access control… (Enter)" />
                </div>
                <div>
                  <Label>Background notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} rows={3} placeholder="Customer profile, strengths…" />
                </div>
              </div>

              <div className="mt-3 flex justify-end">
                <Button onClick={handleSave} disabled={update.isPending}>
                  <Save className="mr-1 h-4 w-4" /> {update.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </Section>

            <Section title="Documents" icon={<FileText className="h-4 w-4" />}>
              <DocumentsCard leadId={id} />
            </Section>

            <Section title="Linked inquiries" icon={<Target className="h-4 w-4" />}>
              <InquiriesCard leadId={id} />
            </Section>

            <Section title="AI Respond" icon={<Globe className="h-4 w-4" />}>
              <RespondTab leadId={id} />
            </Section>
          </>
        }
        notesEntityType={notesEntityType}
        notesEntityId={notesEntityId}
      />

      {purchaseDialog && (
        <LeadPurchaseDialog
          open={!!purchaseDialog}
          onOpenChange={(v) => {
            if (!v) setPurchaseDialog(null);
          }}
          leadId={id}
          trigger={purchaseDialog.trigger}
          onSaved={() => {
            if (purchaseDialog.pendingStatus) setStatusManual.mutate(purchaseDialog.pendingStatus);
            setPurchaseDialog(null);
          }}
        />
      )}
    </>
  );
}

// ---------------- Documents ----------------

function DocumentsCard({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listLeadDocuments);
  const signFn = useServerFn(createLeadDocumentUploadUrl);
  const registerFn = useServerFn(registerLeadDocument);
  const downloadFn = useServerFn(getLeadDocumentDownloadUrl);
  const delFn = useServerFn(deleteLeadDocument);

  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState<DocLabel>("trade_license");
  const [uploading, setUploading] = useState(false);

  const { data: docs = [] } = useQuery({
    queryKey: ["lead-documents", leadId],
    queryFn: () => listFn({ data: { leadId } }),
  });

  const handleFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10 MB");
      return;
    }
    setUploading(true);
    try {
      const signed = await signFn({
        data: { leadId, fileName: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size, label },
      });
      const putRes = await fetch(signed.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);
      await registerFn({
        data: { leadId, label, fileName: file.name, storagePath: signed.path, mimeType: file.type || "application/octet-stream", sizeBytes: file.size },
      });
      qc.invalidateQueries({ queryKey: ["lead-documents", leadId] });
      toast.success("Uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (docId: string) => {
    try {
      const { url } = await downloadFn({ data: { id: docId } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const del = useMutation({
    mutationFn: (docId: string) => delFn({ data: { id: docId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-documents", leadId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={label} onValueChange={(v) => setLabel(v as DocLabel)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(DOC_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
          <Upload className="mr-1 h-4 w-4" /> {uploading ? "Uploading…" : "Upload"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
      <div className="space-y-2">
        {docs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No documents yet.</p>
        ) : (
          docs.map((d) => (
            <div key={d.id} className="flex items-center gap-3 rounded border bg-muted/30 p-2">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{d.file_name}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded bg-secondary px-1.5 py-0.5 uppercase">{DOC_LABELS[d.label as DocLabel] ?? d.label}</span>
                  <span>{fmtFileSize(d.size_bytes)}</span>
                </div>
              </div>
              <button onClick={() => handleDownload(d.id)} className="grid h-8 w-8 place-items-center rounded hover:bg-muted" title="Download">
                <Download className="h-4 w-4" />
              </button>
              <button
                onClick={() => confirm(`Delete ${d.file_name}?`) && del.mutate(d.id)}
                className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-destructive"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------- Inquiries link ----------------

function InquiriesCard({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const listForLeadFn = useServerFn(listInquiriesForLead);
  const listAllFn = useServerFn(listInquiries);
  const linkFn = useServerFn(linkLeadToInquiry);
  const unlinkFn = useServerFn(unlinkLeadFromInquiry);
  const createFn = useServerFn(createInquiry);

  const linkedQ = useQuery({
    queryKey: ["lead-inquiries", leadId],
    queryFn: () => listForLeadFn({ data: { leadId } }),
  });
  const allQ = useQuery({
    queryKey: ["inquiries-all"],
    queryFn: () => listAllFn(),
  });

  const linked = (linkedQ.data ?? []) as Array<{
    inquiry_id: string;
    inquiries: { id: string; title: string; status: string } | null;
  }>;
  const linkedIds = new Set(linked.map((l) => l.inquiry_id));
  const available = ((allQ.data ?? []) as Array<{ id: string; title: string; status: string }>).filter((i) => !linkedIds.has(i.id));

  const [picker, setPicker] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["lead-inquiries", leadId] });
    qc.invalidateQueries({ queryKey: ["inquiries-all"] });
  };

  const linkExisting = useMutation({
    mutationFn: async (inquiryId: string) => linkFn({ data: { inquiryId, leadId } }),
    onSuccess: () => {
      toast.success("Linked to inquiry");
      setPicker("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const unlink = useMutation({
    mutationFn: async (inquiryId: string) => unlinkFn({ data: { inquiryId, leadId } }),
    onSuccess: () => {
      toast.success("Unlinked");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const createAndLink = useMutation({
    mutationFn: async (title: string) => createFn({ data: { title, leadIds: [leadId] } }),
    onSuccess: () => {
      toast.success("Inquiry created");
      setCreating(false);
      setNewTitle("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-3">
      {linked.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not linked to any inquiry yet.</p>
      ) : (
        <ul className="space-y-2">
          {linked.map((l) => (
            <li key={l.inquiry_id} className="flex items-center justify-between gap-2 rounded border p-2">
              <Link to="/app/inquiries/$id" params={{ id: l.inquiry_id }} className="flex min-w-0 items-center gap-2 text-sm hover:underline">
                <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{l.inquiries?.title ?? "Inquiry"}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{l.inquiries?.status ?? "open"}</span>
              </Link>
              <Button size="icon" variant="ghost" onClick={() => unlink.mutate(l.inquiry_id)} disabled={unlink.isPending} title="Unlink">
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={picker}
          onValueChange={(v) => {
            setPicker(v);
            linkExisting.mutate(v);
          }}
        >
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder={available.length ? "Link to existing inquiry…" : "No other inquiries"} />
          </SelectTrigger>
          <SelectContent>
            {available.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.title} <span className="text-xs text-muted-foreground">({i.status})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!creating ? (
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" /> New inquiry
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Inquiry title" className="w-[220px]" maxLength={200} />
            <Button size="sm" disabled={!newTitle.trim() || createAndLink.isPending} onClick={() => createAndLink.mutate(newTitle.trim())}>
              {createAndLink.isPending ? "Creating…" : "Create"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewTitle(""); }}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
