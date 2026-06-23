## Leads module — 5 fixes

### 1. Prospect → Leads navigation lands on empty page
**Cause:** The Users icon on the Prospect page links to `/app/leads/group/$companyId` using the prospect's `companies.id`. The leads group page calls `listLeadsByCompany` which only matches leads where `leads.company_id` equals that UUID. When a prospect was created independently (e.g. via "Find contacts") and the original lead was added separately as a WhatsApp lead, the lead's `company_id` may be null or a different row → the page shows "No leads in this group."

**Fix:** Broaden `resolveCompanyIdByGroupKey` (already handles the reverse direction) so the leads-group page, when given a prospect UUID with zero direct `company_id` matches, also looks up the company's `domain` / normalized `name` and finds leads whose `website` or `company_name` matches. Update `listLeadsByCompany` to fall back to this domain/name match when the UUID returns 0 rows. Net effect: clicking the Leads icon from any prospect lands on all leads tied to that company by id, domain, or name.

### 2. Auvea Dental — add WON status + 1-click "Create Prospect"
- **Add `won` to `LeadStatus`** in `src/lib/leads-ui.ts` (new green style + dot) and surface it in the status pill row on `app.leads.$id.tsx` between DEAD and the existing list as **WON** (emerald). No DB change needed (`status` column is free text).
- **Tiny logo left of WhatsApp button** in the lead header: a small `Building2` icon-only button. Behaviour:
  - If a prospect already exists for this company (lookup by `prospect_id` on the lead, else by company id/domain/name), navigate to `/app/prospects/$id`.
  - Otherwise call a new `createProspectFromLead` server fn that inserts a `companies` row (name, domain, phone, mobile, email, contact_person, country from the lead), links `leads.prospect_id`, then routes to the new prospect page where the user can hit "AI research" / "Find contacts" as usual.
- Button uses a small filled icon, not full text, to match the "tiny footprint" pattern used on Prospect page.

### 3. Lead detail form overflowing at 100% zoom
On `app.leads.$id.tsx` the lead info card stacks two columns that overflow on a 1069px viewport (per screenshot, content only fits at 67%). Convert the inner grid to a responsive 4-column grid (`grid-cols-2 md:grid-cols-4`) with each field taking 2 cols on mobile / 1 col on desktop, and let the Activity log card move below at this breakpoint (see #5). Form fields will fit edge-to-edge with no horizontal scroll, no zoom needed.

### 4. Reorder Leads tabs: Direct → Resellers → All Leads, default Direct
In `app.leads.tsx`: reorder the Tabs to `direct | reseller | all`, change `defaultValue` from `all` to `direct`. Update the URL search param default accordingly so refresh keeps Direct.

### 5. Swap Activity log ↔ Expertise & Focus
On `app.leads.$id.tsx`, the right column of the top viewport currently holds Activity log (large) while Expertise & Focus sits below. Swap them:
- Top-right: **Expertise & Focus** (Brands distributed, Products & services, Notes, Save expertise) — fills the viewport gap next to Lead information.
- Below the fold: **Activity log** (Note dropdown, What happened?, Log entry, entry list).
No logic changes — only JSX order in the two-column grid.

---

### Files to touch
- `src/lib/leads.functions.ts` — broaden `listLeadsByCompany` fallback; add `createProspectFromLead`.
- `src/lib/leads-ui.ts` — add `won` status + styles.
- `src/routes/_authenticated/app.leads.tsx` — tab order + default.
- `src/routes/_authenticated/app.leads.$id.tsx` — WON pill, Create-Prospect icon button, form grid, swap widgets.

No DB migration required.

### Confirm before I build
1. WON colour: emerald/green pill (matches WhatsApp green family) — OK?
2. "Create Prospect" should copy company name, domain, phone, mobile, email, contact_person, country from the lead. Anything else (pipeline value, notes)?