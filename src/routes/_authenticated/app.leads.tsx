import { createFileRoute, Outlet, useChildMatches } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Upload, Sparkles, X, Image as ImageIcon } from "lucide-react";
import { listLeads, createQuickLead, extractLeadFromImage } from "@/lib/leads.functions";
import { listResellerCompanies } from "@/lib/companies.functions";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { LeadsCommandCenter, type CommandLead } from "@/components/leads/CommandCenter";

export const Route = createFileRoute("/_authenticated/app/leads")({
  head: () => ({ meta: [{ title: "Leads — Sales Insights" }] }),
  component: LeadsRoot,
});

function LeadsRoot() {
  const childMatches = useChildMatches();
  if (childMatches.length > 0) return <Outlet />;
  return <LeadsPage />;
}

function LeadsPage() {
  const listFn = useServerFn(listLeads);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["leads"], queryFn: () => listFn() });
  const leads = (data ?? []) as unknown as CommandLead[];

  const [quickOpen, setQuickOpen] = useState(false);

  useEffect(() => {
    const handler = () => setQuickOpen(true);
    window.addEventListener("shortcut:add-lead", handler);
    return () => window.removeEventListener("shortcut:add-lead", handler);
  }, []);

  return (
    <div className="min-w-0">
      <LeadsCommandCenter leads={leads} isLoading={isLoading} onAddLead={() => setQuickOpen(true)} />
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
  const listResellersFn = useServerFn(listResellerCompanies);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: resellers = [] } = useQuery({
    queryKey: ["reseller-companies"],
    queryFn: () => listResellersFn(),
    enabled: open,
  });

  const [images, setImages] = useState<string[]>([]);
  const [contact, setContact] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [product, setProduct] = useState("");
  const [note, setNote] = useState("");
  const [extracted, setExtracted] = useState<Set<string>>(new Set());
  const [isReseller, setIsReseller] = useState(false);
  const [resellerChoice, setResellerChoice] = useState<string>(""); // existing id or "__new__"
  const [newResellerName, setNewResellerName] = useState("");
  const [endUserProject, setEndUserProject] = useState("");
  const [pipelineValue, setPipelineValue] = useState("");

  const reset = () => {
    setImages([]);
    setContact("");
    setWhatsapp("");
    setEmail("");
    setCompanyName("");
    setWebsite("");
    setProduct("");
    setNote("");
    setExtracted(new Set());
    setIsReseller(false);
    setResellerChoice("");
    setNewResellerName("");
    setEndUserProject("");
    setPipelineValue("");
  };

  const extract = useMutation({
    mutationFn: (url: string) => extractFn({ data: { imageDataUrl: url } }),
    onSuccess: (r) => {
      const tags = new Set<string>(extracted);
      if (r.contact_person && !contact) { setContact(r.contact_person); tags.add("contact"); }
      if (r.whatsapp && !whatsapp) { setWhatsapp(r.whatsapp.replace(/[^\d+\-\s()]/g, "")); tags.add("whatsapp"); }
      if (r.contact_email && !email) { setEmail(r.contact_email); tags.add("email"); }
      if (r.company_name && !companyName) { setCompanyName(r.company_name); tags.add("company"); }
      if (r.website && !website) { setWebsite(r.website); tags.add("website"); }
      if (r.product && !product) { setProduct(r.product); tags.add("product"); }
      if (r.note) {
        setNote((n) => (n ? `${n}\n${r.note}` : r.note!));
        tags.add("note");
      }
      setExtracted(tags);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: () => {
      const reseller_company_id =
        isReseller && resellerChoice && resellerChoice !== "__new__" ? resellerChoice : null;
      const reseller_company_name =
        isReseller && resellerChoice === "__new__" ? newResellerName.trim() : null;
      const pipeline_value_cents = Math.max(0, Math.round(Number(pipelineValue || "0") * 100));
      return createFn({
        data: {
          contact_person: contact || null,
          whatsapp,
          contact_email: email || null,
          company_name: companyName || null,
          website: website || null,
          product: product || null,
          note: note || null,
          is_reseller: isReseller,
          reseller_company_id,
          reseller_company_name,
          end_user_project: isReseller ? endUserProject || null : null,
          pipeline_value_cents,
        },
      });
    },
    onSuccess: () => {
      toast.success("Lead added");
      reset();
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFiles = (files: File[] | FileList) => {
    const arr = Array.from(files).slice(0, 10);
    for (const file of arr) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 6 * 1024 * 1024) {
        toast.error(`${file.name || "Image"} is over 6 MB — skipped`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result || "");
        setImages((prev) => [...prev, url]);
        extract.mutate(url);
      };
      reader.readAsDataURL(file);
    }
  };

  // Paste images directly (Ctrl/Cmd + V) while dialog is open
  useEffect(() => {
    if (!open) return;
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        handleFiles(files);
        toast.success(`Pasted ${files.length} image${files.length === 1 ? "" : "s"}`);
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New WhatsApp Lead</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
            }}
            className="relative cursor-pointer rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-center hover:bg-muted/50"
          >
            {images.length > 0 ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {images.map((src, i) => (
                    <div key={i} className="relative">
                      <img
                        src={src}
                        alt={`screenshot ${i + 1}`}
                        className="h-20 w-20 rounded object-cover ring-1 ring-border"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setImages((prev) => prev.filter((_, idx) => idx !== i));
                        }}
                        className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-background ring-1 ring-border hover:bg-muted"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">
                  {extract.isPending
                    ? "Reading screenshot(s)…"
                    : "Click, drop, or paste (Ctrl+V) more images"}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-4 text-sm text-muted-foreground">
                <ImageIcon className="h-6 w-6" />
                <div>
                  Drop, click to upload, or <span className="font-medium text-foreground">paste (Ctrl+V)</span> WhatsApp screenshots
                </div>
                <div className="text-xs">PNG / JPG / WebP, up to 6 MB each — multiple supported</div>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleFiles(e.target.files);
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

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Company name {tag("company")}
              </Label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                maxLength={200}
                placeholder="Optional"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Website {tag("website")}
              </Label>
              <Input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                maxLength={300}
                placeholder="example.com (optional)"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Product / service * {tag("product")}
              </Label>
              <Input
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                maxLength={500}
                placeholder="What is the customer asking about?"
                required
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
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Pipeline value (AED)
              </Label>
              <Input
                value={pipelineValue}
                onChange={(e) => setPipelineValue(e.target.value)}
                type="number"
                min="0"
                inputMode="decimal"
                placeholder="0"
              />
            </div>
          </div>


          <div className="rounded-lg border bg-amber-50/40 dark:bg-amber-950/10 p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={isReseller}
                onCheckedChange={(c) => setIsReseller(c === true)}
              />
              <span className="text-sm font-medium">This is a Reseller lead</span>
            </label>
            {isReseller && (
              <>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Primary reseller *
                  </Label>
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
                      <SelectItem value="__new__">+ Create new reseller…</SelectItem>
                    </SelectContent>
                  </Select>
                  {resellerChoice === "__new__" && (
                    <Input
                      value={newResellerName}
                      onChange={(e) => setNewResellerName(e.target.value)}
                      placeholder="New reseller company name"
                      className="mt-2"
                      maxLength={200}
                    />
                  )}
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    End user / project details
                  </Label>
                  <Textarea
                    value={endUserProject}
                    onChange={(e) => setEndUserProject(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    placeholder="e.g. National Intelligence Agency – STU-430 rollout"
                  />
                </div>
              </>
            )}
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
            disabled={
              !whatsapp.trim() ||
              !product.trim() ||
              create.isPending ||
              (isReseller && !resellerChoice) ||
              (isReseller && resellerChoice === "__new__" && !newResellerName.trim())
            }
          >
            <Upload className="mr-1 h-4 w-4" />
            {create.isPending ? "Saving…" : "Add to Leads"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
