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
} from "lucide-react";
import {
  getLead,
  updateLead,
  deleteLead,
  listLeadActivities,
  addLeadActivity,
  deleteLeadActivity,
  listLeadDocuments,
  createLeadDocumentUploadUrl,
  registerLeadDocument,
  getLeadDocumentDownloadUrl,
  deleteLeadDocument,
} from "@/lib/leads.functions";
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
} from "@/lib/leads-ui";
import { TagInput } from "@/components/leads/TagInput";
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

  const { data: lead, isLoading } = useQuery({
    queryKey: ["lead", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [wa, setWa] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
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

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!lead) return <p className="text-sm text-muted-foreground">Not found.</p>;

  const l = lead as typeof lead & { status: LeadStatus };

  // Auto-suggest website from a business email domain
  const suggestedDomain =
    !website.trim() && email ? domainFromEmail(email) : null;
  const effectiveWebsite = website.trim() || suggestedDomain || "";
  const effectiveHost = hostFromWebsite(effectiveWebsite);
  const websiteHref = normalizeWebsite(effectiveWebsite);
  const favicon = faviconUrl(effectiveWebsite);

  const handleSave = async () => {
    await update.mutateAsync({
      contact_person: contact || null,
      contact_email: email || null,
      whatsapp: wa || null,
      company_name: companyName || null,
      website: website || (suggestedDomain ?? null),
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
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/leads">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          className="text-destructive"
        >
          <Trash2 className="mr-1 h-4 w-4" /> Delete
        </Button>
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
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
                  onClick={() => update.mutate({ status: s })}
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
                <Label>WhatsApp number</Label>
                <Input
                  value={wa}
                  onChange={(e) => setWa(e.target.value)}
                  maxLength={30}
                  placeholder="+971501234567"
                />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={200}
                type="email"
              />
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
