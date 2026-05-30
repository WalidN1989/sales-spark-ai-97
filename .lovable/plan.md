## Market Insight (v1)

Add a new **Market Insight** tab to the company profile (`/app/prospects/$id`) that lets the user scan a company and get:

1. **Suggested industries** — 1–3 AI-inferred industry tags based on the company's name, manually-entered industry, website and existing research data.
2. **Competitor list** — competitors discovered via AI from an optional seed list of competitor URLs the user provides.

Results are cached on the company and re-run on demand via a SCAN button (matches the mock).

### UX

In `app.prospects.$id.tsx`, add a `TabsTrigger value="market"` next to Pitch email and a matching `TabsContent`:

- Header card (dark, like mock): title "Market Insight", subtitle, "Last scan" timestamp + SCAN button.
- **Suggested industries**: chips showing AI-suggested industries with confidence; small "Apply" link to write a chosen one back to `companies.industry`.
- **Seed competitors input**: textarea to paste competitor URLs (one per line), saved with the scan.
- **Competitors table** (shadcn `Table`): columns — Name · Website · Country · Short description · Source (seeded / AI-expanded).
- Empty state before first scan; loading spinner during scan; toast on error.

### Data

New columns on `public.companies` (migration):
- `market_seed_urls text[]` — user-supplied competitor URLs.
- `market_insight jsonb` — `{ industries: [{name, confidence}], competitors: [{name, website, country, description, source}], generated_at }`.
- `market_insight_at timestamptz`.

No new table needed for v1 — single cached blob per company is enough and keeps it simple.

### Server function

New file `src/lib/market.functions.ts`:

- `scanMarketInsight({ companyId, seedUrls })` — auth-required:
  1. Loads the company (name, industry, domain, research_data) via authed Supabase client.
  2. For each seed URL (cap ~5), calls Firecrawl `/v2/scrape` (markdown+summary, main content) — reuses the pattern in `companies.functions.ts`. Skips silently on per-URL failures.
  3. Calls Lovable AI gateway (`google/gemini-3-flash-preview`) with tool-calling for a strict JSON shape: `industries[]`, `competitors[]`. System prompt asks it to expand the seed list with additional likely competitors and to suggest industries based on the company + scraped seed content.
  4. Writes result + timestamp + seed URLs to `companies` and returns it.

Errors map to friendly messages (rate limit, credits exhausted, missing `FIRECRAWL_API_KEY` / `LOVABLE_API_KEY`) just like the existing extract helpers.

### Files

- **Migration**: add `market_seed_urls`, `market_insight`, `market_insight_at` to `companies`.
- **New**: `src/lib/market.functions.ts`.
- **Edit**: `src/routes/_authenticated/app.prospects.$id.tsx` — new tab, table, scan handler, industry chips, seed-URL editor; invalidate the `["company", id]` query on success.

### Out of scope for v1 (noted for later)

Products-per-competitor table, Semrush keyword volumes, social URL discovery via Firecrawl map, deep keyword insights window — explicitly deferred per the user's note that the richer table is a "future" expansion.
