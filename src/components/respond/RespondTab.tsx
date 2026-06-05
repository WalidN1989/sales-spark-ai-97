import { useMemo, useState, type ClipboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, Copy, Save, BookOpen, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TagInput } from "@/components/leads/TagInput";
import { RESPOND_ENGINES, type EngineId } from "@/lib/respond-engines";
import {
  generateResponse,
  ocrImage,
  saveResponseToActivityLog,
  saveResponseToLearning,
} from "@/lib/respond.functions";
import { extractPartNumberCandidates } from "@/lib/products.functions";

type UploadItem = {
  id: string;
  path: string;
  name: string;
  status: "uploading" | "ocr" | "done" | "error";
  text?: string;
  error?: string;
};

export function RespondTab({
  companyId,
  leadId,
}: {
  companyId?: string;
  leadId?: string;
}) {
  const qc = useQueryClient();
  const gen = useServerFn(generateResponse);
  const ocr = useServerFn(ocrImage);
  const saveAct = useServerFn(saveResponseToActivityLog);
  const saveLearn = useServerFn(saveResponseToLearning);

  const [engine, setEngine] = useState<EngineId>("initial_inquiry");
  const [inputText, setInputText] = useState("");
  const [notes, setNotes] = useState("");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [draft, setDraft] = useState("");
  const [responseId, setResponseId] = useState<string | null>(null);
  const [matchedProducts, setMatchedProducts] = useState<
    Array<{ name: string; part_number: string | null; brand: string | null; selling_price_cents: number | null; currency: string | null }>
  >([]);
  const [usedLearning, setUsedLearning] = useState<Array<{ title: string; category: string }>>([]);
  const [saveLearnOpen, setSaveLearnOpen] = useState(false);
  const [learnTitle, setLearnTitle] = useState("");
  const [learnCategory, setLearnCategory] = useState<
    "writing_style" | "business_rule" | "objection" | "negotiation"
  >("writing_style");
  const [learnTags, setLearnTags] = useState<string[]>([]);

  const ocrText = useMemo(
    () => uploads.filter((u) => u.text).map((u) => u.text).join("\n\n"),
    [uploads],
  );

  const detectedParts = useMemo(
    () => extractPartNumberCandidates(`${inputText}\n${ocrText}`),
    [inputText, ocrText],
  );

  const uploadOne = async (file: File, uid: string) => {
    const id = crypto.randomUUID();
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${uid}/${id}.${ext}`;
    const safeName = file.name || `pasted-${Date.now()}.${ext}`;
    setUploads((u) => [...u, { id, path, name: safeName, status: "uploading" }]);
    const { error } = await supabase.storage.from("respond-uploads").upload(path, file);
    if (error) {
      setUploads((u) =>
        u.map((x) => (x.id === id ? { ...x, status: "error", error: error.message } : x)),
      );
      return;
    }
    setUploads((u) => u.map((x) => (x.id === id ? { ...x, status: "ocr" } : x)));
    try {
      const r = await ocr({ data: { storagePath: path } });
      setUploads((u) => u.map((x) => (x.id === id ? { ...x, status: "done", text: r.text } : x)));
    } catch (e) {
      setUploads((u) =>
        u.map((x) =>
          x.id === id ? { ...x, status: "error", error: e instanceof Error ? e.message : "OCR failed" } : x,
        ),
      );
    }
  };

  const handleUpload = async (files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files).slice(0, 10);
    if (arr.length === 0) return;
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) {
      toast.error("Not signed in");
      return;
    }
    for (const file of arr) {
      await uploadOne(file, uid);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
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
      void handleUpload(files);
      toast.success(`Pasted ${files.length} image${files.length === 1 ? "" : "s"}`);
    }
  };

  const removeUpload = async (item: UploadItem) => {
    setUploads((u) => u.filter((x) => x.id !== item.id));
    await supabase.storage.from("respond-uploads").remove([item.path]);
  };

  const generate = useMutation({
    mutationFn: () =>
      gen({
        data: {
          companyId: companyId ?? null,
          leadId: leadId ?? null,
          engine,
          inputText,
          notes: notes || null,
          ocrText: ocrText || null,
          attachments: uploads.filter((u) => u.status !== "error").map((u) => ({ path: u.path, name: u.name })),
        },
      }),
    onSuccess: (res) => {
      setDraft(res.draft);
      setResponseId(res.responseId);
      setMatchedProducts(res.matchedProducts);
      setUsedLearning(res.usedLearning.map((l) => ({ title: l.title, category: l.category })));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(draft);
    toast.success("Copied");
  };

  const handleSaveActivity = async () => {
    if (!responseId || !draft.trim()) return;
    try {
      await saveAct({ data: { responseId, finalText: draft } });
      if (companyId) qc.invalidateQueries({ queryKey: ["company", companyId] });
      if (leadId) {
        qc.invalidateQueries({ queryKey: ["lead-activities", leadId] });
        qc.invalidateQueries({ queryKey: ["lead", leadId] });
      }
      toast.success("Saved to activity log");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const handleSaveLearning = async () => {
    if (!responseId) return;
    try {
      await saveLearn({
        data: {
          responseId,
          title: learnTitle || `${RESPOND_ENGINES.find((e) => e.id === engine)?.label} — ${new Date().toLocaleDateString()}`,
          category: learnCategory,
          tags: learnTags,
          finalText: draft || null,
        },
      });
      toast.success("Saved to Learning");
      setSaveLearnOpen(false);
      setLearnTitle("");
      setLearnTags([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <Label className="mb-1 block text-xs">Response engine</Label>
          <Select value={engine} onValueChange={(v) => setEngine(v as EngineId)}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESPOND_ENGINES.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="mb-1 block text-xs">Customer email / message</Label>
          <Textarea
            rows={6}
            placeholder="Paste the customer's email, WhatsApp message, or inquiry… (Ctrl+V images here too)"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onPaste={handlePaste}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Tip: paste screenshots directly (Ctrl/Cmd + V) — multiple images supported.
          </p>
        </div>

        <div>
          <Label className="mb-1 block text-xs">Screenshots (OCR'd automatically)</Label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm hover:bg-muted/50">
              <Upload className="h-4 w-4" />
              <span>Upload images</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleUpload(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            {uploads.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-2 rounded border bg-card px-2 py-1 text-xs"
                title={u.text ?? u.error ?? u.name}
              >
                <span className="max-w-[160px] truncate">{u.name}</span>
                <span
                  className={
                    u.status === "done"
                      ? "text-emerald-600"
                      : u.status === "error"
                        ? "text-rose-600"
                        : "text-muted-foreground"
                  }
                >
                  {u.status === "uploading"
                    ? "Uploading…"
                    : u.status === "ocr"
                      ? "OCR…"
                      : u.status === "done"
                        ? "✓"
                        : "Error"}
                </span>
                <button
                  type="button"
                  onClick={() => removeUpload(u)}
                  className="rounded text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <Label className="mb-1 block text-xs">Notes (optional)</Label>
          <Textarea
            rows={2}
            placeholder="Existing customer, wants Ex-JAFZA pricing, negotiating heavily…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {detectedParts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-muted-foreground">Detected part numbers:</span>
            {detectedParts.map((p) => (
              <Badge key={p} variant="secondary">
                {p}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {draft ? "Regenerate" : "Generate response"}
          </Button>
        </div>

        {draft && (
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="text-xs">Draft response</Label>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={handleCopy}>
                    <Copy className="mr-1 h-3 w-3" /> Copy
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleSaveActivity}>
                    <Save className="mr-1 h-3 w-3" /> Save to Activity
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSaveLearnOpen(true)}>
                    <BookOpen className="mr-1 h-3 w-3" /> Save to Learning
                  </Button>
                </div>
              </div>
              <Textarea rows={14} value={draft} onChange={(e) => setDraft(e.target.value)} />
            </div>

            {matchedProducts.length > 0 && (
              <div className="rounded border bg-muted/30 p-3 text-xs">
                <div className="mb-1 font-semibold">Products used as context</div>
                <ul className="space-y-0.5">
                  {matchedProducts.map((p) => (
                    <li key={p.part_number ?? p.name}>
                      {p.brand ? `${p.brand} ` : ""}{p.name}
                      {p.part_number ? ` · ${p.part_number}` : ""}
                      {p.selling_price_cents != null
                        ? ` · ${(p.selling_price_cents / 100).toLocaleString()} ${p.currency ?? ""}`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {usedLearning.length > 0 && (
              <div className="rounded border bg-muted/30 p-3 text-xs">
                <div className="mb-1 font-semibold">Knowledge used</div>
                <ul className="space-y-0.5">
                  {usedLearning.map((l, i) => (
                    <li key={i}>
                      [{l.category}] {l.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <Dialog open={saveLearnOpen} onOpenChange={setSaveLearnOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save to Learning</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="mb-1 block text-xs">Title</Label>
                <Input
                  value={learnTitle}
                  onChange={(e) => setLearnTitle(e.target.value)}
                  placeholder="e.g. KAUST Ex-JAFZA pricing negotiation"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Category</Label>
                <Select value={learnCategory} onValueChange={(v) => setLearnCategory(v as typeof learnCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="writing_style">Writing Style</SelectItem>
                    <SelectItem value="business_rule">Business Rule</SelectItem>
                    <SelectItem value="objection">Objection Handling</SelectItem>
                    <SelectItem value="negotiation">Negotiation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block text-xs">Tags</Label>
                <TagInput value={learnTags} onChange={setLearnTags} placeholder="Type and press Enter" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setSaveLearnOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveLearning}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
