// Friendly CSV / Excel importer for the Prospects page. Maps human headers
// (company, contact_name, industry, country, product_service, email, phone,
// website, notes) onto the companies schema and reuses importProspects, which
// dedupes by company name (case-insensitive) and returns a created/skipped
// summary. WhatsApp/phone is never required.
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { FileUp, Loader2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { importProspects } from "@/lib/import.functions";
import { toast } from "sonner";

// Case-insensitive header → companies column.
const ALIASES: Record<string, string> = {
  company: "name",
  "company name": "name",
  name: "name",
  contact_name: "contact_person",
  "contact name": "contact_person",
  contact: "contact_person",
  contact_person: "contact_person",
  industry: "industry",
  sector: "industry",
  country: "country",
  product_service: "product_service",
  "product/service": "product_service",
  "product / service": "product_service",
  "product / service interest": "product_service",
  product: "product_service",
  service: "product_service",
  interest: "product_service",
  email: "email",
  "e-mail": "email",
  phone: "phone",
  "phone / whatsapp": "phone",
  whatsapp: "phone",
  mobile: "phone",
  tel: "phone",
  website: "domain",
  domain: "domain",
  url: "domain",
};

type MappedRow = Record<string, string>;

function mapRows(raw: Record<string, unknown>[]): { rows: MappedRow[]; hadNotes: boolean } {
  let hadNotes = false;
  const rows: MappedRow[] = [];
  for (const r of raw) {
    const out: MappedRow = {};
    for (const [k, v] of Object.entries(r)) {
      const key = k.trim().toLowerCase();
      if (key === "notes" || key === "comments") {
        if (String(v ?? "").trim()) hadNotes = true;
        continue; // no company notes column — imported separately, see hint
      }
      const field = ALIASES[key];
      if (field) out[field] = String(v ?? "").trim();
    }
    if (out.name) rows.push(out);
  }
  return { rows, hadNotes };
}

type Result = {
  inserted: number;
  skipped: { index: number; reason: string }[];
  failed: { index: number; error: string }[];
};

export function ImportProspectsDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const importFn = useServerFn(importProspects);
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<MappedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [hadNotes, setHadNotes] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const reset = () => {
    setRows([]);
    setFileName("");
    setHadNotes(false);
    setParseError(null);
    setResult(null);
  };

  const handleFile = async (file: File) => {
    reset();
    setFileName(file.name);
    try {
      let raw: Record<string, unknown>[];
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      } else {
        const text = await file.text();
        const parsed = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          skipEmptyLines: true,
        });
        raw = parsed.data;
      }
      const { rows: mapped, hadNotes: notes } = mapRows(raw);
      if (mapped.length === 0) {
        setParseError("No rows with a company name were found. Check the header row includes 'company'.");
        return;
      }
      setRows(mapped);
      setHadNotes(notes);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Could not read that file");
    }
  };

  const run = useMutation({
    mutationFn: () => importFn({ data: { rows } }) as Promise<Result>,
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["companies"] });
      onDone();
      toast.success(`Imported ${r.inserted} prospect${r.inserted === 1 ? "" : "s"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-primary" /> Import prospects
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Upload a CSV or Excel file. Duplicate company names are skipped automatically.
          </p>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border bg-emerald-50 p-3 dark:bg-emerald-950/30">
                <div className="text-2xl font-bold text-emerald-600">{result.inserted}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Created</div>
              </div>
              <div className="rounded-lg border bg-amber-50 p-3 dark:bg-amber-950/30">
                <div className="text-2xl font-bold text-amber-600">{result.skipped.length}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Skipped</div>
              </div>
              <div className="rounded-lg border bg-rose-50 p-3 dark:bg-rose-950/30">
                <div className="text-2xl font-bold text-rose-600">{result.failed.length}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Failed</div>
              </div>
            </div>
            {result.skipped.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-lg border bg-muted/40 p-2 text-xs text-muted-foreground">
                {result.skipped.slice(0, 30).map((s, i) => (
                  <div key={i}>Row {s.index + 1}: {s.reason}</div>
                ))}
                {result.skipped.length > 30 && <div>…and {result.skipped.length - 30} more</div>}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Import another
              </Button>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
              }}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm text-muted-foreground hover:bg-accent/40"
            >
              <Upload className="h-6 w-6" />
              {fileName ? (
                <div className="font-medium text-foreground">{fileName}</div>
              ) : (
                <>
                  <div>Drop a CSV / Excel file, or click to choose</div>
                  <div className="text-xs">
                    Headers: company, contact_name, industry, country, product_service, email, phone, website
                  </div>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFile(e.target.files[0]);
                  e.target.value = "";
                }}
              />
            </div>

            {parseError && <p className="text-sm text-rose-600">{parseError}</p>}

            {rows.length > 0 && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="font-medium">
                  {rows.length} prospect{rows.length === 1 ? "" : "s"} ready to import
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {rows.slice(0, 4).map((r) => r.name).join(", ")}
                  {rows.length > 4 ? "…" : ""}
                </div>
                {hadNotes && (
                  <div className="mt-2 text-[11px] text-amber-600">
                    Note: a Notes column was found — it isn&apos;t imported (prospects have no notes field yet).
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={() => run.mutate()} disabled={rows.length === 0 || run.isPending}>
                {run.isPending ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Importing…
                  </>
                ) : (
                  `Import ${rows.length || ""}`.trim()
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
