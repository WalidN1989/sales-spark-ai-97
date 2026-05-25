## Goal

Make Prospects fully usable (Add company works, multi-source intake with AI autofill) and make Sales CSV upload work end-to-end.

## 1. Unblock "Add company" (root cause)

The Add-company flow calls `listCompanies` / `createCompany`, whose RLS policies invoke `public.is_admin(auth.uid())`. The function exists but `authenticated` lacks EXECUTE → `permission denied for function is_admin` (the error you hit earlier).

A migration granting EXECUTE on `is_admin`, `has_role`, `has_permission` was drafted but **not yet approved/applied**. Re-apply it as the first step so every prospects mutation stops 500-ing.

## 2. Prospects — multi-source intake on `/app/prospects/new`

Replace the single textarea with a 3-tab "Quick add" card:

```text
[ Email / signature text ]  [ Image (card / screenshot) ]  [ Website URL ]
```

All three paths populate the same editable form below (name, domain, country, industry, contact, email, phone, product/service, address) so the user can review before saving.

### a. Text tab (already works)
Keep the current `extractCompanyFromText` flow — paste signature → Gemini tool call → fields.

### b. Image tab (NEW — business card / email screenshot)
- File input + drag-drop + "Paste from clipboard" (reads `image/*` from `navigator.clipboard.read()`).
- Preview thumbnail, then "Extract with AI".
- New server fn `extractCompanyFromImage` calls Lovable AI Gateway with `google/gemini-2.5-flash` (vision-capable), sending the image as a `data:` URL plus the same `extract_company` tool schema used for text. Gemini does the OCR + structured extraction in one call — no separate OCR service needed.
- Accept PNG/JPG/WebP, hard cap ~6 MB; reject anything bigger client-side.

### c. URL tab (NEW — Firecrawl + AI)
- Single URL input + "Fetch & extract".
- New server fn `extractCompanyFromUrl`:
  1. Normalize URL.
  2. Firecrawl `scrape` with `formats: ["markdown","summary","links"]`, `onlyMainContent: true`.
  3. Feed the (truncated) markdown + summary + URL into the same `extract_company` Gemini tool call so name/industry/address/contact/etc. are inferred from the site.
  4. Return the structured fields **and** stash the raw scrape so the later "Research" tab on the detail page can reuse it (avoid double-scraping).

### UX
- One shared "Extracting…" state per tab, toast on success/failure.
- After extraction, scroll to the form, highlight changed fields briefly.
- Save button unchanged.

## 3. Sales — CSV upload (foundation)

Today `/app/sales` is a placeholder. Build the minimum useful version:

- Add a `sales_transactions` table (date, company_id nullable, customer_name, brand, model, service, qty, unit_price, total, currency, source_file, user_id, created_at) with RLS: user sees their own rows, admin sees all.
- `/app/sales` page:
  - Drag-drop CSV uploader (parse client-side with `papaparse`).
  - Column-mapping step: detected headers → required fields (date, customer/company, brand, model, service, amount). Remembers last mapping in localStorage.
  - Preview first 20 rows + validation errors.
  - "Import N rows" calls `importSalesRows` server fn which inserts in batches of 500 via Supabase `upsert` on a dedup key (`user_id, date, customer_name, total`) so re-uploading the same file is idempotent.
- Simple table view of imported rows with search + a totals bar (count, sum by currency). Charts deferred to next iteration as previously agreed.

## 4. Files touched

```text
supabase/migrations/<new>.sql           # re-apply grants + sales_transactions table & RLS
src/lib/companies.functions.ts          # + extractCompanyFromImage, extractCompanyFromUrl
src/lib/sales.functions.ts              # NEW: importSalesRows, listSalesRows
src/routes/_authenticated/app.prospects.new.tsx   # 3-tab intake UI
src/routes/_authenticated/app.sales.tsx           # CSV uploader + table
package.json                            # + papaparse, @types/papaparse
```

No changes to auth, routing shell, or the existing Research/Pitch tabs on the detail page.

## Out of scope (explicit)

- Charts/graphs on Sales (next iteration).
- Linking each sales row to a prospect automatically (manual link only for now).
- PDF business cards / multi-page docs.

## Open question

For the **Image tab**, OK to use Gemini vision (one call, no extra connector) instead of adding a dedicated OCR service? It's faster and cheaper and matches what you already pay for via Lovable AI.
