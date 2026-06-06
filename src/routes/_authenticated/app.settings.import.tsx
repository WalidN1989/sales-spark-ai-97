import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import Papa from "papaparse";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAccess } from "@/hooks/use-access";
import { importProspects, importLeads } from "@/lib/import.functions";

export const Route = createFileRoute("/_authenticated/app/settings/import")({
  component: ImportPage,
});

const PROSPECT_COLS = [
  "id", "user_id", "name", "domain", "country", "industry", "contact_person",
  "email", "phone", "product_service", "address", "lat", "lng", "research_data",
  "last_research_at", "created_at", "market_seed_urls", "market_insight",
  "market_insight_at", "hunter_last_sync", "employee_count", "linkedin_url",
  "enrichment_status",
];

const LEAD_COLS = [
  "id", "user_id", "company_id", "prospect_id", "contact_person", "contact_email",
  "whatsapp", "status", "pipeline_value_cents", "last_activity_kind",
  "last_activity_at", "last_activity_note", "company_name", "website", "brands",
  "products_services", "notes", "job_title", "source", "email_status",
  "email_score", "last_verified_at", "lead_score", "lead_score_manual_override",
  "created_at", "updated_at",
];

type ImportResult = {
  inserted: number;
  skipped: { index: number; reason: string }[];
  failed: { index: number; error: string }[];
};

function ImportPage() {
  const { isAdmin, isLoading } = useAccess();
  const importProspectsFn = useServerFn(importProspects);
  const importLeadsFn = useServerFn(importLeads);

  const [prospectRows, setProspectRows] = useState<Record<string, string>[]>([]);
  const [prospectHeaders, setProspectHeaders] = useState<string[]>([]);
  const [prospectResult, setProspectResult] = useState<ImportResult | null>(null);
  const [prospectMap, setProspectMap] = useState<Record<string, string> | null>(null);
  const [prospectBusy, setProspectBusy] = useState(false);

  const [leadRows, setLeadRows] = useState<Record<string, string>[]>([]);
  const [leadHeaders, setLeadHeaders] = useState<string[]>([]);
  const [leadResult, setLeadResult] = useState<ImportResult | null>(null);
  const [leadBusy, setLeadBusy] = useState(false);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!isAdmin) return <p className="text-sm text-muted-foreground">Admin only.</p>;

  const parseFile = (
    file: File,
    setRows: (r: Record<string, string>[]) => void,
    setHeaders: (h: string[]) => void,
  ) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setRows(res.data);
        setHeaders(res.meta.fields ?? []);
      },
      error: (err) => toast.error(`Parse error: ${err.message}`),
    });
  };

  const runProspects = async () => {
    setProspectBusy(true);
    try {
      const res = await importProspectsFn({ data: { rows: prospectRows } });
      setProspectResult({
        inserted: res.inserted,
        skipped: res.skipped,
        failed: res.failed,
      });
      setProspectMap(res.prospectIdMap);
      toast.success(
        `Prospects: ${res.inserted} inserted, ${res.skipped.length} skipped, ${res.failed.length} failed`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setProspectBusy(false);
    }
  };

  const runLeads = async () => {
    if (!prospectMap) {
      toast.error("Import prospects first");
      return;
    }
    setLeadBusy(true);
    try {
      const res = await importLeadsFn({
        data: { rows: leadRows, prospectIdMap: prospectMap },
      });
      setLeadResult(res);
      toast.success(
        `Leads: ${res.inserted} inserted, ${res.skipped.length} skipped, ${res.failed.length} failed`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLeadBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Step
        title="Step 1 — Import Prospects"
        expectedCols={PROSPECT_COLS}
        rows={prospectRows}
        headers={prospectHeaders}
        onFile={(f) => parseFile(f, setProspectRows, setProspectHeaders)}
        onImport={runProspects}
        busy={prospectBusy}
        result={prospectResult}
        importLabel="Import prospects"
      />

      <Step
        title="Step 2 — Import Leads"
        expectedCols={LEAD_COLS}
        rows={leadRows}
        headers={leadHeaders}
        onFile={(f) => parseFile(f, setLeadRows, setLeadHeaders)}
        onImport={runLeads}
        busy={leadBusy}
        result={leadResult}
        disabled={!prospectMap}
        disabledReason="Complete Step 1 first."
        importLabel="Import leads"
      />
    </div>
  );
}

function Step({
  title, expectedCols, rows, headers, onFile, onImport, busy, result,
  disabled, disabledReason, importLabel,
}: {
  title: string;
  expectedCols: string[];
  rows: Record<string, string>[];
  headers: string[];
  onFile: (f: File) => void;
  onImport: () => void;
  busy: boolean;
  result: ImportResult | null;
  disabled?: boolean;
  disabledReason?: string;
  importLabel: string;
}) {
  const matched = expectedCols.filter((c) => headers.includes(c));
  const missing = expectedCols.filter((c) => !headers.includes(c));
  const extra = headers.filter((c) => !expectedCols.includes(c));
  const preview = rows.slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {disabled && (
          <p className="text-sm text-muted-foreground">{disabledReason}</p>
        )}
        <Input
          type="file"
          accept=".csv,text/csv"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        {rows.length > 0 && (
          <>
            <div className="text-sm">
              <span className="font-medium">{rows.length}</span> rows detected.
            </div>
            <div className="grid gap-2 text-xs sm:grid-cols-3">
              <div>
                <p className="font-medium text-foreground">Matched ({matched.length})</p>
                <p className="text-muted-foreground break-words">{matched.join(", ") || "—"}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Missing ({missing.length})</p>
                <p className="text-muted-foreground break-words">{missing.join(", ") || "—"}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Extra ({extra.length})</p>
                <p className="text-muted-foreground break-words">{extra.join(", ") || "—"}</p>
              </div>
            </div>
            <div className="overflow-x-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.slice(0, 8).map((h) => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((r, i) => (
                    <TableRow key={i}>
                      {headers.slice(0, 8).map((h) => (
                        <TableCell key={h} className="max-w-[200px] truncate">
                          {String(r[h] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button onClick={onImport} disabled={busy || disabled}>
              {busy ? "Importing…" : importLabel}
            </Button>
          </>
        )}
        {result && (
          <div className="space-y-2 rounded border p-3 text-sm">
            <p>
              Inserted: <b>{result.inserted}</b> · Skipped:{" "}
              <b>{result.skipped.length}</b> · Failed:{" "}
              <b>{result.failed.length}</b>
            </p>
            {result.skipped.length > 0 && (
              <details>
                <summary className="cursor-pointer text-muted-foreground">
                  Skipped rows
                </summary>
                <ul className="mt-1 max-h-48 list-disc space-y-0.5 overflow-auto pl-5 text-xs">
                  {result.skipped.map((s, i) => (
                    <li key={i}>row {s.index}: {s.reason}</li>
                  ))}
                </ul>
              </details>
            )}
            {result.failed.length > 0 && (
              <details>
                <summary className="cursor-pointer text-destructive">
                  Failed batches
                </summary>
                <ul className="mt-1 max-h-48 list-disc space-y-0.5 overflow-auto pl-5 text-xs">
                  {result.failed.map((s, i) => (
                    <li key={i}>{s.error}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
