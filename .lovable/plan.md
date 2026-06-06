
## Goal

Add an admin-only **Import Data** page under Settings that restores `companies` (Prospects) and `leads` from CSV files exported from another workspace. Used after remixing a project to a new user.

## Routing & UI

- Edit `src/routes/_authenticated/app.settings.tsx` — add `{ to: "/app/settings/import", label: "Import data" }` to the tabs array (only when `isAdmin`).
- New route `src/routes/_authenticated/app.settings.import.tsx`:
  - 2-step wizard with shadcn `Card` per step.
  - **Step 1 — Prospects**: `<Input type="file" accept=".csv" />`, parse with papaparse client-side, show first 5 rows in a shadcn `Table`, detected-column match report (matched ✓ / missing ✗ / extra ⚠), total row count, **Import prospects** button. On success: toast with `inserted / skipped / failed`, per-row error list, then "Continue to leads".
  - **Step 2 — Leads**: same UI; disabled until Step 1 completes. Uses the `prospectIdMap` returned from Step 1 to rewrite `company_id` / `prospect_id`.
  - Both steps gated by `useAccess().isAdmin` — non-admins see "Admin only".

## Dependencies

- `bun add papaparse` + `bun add -d @types/papaparse`.

## Server functions — `src/lib/import.functions.ts`

Both use `createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])` with zod `inputValidator`. Use `context.supabase` (RLS as user). Helpers:

- `parsePgArray(s)` → `text[]` (handles `{a,b,"quoted,c"}`, `{}`, `null`).
- `parseJsonish(s)` → object or `null`.
- `parseIntish`, `parseFloatish`, `parseBoolish` (`t/f/true/false/1/0`), `parseTs` (ISO or null).
- `chunk(arr, 500)`.

### `importProspects({ rows })`

- Zod row schema permissive: all fields optional strings, `name` required & trimmed.
- Pre-fetch existing names: `supabase.from("companies").select("name").eq("user_id", userId)` → Set.
- For each row:
  - Skip if `name` empty or already exists → record in `skipped`.
  - Build new record: `id = crypto.randomUUID()`, `user_id = context.userId`, coerce types, `market_seed_urls = parsePgArray(...) ?? []`, `research_data/market_insight = parseJsonish(...)`, numeric fields via `parseIntish/Floatish`, timestamps via `parseTs`.
  - Track `prospectIdMap[row.id] = newId`.
- Insert in batches of 500; per-batch errors push to `failed[]` with row index + message.
- Return `{ inserted, skipped, failed, prospectIdMap }`.

### `importLeads({ rows, prospectIdMap })`

- Zod row schema permissive; required: at least one of `contact_email`/`whatsapp`/`company_name`.
- Pre-fetch existing leads for dedupe: `select("contact_email, whatsapp").eq("user_id", userId)` → two Sets (lowercased email, trimmed whatsapp).
- For each row:
  - Rewrite `company_id` and `prospect_id` via `prospectIdMap` — set to `null` if the source id is missing from the map.
  - Force `user_id = context.userId`, `id = crypto.randomUUID()`.
  - Dedupe against pre-fetched sets AND within the current batch (track seen in-loop).
  - Coerce `brands`/`products_services` via `parsePgArray` → `[]`; numerics; booleans (`lead_score_manual_override`); timestamps.
  - Default `status = "warm"`, `source = "manual"`, `pipeline_value_cents = 0`, `lead_score = 0`, `lead_score_manual_override = false` when missing.
- Insert in batches of 500. Return `{ inserted, skipped, failed }`.

## Security

- `user_id` from CSV is always discarded; rewritten to `context.userId`.
- Every field validated by zod; unknown columns ignored.
- RLS via `requireSupabaseAuth` client; no admin client used.
- Admin gate enforced both client-side (tab visibility + page guard) and implicitly by RLS (data only lands in caller's account regardless).

## File list

- new `src/lib/import.functions.ts`
- new `src/routes/_authenticated/app.settings.import.tsx`
- edit `src/routes/_authenticated/app.settings.tsx` (add tab)
- `bun add papaparse @types/papaparse`

## Out of scope

- No edits to other tables (activity_log, lead_documents, products, learning, responses, sales, my_company).
- No re-upload of stored files; only row data.
- No update/merge mode — duplicates are skipped, not overwritten.
