# Sales Module v2 — Plan

Rework `/app/sales` to handle multi-sheet Excel workbooks that follow your fixed eTOP template, store per-rep sales (Walid / Javid), and add an analytics chart with month / quarter / all-time modes plus a sales-rep filter.

## 1. Database changes

Extend `sales` with the columns the template carries:

```text
invoice_no    text     -- "Invoice No" column
company_name  text     -- free-text from sheet; company_id stays nullable for now
rep_walid     numeric  -- Walid's share of the sale (nullable)
rep_javid     numeric  -- Javid's share (nullable)
vat           numeric  -- 5% VAT column
-- existing: order_date, order_ref, value (= Total Sales), product, brand, model
```

- Drop the current dedup unique index, replace with `(user_id, order_date, invoice_no)` so re-uploading the same workbook is idempotent.
- No new tables yet (sales-reps stay as fixed columns; a proper `sales_reps` table is deferred to phase 2 so adding a 3rd rep doesn't need a migration).
- RLS already correct (`user_id = auth.uid() OR is_admin`).

## 2. Upload flow (XLSX, not CSV)

Replace the CSV uploader on `/app/sales`:

1. **Drop `.xlsx`** (keep `.csv` as fallback). Parse client-side with `xlsx` (SheetJS).
2. **Sheet picker** as soon as the workbook is parsed:
   `[ January ] [ February ] [ March ] [ April ] [ May ]` — multi-select, default all.
3. **Template detection** — compare the header row of the first selected sheet against the saved template (stored in `localStorage` as `sales-xlsx-template-v1`):
   - Default template = `Date | Invoice No | Company | Walid | Javid | 5% VAT | Total Sales` → fields `order_date | invoice_no | company_name | rep_walid | rep_javid | vat | value`.
   - Headers match → skip the mapping UI, go straight to preview.
   - Headers differ → show the mapping UI (extended with the new fields), and on confirm save the new mapping as the template for next time. A "Remap columns" button is always available to force the UI open.
4. **Preview** shows first 20 merged rows across selected sheets with a sheet badge per row.
5. **Import** calls `importSales` with all rows; server upserts on `(user_id, order_date, invoice_no)` so re-uploading is safe.

Notes on the template:
- Dates like `13/01/2026` parsed as `dd/mm/yyyy` (existing `parseDate` already handles it).
- Empty rep cells stored as `null`, not `0`, so per-rep totals stay accurate.
- Rows missing both `Total Sales` and `Invoice No` are skipped (footer/blank rows).

## 3. Transactions table

Below the uploader:

- Columns: Date, Invoice, Company, **Walid**, **Javid**, VAT, Total, (source sheet badge).
- Filters row: search (company / invoice), month dropdown, **Sales rep selector** (`All · Walid · Javid`).
  - Picking a rep filters to rows where that rep's amount is non-null, and the "Total" column switches to show that rep's amount.
- Footer total = sum of `value` (or selected rep's column) for the current filter.

## 4. Analytics chart (new card above the table)

Use `recharts` (already in deps via shadcn chart).

Controls:
- **Range**: `Month` (single-month picker) · `Quarter` (Q1/Q2/…) · `All time`.
- **Sales rep**: `All · Walid · Javid` — when a rep is selected, every aggregation uses that rep's amount instead of `value` (Total Sales). So you can see, e.g., Walid's all-time leaderboard vs Javid's.
- **Company multi-select** (optional) — when empty, auto-pick top 6 companies by total for the line chart.

Behaviour:
- **Month / Quarter**: line chart, X = day or week, Y = amount. One line per selected company in distinct colors from the chart palette.
- **All time**: bar chart sorted by total revenue per company (sum grouped by `company_name`, respecting the rep filter). Clicking a bar filters the transactions table to that company.

Phase 2 (deferred per your note): gap detection (company ordered in Jan but went quiet in Feb/Mar).

## 5. Files touched

```text
supabase/migrations/<new>.sql              # add invoice_no, company_name, rep_walid, rep_javid, vat; swap unique index
src/lib/sales.functions.ts                 # extend schema + select list
src/routes/_authenticated/app.sales.tsx    # XLSX upload, sheet picker, template auto-map, rep filter, chart, extended table
package.json                               # + xlsx (SheetJS)
```

No changes to Prospects, auth, or routing.
