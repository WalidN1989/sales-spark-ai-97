import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Trash2, Mail, MessageCircle, Save } from "lucide-react";
import { getLead, updateLead, deleteLead } from "@/lib/leads.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LEAD_STATUSES,
  LEAD_STATUS_STYLES,
  type LeadStatus,
  leadInitials,
  waHref,
} from "@/lib/leads-ui";
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
  const [value, setValue] = useState("0");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<ActivityKind>("note");

  useEffect(() => {
    if (lead) {
      setContact(lead.contact_person ?? "");
      setEmail(lead.contact_email ?? "");
      setWa(lead.whatsapp ?? "");
      setValue(String((lead.pipeline_value_cents ?? 0) / 100));
    }
  }, [lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  type Patch = {
    status?: LeadStatus;
    contact_person?: string | null;
    contact_email?: string | null;
    whatsapp?: string | null;
    pipeline_value_cents?: number;
    last_activity_kind?: ActivityKind | null;
    last_activity_note?: string | null;
    touch_activity?: boolean;
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

  const handleSave = async () => {
    await update.mutateAsync({
      contact_person: contact || null,
      contact_email: email || null,
      whatsapp: wa || null,
      pipeline_value_cents: Math.max(0, Math.round(Number(value || "0") * 100)),
    });
    toast.success("Saved");
  };

  const handleLog = async () => {
    if (!note.trim()) return;
    await update.mutateAsync({
      last_activity_kind: kind,
      last_activity_note: note.trim(),
      touch_activity: true,
    });
    setNote("");
    toast.success("Activity logged");
  };

  const handleDelete = async () => {
    if (!confirm("Remove this lead?")) return;
    del.mutate();
  };

  const wa_link = waHref(l.whatsapp);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/leads"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive">
          <Trash2 className="mr-1 h-4 w-4" /> Delete
        </Button>
      </div>

      {/* Header card */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-lg bg-secondary text-lg font-semibold">
              {leadInitials(l.contact_person, l.companies?.name ?? "?")}
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-2xl">
                {l.contact_person || l.whatsapp || "Lead"}
              </CardTitle>
              <div className="mt-1 text-sm text-muted-foreground">
                {l.companies?.name ? (
                  l.company_id ? (
                    <Link
                      to="/app/prospects/$id"
                      params={{ id: l.company_id }}
                      className="hover:underline"
                    >
                      @ {l.companies.name}
                    </Link>
                  ) : (
                    <>@ {l.companies.name}</>
                  )
                ) : (
                  "WhatsApp lead"
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
                  onClick={() => update.mutate({ status: s, touch_activity: true })}
                  className={cn(
                    "rounded px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors",
                    l.status === s ? LEAD_STATUS_STYLES[s] : "text-muted-foreground hover:bg-muted",
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
        {/* Lead info / edit */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Contact name</Label>
              <Input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} />
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
            <div>
              <Label>WhatsApp number</Label>
              <Input
                value={wa}
                onChange={(e) => setWa(e.target.value)}
                maxLength={30}
                placeholder="971501234567"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Country code + number. Opens wa.me/&lt;digits&gt;.
              </p>
            </div>
            <div>
              <Label>Pipeline value (USD)</Label>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="decimal"
                type="number"
                min="0"
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} disabled={update.isPending}>
                <Save className="mr-1 h-4 w-4" />
                {update.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Activity log */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activity log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Select value={kind} onValueChange={(v) => setKind(v as ActivityKind)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
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
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              placeholder="What happened?"
              rows={4}
            />
            <div className="flex justify-end">
              <Button onClick={handleLog} disabled={!note.trim() || update.isPending}>
                Log entry
              </Button>
            </div>

            {l.last_activity_note ? (
              <div className="rounded border bg-muted/30 p-3">
                <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded bg-secondary px-2 py-0.5 uppercase">
                    {l.last_activity_kind || "note"}
                  </span>
                  <span>
                    {l.last_activity_at
                      ? new Date(l.last_activity_at).toLocaleString()
                      : ""}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{l.last_activity_note}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No activity yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
