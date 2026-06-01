## Goal

New **Leads** module mirroring the reference UI (priority queue with HOT/WARM/COLD/FROZEN/DEAD status pills + last activity). A prospect is promoted into a Lead via a small flame icon on the prospect card. Leads carry over contact name + email from the parent company and add a `whatsapp` field that opens `https://wa.me/...` in a new tab.

---

## 1. Data model

New migration creates `public.leads`:

- `id uuid pk`, `user_id uuid` (owner), `company_id uuid` (FK → companies, unique per user — one lead per prospect)
- `contact_person text`, `contact_email text` (copied from company at promote time, editable)
- `whatsapp text` (E.164-ish digits, no `+`, used directly in `wa.me/{whatsapp}`)
- `status text check in ('hot','warm','cold','frozen','dead')` default `'warm'`
- `last_activity_kind text` (note | email | log | meeting | call), `last_activity_at timestamptz`, `last_activity_note text`
- `pipeline_value_cents bigint default 0`
- timestamps + `update_updated_at_column` trigger

RLS: owner-only (`auth.uid() = user_id`) for select/insert/update/delete. GRANTs to `authenticated` + `service_role`.

## 2. Server functions (`src/lib/leads.functions.ts`)

- `listLeads()` → leads joined with company name/domain/country.
- `promoteToLead({ companyId })` → inserts a lead seeded with company's `contact_person` / `contact_email`; idempotent (returns existing if present).
- `updateLead({ id, patch })` → status / whatsapp / contact fields / pipeline value.
- `deleteLead({ id })`.
- `isProspectPromoted({ companyId })` used by prospects list to color the flame.

All `.middleware([requireSupabaseAuth])`.

## 3. UI — Prospects card flame

In `app.prospects.index.tsx` each card gets a small **Flame** icon button (top-right of the card, lucide `Flame`):
- If not yet a lead → muted outline; click promotes (calls `promoteToLead`) then navigates to `/app/leads`.
- If already a lead → filled orange; click navigates to `/app/leads` (and we could pre-select via search param later).
- `e.preventDefault()` + `e.stopPropagation()` so the surrounding `<Link>` to the prospect detail still works.

Promoted state comes from a single `listLeads` query reused as a Set of `company_id`s.

## 4. UI — Leads module

New route `src/routes/_authenticated/app.leads.tsx` (`/app/leads`).

- Sidebar entry "Leads" added to the main app shell (next to Prospects). Icon: lucide `Flame`.
- Header: page title + sort dropdown (`Sort: High Priority` — orders HOT > WARM > COLD > FROZEN > DEAD, then most recent activity).
- Stat cards (compact, top of page):
  - **Hot Leads** count (flame icon)
  - **Pipeline Value** = sum of `pipeline_value_cents`
  - **Conversion Quota** placeholder (static for v1, e.g. won/total once we add a `won` flag — for now show count of HOT vs total as %).
- **Priority Queue** list — each row:
  - Avatar (initials chip from contact name).
  - Contact name + "`{role placeholder}` @ {company}".
  - Status pill group: HOT / WARM / COLD / FROZEN / DEAD — clicking a pill updates `status` inline (optimistic).
  - Right side: last activity kind badge + relative time + truncated note.
  - **WhatsApp button** (green, lucide `MessageCircle` styled or inline SVG) — `href="https://wa.me/{digits}"`, `target="_blank"`. Shown only when `whatsapp` is set; otherwise a muted "Add WhatsApp" button opens an inline edit popover.
  - Email button → `mailto:{contact_email}`.
- Row click opens a side `Sheet` (shadcn) with editable fields: contact name, email, whatsapp (with country-code helper text), pipeline value, quick note (creates a `last_activity_*` entry on save).

Empty state when no leads: "Promote a prospect from the Prospects page using the 🔥 icon."

## 5. WhatsApp deep link

Helper `waHref(whatsapp: string)` strips non-digits and returns `https://wa.me/${digits}`. User stores number like `971501234567` (country code + number, no `+`, no spaces). Input shows hint: "Include country code without +, e.g. 971501234567".

## 6. Out of scope (deferred)

- Activity log writes from the WhatsApp / email buttons (we only record activity from the manual quick-note field in v1).
- Won/Lost stages & conversion-quota math beyond the simple HOT% indicator.
- Bulk promote, drag-and-drop pipeline view, Kanban.
- Editing prospects' `contact_email` from the Leads sheet writing back to `companies`.

## Files

- New migration `supabase/migrations/{ts}_leads.sql`.
- New `src/lib/leads.functions.ts`.
- New `src/routes/_authenticated/app.leads.tsx`.
- Edit `src/routes/_authenticated/app.tsx` (sidebar nav entry).
- Edit `src/routes/_authenticated/app.prospects.index.tsx` (Flame icon + promote action).
