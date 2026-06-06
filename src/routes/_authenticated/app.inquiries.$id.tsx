import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Trophy, Trash2, Plus, Linkedin, Mail } from "lucide-react";
import {
  getInquiry,
  updateInquiry,
  deleteInquiry,
  unlinkLeadFromInquiry,
  addInquiryActivity,
  markInquiryWinner,
  linkLeadToInquiry,
} from "@/lib/inquiries.functions";
import { listLeads } from "@/lib/leads.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtMoneyCents, timeAgo, LEAD_STATUS_STYLES, type LeadStatus } from "@/lib/leads-ui";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/inquiries/$id")({
  head: () => ({ meta: [{ title: "Inquiry — Sales Insights" }] }),
  component: InquiryDetail,
});

type Lead = {
  id: string;
  contact_person: string | null;
  contact_email: string | null;
  company_name: string | null;
  status: LeadStatus;
  lead_score: number | null;
  pipeline_value_cents: number;
  last_activity_at: string | null;
  last_activity_note: string | null;
  linkedin_url: string | null;
  job_title: string | null;
};

function InquiryDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getInquiry);
  const updateFn = useServerFn(updateInquiry);
  const deleteFn = useServerFn(deleteInquiry);
  const unlinkFn = useServerFn(unlinkLeadFromInquiry);
  const addActFn = useServerFn(addInquiryActivity);
  const winFn = useServerFn(markInquiryWinner);
  const linkFn = useServerFn(linkLeadToInquiry);
  const listLeadsFn = useServerFn(listLeads);

  const { data, isLoading } = useQuery({
    queryKey: ["inquiry", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const { data: allLeadsData } = useQuery({
    queryKey: ["leads"],
    queryFn: () => listLeadsFn(),
  });

  const [noteBody, setNoteBody] = useState("");
  const [noteLeadId, setNoteLeadId] = useState<string>("");
  const [linkOpen, setLinkOpen] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inquiry", id] });
    qc.invalidateQueries({ queryKey: ["inquiries"] });
  };

  const upd = useMutation({
    mutationFn: (patch: {
      title?: string;
      description?: string | null;
      product?: string | null;
      target_value_cents?: number;
      status?: "open" | "won" | "lost" | "cancelled";
    }) => updateFn({ data: { id, patch } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: () => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Inquiry deleted");
      navigate({ to: "/app/inquiries" });
    },
  });

  const unlink = useMutation({
    mutationFn: (leadId: string) => unlinkFn({ data: { inquiryId: id, leadId } }),
    onSuccess: invalidate,
  });

  const addAct = useMutation({
    mutationFn: () =>
      addActFn({
        data: {
          inquiryId: id,
          leadId: noteLeadId || null,
          kind: "note",
          body: noteBody.trim(),
        },
      }),
    onSuccess: () => {
      setNoteBody("");
      setNoteLeadId("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const winner = useMutation({
    mutationFn: (winnerLeadId: string) => {
      const markOthersDead = confirm("Mark all other competitors as 'dead'?");
      return winFn({ data: { inquiryId: id, winnerLeadId, markOthersDead } });
    },
    onSuccess: () => {
      toast.success("Winner marked");
      invalidate();
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const link = useMutation({
    mutationFn: (leadId: string) => linkFn({ data: { inquiryId: id, leadId } }),
    onSuccess: () => {
      setLinkOpen(false);
      invalidate();
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data?.inquiry) return <p className="text-sm text-muted-foreground">Not found.</p>;

  const inq = data.inquiry;
  const links = (data.links ?? []) as Array<{ lead_id: string; leads: Lead | null }>;
  const activities = data.activities ?? [];
  const allLeads = (allLeadsData ?? []) as unknown as Lead[];
  const linkedIds = new Set(links.map((l) => l.lead_id));
  const availableLeads = allLeads.filter((l) => !linkedIds.has(l.id));

  const totalValue = links.reduce((a, l) => a + (l.leads?.pipeline_value_cents ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/inquiries">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => {
            if (confirm("Delete this inquiry? Lead links and activity will be removed.")) del.mutate();
          }}
        >
          <Trash2 className="mr-1 h-4 w-4" /> Delete
        </Button>
      </div>

      {/* Header */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <Input
              value={inq.title}
              onChange={(e) => upd.mutate({ title: e.target.value })}
              className="text-xl font-bold border-0 px-0 shadow-none focus-visible:ring-0"
            />
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Product</span>
              <Input
                value={inq.product ?? ""}
                onChange={(e) => upd.mutate({ product: e.target.value || null })}
                placeholder="Optional"
                className="h-7 max-w-[260px]"
              />
              <span>Target</span>
              <Input
                type="number"
                value={String((inq.target_value_cents ?? 0) / 100)}
                onChange={(e) =>
                  upd.mutate({ target_value_cents: Math.max(0, Math.round(Number(e.target.value || "0") * 100)) })
                }
                className="h-7 w-32"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={inq.status} onValueChange={(v) => upd.mutate({ status: v as typeof inq.status })}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Textarea
          value={inq.description ?? ""}
          onChange={(e) => upd.mutate({ description: e.target.value || null })}
          placeholder="Describe the inquiry / market request…"
          rows={2}
        />
        <div className="text-xs text-muted-foreground">
          Pipeline · <span className="font-semibold text-foreground">{fmtMoneyCents(totalValue)}</span>
          {inq.won_lead_id && (
            <> · Winner: <span className="font-semibold text-emerald-600">
              {links.find((l) => l.lead_id === inq.won_lead_id)?.leads?.contact_person ?? "—"}
            </span></>
          )}
        </div>
      </Card>

      {/* Competitors table */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Competing leads</h2>
          <Button size="sm" variant="outline" onClick={() => setLinkOpen((o) => !o)}>
            <Plus className="mr-1 h-4 w-4" /> Link lead
          </Button>
        </div>

        {linkOpen && (
          <div className="mb-3 rounded-md border p-2">
            {availableLeads.length === 0 ? (
              <p className="text-xs text-muted-foreground">No more leads to link.</p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {availableLeads.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => link.mutate(l.id)}
                    className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-accent"
                  >
                    <span className="truncate">
                      {l.contact_person || l.contact_email || "—"}
                      {l.company_name && <span className="text-muted-foreground"> · {l.company_name}</span>}
                    </span>
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", LEAD_STATUS_STYLES[l.status])}>
                      {l.status}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {links.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leads linked yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Lead</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Score</th>
                  <th className="p-2 text-right">Value</th>
                  <th className="p-2 text-left">Last activity</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => {
                  if (!l.leads) return null;
                  const lead = l.leads;
                  const isWinner = inq.won_lead_id === lead.id;
                  return (
                    <tr key={lead.id} className={cn("border-t", isWinner && "bg-emerald-50")}>
                      <td className="p-2">
                        <Link to="/app/leads/$id" params={{ id: lead.id }} className="hover:underline">
                          <div className="font-medium">{lead.contact_person || lead.contact_email || "—"}</div>
                          {lead.company_name && (
                            <div className="text-xs text-muted-foreground">{lead.company_name}</div>
                          )}
                        </Link>
                      </td>
                      <td className="p-2">
                        <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase", LEAD_STATUS_STYLES[lead.status])}>
                          {lead.status}
                        </span>
                      </td>
                      <td className="p-2">{lead.lead_score ?? 0}</td>
                      <td className="p-2 text-right">{fmtMoneyCents(lead.pipeline_value_cents || 0)}</td>
                      <td className="p-2 text-xs text-muted-foreground">{timeAgo(lead.last_activity_at)}</td>
                      <td className="p-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {lead.linkedin_url && (
                            <a
                              href={lead.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="grid h-7 w-7 place-items-center rounded text-[#0A66C2] hover:bg-muted"
                              title="LinkedIn"
                            >
                              <Linkedin className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {lead.contact_email && (
                            <a
                              href={`mailto:${lead.contact_email}`}
                              className="grid h-7 w-7 place-items-center rounded hover:bg-muted"
                              title="Email"
                            >
                              <Mail className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {!isWinner && inq.status === "open" && (
                            <Button size="sm" variant="ghost" onClick={() => winner.mutate(lead.id)} title="Mark winner">
                              <Trophy className="h-3.5 w-3.5 text-amber-500" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => unlink.mutate(lead.id)} title="Unlink">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Activity timeline */}
      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Shared activity log</h2>
        <div className="space-y-2">
          <div className="flex gap-2">
            <Select value={noteLeadId || "_none"} onValueChange={(v) => setNoteLeadId(v === "_none" ? "" : v)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="About lead (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">General</SelectItem>
                {links.map((l) =>
                  l.leads ? (
                    <SelectItem key={l.lead_id} value={l.lead_id}>
                      {l.leads.contact_person || l.leads.company_name || "—"}
                    </SelectItem>
                  ) : null,
                )}
              </SelectContent>
            </Select>
            <Textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={2}
              placeholder="Update everyone — who is progressing, who is losing, what changed…"
              className="flex-1"
            />
            <Button onClick={() => addAct.mutate()} disabled={!noteBody.trim() || addAct.isPending}>
              Post
            </Button>
          </div>
        </div>

        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <div className="space-y-2">
            {activities.map((a) => {
              const aboutLead = a.lead_id ? links.find((l) => l.lead_id === a.lead_id)?.leads : null;
              return (
                <div key={a.id} className="rounded border p-2 text-sm">
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase">{a.kind}</span>
                      {aboutLead && (
                        <span>· {aboutLead.contact_person || aboutLead.company_name}</span>
                      )}
                    </div>
                    <span>{timeAgo(a.created_at)}</span>
                  </div>
                  <div className="whitespace-pre-wrap">{a.body}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
