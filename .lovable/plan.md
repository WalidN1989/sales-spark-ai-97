## Goal

Two additions to Market Insight:

1. **Social footprint** on each competitor row (LinkedIn / X / Facebook / Instagram icons) so the user can land directly on a social profile. Auto-discovered via Firecrawl during the scan.
2. **Full-screen competitor metric page** opened by clicking a row, with breadcrumbs and an AI-drafted outreach email (from My Company → competitor).

---

## 1. Social URLs on the scan

**Server (`src/lib/market.functions.ts`)**
- After AI returns the competitor list, for every competitor that has a `website`, call Firecrawl `/v2/map` with `search: "linkedin twitter facebook instagram"` and a small `limit` (≈30) to find external social links — and also extract any social URLs already found in the scraped seed markdown.
- Normalize and dedupe per platform; store as `socials: { linkedin?, twitter?, facebook?, instagram?, youtube? }` on each competitor inside the existing `market_insight` jsonb. No new column.
- Skip silently per-competitor on failure so one bad map doesn't kill the scan. Cap to first ~10 competitors to control credits.

**UI (Competitors table in `app.prospects.$id.tsx`)**
- New compact "Social" column with small icon buttons (lucide `Linkedin`, `Twitter`, `Facebook`, `Instagram`, `Youtube`) — only icons for platforms that exist; `target="_blank" rel="noopener"`.
- Row stays clickable (see §2); icons get `e.stopPropagation()` so clicking an icon goes to the social, clicking elsewhere opens the metric page.

---

## 2. Full-screen competitor metric page

**New route:** `src/routes/_authenticated/app.prospects.$id.competitor.$slug.tsx`
- URL: `/app/prospects/:id/competitor/:slug` where `slug` is the competitor name slugified (lookup against `market_insight.competitors`).
- Breadcrumbs at the top (shadcn `Breadcrumb`): **Prospects › {Company Name} › Competitors › {Competitor Name}**.
- Layout sections:
  - Header card: competitor name, country, website, social icon row (same icons as table).
  - **Profile** card: description + source badge.
  - **Outreach** card: "Draft email" button → calls new server fn, shows subject + body in editable `Input` + `Textarea`, plus Copy / "Open in mail client" (`mailto:`) buttons. Drafts are not persisted in v1.
  - Empty placeholder cards for **Products**, **Keywords (SEMrush)**, **Backlinks** so the panel feels like a metric panel and signals future work.

**Loader:** reads the parent company from `companies` by id, finds the matching competitor in `market_insight.competitors` by slug; throws `notFound()` if missing.

**Click handler in the Competitors table:** `<TableRow>` becomes a `Link` (or `onClick` + `useNavigate`) to the new route. Cursor `pointer`. Social icons stop propagation.

---

## 3. Draft email server function

**New** `src/lib/competitor-email.functions.ts`
- `draftCompetitorEmail({ companyId, competitorSlug })` — auth required.
- Loads parent company + finds competitor in its `market_insight`, plus the user's `my_company` row for sender context.
- Calls Lovable AI `google/gemini-3-flash-preview` with tool-calling for strict `{ subject, body }`. System prompt: "Write a concise, professional cold outreach email FROM the sender company TO the competitor, offering collaboration / introducing services. 120–180 words. No placeholders like [Your Name]."
- Returns `{ subject, body }`. No DB write.

Reuses the same error mapping (rate limit / credits / missing keys) used in `market.functions.ts`.

---

## Out of scope (deferred)

- Manual editing of social URLs in the panel.
- Persisting drafted emails / send history.
- SEMrush / backlinks / products data — placeholder cards only.

## Files

- Edit `src/lib/market.functions.ts` — add Firecrawl map + social extraction; extend `insightToolSchema` competitor shape with optional `socials`.
- New `src/lib/competitor-email.functions.ts`.
- Edit `src/routes/_authenticated/app.prospects.$id.tsx` — Social icon column + clickable rows.
- New `src/routes/_authenticated/app.prospects.$id.competitor.$slug.tsx` — full-screen metric page.
