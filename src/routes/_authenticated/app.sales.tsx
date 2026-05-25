import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { useMemo, useRef, useState } from "react";
import { Upload, X, Settings2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

type FieldKey =
  | "order_date"
  | "invoice_no"
  | "company_name"
  | "rep_walid"
  | "rep_javid"
  | "vat"
  | "value";

const FIELDS: { key: FieldKey; label: string; required?: boolean }[] = [
  { key: "order_date", label: "Date", required: true },
  { key: "invoice_no", label: "Invoice No", required: true },
  { key: "company_name", label: "Company" },
  { key: "rep_walid", label: "Walid (Sales Rep)" },
  { key: "rep_javid", label: "Javid (Sales Rep)" },
  { key: "vat", label: "5% VAT" },
  { key: "value", label: "Total Sales", required: true },
];

type Mapping = Record<FieldKey, string | "">;
const NONE = "__none__";
const MAP_KEY = "sales-xlsx-template-v1";

const DEFAULT_TEMPLATE: Mapping = {
  order_date: "Date",
  invoice_no: "Invoice No",
  company_name: "Company",
  rep_walid: "Walid",
  rep_javid: "Javid",
  vat: "5% VAT",
  value: "Total Sales",
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function headersMatchTemplate(headers: string[], tmpl: Mapping): boolean {
  const set = new Set(headers.map(norm));
  // Require the 3 required fields to be present (allow flexible names for VAT)
  const must: FieldKey[] = ["order_date", "invoice_no", "value"];
  return must.every((k) => {
    const v = tmpl[k];
    return v ? set.has(norm(v)) : false;
  });
}

function guessHeader(headers: string[], key: FieldKey): string {
  const hints: Record<FieldKey, string[]> = {
    order_date: ["date", "orderdate", "invoicedate"],
    invoice_no: ["invoiceno", "invoice", "orderno", "ref"],
    company_name: ["company", "customer", "client", "name"],
    rep_walid: ["walid"],
    rep_javid: ["javid"],
    vat: ["vat", "tax", "5vat"],
    value: ["totalsales", "total", "amount", "value", "grandtotal"],
  };
  const h = hints[key];
  for (const head of headers) {
    const n = norm(head);
    if (h.some((p) => n.includes(p))) return head;
  }
  return "";
}

function parseDate(input: unknown): string | null {
  if (input == null || input === "") return null;
  // Excel serial date
  if (typeof input === "number") {
    const d = XLSX.SSF?.parse_date_code(input);
    if (d) {
      const iso = new Date(Date.UTC(d.y, d.m - 1, d.d)).toISOString().slice(0, 10);
      return iso;
    }
  }
  const s = String(input).trim();
  if (!s) return null;
  // dd/mm/yyyy first (matches the eTOP template)
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const day = +m[1];
    const mo = +m[2];
    let yr = +m[3];
    if (yr < 100) yr += 2000;
    const d = new Date(Date.UTC(yr, mo - 1, day));
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseNumber(input: unknown): number | null {
  if (input == null || input === "") return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const s = String(input).replace(/[,\s]/g, "").replace(/[^\d.\-]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function asString(input: unknown): string | null {
  if (input == null) return null;
  const s = String(input).trim();
  return s || null;
}

type SheetData = { name: string; headers: string[]; rows: Record<string, unknown>[] };

type MappedRow = {
  order_date: string | null;
  invoice_no: string | null;
  company_name: string | null;
  rep_walid: number | null;
  rep_javid: number | null;
  vat: number | null;
  value: number | null;
  source_sheet: string;
};

function mapRow(row: Record<string, unknown>, m: Mapping, sheet: string): MappedRow {
  return {
    order_date: parseDate(m.order_date ? row[m.order_date] : null),
    invoice_no: m.invoice_no ? asString(row[m.invoice_no]) : null,
    company_name: m.company_name ? asString(row[m.company_name]) : null,
    rep_walid: parseNumber(m.rep_walid ? row[m.rep_walid] : null),
    rep_javid: parseNumber(m.rep_javid ? row[m.rep_javid] : null),
    vat: parseNumber(m.vat ? row[m.vat] : null),
    value: parseNumber(m.value ? row[m.value] : null),
    source_sheet: sheet,
  };
}

const CHART_COLORS = [
  "hsl(221 83% 53%)",
  "hsl(142 71% 45%)",
  "hsl(0 84% 60%)",
  "hsl(38 92% 50%)",
  "hsl(262 83% 58%)",
  "hsl(173 80% 40%)",
];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function SalesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listSales);
  const importFn = useServerFn(importSales);
  const { data: rows, isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: () => list(),
  });

  // --- Upload state ---
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(new Set());
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [showMapper, setShowMapper] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | null | undefined) => {
    if (!file) return;
    setFilename(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: false });
      const parsed: SheetData[] = wb.SheetNames.map((name) => {
        const ws = wb.Sheets[name];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
          defval: null,
          raw: true,
        });
        const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        return { name, headers, rows };
      }).filter((s) => s.headers.length > 0);
      if (!parsed.length) {
        toast.error("No data found in workbook");
        return;
      }
      setSheets(parsed);
      setSelectedSheets(new Set(parsed.map((s) => s.name)));

      // Load saved template or default
      let saved: Mapping | null = null;
      try {
        const raw = localStorage.getItem(MAP_KEY);
        if (raw) saved = JSON.parse(raw);
      } catch {
        /* ignore */
      }
      const tmpl = saved ?? DEFAULT_TEMPLATE;
      const firstHeaders = parsed[0].headers;
      if (headersMatchTemplate(firstHeaders, tmpl)) {
        setMapping(tmpl);
        setShowMapper(false);
      } else {
        // build guessed mapping for review
        const guessed: Mapping = {
          order_date: "",
          invoice_no: "",
          company_name: "",
          rep_walid: "",
          rep_javid: "",
          vat: "",
          value: "",
        };
        for (const f of FIELDS) {
          guessed[f.key] = guessHeader(firstHeaders, f.key);
        }
        setMapping(guessed);
        setShowMapper(true);
        toast.info("New template detected — confirm column mapping.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to read workbook");
    }
  };

  const reset = () => {
    setSheets([]);
    setSelectedSheets(new Set());
    setMapping(null);
    setShowMapper(false);
    setFilename(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const toggleSheet = (name: string) => {
    setSelectedSheets((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectedRowsRaw = useMemo(() => {
    const out: { sheet: string; row: Record<string, unknown> }[] = [];
    for (const s of sheets) {
      if (!selectedSheets.has(s.name)) continue;
      for (const r of s.rows) out.push({ sheet: s.name, row: r });
    }
    return out;
  }, [sheets, selectedSheets]);

  const preview = useMemo(() => {
    if (!mapping) return [];
    return selectedRowsRaw
      .slice(0, 20)
      .map(({ sheet, row }) => mapRow(row, mapping, sheet));
  }, [selectedRowsRaw, mapping]);

  const allHeaders = useMemo(() => {
    const set = new Set<string>();
    for (const s of sheets) if (selectedSheets.has(s.name)) s.headers.forEach((h) => set.add(h));
    return Array.from(set);
  }, [sheets, selectedSheets]);

  const handleImport = async () => {
    if (!mapping) return;
    if (!mapping.value || !mapping.order_date || !mapping.invoice_no) {
      return toast.error("Map Date, Invoice No and Total Sales columns first");
    }
    const all = selectedRowsRaw
      .map(({ sheet, row }) => mapRow(row, mapping, sheet))
      // skip blank/footer rows
      .filter((r) => r.invoice_no && r.value != null);
    if (!all.length) return toast.error("No valid rows to import");

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

  // --- Transactions filters / chart ---
  type RepFilter = "all" | "walid" | "javid";
  type Range = "month" | "quarter" | "all";
  const [search, setSearch] = useState("");
  const [repFilter, setRepFilter] = useState<RepFilter>("all");
  const [range, setRange] = useState<Range>("all");
  const [month, setMonth] = useState<string>(""); // yyyy-mm
  const [quarter, setQuarter] = useState<string>(""); // yyyy-Q1..Q4

  const amountOf = (r: { value: unknown; rep_walid: unknown; rep_javid: unknown }) => {
    if (repFilter === "walid") return Number(r.rep_walid) || 0;
    if (repFilter === "javid") return Number(r.rep_javid) || 0;
    return Number(r.value) || 0;
  };

  // Available months/quarters from data
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    (rows ?? []).forEach((r) => {
      if (r.order_date) set.add(r.order_date.slice(0, 7));
    });
    return Array.from(set).sort().reverse();
  }, [rows]);

  const availableQuarters = useMemo(() => {
    const set = new Set<string>();
    (rows ?? []).forEach((r) => {
      if (!r.order_date) return;
      const [y, m] = r.order_date.split("-").map(Number);
      const q = Math.floor((m - 1) / 3) + 1;
      set.add(`${y}-Q${q}`);
    });
    return Array.from(set).sort().reverse();
  }, [rows]);

  // Default selections
  if (range === "month" && !month && availableMonths.length) {
    setMonth(availableMonths[0]);
  }
  if (range === "quarter" && !quarter && availableQuarters.length) {
    setQuarter(availableQuarters[0]);
  }

  const rangeFiltered = useMemo(() => {
    const list = rows ?? [];
    return list.filter((r) => {
      if (!r.order_date) return range === "all";
      if (range === "month") return month ? r.order_date.startsWith(month) : true;
      if (range === "quarter") {
        if (!quarter) return true;
        const [y, m] = r.order_date.split("-").map(Number);
        const q = Math.floor((m - 1) / 3) + 1;
        return `${y}-Q${q}` === quarter;
      }
      return true;
    });
  }, [rows, range, month, quarter]);

  const repFiltered = useMemo(() => {
    return rangeFiltered.filter((r) => {
      if (repFilter === "walid") return r.rep_walid != null;
      if (repFilter === "javid") return r.rep_javid != null;
      return true;
    });
  }, [rangeFiltered, repFilter]);

  // --- Chart data ---
  type LinePoint = { label: string } & Record<string, number | string>;

  const topCompanies = useMemo(() => {
    const totals = new Map<string, number>();
    repFiltered.forEach((r) => {
      const c = r.company_name?.trim() || "Unknown";
      totals.set(c, (totals.get(c) || 0) + amountOf(r));
    });
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repFiltered, repFilter]);

  const lineData = useMemo<LinePoint[]>(() => {
    // Bucket by day for month, by month for quarter
    const buckets = new Map<string, Record<string, number>>();
    repFiltered.forEach((r) => {
      if (!r.order_date) return;
      const company = r.company_name?.trim() || "Unknown";
      if (!topCompanies.includes(company)) return;
      const key =
        range === "month" ? r.order_date.slice(8, 10) : r.order_date.slice(5, 7);
      const bucket = buckets.get(key) ?? {};
      bucket[company] = (bucket[company] || 0) + amountOf(r);
      buckets.set(key, bucket);
    });
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, vals]) => {
        const point: LinePoint = { label: range === "quarter" ? MONTHS[Number(label) - 1] ?? label : label };
        topCompanies.forEach((c) => {
          point[c] = vals[c] || 0;
        });
        return point;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repFiltered, topCompanies, range, repFilter]);

  const barData = useMemo(() => {
    const totals = new Map<string, number>();
    repFiltered.forEach((r) => {
      const c = r.company_name?.trim() || "Unknown";
      totals.set(c, (totals.get(c) || 0) + amountOf(r));
    });
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([company, total]) => ({ company, total }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repFiltered, repFilter]);

  // Transactions table (search applied)
  const tableRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return repFiltered.filter((r) => {
      if (!q) return true;
      return (
        (r.company_name ?? "").toLowerCase().includes(q) ||
        (r.invoice_no ?? "").toLowerCase().includes(q)
      );
    });
  }, [repFiltered, search]);

  const tableTotal = tableRows.reduce((acc, r) => acc + amountOf(r), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
        <p className="text-sm text-muted-foreground">
          Upload your monthly sales workbook (.xlsx). We'll auto-map the eTOP template; remap on the fly if your template changes.
        </p>
      </div>

      {/* Upload card */}
      <Card>
        <CardHeader>
          <CardTitle>Upload workbook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!sheets.length ? (
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border p-8 text-sm text-muted-foreground"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onFile(e.dataTransfer.files?.[0]);
              }}
            >
              <Upload className="h-6 w-6" />
              <div>Drop a .xlsx or .csv file here</div>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                Choose file
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium">{filename}</span>{" "}
                  <span className="text-muted-foreground">
                    · {sheets.length} sheet{sheets.length === 1 ? "" : "s"} ·{" "}
                    {selectedRowsRaw.length} rows selected
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowMapper((v) => !v)}>
                    <Settings2 className="mr-1 h-4 w-4" />
                    {showMapper ? "Hide mapping" : "Remap columns"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={reset}>
                    <X className="mr-1 h-4 w-4" /> Clear
                  </Button>
                </div>
              </div>

              {/* Sheet picker */}
              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  Which sheets to import?
                </div>
                <div className="flex flex-wrap gap-2">
                  {sheets.map((s) => {
                    const active = selectedSheets.has(s.name);
                    return (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() => toggleSheet(s.name)}
                        className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-muted"
                        }`}
                      >
                        {s.name}{" "}
                        <span className={active ? "opacity-75" : "text-muted-foreground"}>
                          ({s.rows.length})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mapping (collapsed when template matches) */}
              {showMapper && mapping && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {FIELDS.map((f) => (
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
                          {allHeaders.map((h) => (
                            <SelectItem key={h} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}

              {/* Preview */}
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Preview (first 20)</div>
                <div className="overflow-x-auto rounded border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sheet</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead className="text-right">Walid</TableHead>
                        <TableHead className="text-right">Javid</TableHead>
                        <TableHead className="text-right">VAT</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Badge variant="outline">{r.source_sheet}</Badge>
                          </TableCell>
                          <TableCell>{r.order_date ?? "—"}</TableCell>
                          <TableCell>{r.invoice_no ?? "—"}</TableCell>
                          <TableCell className="max-w-[240px] truncate">
                            {r.company_name ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.rep_walid != null ? r.rep_walid.toLocaleString() : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.rep_javid != null ? r.rep_javid.toLocaleString() : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.vat != null ? r.vat.toLocaleString() : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.value != null ? r.value.toLocaleString() : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleImport} disabled={importing || !selectedRowsRaw.length}>
                  {importing
                    ? "Importing…"
                    : `Import ${selectedRowsRaw.length} rows`}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Analytics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>Analytics</span>
            <div className="flex flex-wrap gap-2">
              <Select value={repFilter} onValueChange={(v) => setRepFilter(v as RepFilter)}>
                <SelectTrigger className="h-8 w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All reps</SelectItem>
                  <SelectItem value="walid">Walid</SelectItem>
                  <SelectItem value="javid">Javid</SelectItem>
                </SelectContent>
              </Select>
              <Select value={range} onValueChange={(v) => setRange(v as Range)}>
                <SelectTrigger className="h-8 w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="quarter">Quarter</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
              {range === "month" && availableMonths.length > 0 && (
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger className="h-8 w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMonths.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {range === "quarter" && availableQuarters.length > 0 && (
                <Select value={quarter} onValueChange={setQuarter}>
                  <SelectTrigger className="h-8 w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableQuarters.map((q) => (
                      <SelectItem key={q} value={q}>
                        {q}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {repFiltered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data for this filter yet.</p>
          ) : range === "all" ? (
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 10, right: 16, left: 8, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="company"
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    height={70}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} />
                  <Tooltip formatter={(v: number) => v.toLocaleString()} />
                  <Bar dataKey="total" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={{ top: 10, right: 16, left: 8, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} />
                  <Tooltip formatter={(v: number) => v.toLocaleString()} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {topCompanies.map((c, i) => (
                    <Line
                      key={c}
                      type="monotone"
                      dataKey={c}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>Transactions</span>
            <span className="text-sm font-normal text-muted-foreground">
              {tableRows.length} rows · Total {tableTotal.toLocaleString()}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap gap-2">
            <Input
              placeholder="Search company or invoice…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !rows || rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No transactions yet. Upload a workbook above.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead className="text-right">Walid</TableHead>
                    <TableHead className="text-right">Javid</TableHead>
                    <TableHead className="text-right">VAT</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Sheet</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableRows.slice(0, 500).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.order_date ?? "—"}</TableCell>
                      <TableCell>{r.invoice_no ?? "—"}</TableCell>
                      <TableCell className="max-w-[260px] truncate">
                        {r.company_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.rep_walid != null ? Number(r.rep_walid).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.rep_javid != null ? Number(r.rep_javid).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.vat != null ? Number(r.vat).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.value != null ? Number(r.value).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell>
                        {r.source_sheet ? (
                          <Badge variant="outline">{r.source_sheet}</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {tableRows.length > 500 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Showing first 500 of {tableRows.length}.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
