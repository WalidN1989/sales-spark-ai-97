import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import { useMemo, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { importSales, listSales } from "@/lib/sales.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/sales")({
  head: () => ({ meta: [{ title: "Sales — Sales Insights" }] }),
  component: SalesPage,
});

type FieldKey = "order_date" | "order_ref" | "value" | "brand" | "model" | "product";
const FIELDS: { key: FieldKey; label: string; required?: boolean }[] = [
  { key: "order_date", label: "Order date" },
  { key: "order_ref", label: "Order ref / #" },
  { key: "value", label: "Value / amount", required: true },
  { key: "brand", label: "Brand" },
  { key: "model", label: "Model" },
  { key: "product", label: "Product / service" },
];

type Mapping = Record<FieldKey, string | "">;
const NONE = "__none__";

const MAP_KEY = "sales-csv-mapping-v1";

function guessHeader(headers: string[], key: FieldKey): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const hints: Record<FieldKey, string[]> = {
    order_date: ["date", "orderdate", "invoicedate"],
    order_ref: ["ref", "reference", "orderno", "order", "invoice", "number"],
    value: ["value", "amount", "total", "price", "subtotal", "grandtotal"],
    brand: ["brand", "make", "manufacturer", "vendor"],
    model: ["model"],
    product: ["product", "service", "item", "description"],
  };
  const h = hints[key];
  for (const head of headers) {
    const n = norm(head);
    if (h.some((p) => n.includes(p))) return head;
  }
  return "";
}

function parseDate(input: unknown): string | null {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;
  // try native
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  // try dd/mm/yyyy or dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const day = +m[1];
    const mo = +m[2];
    let yr = +m[3];
    if (yr < 100) yr += 2000;
    const d2 = new Date(Date.UTC(yr, mo - 1, day));
    if (!Number.isNaN(d2.getTime())) return d2.toISOString().slice(0, 10);
  }
  return null;
}

function parseNumber(input: unknown): number | null {
  if (input == null) return null;
  const s = String(input).replace(/[,\s]/g, "").replace(/[^\d.\-]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function SalesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listSales);
  const importFn = useServerFn(importSales);
  const { data: rows, isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: () => list(),
  });

  const [csvRows, setCsvRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File | null | undefined) => {
    if (!file) return;
    setFilename(file.name);
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const hdrs = (res.meta.fields ?? []).filter(Boolean);
        setHeaders(hdrs);
        setCsvRows(res.data);
        // restore mapping or guess
        let stored: Partial<Mapping> = {};
        try {
          stored = JSON.parse(localStorage.getItem(MAP_KEY) ?? "{}");
        } catch {
          /* ignore */
        }
        const next: Mapping = {
          order_date: "",
          order_ref: "",
          value: "",
          brand: "",
          model: "",
          product: "",
        };
        for (const f of FIELDS) {
          const fromStore = stored[f.key];
          next[f.key] = fromStore && hdrs.includes(fromStore) ? fromStore : guessHeader(hdrs, f.key);
        }
        setMapping(next);
      },
      error: (err) => toast.error(`CSV parse error: ${err.message}`),
    });
  };

  const preview = useMemo(() => {
    if (!mapping) return [];
    return csvRows.slice(0, 20).map((row) => ({
      order_date: parseDate(mapping.order_date ? row[mapping.order_date] : null),
      order_ref: mapping.order_ref ? (row[mapping.order_ref]?.toString() ?? null) : null,
      value: parseNumber(mapping.value ? row[mapping.value] : null),
      brand: mapping.brand ? (row[mapping.brand]?.toString() ?? null) : null,
      model: mapping.model ? (row[mapping.model]?.toString() ?? null) : null,
      product: mapping.product ? (row[mapping.product]?.toString() ?? null) : null,
    }));
  }, [csvRows, mapping]);

  const reset = () => {
    setCsvRows([]);
    setHeaders([]);
    setMapping(null);
    setFilename(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleImport = async () => {
    if (!mapping) return;
    if (!mapping.value) return toast.error("Map the Value/amount column first");
    const all = csvRows.map((row) => ({
      order_date: parseDate(mapping.order_date ? row[mapping.order_date] : null),
      order_ref: mapping.order_ref ? (row[mapping.order_ref]?.toString() ?? null) : null,
      value: parseNumber(mapping.value ? row[mapping.value] : null),
      brand: mapping.brand ? (row[mapping.brand]?.toString() ?? null) : null,
      model: mapping.model ? (row[mapping.model]?.toString() ?? null) : null,
      product: mapping.product ? (row[mapping.product]?.toString() ?? null) : null,
    }));
    setImporting(true);
    try {
      localStorage.setItem(MAP_KEY, JSON.stringify(mapping));
      const res = await importFn({ data: { rows: all } });
      toast.success(`Imported ${res.inserted} rows (${res.skipped} duplicates skipped)`);
      reset();
      qc.invalidateQueries({ queryKey: ["sales"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const total = (rows ?? []).reduce((acc, r) => acc + (Number(r.value) || 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
        <p className="text-sm text-muted-foreground">
          Upload your sales CSV. Map columns once — we'll remember it next time.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!csvRows.length ? (
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border p-8 text-sm text-muted-foreground"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onFile(e.dataTransfer.files?.[0]);
              }}
            >
              <Upload className="h-6 w-6" />
              <div>Drop a .csv file here</div>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                Choose file
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium">{filename}</span>{" "}
                  <span className="text-muted-foreground">· {csvRows.length} rows</span>
                </div>
                <Button variant="ghost" size="sm" onClick={reset}>
                  <X className="mr-1 h-4 w-4" /> Clear
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mapping &&
                  FIELDS.map((f) => (
                    <div key={f.key}>
                      <Label>
                        {f.label}
                        {f.required && <span className="text-destructive"> *</span>}
                      </Label>
                      <Select
                        value={mapping[f.key] || NONE}
                        onValueChange={(v) =>
                          setMapping((m) => (m ? { ...m, [f.key]: v === NONE ? "" : v } : m))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="— none —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>— none —</SelectItem>
                          {headers.map((h) => (
                            <SelectItem key={h} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
              </div>

              <div>
                <div className="mb-1 text-xs text-muted-foreground">Preview (first 20)</div>
                <div className="overflow-x-auto rounded border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Ref</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead>Brand</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead>Product</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell>{r.order_date ?? "—"}</TableCell>
                          <TableCell>{r.order_ref ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            {r.value != null ? r.value.toLocaleString() : "—"}
                          </TableCell>
                          <TableCell>{r.brand ?? "—"}</TableCell>
                          <TableCell>{r.model ?? "—"}</TableCell>
                          <TableCell className="max-w-[240px] truncate">{r.product ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleImport} disabled={importing}>
                  {importing ? "Importing…" : `Import ${csvRows.length} rows`}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Transactions</span>
            <span className="text-sm font-normal text-muted-foreground">
              {rows?.length ?? 0} rows · Total {total.toLocaleString()}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !rows || rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet. Upload a CSV above.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Ref</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Product</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 200).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.order_date ?? "—"}</TableCell>
                      <TableCell>{r.order_ref ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {r.value != null ? Number(r.value).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell>{r.brand ?? "—"}</TableCell>
                      <TableCell>{r.model ?? "—"}</TableCell>
                      <TableCell className="max-w-[240px] truncate">{r.product ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > 200 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Showing first 200 of {rows.length}.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
