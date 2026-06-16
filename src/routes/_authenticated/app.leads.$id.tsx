import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
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
  listLeadActivities,
  addLeadActivity,
  deleteLeadActivity,
  listLeadDocuments,
  createLeadDocumentUploadUrl,
  registerLeadDocument,
  getLeadDocumentDownloadUrl,
  deleteLeadDocument,
} from "@/lib/leads.functions";
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
  leadInitials,
  waHref,
  domainFromEmail,
  faviconUrl,
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
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/leads/$id")({
  head: () => ({ meta: [{ title: "Lead — Sales Insights" }] }),
  component: LeadDetail,
});

type ActivityKind = "note" | "email" | "call" | "meeting" | "log";

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

  useEffect(() => {
    if (lead) {
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
      qc.invalidateQueries({ queryKey: ["lead-activities", id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearOverride = useMutation({
    mutationFn: () => clearOverrideFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead", id] });
      qc.invalidateQueries({ queryKey: ["lead-activities", id] });
      toast.success("Auto-scoring re-enabled");
    },
  });

  const verify = useMutation({
    mutationFn: () => verifyFn({ data: { leadId: id } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["lead", id] });
      qc.invalidateQueries({ queryKey: ["lead-activities", id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`Email ${r.email_status}${r.email_score != null ? ` · ${r.email_score}` : ""}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!lead) return <p className="text-sm text-muted-foreground">Not found.</p>;

  const l = lead as typeof lead & {
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

  // Auto-suggest website from a business email domain
  const suggestedDomain =
    !website.trim() && email ? domainFromEmail(email) : null;
  const effectiveWebsite = website.trim() || suggestedDomain || "";
  const effectiveHost = hostFromWebsite(effectiveWebsite);
  const websiteHref = normalizeWebsite(effectiveWebsite);
  const favicon = faviconUrl(effectiveWebsite);
  const sb = scoreBucket(l.lead_score);

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
    });
    toast.success("Saved");
  };

  const handleDelete = async () => {
    if (!confirm("Remove this lead?")) return;
    del.mutate();
  };

  const wa_link = waHref(l.whatsapp);

  return (
    <div className="mx-auto max-w-6xl space-y-4 min-w-0">
      <div className="grid grid-cols-[auto_1fr] items-center gap-2 sm:flex sm:flex-wrap sm:justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/leads">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-1">
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
            size="sm"
            onClick={handleDelete}
            className="shrink-0 text-destructive"
          >
            <Trash2 className="mr-1 h-4 w-4" /> <span className="hidden sm:inline">Delete</span>
          </Button>
        </div>
      </div>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-lg bg-secondary text-lg font-semibold">
              {leadInitials(l.contact_person, l.company_name ?? l.companies?.name ?? "?")}
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-2xl">
                {l.contact_person || l.whatsapp || "Lead"}
              </CardTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {favicon && (
                  <a
                    href={websiteHref ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={effectiveHost ?? "Website"}
                    className="inline-flex h-5 w-5 items-center justify-center rounded bg-background ring-1 ring-border"
                  >
                    <img
                      src={favicon}
                      alt=""
                      className="h-4 w-4"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </a>
                )}
                <span>
                  {l.company_name ? (
                    <>@ {l.company_name}</>
                  ) : l.companies?.name && l.company_id ? (
                    <Link
                      to="/app/prospects/$id"
                      params={{ id: l.company_id }}
                      className="hover:underline"
                    >
                      @ {l.companies.name}
                    </Link>
                  ) : (
                    "WhatsApp lead"
                  )}
                </span>
                {websiteHref && (
                  <a
                    href={websiteHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs hover:underline"
                  >
                    {effectiveHost} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              {(l.department || l.seniority || l.hunter_confidence != null) && (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {l.department && (
                    <span className="rounded bg-muted px-2 py-0.5">{l.department}</span>
                  )}
                  {l.seniority && (
                    <span className="rounded bg-muted px-2 py-0.5 capitalize">{l.seniority}</span>
                  )}
                  {l.hunter_confidence != null && (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                      Hunter {l.hunter_confidence}%
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {l.linkedin_url && (
                <Button asChild variant="outline" className="bg-[#0A66C2] text-white hover:bg-[#0a4f96] hover:text-white border-[#0A66C2]">
                  <a href={l.linkedin_url} target="_blank" rel="noopener noreferrer" title="Open LinkedIn profile">
                    <Linkedin className="mr-1 h-4 w-4" /> LinkedIn
                  </a>
                </Button>
              )}
              {wa_link && (
                <Button asChild className="bg-[#25D366] text-white hover:bg-[#1ebc59]">
                  <a href={wa_link} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
                  </a>
                </Button>
              )}
              {l.contact_email && (
                <Button asChild variant="outline">
                  <a href={`mailto:${l.contact_email}`}>
                    <Mail className="mr-1 h-4 w-4" /> Email
                  </a>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground mr-2">
              Status
            </span>
            <div className="flex rounded-md border bg-background p-0.5">
              {LEAD_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusManual.mutate(s)}
                  className={cn(
                    "rounded px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors",
                    l.status === s
                      ? LEAD_STATUS_STYLES[s]
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            {(l.lead_score ?? 0) > 0 && (
              <span className={cn("rounded px-2 py-0.5 text-[11px] font-bold", sb.className)}>
                Score {l.lead_score} · {sb.label}
              </span>
            )}
            {l.lead_score_manual_override ? (
              <button
                type="button"
                onClick={() => clearOverride.mutate()}
                className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                Manually set · Clear
              </button>
            ) : (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Auto-scored
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Lead info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Contact name</Label>
                <Input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} />
              </div>
              <div>
                <Label>Job title</Label>
                <Input
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  maxLength={200}
                  placeholder="e.g. Procurement Manager"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>WhatsApp number</Label>
                <Input
                  value={wa}
                  onChange={(e) => setWa(e.target.value)}
                  maxLength={30}
                  placeholder="+971501234567"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={200}
                  type="email"
                />
                {email && (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {l.email_status && (
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", EMAIL_STATUS_STYLES[l.email_status])}>
                        {EMAIL_STATUS_LABEL[l.email_status]}
                        {l.email_score != null ? ` · ${l.email_score}` : ""}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => verify.mutate()}
                      disabled={verify.isPending}
                      className="text-[11px] font-medium text-primary hover:underline disabled:opacity-60"
                    >
                      {verify.isPending ? "Verifying…" : "Verify email"}
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Company name</Label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  maxLength={200}
                  placeholder="Optional — add once known"
                />
              </div>
              <div>
                <Label>Website / domain</Label>
                <Input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  maxLength={300}
                  placeholder={suggestedDomain ?? "example.com"}
                />
                {suggestedDomain && !website && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Suggested from email: <span className="font-medium">{suggestedDomain}</span>
                  </p>
                )}
              </div>
            </div>
            <div>
              <Label>Pipeline value (AED)</Label>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="decimal"
                type="number"
                min="0"
              />
            </div>
            <div className="flex justify-end pt-1">
              <Button onClick={handleSave} disabled={update.isPending}>
                <Save className="mr-1 h-4 w-4" />
                {update.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Activity log */}
        <ActivityLogCard leadId={id} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Expertise */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" /> Expertise & focus
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Brands they distribute</Label>
              <TagInput
                value={brands}
                onChange={setBrands}
                placeholder="HP, Logitech, Dell… (press Enter)"
              />
            </div>
            <div>
              <Label>Products & services (good pricing)</Label>
              <TagInput
                value={products}
                onChange={setProducts}
                placeholder="Laptop accessories, Printer toner… (press Enter)"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={4000}
                rows={4}
                placeholder="Background, strengths, customer profile…"
              />
            </div>
            <div className="flex justify-end pt-1">
              <Button onClick={handleSave} disabled={update.isPending} variant="outline">
                <Save className="mr-1 h-4 w-4" /> Save expertise
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Documents */}
        <DocumentsCard leadId={id} />
      </div>

      {/* Inquiries */}
      <InquiriesCard leadId={id} />

      {/* AI Respond */}
      <div>
        <h2 className="mb-2 text-base font-semibold">AI Respond</h2>
        <RespondTab leadId={id} />
      </div>
    </div>
  );
}

// ---------------- Activity log ----------------

function ActivityLogCard({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listLeadActivities);
  const addFn = useServerFn(addLeadActivity);
  const delFn = useServerFn(deleteLeadActivity);

  const { data: activities = [] } = useQuery({
    queryKey: ["lead-activities", leadId],
    queryFn: () => listFn({ data: { leadId } }),
  });

  const [kind, setKind] = useState<ActivityKind>("note");
  const [body, setBody] = useState("");

  const add = useMutation({
    mutationFn: () => addFn({ data: { leadId, kind, body: body.trim() } }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["lead-activities", leadId] });
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Logged");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-activities", leadId] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity log</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-start gap-2">
          <Select value={kind} onValueChange={(v) => setKind(v as ActivityKind)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="note">Note</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="call">Call</SelectItem>
              <SelectItem value="meeting">Meeting</SelectItem>
              <SelectItem value="log">Log</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="What happened?"
        />
        <div className="flex justify-end">
          <Button onClick={() => add.mutate()} disabled={!body.trim() || add.isPending}>
            Log entry
          </Button>
        </div>

        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {activities.length === 0 ? (
            <p className="text-xs text-muted-foreground">No activity yet.</p>
          ) : (
            activities.map((a) => (
              <div key={a.id} className="rounded border bg-muted/30 p-3">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-secondary px-2 py-0.5 font-semibold uppercase">
                      {a.kind}
                    </span>
                    <span>{new Date(a.created_at).toLocaleString()}</span>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm("Delete this entry?")) del.mutate(a.id);
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    aria-label="Delete entry"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-sm">{a.body}</p>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
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
        data: {
          leadId,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          label,
        },
      });
      const putRes = await fetch(signed.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);
      await registerFn({
        data: {
          leadId,
          label,
          fileName: file.name,
          storagePath: signed.path,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        },
      });
      qc.invalidateQueries({ queryKey: ["lead-documents", leadId] });
      toast.success("Uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (id: string) => {
    try {
      const { url } = await downloadFn({ data: { id } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-documents", leadId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" /> Supporting documents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
            <Upload className="mr-1 h-4 w-4" />
            {uploading ? "Uploading…" : "Upload"}
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
        <p className="text-xs text-muted-foreground">
          PDF, PNG, JPG, WebP — up to 10 MB.
        </p>

        <div className="space-y-2">
          {docs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No documents yet.</p>
          ) : (
            docs.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 rounded border bg-muted/30 p-2"
              >
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{d.file_name}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded bg-secondary px-1.5 py-0.5 uppercase">
                      {DOC_LABELS[d.label as DocLabel] ?? d.label}
                    </span>
                    <span>{fmtFileSize(d.size_bytes)}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDownload(d.id)}
                  className="grid h-8 w-8 place-items-center rounded hover:bg-muted"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete ${d.file_name}?`)) del.mutate(d.id);
                  }}
                  className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
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
  const available = ((allQ.data ?? []) as Array<{ id: string; title: string; status: string }>)
    .filter((i) => !linkedIds.has(i.id));

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
    mutationFn: async (title: string) =>
      createFn({ data: { title, leadIds: [leadId] } }),
    onSuccess: () => {
      toast.success("Inquiry created");
      setCreating(false);
      setNewTitle("");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4" /> Linked inquiries
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {linked.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not linked to any inquiry yet. Group competing leads under an inquiry to track them together.
          </p>
        ) : (
          <ul className="space-y-2">
            {linked.map((l) => (
              <li
                key={l.inquiry_id}
                className="flex items-center justify-between gap-2 rounded border p-2"
              >
                <Link
                  to="/app/inquiries/$id"
                  params={{ id: l.inquiry_id }}
                  className="flex min-w-0 items-center gap-2 text-sm hover:underline"
                >
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">
                    {l.inquiries?.title ?? "Inquiry"}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
                    {l.inquiries?.status ?? "open"}
                  </span>
                </Link>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => unlink.mutate(l.inquiry_id)}
                  disabled={unlink.isPending}
                  title="Unlink"
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Select
            value={picker}
            onValueChange={(v) => {
              setPicker(v);
              linkExisting.mutate(v);
            }}
          >
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder={available.length ? "Link to existing inquiry…" : "No other inquiries"} />
            </SelectTrigger>
            <SelectContent>
              {available.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.title}{" "}
                  <span className="text-xs text-muted-foreground">({i.status})</span>
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
              <Input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Inquiry title (e.g. 50× Laptops RFQ)"
                className="w-[260px]"
                maxLength={200}
              />
              <Button
                size="sm"
                disabled={!newTitle.trim() || createAndLink.isPending}
                onClick={() => createAndLink.mutate(newTitle.trim())}
              >
                {createAndLink.isPending ? "Creating…" : "Create & link"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCreating(false);
                  setNewTitle("");
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
