## Goal
Fix Notes so a note added on a Prospect company appears in the related Leads view, and a note added from a Lead appears back on the Prospect/company notes.

## What I found
- Prospect detail notes are saved as `entity_type = "prospect"` with the company/prospect id.
- Lead detail notes are saved as `entity_type = "lead"` with the individual lead id.
- Because those are different entity keys, they do not sync even when the lead and prospect are for the same company.
- The lead group page already mostly uses company notes, which is why this can look inconsistent between single lead vs grouped lead screens.

## Plan
1. **Resolve the company id on Lead detail**
   - Use the loaded lead’s `company_id` first.
   - Fall back to `prospect_id` if that is the linked company/prospect id.
   - If neither exists, keep the existing lead-specific notes behavior so direct leads without a company still work.

2. **Show company notes on Lead detail when possible**
   - Change the Lead detail right-side notes rail to use `entity_type="prospect"` and the resolved company id.
   - Label it as `Company notes` so it is clear these are shared across the company.
   - This will make notes mirror with the Prospect detail page because both surfaces read/write the same note records.

3. **Keep group leads aligned**
   - Keep the group view using company notes, but make the fallback logic explicit and consistent with the Lead detail behavior.

4. **Preserve existing standalone lead notes**
   - For direct leads that have no linked company/prospect yet, notes will still save under the lead id so nothing breaks.
   - Once a company/prospect exists, the app will show the shared company notes.

5. **Verify the behavior**
   - Check the relevant source paths after editing.
   - If possible, inspect the live preview flow: add/read a note on a lead and confirm it appears on the matching prospect/company notes rail.