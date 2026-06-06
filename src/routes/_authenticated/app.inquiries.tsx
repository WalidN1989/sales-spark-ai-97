import { createFileRoute, Link, Outlet, useChildMatches } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Layers, Trophy } from "lucide-react";
import { listInquiries, createInquiry } from "@/lib/inquiries.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { fmtMoneyCents, timeAgo, LEAD_STATUS_STYLES, type LeadStatus } from "@/lib/leads-ui";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/inquiries")({
  head: () => ({ meta: [{ title: "Inquiries — Sales Insights" }] }),
  component: InquiriesRoot,
});

function InquiriesRoot() {
  const childMatches = useChildMatches();
  if (childMatches.length > 0) return <Outlet />;
  return <InquiriesList />;
}

type LinkedLead = {
  lead_id: string;
  leads: {
    id: string;
    contact_person: string | null;
    company_name: string | null;
    status: LeadStatus;
    lead_score: number | null;
    pipeline_value_cents: number;
  } | null;
};

type Inquiry = {
  id: string;
  title: string;
  description: string | null;
  product: string | null;
  target_value_cents: number;
  status: "open" | "won" | "lost" | "cancelled";
  won_lead_id: string | null;
  created_at: string;
  updated_at: string;
  inquiry_leads: LinkedLead[];
};

const STATUS_STYLES: Record<Inquiry["status"], string> = {
  open: "bg-sky-100 text-sky-700",
  won: "bg-emerald-500 text-white",
  lost: "bg-rose-500 text-white",
  cancelled: "bg-slate-300 text-slate-700",
};

function InquiriesList() {
  const listFn = useServerFn(listInquiries);
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["inquiries"], queryFn: () => listFn() });
  const inquiries = (data ?? []) as unknown as Inquiry[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inquiries</h1>
          <p className="text-sm text-muted-foreground">
            Group competing leads working on the same market request. Track them together — only one wins.
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)}>
          <Plus className="mr-1 h-4 w-4" /> New Inquiry
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : inquiries.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No inquiries yet. Create one to group competing leads.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {inquiries.map((inq) => {
            const leadCount = inq.inquiry_leads?.length ?? 0;
            const sumValue = (inq.inquiry_leads ?? []).reduce(
              (a, l) => a + (l.leads?.pipeline_value_cents ?? 0),
              0,
            );
            return (
              <Link
                key={inq.id}
                to="/app/inquiries/$id"
                params={{ id: inq.id }}
                className="block"
              >
                <Card className="p-4 transition-colors hover:bg-accent min-h-[160px] flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-primary shrink-0" />
                        <h3 className="truncate font-semibold">{inq.title}</h3>
                      </div>
                      {inq.product && (
                        <div className="truncate text-xs text-muted-foreground">{inq.product}</div>
                      )}
                    </div>
                    <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", STATUS_STYLES[inq.status])}>
                      {inq.status === "won" && <Trophy className="mr-0.5 inline h-3 w-3" />}
                      {inq.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 font-bold text-primary">
                      {leadCount} leads
                    </span>
                    {(inq.inquiry_leads ?? []).slice(0, 4).map((l) =>
                      l.leads ? (
                        <span
                          key={l.lead_id}
                          className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", LEAD_STATUS_STYLES[l.leads.status])}
                          title={l.leads.contact_person ?? l.leads.company_name ?? ""}
                        >
                          {(l.leads.contact_person ?? l.leads.company_name ?? "?").slice(0, 2)}
                        </span>
                      ) : null,
                    )}
                  </div>

                  {(sumValue > 0 || inq.target_value_cents > 0) && (
                    <div className="text-xs text-muted-foreground">
                      Pipeline · <span className="font-semibold text-foreground">{fmtMoneyCents(sumValue)}</span>
                      {inq.target_value_cents > 0 && (
                        <> · Target {fmtMoneyCents(inq.target_value_cents)}</>
                      )}
                    </div>
                  )}

                  <div className="mt-auto text-[11px] text-muted-foreground">
                    Updated {timeAgo(inq.updated_at)}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <CreateInquiryDialog
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["inquiries"] });
          setOpenCreate(false);
        }}
      />
    </div>
  );
}

function CreateInquiryDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const createFn = useServerFn(createInquiry);
  const [title, setTitle] = useState("");
  const [product, setProduct] = useState("");
  const [description, setDescription] = useState("");
  const [targetValue, setTargetValue] = useState("0");

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          title: title.trim(),
          product: product.trim() || null,
          description: description.trim() || null,
          target_value_cents: Math.max(0, Math.round(Number(targetValue || "0") * 100)),
        },
      }),
    onSuccess: () => {
      toast.success("Inquiry created");
      setTitle("");
      setProduct("");
      setDescription("");
      setTargetValue("0");
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Inquiry</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 50 units of Wacom Cintiq 24" maxLength={200} />
          </div>
          <div>
            <Label>Product</Label>
            <Input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Optional" maxLength={200} />
          </div>
          <div>
            <Label>Target value (AED)</Label>
            <Input value={targetValue} onChange={(e) => setTargetValue(e.target.value)} type="number" min={0} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!title.trim() || create.isPending}>
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
