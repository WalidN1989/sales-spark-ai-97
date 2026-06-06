# Leads: Hunter enrichment, grouping, and Inquiries

Four connected changes to the Leads module.

---

## 1. Persist Hunter enrichment on leads

**Problem:** Hunter returns LinkedIn URL, department, seniority, and confidence per contact, but only `job_title` is stored. The LinkedIn icon disappears after import.

**Schema (migration):** add to `public.leads`
- `linkedin_url text`
- `department text`
- `seniority text`
- `hunter_confidence integer`
- `phone text` (Hunter sometimes returns it)

**Server (`hunterImportLeads`):** insert these fields from each `HunterContact`. Also write them into the `lead_activities` log entry summary.

**UI:**
- **Lead detail header** (`app.leads.$id.tsx`): replace the placeholder "in" box with a real LinkedIn button (opens `linkedin_url` in a new tab) when present. Show department · seniority · confidence% under the job title.
- **Lead card** (`app.leads.tsx`): add a small LinkedIn icon next to the email/WhatsApp action buttons when `linkedin_url` exists.
- **Find Contacts dialog**: already shows LinkedIn — no change.

## 2. "New" badge + recency sort

- In the leads list, any lead with `created_at` within the last 24h gets a small green **NEW** ribbon on the card.
- When `sortKey === "status"` (default), bubble all "new" leads to the very top regardless of status, then fall back to existing status sort. (Score / Recent / Newest sorts unchanged.)

## 3. Group leads by company (Group → Split → Focus)

**Goal:** When multiple leads share the same `company_id` (or `company_name` as fallback), render them as a single **group card** instead of N separate cards.

**Group card (collapsed):**
- Shows company name, favicon, industry/country chips.
- A horizontal stack of up to 3 avatar pills for the people inside (overflow shows "+N").
- Aggregate badges: highest status of the group, summed pipeline value, most recent activity.

**Click group card → Group view** (`/app/leads/group/$companyId`):
- Breadcrumb: `Leads / {Company}`.
- Horizontal **carousel** of lead mini-cards (scroll-snap, arrows when >3).
- Selecting one card opens the existing single-lead detail in the right pane.
- Toggle **"Compare"** = split view with 2 leads side-by-side using `ResizablePanelGroup` (already in `src/components/ui/resizable.tsx`).
- A **Focus** button on any pane expands it to full width; closing returns to the previous split / group view.
- Solo leads (companies with only one lead) keep rendering as today.

**Routing:**
- `src/routes/_authenticated/app.leads.group.$companyId.tsx` — group shell, breadcrumb, carousel, split/focus state in URL search params (`?left=<id>&right=<id>&focus=left|right`).
- Existing `app.leads.$id.tsx` remains and is also embedded inside the group panes via a shared `LeadDetailPanel` component extracted from it (no behavior change for direct `/app/leads/$id` URLs).

## 4. Inquiries — link competing leads with a shared timeline

**Concept:** An **Inquiry** = one market request that multiple companies/leads are quoting for. Track them together; only one wins.

**Schema (migration):**
- `inquiries(id, user_id, title, description, product, target_value_cents, status: open|won|lost|cancelled, won_lead_id nullable, created_at, updated_at)`.
- `inquiry_leads(inquiry_id, lead_id, role: 'competitor', joined_at)` — many-to-many, unique on the pair.
- `inquiry_activities(id, inquiry_id, user_id, kind: note|update|status|won|lost, body, lead_id nullable, created_at)` — shared timeline; `lead_id` indicates which competitor the entry is about.
- RLS scoped to `user_id`; GRANTs for `authenticated` + `service_role`.

**UI:**
- New top-level tab **Inquiries** in the sidebar.
- `/app/inquiries` — list of inquiries with progress chips (X leads · top status · winner if any).
- `/app/inquiries/$id` — header (title, value, status), a **comparison table** of linked leads (status, score, last activity, value), shared activity log timeline, and a "Mark winner" action that sets `won_lead_id` + auto-closes the inquiry (sets other leads to `dead` with confirmation).
- **From a lead:** "Link to inquiry" button (combobox to existing inquiries or create new).
- **From the group view:** "Create inquiry from this group" shortcut that pre-links all leads in the group.

---

## Technical notes

- All new server fns live in `src/lib/inquiries.functions.ts` and `src/lib/lead-groups.functions.ts`, guarded by `requireSupabaseAuth`.
- The Hunter migration only adds nullable columns — no data migration needed.
- Grouping is computed client-side from the existing `listLeads` payload to avoid a new endpoint; key by `company_id ?? lower(company_name)`.
- Split view uses existing `ResizablePanelGroup`; focus mode is a local state flag rendering a single pane at full width.
- LinkedIn button uses the existing `Linkedin` icon from `lucide-react` (already used in `FindContactsDialog`).

Will deliver in this order so each phase is usable on its own: **1 → 2 → 3 → 4**.
