// Staff lead importer. Download the template, fill it, upload it. The only
// requirement is a Company name — every other field is optional. Each imported
// lead is owned by and assigned to the person importing (author engraved), and
// only maps onto existing lead columns.
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Download, FileUp, Loader2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { importMyLeads } from "@/lib/leads.functions";
import { downloadSheet } from "@/lib/export-sheet";
import { toast } from "sonner";

// The template columns, in order. Company is the only one that matters.
const TEMPLATE_HEADERS = [
  "Company", "Contact name", "Job title", "Email", "WhatsApp", "Phone",
  "Website", "Product / Service", "Pipeline value (AED)", "Stage", "Priority", "Notes",
];
const TEMPLATE_EXAMPLE = [
  "Acme Trading LLC", "Ahmed Khan", "Procurement Manager", "ahmed@acme.ae",
  "+971501234567", "+97142000000", "https://acme.ae", "Wacom STU-540 | Access control",
  "50000", "quotation", "high", "Met at GITEX — wants a demo",
];

// Case-insensitive header → importMyLeads field.
const ALIASES: Record<string, string> = {
  company: "company", "company name": "company", name: "company",
  "contact name": "contact", contact: "contact", "contact person": "contact", contact_person: "contact",
  "job title": "job_title", job_title: "job_title", title: "job_title", position: "job_title",
  email: "email", "e-mail": "email",
  whatsapp: "whatsapp", "whatsapp number": "whatsapp",
  phone: "phone", mobile: "phone", tel: "phone", telephone: "phone", landline: "phone",
  website: "website", domain: "website", url: "website",
  "product / service": "product", "product/service": "product", product_service: "product",
  product: "product", service: "product", "products & services": "product",
  "pipeline value (aed)": "value", "pipeline value": "value", value: "value", amount: "value",
  stage: "stage", "pipeline stage": "stage",
  priority: "priority",
  notes: "notes", comments: "notes",
};

type ImportRow = Record<string, string>;

function mapRows(raw: Record<string, unknown>[]): ImportRow[] {
  const out: ImportRow[] = [];
  for (const r of raw) {
    const row: ImportRow = {};
    for (const [k, v] of Object.entries(r)) {
      const field = ALIASES[k.trim().toLowerCase()];
      if (!field) continue;
      const val = String(v ?? "").trim();
      if (val && !row[field]) row[field] = val;
    }
    if (row.company) out.push(row);
  }
  return out;
}

export function ImportLeadsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const importFn = useServerFn(importMyLeads);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [parseErr, setParseErr] = useState<string | null>(null);

  const reset = () => {
    setFileName(null);
    setRows([]);
    setParseErr(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const downloadTemplate = () =>
    downloadSheet("leads-template", TEMPLATE_HEADERS, [TEMPLATE_EXAMPLE], "csv", "Leads");

  const onFile = async (file: File) => {
    setParseErr(null);
    setFileName(file.name);
    try {
      let raw: Record<string, unknown>[] = [];
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        raw = XLSX.utils.sheet_to_json(ws, { defval: "" });
      } else {
        const text = await file.text();
        const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
        raw = parsed.data;
      }
      const mapped = mapRows(raw);
      if (mapped.length === 0) {
        setParseErr("No rows with a Company name were found. Check the file and headers.");
        setRows([]);
        return;
      }
      setRows(mapped);
    } catch (e) {
      setParseErr(e instanceof Error ? e.message : "Could not read the file");
      setRows([]);
    }
  };

  const run = useMutation({
    mutationFn: () => importFn({ data: { rows } }),
    onSuccess: (res: { inserted: number; skipped: number }) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success(
        `Imported ${res.inserted} lead${res.inserted === 1 ? "" : "s"}` +
          (res.skipped ? ` · ${res.skipped} skipped (no company)` : ""),
      );
      onOpenChange(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import leads</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium">1. Download the template</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Fill one row per lead. Only <span className="font-semibold">Company</span> is required — leave anything
              else blank if you don't have it.
            </p>
            <Button variant="outline" size="sm" className="mt-2 h-8 text-xs" onClick={downloadTemplate}>
              <Download className="mr-1 h-3.5 w-3.5" /> Download CSV template
            </Button>
          </div>

          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">2. Upload your filled file</p>
            <p className="mt-0.5 text-xs text-muted-foreground">CSV or Excel (.xlsx). Imported leads are added to your book.</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            <Button variant="outline" size="sm" className="mt-2 h-8 text-xs" onClick={() => fileRef.current?.click()}>
              <FileUp className="mr-1 h-3.5 w-3.5" /> {fileName ? "Choose a different file" : "Choose file"}
            </Button>
            {fileName && !parseErr && (
              <p className="mt-2 text-xs text-emerald-600">
                {fileName} — <span className="font-semibold">{rows.length}</span> lead{rows.length === 1 ? "" : "s"} ready
                to import.
              </p>
            )}
            {parseErr && <p className="mt-2 text-xs text-rose-600">{parseErr}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => run.mutate()} disabled={rows.length === 0 || run.isPending}>
            {run.isPending ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Importing…
              </>
            ) : (
              <>
                <Upload className="mr-1 h-3.5 w-3.5" /> Import {rows.length || ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
