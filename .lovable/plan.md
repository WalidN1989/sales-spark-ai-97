## Reseller Centralization

Group multiple salespeople from the same reseller (e.g. ID Vision) under one reseller card, while keeping direct end-user leads as today.

### 1. Data model (one migration)

Reuse `companies` as the reseller entity (no parallel table — simpler and lets existing notes/status/edit flows work automatically).

Add to `public.companies`:
- `is_reseller boolean not null default false`

Add to `public.leads`:
- `lead_type text not null default 'direct'` — check: `'direct' | 'reseller'`
- `reseller_company_id uuid references companies(id) on delete set null` — the reseller this contact works for
- `end_user_project text` — describes the end-user / project this reseller contact is working

Drop the unique index `leads_user_company_unique` (or relax it) so multiple reseller salespeople can share one `reseller_company_id`. For reseller leads, `company_id` represents the end-user company (optional / can be null); `reseller_company_id` is required. For direct leads, behavior unchanged.

Index `leads(reseller_company_id)`.

### 2. Server functions

`src/lib/leads.functions.ts`:
- Extend `patchSchema` + quick/create paths with `lead_type`, `reseller_company_id`, `end_user_project`.
- New `listResellerGroups`: returns `[{ company, contactCount, totalPipelineCents, hottestStatus, leads[] }]` aggregated by `reseller_company_id`.
- New `listDirectLeads`: leads where `lead_type='direct'`.
- Update `LEAD_SELECT` to include new columns + `reseller:companies!leads_reseller_company_id_fkey(id,name,status)`.

`src/lib/companies.functions.ts`:
- New `listResellerCompanies({ search? })` — returns companies where `is_reseller=true` for the dropdown; also include auto-create on the fly via existing create path.
- Allow toggling `is_reseller` from EditCompanyDialog.

### 3. UI — Lead form (create + edit)

In `app.leads.tsx` quick-add form and `app.leads.$id.tsx` edit:
- Checkbox **"This is a reseller lead"**.
- When checked:
  - **Primary reseller** combobox: searches existing `is_reseller=true` companies; "Create new reseller …" creates a company with `is_reseller=true` and links it.
  - **End user / project details** textarea.
  - Pipeline value field stays.
- When unchecked: form behaves as today (direct lead).

### 4. UI — Leads list with tabs

`app.leads.tsx` header tabs: **All Leads | Resellers | Direct**.

- **All Leads** (default): current mixed list — but reseller leads collapse into one reseller card per `reseller_company_id` instead of per `company_name`. Direct leads stay individual.
- **Resellers**: only reseller group cards.
- **Direct**: only `lead_type='direct'` individual cards.

Reseller group card shows:
- Reseller company name + small "Reseller" pill
- Contact count ("3 contacts")
- Total combined pipeline value (sum)
- Status badge = hottest among contained leads (hot > warm > cold > frozen > dead)
- Click → `/app/leads/reseller/$resellerId`

### 5. New route: reseller detail

`src/routes/_authenticated/app.leads.reseller.$resellerId.tsx` (mirrors existing group page):
- Header: reseller name, company status pill, edit company button, cross-nav icon to Prospect page.
- Left/main: each contact as a sub-card showing contact name, job title, end-user/project, pipeline value, individual status, WhatsApp/email actions, link to full lead detail.
- Right rail: `EntityNotesRail` bound to the reseller `companyId` → shared notes auto-sync (same mechanism already used for prospects/leads-group).
- Each sub-card retains its own `lead_activities` timeline (existing per-lead activity log).

### 6. Existing group page

`app.leads.group.$companyId.tsx` continues to group direct leads by end-user company (unchanged behavior). Reseller leads route through the new reseller detail page instead.

### 7. Notes sharing

Notes already key on `entity_type='company' + entity_id`. Pointing `EntityNotesRail` at the reseller company id automatically gives shared notes across all contacts of that reseller. No notes-schema changes.

### Files touched

- New migration: `companies.is_reseller`; `leads.lead_type / reseller_company_id / end_user_project`; index; drop/relax unique.
- `src/lib/leads.functions.ts` — schema + new list fns.
- `src/lib/companies.functions.ts` — reseller listing/toggle.
- `src/components/prospects/EditCompanyDialog.tsx` — "Is reseller" toggle.
- `src/routes/_authenticated/app.leads.tsx` — tabs, reseller grouping, form fields.
- `src/routes/_authenticated/app.leads.$id.tsx` — reseller fields on edit.
- New `src/routes/_authenticated/app.leads.reseller.$resellerId.tsx`.

### Open questions

1. For a reseller lead, should `company_id` (end-user company) be auto-created as a lightweight company record from `end_user_project`, or kept purely as free-text on the lead? Free-text is simpler; auto-creating end-user companies enables linking them to prospects later. **Default: free-text only for v1.**
2. Should we offer a "Convert existing lead → reseller" action on current cards so you can retro-tag Khadija/Noman? **Default: yes, via the edit form checkbox.**
