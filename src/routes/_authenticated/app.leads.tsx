import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { Flame, TrendingUp, Target, Mail, Trash2, MessageCircle, Plus, Upload, Sparkles, X, Image as ImageIcon } from "lucide-react";
import { listLeads, updateLead, deleteLead, createQuickLead, extractLeadFromImage } from "@/lib/leads.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/leads")({
  head: () => ({ meta: [{ title: "Leads — Sales Insights" }] }),
  component: LeadsPage,
});

type Status = "hot" | "warm" | "cold" | "frozen" | "dead";
const STATUSES: Status[] = ["hot", "warm", "cold", "frozen", "dead"];
const STATUS_ORDER: Record<Status, number> = { hot: 0, warm: 1, cold: 2, frozen: 3, dead: 4 };

const STATUS_STYLES: Record<Status, string> = {
  hot: "bg-orange-500 text-white",
  warm: "bg-amber-400 text-amber-950",
  cold: "bg-sky-300 text-sky-950",
  frozen: "bg-slate-200 text-slate-700",
  dead: "bg-zinc-400 text-white",
};

type Lead = {
  id: string;
  company_id: string;
  contact_person: string | null;
  contact_email: string | null;
  whatsapp: string | null;
  status: Status;
  pipeline_value_cents: number;
  last_activity_kind: string | null;
  last_activity_at: string | null;
  last_activity_note: string | null;
  companies: { name: string; domain: string | null; country: string | null; industry: string | null } | null;
};

function initials(name: string | null | undefined, fallback: string) {
  const s = (name || fallback).trim();
  const parts = s.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function waHref(num: string | null | undefined): string | null {
  if (!num) return null;
  const digits = num.replace(/\D+/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

function fmtMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function LeadsPage() {
  const listFn = useServerFn(listLeads);
  const updateFn = useServerFn(updateLead);
  const deleteFn = useServerFn(deleteLead);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["leads"], queryFn: () => listFn() });
  const leads = (data ?? []) as unknown as Lead[];

  const [selected, setSelected] = useState<Lead | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);

  const update = useMutation({
    mutationFn: (args: { id: string; patch: Patch }) => updateFn({ data: args }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      setSelected(null);
      toast.success("Lead removed");
    },
  });

  const sorted = useMemo(
    () =>
      [...leads].sort((a, b) => {
        const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        if (s !== 0) return s;
        return (b.last_activity_at ?? "").localeCompare(a.last_activity_at ?? "");
      }),
    [leads],
  );

  const hotCount = leads.filter((l) => l.status === "hot").length;
  const pipelineCents = leads.reduce((a, l) => a + (l.pipeline_value_cents || 0), 0);
  const quotaPct = leads.length === 0 ? 0 : Math.round((hotCount / leads.length) * 100);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">Prospects you're actively pursuing.</p>
        </div>
        <Button onClick={() => setQuickOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add Lead
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-orange-100 text-orange-500">
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Hot Leads</div>
            <div className="text-2xl font-bold">{hotCount}</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-sky-100 text-sky-600">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Pipeline Value</div>
            <div className="text-2xl font-bold">{fmtMoney(pipelineCents)}</div>
          </div>
        </Card>
        <Card className="p-4 bg-slate-900 text-white flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-white/10">
            <Target className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-xs uppercase text-white/60">Hot Ratio</div>
            <div className="text-2xl font-bold">{quotaPct}%</div>
            <div className="mt-1 h-1.5 w-full rounded bg-white/10">
              <div className="h-full rounded bg-sky-400" style={{ width: `${quotaPct}%` }} />
            </div>
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Priority Queue</h2>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : sorted.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No leads yet. Promote a prospect from the Prospects page using the 🔥 icon.
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((l) => (
            <Card
              key={l.id}
              className="p-4 cursor-pointer hover:bg-accent/30"
              onClick={() => setSelected(l)}
            >
              <div className="flex flex-wrap items-center gap-4">
                <div className="grid h-10 w-10 place-items-center rounded-md bg-secondary text-sm font-semibold">
                  {initials(l.contact_person, l.companies?.name ?? "?")}
                </div>
                <div className="min-w-[180px] flex-1">
                  <div className="font-semibold">{l.contact_person || l.whatsapp || "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {l.companies?.name ? `@ ${l.companies.name}` : "WhatsApp lead"}
                  </div>
                </div>

                <div
                  className="flex rounded-md border bg-background p-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => update.mutate({ id: l.id, patch: { status: s } })}
                      className={cn(
                        "rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
                        l.status === s
                          ? STATUS_STYLES[s]
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div className="min-w-[160px] text-right text-xs text-muted-foreground">
                  <div className="font-medium uppercase text-foreground/70">
                    {l.last_activity_kind || "—"}
                  </div>
                  <div>{timeAgo(l.last_activity_at)}</div>
                  {l.last_activity_note && (
                    <div className="mt-1 italic truncate max-w-[200px] ml-auto">"{l.last_activity_note}"</div>
                  )}
                </div>

                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {waHref(l.whatsapp) ? (
                    <a
                      href={waHref(l.whatsapp)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open WhatsApp"
                      className="grid h-9 w-9 place-items-center rounded-md bg-[#25D366] text-white hover:opacity-90"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </a>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelected(l)}
                      className="h-9 text-xs"
                    >
                      + WhatsApp
                    </Button>
                  )}
                  {l.contact_email && (
                    <a
                      href={`mailto:${l.contact_email}`}
                      title="Send email"
                      className="grid h-9 w-9 place-items-center rounded-md border hover:bg-accent"
                    >
                      <Mail className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <LeadSheet
        lead={selected}
        onClose={() => setSelected(null)}
        onSave={(patch) => selected && update.mutate({ id: selected.id, patch })}
        onDelete={() => selected && del.mutate(selected.id)}
      />

      <QuickAddLeadDialog
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["leads"] });
          setQuickOpen(false);
        }}
      />
    </div>
  );
}

type Patch = {
  status?: Status;
  contact_person?: string | null;
  contact_email?: string | null;
  whatsapp?: string | null;
  pipeline_value_cents?: number;
  last_activity_kind?: "note" | "email" | "call" | "meeting" | "log" | null;
  last_activity_note?: string | null;
  touch_activity?: boolean;
};

function LeadSheet({
  lead,
  onClose,
  onSave,
  onDelete,
}: {
  lead: Lead | null;
  onClose: () => void;
  onSave: (patch: Patch) => void;
  onDelete: () => void;
}) {
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [wa, setWa] = useState("");
  const [value, setValue] = useState("0");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<"note" | "email" | "call" | "meeting" | "log">("note");

  useMemo(() => {
    if (lead) {
      setContact(lead.contact_person ?? "");
      setEmail(lead.contact_email ?? "");
      setWa(lead.whatsapp ?? "");
      setValue(String((lead.pipeline_value_cents ?? 0) / 100));
      setNote("");
      setKind("note");
    }
  }, [lead?.id]);

  if (!lead) return null;

  const save = () => {
    const patch: Patch = {
      contact_person: contact || null,
      contact_email: email || null,
      whatsapp: wa || null,
      pipeline_value_cents: Math.max(0, Math.round(Number(value || "0") * 100)),
    };
    if (note.trim()) {
      patch.last_activity_kind = kind;
      patch.last_activity_note = note.trim();
    }
    onSave(patch);
    onClose();
  };

  return (
    <Sheet open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{lead.companies?.name || "Lead"}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div>
            <Label>Contact name</Label>
            <Input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} type="email" />
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
              Country code + number, no +. e.g. 971501234567 opens wa.me/971501234567
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
          <div className="rounded-md border p-3 space-y-2">
            <Label className="text-sm">Quick activity</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="note">Note</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="call">Call</SelectItem>
                <SelectItem value="meeting">Meeting</SelectItem>
                <SelectItem value="log">Log</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              placeholder="What happened? (optional)"
              rows={3}
            />
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive">
              <Trash2 className="mr-1 h-4 w-4" /> Remove lead
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={save}>Save</Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------- Quick Add Lead (WhatsApp) ----------

function QuickAddLeadDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const extractFn = useServerFn(extractLeadFromImage);
  const createFn = useServerFn(createQuickLead);
  const fileRef = useRef<HTMLInputElement>(null);

  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [contact, setContact] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [product, setProduct] = useState("");
  const [note, setNote] = useState("");
  const [extracted, setExtracted] = useState<Set<string>>(new Set());

  const reset = () => {
    setImageDataUrl(null);
    setContact("");
    setWhatsapp("");
    setEmail("");
    setProduct("");
    setNote("");
    setExtracted(new Set());
  };

  const extract = useMutation({
    mutationFn: (url: string) => extractFn({ data: { imageDataUrl: url } }),
    onSuccess: (r) => {
      const tags = new Set<string>();
      if (r.contact_person) { setContact(r.contact_person); tags.add("contact"); }
      if (r.whatsapp) { setWhatsapp(r.whatsapp.replace(/[^\d+\-\s()]/g, "")); tags.add("whatsapp"); }
      if (r.contact_email) { setEmail(r.contact_email); tags.add("email"); }
      if (r.product) { setProduct(r.product); tags.add("product"); }
      if (r.note) { setNote(r.note); tags.add("note"); }
      setExtracted(tags);
      toast.success(`Detected ${tags.size} field${tags.size === 1 ? "" : "s"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          contact_person: contact || null,
          whatsapp,
          contact_email: email || null,
          product: product || null,
          note: note || null,
        },
      }),
    onSuccess: () => {
      toast.success("Lead added");
      reset();
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFile = (file: File) => {
    if (file.size > 6 * 1024 * 1024) {
      toast.error("Image must be under 6 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      setImageDataUrl(url);
      extract.mutate(url);
    };
    reader.readAsDataURL(file);
  };

  const tag = (k: string) =>
    extracted.has(k) ? (
      <span className="ml-2 text-[10px] font-bold tracking-wider text-sky-500 uppercase">Extracted</span>
    ) : null;

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
          <DialogTitle>New WhatsApp Lead</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            className="relative cursor-pointer rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-center hover:bg-muted/50"
          >
            {imageDataUrl ? (
              <div className="flex items-center gap-3">
                <img src={imageDataUrl} alt="screenshot" className="h-20 w-20 rounded object-cover" />
                <div className="text-left text-xs text-muted-foreground">
                  {extract.isPending ? "Reading screenshot…" : "Click to replace screenshot"}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageDataUrl(null);
                    setExtracted(new Set());
                  }}
                  className="ml-auto rounded p-1 hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-4 text-sm text-muted-foreground">
                <ImageIcon className="h-6 w-6" />
                <div>Drop a WhatsApp screenshot or <span className="font-medium text-foreground">click to upload</span></div>
                <div className="text-xs">PNG / JPG / WebP, up to 6 MB</div>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </div>

          {extract.isPending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 animate-pulse" /> Extracting fields…
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Contact name {tag("contact")}
              </Label>
              <Input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                WhatsApp number * {tag("whatsapp")}
              </Label>
              <Input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                maxLength={30}
                placeholder="+971 50 753 1457"
                required
              />
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Product requested {tag("product")}
            </Label>
            <Input
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              maxLength={500}
              placeholder="What is the customer asking about?"
            />
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Email (optional) {tag("email")}
            </Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={200}
              type="email"
              placeholder="example@domain.com"
            />
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Notes / comments {tag("note")}
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Add internal notes about this lead…"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!whatsapp.trim() || create.isPending}
          >
            <Upload className="mr-1 h-4 w-4" />
            {create.isPending ? "Saving…" : "Add to Leads"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
