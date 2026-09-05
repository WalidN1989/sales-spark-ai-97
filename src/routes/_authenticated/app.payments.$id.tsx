import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Check, MessageCircle, Phone, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  getPaymentFollowup,
  logPaymentActivity,
  setPaymentFollowupStatus,
  updatePaymentFollowup,
  deletePaymentFollowup,
} from "@/lib/payments.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HeaderPortal, useHideHeaderActions } from "@/components/layout/HeaderPortal";
import {
  CATEGORY_META,
  STATUS_META,
  STATUS_OPTIONS,
  ACTIVITY_TYPES,
  ACTIVITY_META,
  fmtAmount,
  fmtDubaiDate,
} from "@/lib/payments-ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/payments/$id")({
  head: () => ({ meta: [{ title: "Follow-up — Sales Insights" }] }),
  component: FollowupDetail,
});

function FollowupDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  useHideHeaderActions(true);

  const getFn = useServerFn(getPaymentFollowup);
  const logFn = useServerFn(logPaymentActivity);
  const statusFn = useServerFn(setPaymentFollowupStatus);
  const updateFn = useServerFn(updatePaymentFollowup);
  const delFn = useServerFn(deletePaymentFollowup);

  const { data, isLoading } = useQuery({
    queryKey: ["payment-followup", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const [logOpen, setLogOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["payment-followup", id] });
    qc.invalidateQueries({ queryKey: ["payment-followups"] });
  };

  const log = useMutation({
    mutationFn: (v: { activity_type: string; summary: string; activity_at?: string }) =>
      logFn({ data: { followup_id: id, ...v } as never }),
    onSuccess: () => {
      invalidate();
      toast.success("Activity logged");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: (status: string) => statusFn({ data: { id, status: status as never } }),
    onSuccess: () => {
      invalidate();
      toast.success("Status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: () => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment-followups"] });
      toast.success("Item deleted");
      navigate({ to: "/app/payments" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data?.item) return <p className="text-sm text-muted-foreground">Not found.</p>;

  const it = data.item as {
    id: string;
    company_name: string;
    category: string;
    reference: string | null;
    title: string;
    description: string | null;
    amount_aed: number | null;
    currency: string;
    quantity: number | null;
    unit_sku: string | null;
    due_date: string | null;
    sent_date: string | null;
    status: string;
    priority: string;
    owner: string | null;
    notes: string | null;
    last_activity_at: string | null;
  };
  const activities = data.activities as {
    id: string;
    activity_type: string;
    summary: string;
    details: string | null;
    activity_at: string;
    created_by: string | null;
  }[];

  const cm = CATEGORY_META[it.category];
  const sm = STATUS_META[it.status] ?? STATUS_META.open;

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <nav className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
        <Link to="/app/payments" className="inline-flex items-center hover:text-foreground">
          <ArrowLeft className="mr-1 h-4 w-4" /> Payment Follow-up
        </Link>
        <span>/</span>
        <span className="truncate font-medium text-foreground">{it.company_name}</span>
      </nav>
      <div className="flex flex-wrap items-center gap-1">
        <Select value={it.status} onValueChange={(v) => setStatus.mutate(v)}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>Edit</Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive"
          title="Delete item"
          onClick={() => confirm("Delete this follow-up item and its history?") && del.mutate()}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="mx-auto grid max-w-[1100px] gap-4 min-w-0 lg:grid-cols-[minmax(0,1fr)_320px]">
      <HeaderPortal>{header}</HeaderPortal>

      <div className="min-w-0 space-y-4">
        {/* Identity */}
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-xl font-bold tracking-tight">{it.company_name}</h1>
                <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", sm.className)}>{sm.label}</span>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{it.title}</div>
            </div>
            <Wallet className="h-6 w-6 shrink-0 text-muted-foreground/50" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className={cn("rounded px-2 py-0.5 text-xs font-medium", cm?.className)}>{cm?.label ?? it.category}</span>
            {it.reference && <span className="text-muted-foreground">Ref: <span className="font-medium text-foreground">{it.reference}</span></span>}
            {it.amount_aed != null && <span className="font-semibold">{fmtAmount(it.amount_aed, it.currency)}</span>}
            {it.quantity != null && <span className="text-muted-foreground">{it.quantity}× {it.unit_sku ?? "units"}</span>}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Field label="Due" value={fmtDubaiDate(it.due_date)} />
            <Field label="Sent" value={fmtDubaiDate(it.sent_date)} />
            <Field label="Owner" value={it.owner ?? "—"} />
            <Field label="Priority" value={it.priority} />
          </div>
          {it.notes && <div className="mt-3 rounded-lg bg-muted/40 p-3 text-sm">{it.notes}</div>}
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => log.mutate({ activity_type: "call", summary: "Called about this follow-up" })}>
            <Phone className="mr-1 h-3.5 w-3.5" /> Log call
          </Button>
          <Button size="sm" variant="outline" onClick={() => log.mutate({ activity_type: "whatsapp", summary: "WhatsApp follow-up sent" })}>
            <MessageCircle className="mr-1 h-3.5 w-3.5" /> Log WhatsApp
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLogOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Log activity
          </Button>
          {it.status !== "resolved" && (
            <Button size="sm" onClick={() => setStatus.mutate("resolved")}>
              <Check className="mr-1 h-3.5 w-3.5" /> Mark resolved
            </Button>
          )}
        </div>

        {/* Timeline */}
        <div className="rounded-xl border bg-card">
          <div className="border-b p-3 text-sm font-bold">Activity ({activities.length})</div>
          <div className="p-3">
            {activities.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No activity yet. Logging one keeps the Wed/Fri reminder quiet.</p>
            ) : (
              <div className="space-y-3">
                {activities.map((a) => {
                  const m = ACTIVITY_META[a.activity_type] ?? ACTIVITY_META.other;
                  return (
                    <div key={a.id} className="flex gap-3">
                      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-sm">{m.emoji}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-semibold">{m.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(a.activity_at).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                          </span>
                          {a.created_by && <span className="text-xs text-muted-foreground">· {a.created_by}</span>}
                        </div>
                        <div className="text-sm text-foreground/90">{a.summary}</div>
                        {a.details && <div className="text-xs text-muted-foreground">{a.details}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Side: reminder status */}
      <div className="min-w-0 space-y-4">
        <div className="rounded-xl border bg-card p-4 text-sm">
          <div className="font-semibold">Reminder status</div>
          <p className="mt-1 text-muted-foreground">
            Last activity: <span className="font-medium text-foreground">{it.last_activity_at ? fmtDubaiDate(it.last_activity_at) : "never"}</span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Monday 10:00 always lists this item. Wednesday & Friday nudge it only if there's been no activity since Monday — so logging a call, WhatsApp, or note here keeps it quiet.
          </p>
        </div>
      </div>

      <LogActivityDialog open={logOpen} onClose={() => setLogOpen(false)} onSubmit={(v) => { log.mutate(v); setLogOpen(false); }} />
      <EditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        item={it}
        onSave={async (patch) => {
          await updateFn({ data: { id, patch: patch as never } });
          invalidate();
          setEditOpen(false);
          toast.success("Saved");
        }}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="capitalize">{value}</div>
    </div>
  );
}

function LogActivityDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (v: { activity_type: string; summary: string; activity_at?: string }) => void;
}) {
  const [type, setType] = useState("call");
  const [summary, setSummary] = useState("");
  const [when, setWhen] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Log activity</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{ACTIVITY_META[t].emoji} {ACTIVITY_META[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>What happened?</Label>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="e.g. Called accounts — PDC clears next week" />
          </div>
          <div>
            <Label>When (optional)</Label>
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!summary.trim()}
            onClick={() =>
              onSubmit({
                activity_type: type,
                summary: summary.trim(),
                activity_at: when ? new Date(when).toISOString() : undefined,
              })
            }
          >
            Log
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  open,
  onClose,
  item,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  item: { title: string; amount_aed: number | null; due_date: string | null; priority: string; notes: string | null };
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [amount, setAmount] = useState(item.amount_aed?.toString() ?? "");
  const [due, setDue] = useState(item.due_date ?? "");
  const [priority, setPriority] = useState(item.priority);
  const [notes, setNotes] = useState(item.notes ?? "");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Edit follow-up</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Amount (AED)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div><Label>Due date</Label><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() =>
              onSave({
                title: title.trim(),
                amount_aed: amount ? Number(amount) : null,
                due_date: due || null,
                priority,
                notes: notes.trim() || null,
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
