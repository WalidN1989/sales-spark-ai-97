## Plan: make same-company leads collapse into one Group card

### What I will fix
1. **Group by company even when `company_id` is missing**
   - Current grouping only works when multiple leads share the same `company_id`.
   - Hunter-imported leads in your screenshot appear to have the same company text but likely no shared `company_id`, so they stay as separate lead cards.
   - I’ll group using this fallback key order:
     - `company_id` when present
     - normalized company domain / website when present
     - normalized company name when present

2. **Open the grouped view correctly for fallback groups**
   - `/app/leads/group/$companyId` currently expects a real UUID company id.
   - I’ll update it to accept encoded fallback group keys like `name:blueocean-technologies-trading-dmcc` or `domain:blueocean-technologies.com`.
   - The backend query will support both real company IDs and fallback grouping keys.

3. **Group card UI on Leads list**
   - Replace duplicate individual cards with one company Group card.
   - Show:
     - company name
     - number of leads
     - avatar pills for people inside
     - aggregate pipeline value
     - top status
     - latest activity
     - new badge if any lead in the group was created within 24 hours

4. **Group detail page / carousel / split view**
   - Keep the existing group page flow, but make it work for fallback groups too:
     - breadcrumb back to Leads
     - horizontal scrolling carousel of people
     - Compare toggle for side-by-side view
     - Focus / Minimize per pane
     - Open full deep-link to individual lead detail

### Technical details
- Update `src/routes/_authenticated/app.leads.tsx` grouping logic to use a stable `groupKey` instead of only `company_id`.
- Update `src/lib/leads.functions.ts` `listLeadsByCompany` input/query so it can fetch by:
  - UUID `company_id`
  - company domain / website
  - company name fallback
- Update `src/routes/_authenticated/app.leads.group.$companyId.tsx` only as needed to handle the encoded fallback group key and keep the existing carousel/split UI.
- No database migration is required for this fix.