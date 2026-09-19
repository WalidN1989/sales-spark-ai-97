// Pure mapping from the "Master Price Book" workbook to product rows.
// The workbook has several sheets with DIFFERENT layouts, so we detect each
// sheet's layout by its header row and map accordingly. No I/O here — the caller
// (Products page) reads the .xlsx with SheetJS and passes arrays-of-arrays in.

export type NormalizedProduct = {
  part_number: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  cost_price_cents: number | null;
  selling_price_cents: number | null;
  currency: string;
  stock_status: string | null;
  notes: string | null;
};

export type SheetInput = { name: string; rows: string[][] };

export type ImportSummary = {
  total: number;
  perSheet: { sheet: string; layout: string; imported: number; skipped: number }[];
};

// "4,226.00" / " 1250 " / "AED 440" -> 442600 cents; blank/0/junk -> null.
export function parsePriceCents(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).replace(/,/g, "").replace(/[^0-9.\-]/g, "").trim();
  if (!s) return null;
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function clean(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

type Layout = "matica" | "wacom" | "ubio" | "unknown";

function detectLayout(header: string[]): Layout {
  const h = header.map((c) => clean(c).toLowerCase());
  const has = (name: string) => h.includes(name);
  if (has("part_no") && (has("selling_price_aed") || has("purchase_cost_aed"))) return "matica";
  if (has("part no") && has("description") && has("cost price")) return "wacom";
  if (has("product code") && has("product name")) return "ubio";
  return "unknown";
}

// Find the header row within the first few rows (some sheets have a blank lead row).
function findHeaderRow(rows: string[][]): { idx: number; layout: Layout } {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const layout = detectLayout(rows[i] ?? []);
    if (layout !== "unknown") return { idx: i, layout };
  }
  return { idx: -1, layout: "unknown" };
}

function colIndexer(header: string[]) {
  const map = new Map<string, number>();
  header.forEach((c, i) => map.set(clean(c).toLowerCase(), i));
  return (name: string, row: string[]): string => {
    const idx = map.get(name.toLowerCase());
    return idx == null ? "" : clean(row[idx]);
  };
}

function mapRow(layout: Layout, get: (n: string, r: string[]) => string, row: string[]): NormalizedProduct | null {
  let out: NormalizedProduct | null = null;

  if (layout === "matica") {
    const commercial = get("commercial_name", row);
    const description = get("description", row);
    const name = commercial || description;
    if (!name && !get("part_no", row)) return null;
    const extraDesc = commercial && description && description !== commercial ? description : "";
    const sheetNotes = get("notes", row);
    out = {
      part_number: get("part_no", row) || null,
      name: name || get("part_no", row),
      brand: get("brand", row) || null,
      category: get("category", row) || null,
      cost_price_cents: parsePriceCents(get("purchase_cost_aed", row)),
      selling_price_cents: parsePriceCents(get("selling_price_aed", row)),
      currency: "AED",
      stock_status: get("discontinued", row).toUpperCase() === "TRUE" ? "Discontinued" : null,
      notes: [extraDesc, sheetNotes].filter(Boolean).join(" — ") || null,
    };
  } else if (layout === "wacom") {
    const name = get("description", row);
    if (!name && !get("part no", row)) return null;
    out = {
      part_number: get("part no", row) || null,
      name: name || get("part no", row),
      brand: "Wacom",
      category: "Wacom",
      cost_price_cents: parsePriceCents(get("cost price", row)),
      selling_price_cents: parsePriceCents(get("selling price", row)),
      currency: "AED",
      stock_status: null,
      notes: null,
    };
  } else if (layout === "ubio") {
    const name = get("product name", row);
    if (!name && !get("product code", row)) return null;
    out = {
      part_number: get("product code", row) || null,
      name: name || get("product code", row),
      brand: "Nitgen",
      category: "Access Control",
      cost_price_cents: parsePriceCents(get("new price (aed)", row)),
      selling_price_cents: parsePriceCents(get("selling price", row)),
      currency: "AED",
      stock_status: null,
      notes: null,
    };
  }

  if (out) {
    if (out.part_number) out.part_number = out.part_number.toUpperCase();
    out.name = out.name.trim();
    if (!out.name) return null;
  }
  return out;
}

export function normalizeWorkbook(sheets: SheetInput[]): {
  products: NormalizedProduct[];
  summary: ImportSummary;
} {
  const products: NormalizedProduct[] = [];
  const perSheet: ImportSummary["perSheet"] = [];

  for (const sheet of sheets) {
    const { idx, layout } = findHeaderRow(sheet.rows ?? []);
    if (idx < 0 || layout === "unknown") {
      if ((sheet.rows ?? []).some((r) => r.some((c) => clean(c)))) {
        perSheet.push({ sheet: sheet.name, layout: "unknown (skipped)", imported: 0, skipped: 0 });
      }
      continue;
    }
    const header = sheet.rows[idx];
    const get = colIndexer(header);
    let imported = 0;
    let skipped = 0;
    for (let r = idx + 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r];
      if (!row || !row.some((c) => clean(c))) continue; // blank row
      const mapped = mapRow(layout, get, row);
      if (mapped) {
        products.push(mapped);
        imported++;
      } else {
        skipped++;
      }
    }
    perSheet.push({ sheet: sheet.name, layout, imported, skipped });
  }

  return { products, summary: { total: products.length, perSheet } };
}

// Stable identity for de-duplication: part number (upper) + name (lower). A blank
// part number falls back to name only. Used to decide insert vs update vs skip.
export function productKey(p: { part_number?: string | null; name: string }): string {
  const pn = (p.part_number ?? "").trim().toUpperCase();
  const nm = (p.name ?? "").trim().toLowerCase();
  return `${pn}||${nm}`;
}
