
## Hunter.io Integration — Phases 1–4 (Approved, with addenda)

Provider-agnostic: all Hunter calls and response normalization live in `src/lib/hunter.functions.ts`. UI consumes a neutral contact shape so Apollo / Snov / Clay can drop in later.

### 1. Secrets

- Prompt for `HUNTER_API_KEY` at start of build (server-only).
- Base URL `https://api.hunter.io/v2`. Read `X-RateLimit-Remaining` / `X-Hunter-Request-ID` from response headers; surface a friendly "Hunter monthly quota exhausted…" message on `usage_exceeded` / 402 / 429.

### 2. Migration (single file)

`public.companies` (acts as Prospects) — add:
- `hunter_last_sync timestamptz`
- `employee_count int`
- `linkedin_url text`
- `enrichment_status text`

`public.leads` — add:
- `prospect_id uuid null` referencing `public.companies(id) ON DELETE SET NULL`, indexed
- `job_title text`
- `source text default 'manual'`
- `email_status text` (`valid|risky|invalid|unknown`)
- `email_score int`
- `last_verified_at timestamptz`
- `lead_score int default 0`
- `lead_score_manual_override boolean default false`

Indexes: `(user_id, contact_email)`, `(user_id, whatsapp)`, `prospect_id`. Keep existing GRANTs/RLS.

### 3. Server functions — `src/lib/hunter.functions.ts` (new)

All gated by `requireSupabaseAuth`. Neutral contact shape:
```
{ first_name, last_name, full_name, email, position, department, seniority, linkedin, confidence, provider:'hunter.io' }
```

- **`hunterFindContacts({ companyId })`**
  - Resolve domain from `companies.domain` (fallback: parse `companies.email`).
  - `GET /domain-search?domain&limit=25`. Normalize emails[] to contact shape, return `{ contacts, organization, quotaRemaining }`.
  - Update `companies.hunter_last_sync`, `linkedin_url`, `employee_count` (when Hunter returns it).
  - Insert activity log on the **company**? No — we log on leads. Instead, return a summary so the UI can write a "search completed" entry against any imported leads.

- **`findPossibleDuplicates({ companyId, contacts })`** (helper, used by dialog)
  - For each candidate, find existing leads where ANY match:
    1. `contact_email ILIKE candidate.email`
    2. normalized digits of `whatsapp` equal candidate.whatsapp (when candidate carries one — Hunter doesn't return phones today, but interface supports it)
    3. `contact_person ILIKE candidate.full_name AND (company_name ILIKE companies.name OR company_id = companyId)`
  - Return `{ candidateKey → existingLead | null }` so the dialog can show "Possible existing lead found" inline with a "Merge / Skip / Create anyway" choice.

- **`hunterImportLeads({ companyId, contacts, overrides? })`**
  - For each selected contact: re-check dup; if match → skip OR update (depending on overrides flag), else INSERT.
  - Fields: `prospect_id = companyId`, `company_name`, `website`, `contact_person`, `contact_email`, `job_title`, `source = 'hunter.io'`, initial `status` from §6 below, `lead_score` from §5.
  - For every created lead, insert a `lead_activities` row: `kind='log', body='Imported from Hunter: <Name> · <title>'`.
  - Returns `{ created, skipped, updated, leadIds }`.

- **`hunterVerifyEmail({ leadId })`**
  - `GET /email-verifier?email`. Map Hunter `status` → ours: `valid→valid`, `invalid|disposable→invalid`, `accept_all|webmail|unknown→risky/unknown`.
  - Update `email_status`, `email_score`, `last_verified_at`. Then `recomputeLeadScore`.
  - Insert activity: `kind='log', body='Email verified: <status> (<score>)'`.

- **`recomputeLeadScore({ leadId })`**
  - If `lead_score_manual_override=true` → recompute `lead_score` (number) but DO NOT change `status`.
  - Title bucket (regex match against `job_title || contact_person`):
    - c-level: CEO|CTO|CFO|COO|CMO|Founder|Owner|Chief|President → +70 → status `hot`
    - director: Director|VP|Vice President|Head of → +50 → status `warm`
    - manager: Manager|Lead|Supervisor → +30 → status `warm`
    - other → +0 → status `cold`
  - Email: valid +20, risky +5, else 0.
  - Status set per bucket above (not by raw score) so default Hunter import maps to §6.
  - Insert activity: `kind='log', body='Lead score recalculated: <score> (<status>)'`.

- **`setLeadStatusManual({ leadId, status })`** (extends `updateLead` path)
  - Sets `status` + `lead_score_manual_override=true`. Activity: `'Status manually set to <status>'`.
  - "Clear override" action resets flag and runs `recomputeLeadScore`.

### 4. Initial status mapping (Hunter import) — §8

```
C-level   → hot
Director  → warm
Manager   → warm
Other     → cold
```

### 5. Lead-score formula

```
score = titleScore + emailScore
title: c_level=70 | director=50 | manager=30 | other=0
email: valid=20 | risky=5 | else=0
status: from title bucket (manual override wins)
```

### 6. UI — Find Contacts dialog (`src/components/prospects/FindContactsDialog.tsx`, new)

- Triggered from Prospect detail header next to AI Research / Create Lead.
- Top row: quick filter pills **All · Executives · Directors · Managers · IT · Procurement · Sales** (filter by seniority + department + title regex; pure client-side over the result set).
- Table: checkbox · Name · Title · Dept · Email · Confidence chip · LinkedIn icon · Dup indicator.
  - Confidence chip: `≥90 green · 70–89 orange · <70 gray`, label shows `95% confidence`.
  - Dup indicator: "Possible match: <existing lead name>" with link to that lead; row default-unchecked when dup.
- Footer: quota remaining text, "Import as Leads" runs `hunterImportLeads`.
- On success: toast `{created} created, {skipped} skipped`, invalidate `["leads"]`, close.

### 7. UI — Lead detail (`app.leads.$id.tsx`)

- Header: status pills now write `lead_score_manual_override=true` via `setLeadStatusManual`; show a small "Auto-scored" / "Manually set · Clear" toggle.
- Score chip next to status: `Score 85 · Hot`, color by bucket.
- New editable `job_title` field in Lead info (extends `updateLead` patch). Saving triggers `recomputeLeadScore`.
- Email row: "Verify Email" button → result chip 🟢 Valid / 🟡 Risky / 🔴 Invalid / ⚪ Unknown with score + "verified <relative time>".
- Activity timeline auto-shows all log entries from §3.

### 8. UI — Leads grid (`app.leads.tsx`) — §9

- Card now shows: Name · Company · Job title · Email status chip · Score chip · Pipeline (AED).
- Add sort menu: Score desc / Updated desc / Created desc.
- Quick-add dialog gains optional `job_title`.

### 9. Out of scope (next plan, in order)

- Phase 5 AI Insight tab (Lovable AI Gateway)
- Phase 6 prospect auto-enrichment on create
- Phase 7 bulk "Find Contacts for all Prospects"

### Files touched

- migration: columns on `companies` + `leads`, indexes, FK
- new `src/lib/hunter.functions.ts`
- edit `src/lib/leads.functions.ts` (extend `updateLead` patch with `job_title`, add `setLeadStatusManual`, expose `recomputeLeadScore` wrapper)
- edit `src/lib/leads-ui.ts` (score bucket + email status chip helpers)
- new `src/components/prospects/FindContactsDialog.tsx`
- edit `src/routes/_authenticated/app.prospects.$id.tsx` (Find Contacts button)
- edit `src/routes/_authenticated/app.leads.$id.tsx` (score, verify, manual override, job title)
- edit `src/routes/_authenticated/app.leads.tsx` (grid fields + sort + quick-add job_title)
- secrets prompt: `HUNTER_API_KEY`
