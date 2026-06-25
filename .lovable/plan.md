
# Leads / Prospects / Qualifying — Optimization Pass

Seven fixes, one shared helper (fuzzy company match), one new migration. Grouped by module so you can review.

---

## 1. Reseller vs end-user segregation (Leads paste flow)

**Detection:** auto — when the parsed contact's company name does NOT match the resolved end-user company (fuzzy, see §2).

**Behavior on mismatch:**
- After duplicate check, show modal: *"Reseller `<X>` already exists in Prospects — creating only the end-user `<Y>`."*
- Create the end-user lead **without** copying reseller email / phone / address / website onto it.
- End-user lead opens with empty website + contact fields; user fills the end-user website manually (editable).
- **Hunter.io + Firecrawl + Find Contacts + Update Location buttons stay disabled** until end-user `website` (or `domain`) is set. Tooltip: *"Add the end-user website first."*
- Link the reseller as `reseller_company_id` on the lead (already in schema from earlier work) so the relationship is preserved without data mixing.

Files: `src/components/leads/PasteContactDialog.tsx` (or equivalent), `src/lib/leads.functions.ts`, `src/routes/_authenticated/app.leads.$id.tsx` (button-disable logic).

---

## 2. Fuzzy company duplicate check (shared helper)

New helper `src/lib/fuzzy-match.ts`:
- Normalize: lowercase, strip punctuation, drop suffixes (LLC, Pvt, Ltd, Clinic, Center, &, and).
- Tokenize on whitespace.
- Match if any **2+ consecutive token sequence** appears in both.

Used in 3 places:
- Lead/Prospect creation → "Danet Alafaqi" style duplicates → modal **"Same Company" / "No, Create New"**. "Same Company" attaches new contact as new lead under existing `company_id`.
- Reseller detection (§1).
- Products dropdown duplicate guard (§7).

Server fns: `findSimilarCompanies({name})`, `findSimilarProducts({name, brand})` in new `src/lib/fuzzy.functions.ts`.

---

## 3. Add-contact / primary-contact bugs on Leads card (Pristine Private School)

Two bugs:

**3a. Cannot add new contact** to a company with multiple existing leads.
- Audit `app.leads.group.$companyId.tsx` and the "Add Contact" action. Likely: button only exists on single-lead view, or insert silently fails because `company_id` isn't passed. Add an explicit **"+ Add Contact"** on the group view that opens the same paste/manual dialog pre-filled with `company_id`, then inserts a new `leads` row + new `contacts` row.

**3b. Primary contact missing on leads card** when >1 contact is associated.
- After image-extract → Hunter run, the original primary contact gets overshadowed by Hunter-discovered contacts. Fix: persist `is_primary = true` on the original contact and never overwrite; sort contacts by `is_primary desc, created_at asc` in the leads card render. Also fix the Hunter merge to set `is_primary = false` on freshly discovered contacts.

Files: `src/routes/_authenticated/app.leads.group.$companyId.tsx`, `src/routes/_authenticated/app.leads.$id.tsx`, `src/lib/hunter.functions.ts`, migration adds `is_primary boolean default false` to whatever contacts table is being used (or `leads.is_primary` if contacts are stored as leads).

---

## 4. Competitor Enrich + card cleanup (NMC Royal Dental, Dr. Joy)

**Remove the Outreach card** from `app.prospects.$id.competitor.$slug.tsx`. Keep Profile / Products & Services / Brand Keyword.

**Fix Enrich:**
- Debug `enrichCompetitor` in `src/lib/qualifying.functions.ts` — likely failing silently (Firecrawl error swallowed, or response shape mismatch, or `competitor_profiles` upsert key wrong).
- After Firecrawl returns: parse `markdown` for company description → Profile card; extract product/service mentions (regex + Gemini extraction fallback) → Products & Services card; populate Brand Keyword from `<title>`/`og:site_name`.
- Show toast on success ("Enriched from `<domain>`"), surface error message on failure (not silent).
- Loading state on the Enrich button.

---

## 5. Won/Hot purchase trigger fix

Current bug: toggling status off then back to `won` does not re-open `LeadPurchaseDialog`.

Fix in `app.leads.$id.tsx`:
- Compare **previous status** vs **new status** in the `onSuccess` of the status mutation (not from a `useEffect` watching the stored status — that's what's breaking the re-trigger).
- Rule: **every transition INTO `won` or `hot`** opens the dialog, regardless of whether purchases already exist (per your answer). User can cancel.
- Also add a manual **"+ Record Purchase"** button on already-won/hot leads so backlogged ones (Auvea, etc.) can be captured without re-toggling status.

---

## 6. Qualifying module UX polish

In `app.qualifying.tsx`:

- **Target name → clickable** → navigate to `/app/prospects/$id` (use the competitor's `source_company_id` parent or, if the competitor exists as its own prospect, link there).
- **"Bought product" column → clickable** → open a side sheet showing the full `lead_purchases` row + linked Product detail (after §7 lands, links to `/app/products/$id`).
- **Cache draft emails:** new column `qualifying_targets.cached_email_subject TEXT`, `cached_email_body TEXT`, `cached_email_generated_at TIMESTAMPTZ`. `draftQualifyingEmail` returns cached if present; existing "Regenerate" button bypasses cache and overwrites.
- **"All emails" line in draft modal:** read `competitor_contacts` for the target, render a comma-joined `to:` line with a Copy button → user pastes into Outlook `To:` field.

---

## 7. Products module tight-coupling

**LeadPurchaseDialog** rework:
- Replace the free-text "Model / Brand / Description" inputs with a **Combobox**: searches existing `products` table (fuzzy via §2), shows "Create new product `<typed name>`" at the bottom of the dropdown.
- Selecting existing product → `lead_purchases.product_id` set, denormalized model/brand/description copied for historical accuracy.
- "Create new" → inserts a `products` row (full Products module row, with all standard fields), then attaches it. Duplicate guard via `findSimilarProducts` — if match, show *"Similar product exists: `<name>` — use it?"* with **Use existing / Create anyway**.

**Products module page** unchanged structurally — new rows just appear there and are editable.

**Migration:**
- Add `lead_purchases.product_id uuid references products(id)`.
- Backfill: leave existing rows with `product_id NULL` (denormalized fields stay).

---

## Technical summary

**One migration** (`add_fuzzy_and_caching.sql`):
- `qualifying_targets`: + `cached_email_subject`, `cached_email_body`, `cached_email_generated_at`.
- `lead_purchases`: + `product_id uuid references public.products(id) on delete set null`.
- Whatever holds contacts: + `is_primary boolean default false`. Backfill `is_primary = true` for the oldest contact per company.
- GRANTs preserved on all touched tables.

**New files:**
- `src/lib/fuzzy-match.ts` (pure helper)
- `src/lib/fuzzy.functions.ts` (server fns: `findSimilarCompanies`, `findSimilarProducts`)
- `src/components/products/ProductCombobox.tsx`

**Edited files:**
- `src/lib/leads.functions.ts` — reseller mismatch detection, duplicate check on create.
- `src/lib/qualifying.functions.ts` — fix `enrichCompetitor`, cache draft email, surface Firecrawl errors.
- `src/lib/hunter.functions.ts` — preserve `is_primary` on merge.
- `src/lib/lead-purchases.functions.ts` — accept `product_id`, create-if-missing.
- `src/components/leads/LeadPurchaseDialog.tsx` — Combobox.
- `src/components/leads/PasteContactDialog.tsx` — reseller modal.
- `src/routes/_authenticated/app.leads.$id.tsx` — transition-based trigger, manual record-purchase, contacts sort, button-disable until website.
- `src/routes/_authenticated/app.leads.group.$companyId.tsx` — Add Contact action.
- `src/routes/_authenticated/app.prospects.$id.competitor.$slug.tsx` — remove Outreach card, hook up Enrich.
- `src/routes/_authenticated/app.qualifying.tsx` — clickable target/product, all-emails line, cached draft.

**Out of scope (parking lot):**
- Creative/image generation.
- Trigram (pg_trgm) — using token-only matching per your answer.
- Expertise & Focus widget expansion (deferred earlier).

---

Reply **approve** to implement, or tell me what to adjust.
