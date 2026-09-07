// Download a table as .xlsx (Excel) or .csv, entirely client-side. Excel uses
// the `xlsx` dependency already bundled for imports. Paste straight into Google
// Sheets until a native Sheets integration is added.
import * as XLSX from "xlsx";

export type Cell = string | number | null | undefined;

function trigger(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function downloadSheet(
  baseName: string,
  header: string[],
  rows: Cell[][],
  format: "xlsx" | "csv",
  sheetName = "Export",
) {
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `${baseName}-${stamp}`;
  if (format === "csv") {
    const esc = (v: Cell) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
    trigger(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${name}.csv`);
    return;
  }
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  trigger(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${name}.xlsx`,
  );
}
