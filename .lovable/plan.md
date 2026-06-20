# Changes

## 1. Separate Mobile field on company card

**DB migration:** add `mobile text` column to `public.companies`.

**Prospect card (`app.prospects.$id.tsx`):**
- Show two rows under contact info: Phone (landline icon) and Mobile (mobile icon). Mobile row shows a WhatsApp action button when present; landline shows only call.
- Currently the WhatsApp button is wired to `phone` — rewire to `mobile`.

**Edit Company dialog (`EditCompanyDialog.tsx`):**
- Add a "Mobile" input next to Phone.
- On blur of either Phone or Mobile, auto-classify: if the number matches a mobile pattern (UAE: starts with `5`, `05`, or `+9715`; generic: E.164 mobile prefixes), move it to the Mobile field; otherwise keep in Phone. User can still manually override.

**Find Contacts / Hunter sync:** when a contact has a phone, run the same classifier and write into `mobile` vs `phone` on the company row.

**Leads group page:** show mobile (with WhatsApp) alongside phone on the company header strip.

## 2. Company-level funnel (single status per company)

**DB migration:** add `status text not null default 'warm'` (check: hot/warm/cold/won/lost) and `status_updated_at timestamptz` to `companies`.

**Leads group page (`app.leads.group.$companyId.tsx`):**
- Add one funnel pill in the header next to the company name: Hot / Warm / Cold / Won / Lost (click to change, same dropdown style as today's lead status).
- Remove the per-contact HOT/WARM/COLD badge from each small contact card and from the expanded detail panel. Contact cards keep name, title, score, LinkedIn, email — no status badge.
- "Copy emails" / "Compare" actions unchanged.

**Prospect card:** mirror the same status pill in the header (so it's visible from both modules).

Per-lead `leads.status` is left in place in the DB but no longer surfaced in the UI; the company status is the single source of truth shown to the user.

## 3. Cross-navigation icons (tiny, header-front)

**Prospect detail header:** add a small icon button (Users icon, `h-7 w-7 ghost`) next to Back, tooltip "Open leads", links to `/app/leads/group/$companyId`. Only shown when the company has ≥1 lead.

**Leads group header:** add a small icon button (Building2 icon, `h-7 w-7 ghost`) next to the "Leads / {Company}" breadcrumb, tooltip "Open prospect", links to `/app/prospects/$companyId`.

Both are icon-only, muted-foreground, hover:primary — no text.

## 4. Market Insight tab reorder

In `app.prospects.$id.tsx` (Market insight tab content), reorder the section blocks to:

1. Competitors table (was 3rd)
2. Suggested industries (unchanged middle)
3. Seed competitor URLs (was 1st)

Header card ("Market Insight / Re-scan / Last scan") stays at the top above section 1.

# Technical notes

- New migration adds: `companies.mobile text`, `companies.status text default 'warm'` with check constraint, `companies.status_updated_at timestamptz`. No GRANT changes needed (existing grants cover new columns).
- Mobile classifier helper goes in `src/lib/utils.ts` (`classifyPhone(raw): { phone?: string; mobile?: string }`) and is reused by EditCompanyDialog and the Hunter import path in `hunter.functions.ts`.
- Company status update uses a new `setCompanyStatus` server fn in `companies.functions.ts`.
- Notes sync work from the previous turn is untouched.
