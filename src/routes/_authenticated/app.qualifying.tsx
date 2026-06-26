import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Target,
  Sparkles,
  ArrowRight,
  Trash2,
  Mail,
  Globe,
  Copy,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  listQualifyingTargets,
  updateQualifyingStatus,
  deleteQualifyingTarget,
  convertQualifyingToLead,
  draftQualifyingEmail,
} from "@/lib/qualifying.functions";
import { slugifyCompetitor } from "@/lib/competitor-email.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/qualifying")({
  head: () => ({ meta: [{ title: "Qualifying — Sales Insights" }] }),
  component: QualifyingPage,
});

const STATUSES = [
  "new",
  "researching",
  "contacted",
  "no_response",
  "interested",
  "not_fit",
  "converted",
] as const;
type Status = (typeof STATUSES)[number];

const STATUS_STYLES: Record<Status, string> = {
  new: "bg-sky-500/15 text-sky-700 border-sky-300",
  researching: "bg-violet-500/15 text-violet-700 border-violet-300",
  contacted: "bg-amber-500/15 text-amber-700 border-amber-300",
  no_response: "bg-rose-500/15 text-rose-700 border-rose-300",
  interested: "bg-emerald-500/15 text-emerald-700 border-emerald-300",
  not_fit: "bg-zinc-500/15 text-zinc-700 border-zinc-300",
  converted: "bg-emerald-600 text-white border-emerald-700",
};

type Row = {
  id: string;
  status: Status;
  last_activity_at: string | null;
  last_activity_note: string | null;
  created_at: string;
  source_company_id: string;
  converted_lead_id: string | null;
  cached_email_subject: string | null;
  cached_email_body: string | null;
  cached_email_at: string | null;
  competitor: { id: string; name: string; website: string | null; country: string | null; phone: string | null; email: string | null } | null;
  source: { id: string; name: string } | null;
  purchase: { id: string; brand: string | null; model_no: string | null; model_name: string } | null;
  contact_emails?: Array<{ email: string; name: string | null; position: string | null }>;
};


function QualifyingPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const listFn = useServerFn(listQualifyingTargets);
  const setStatusFn = useServerFn(updateQualifyingStatus);
  const deleteFn = useServerFn(deleteQualifyingTarget);
  const convertFn = useServerFn(convertQualifyingToLead);
  const draftFn = useServerFn(draftQualifyingEmail);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["qualifying"],
    queryFn: () => listFn(),
  });

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [emailFor, setEmailFor] = useState<Row | null>(null);
  const [email, setEmail] = useState<{ subject: string; body: string } | null>(null);
  const [drafting, setDrafting] = useState(false);

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: Status }) =>
      setStatusFn({ data: { id: v.id, status: v.status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["qualifying"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qualifying"] });
      toast.success("Removed");
    },
  });

  const convert = useMutation({
    mutationFn: (id: string) => convertFn({ data: { id } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["qualifying"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Converted to Lead");
      navigate({ to: "/app/leads/$id", params: { id: r.leadId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows as Row[]).filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!term) return true;
      const hay = [
        r.competitor?.name,
        r.competitor?.website,
        r.source?.name,
        r.purchase?.model_name,
        r.purchase?.brand,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [rows, q, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows as Row[]) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const openDraft = async (row: Row, force = false) => {
    setEmailFor(row);
    // Optimistically show cached email immediately if available
    if (!force && row.cached_email_subject && row.cached_email_body) {
      setEmail({ subject: row.cached_email_subject, body: row.cached_email_body });
    } else {
      setEmail(null);
    }
    setDrafting(!row.cached_email_subject || force);
    try {
      const r = await draftFn({ data: { id: row.id, force } });
      setEmail({ subject: r.subject, body: r.body });
      if (force) qc.invalidateQueries({ queryKey: ["qualifying"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      if (!row.cached_email_subject) setEmailFor(null);
    } finally {
      setDrafting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" /> Qualifying
          </h1>
          <p className="text-sm text-muted-foreground">
            Competitors of your won customers — qualify before promoting to Leads.
          </p>
        </div>
      </div>

      <div className="grid gap-2 grid-cols-2 md:grid-cols-7">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
            className={cn(
              "rounded-md border p-2 text-left transition-colors hover:bg-accent",
              statusFilter === s && "ring-2 ring-primary",
            )}
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {s.replace("_", " ")}
            </div>
            <div className="text-lg font-semibold">{counts[s] ?? 0}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search competitor, source, brand…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as Status | "all")}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No qualifying targets yet. Open a prospect&apos;s Market Insight → Competitors → pick one → <strong>Add to Qualifying</strong>.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left">Target</th>
                    <th className="p-3 text-left">Source prospect</th>
                    <th className="p-3 text-left">Bought product</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Last touch</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="p-3">
                        {r.source && r.competitor?.name ? (
                          <button
                            type="button"
                            onClick={() =>
                              navigate({
                                to: "/app/prospects/$id/competitor/$slug",
                                params: {
                                  id: r.source!.id,
                                  slug: slugifyCompetitor(r.competitor!.name),
                                },
                              })
                            }
                            className="text-left font-medium hover:underline"
                            title="Open this target's competitor page under its source prospect"
                          >
                            {r.competitor.name}
                          </button>
                        ) : (
                          <span className="font-medium">{r.competitor?.name}</span>
                        )}
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          {r.competitor?.website && (
                            <a
                              href={
                                /^https?:\/\//i.test(r.competitor.website)
                                  ? r.competitor.website
                                  : `https://${r.competitor.website}`
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 hover:underline"
                            >
                              <Globe className="h-3 w-3" />
                              {r.competitor.website}
                            </a>
                          )}
                          {r.competitor?.country && <span>· {r.competitor.country}</span>}
                          {r.cached_email_at && (
                            <span className="rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-bold uppercase text-emerald-700">
                              Draft cached
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        {r.source ? (
                          <button
                            type="button"
                            className="hover:underline text-primary"
                            onClick={() =>
                              navigate({
                                to: "/app/prospects/$id",
                                params: { id: r.source!.id },
                              })
                            }
                            title="Open source prospect card"
                          >
                            {r.source.name}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-3 text-xs">
                        {r.purchase ? (
                          <button
                            type="button"
                            className="text-left hover:underline"
                            onClick={() => {
                              // Open purchase context by jumping to source prospect (purchases live on a lead inside it).
                              if (r.source) {
                                navigate({
                                  to: "/app/prospects/$id",
                                  params: { id: r.source.id },
                                });
                              }
                            }}
                            title="Open the source prospect to edit this product"
                          >
                            <div className="font-medium">
                              {[r.purchase.brand, r.purchase.model_no]
                                .filter(Boolean)
                                .join(" ")}
                            </div>
                            <div className="text-muted-foreground">
                              {r.purchase.model_name}
                            </div>
                          </button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        <Select
                          value={r.status}
                          onValueChange={(v) =>
                            setStatus.mutate({ id: r.id, status: v as Status })
                          }
                        >
                          <SelectTrigger
                            className={cn(
                              "h-7 w-36 border text-xs font-semibold uppercase",
                              STATUS_STYLES[r.status],
                            )}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s.replace("_", " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {r.last_activity_at
                          ? new Date(r.last_activity_at).toLocaleString()
                          : "—"}
                        {r.last_activity_note && (
                          <div className="truncate max-w-[220px]">
                            {r.last_activity_note}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Draft email"
                            onClick={() => openDraft(r)}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                          </Button>
                          {!r.converted_lead_id ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Convert to Lead"
                              onClick={() => convert.mutate(r.id)}
                              disabled={convert.isPending}
                            >
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Open Lead"
                              onClick={() =>
                                navigate({
                                  to: "/app/leads/$id",
                                  params: { id: r.converted_lead_id! },
                                })
                              }
                            >
                              <Mail className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Remove"
                            onClick={() => {
                              if (confirm("Remove from Qualifying?")) remove.mutate(r.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!emailFor} onOpenChange={(v) => !v && setEmailFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Draft email — {emailFor?.competitor?.name}
            </DialogTitle>
          </DialogHeader>
          {drafting && !email ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Drafting…
            </div>
          ) : email ? (
            <div className="space-y-3">
              {emailFor && (emailFor.contact_emails?.length ?? 0) > 0 && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase text-muted-foreground">
                      Emails ({emailFor.contact_emails?.length ?? 0})
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Copy all emails"
                      onClick={() => {
                        const list = emailFor.contact_emails ?? [];
                        navigator.clipboard.writeText(
                          list.map((c) => c.email).join(", "),
                        );
                        toast.success(`Copied ${list.length} emails`);
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="max-h-24 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs break-all">
                    {(emailFor.contact_emails ?? []).map((c) => c.email).join(", ")}
                  </div>
                </div>
              )}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">
                    Subject
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(email.subject);
                      toast.success("Copied");
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <Input
                  value={email.subject}
                  onChange={(e) => setEmail({ ...email, subject: e.target.value })}
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">
                    Body
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(email.body);
                      toast.success("Copied");
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <Textarea
                  rows={10}
                  value={email.body}
                  onChange={(e) => setEmail({ ...email, body: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (emailFor) openDraft(emailFor, true);
                  }}
                >
                  Regenerate
                </Button>
                <Button
                  onClick={() => {
                    if (!email || !emailFor) return;
                    const to =
                      (emailFor.contact_emails ?? []).map((c) => c.email).join(", ") ||
                      emailFor.competitor?.email ||
                      "";
                    window.location.href = `mailto:${to}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
                    // Mark contacted
                    setStatus.mutate({ id: emailFor.id, status: "contacted" });
                  }}
                >
                  <Mail className="mr-1 h-4 w-4" /> Open in mail
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
