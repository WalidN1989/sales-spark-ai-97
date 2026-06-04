
## Goals

Enhance the Leads module so a WhatsApp-only lead can grow into a fully-profiled contact over time, fix the currency + activity log bugs, and add expertise keywords + supporting docs that will later feed an AI matching engine.

## 1. Lead detail — schema + UI

Add columns to `public.leads`:
- `company_name text` (manual entry, optional)
- `website text` (manual or auto-derived from email domain)
- `brands text[]` (e.g. "HP", "Logitech")
- `products_services text[]` (e.g. "Laptop accessories", "Toner")
- `notes text` (free-form expertise / context summary)

New table `public.lead_documents`:
- `id, lead_id, user_id, label text ('trade_license'|'vat_certificate'|'other'), file_name, storage_path, mime_type, size_bytes, created_at`
- RLS scoped to `user_id`; GRANTs for `authenticated` + `service_role`.

New storage bucket `lead-documents` (private). RLS on `storage.objects` so a user can read/write only under `{user_id}/...`.

New table `public.lead_activities` (proper multi-entry log):
- `id, lead_id, user_id, kind ('note'|'email'|'call'|'meeting'|'log'), body text, created_at`
- RLS by `user_id`; GRANTs added.
- Keep existing `last_activity_*` columns on `leads` and update them via trigger after each insert so the grid card "last activity" still works.

## 2. Lead detail page (`app.leads.$id.tsx`)

Layout becomes a 2-column stack on lg, single column on md:

```
┌─ Header card ──────────────────────────────────────┐
│ Avatar | Name + (company_name @ website-favicon)   │
│ Status pills      [WhatsApp] [Email] [Open site]   │
└────────────────────────────────────────────────────┘
┌─ Lead info ───────────┐ ┌─ Activity log ──────────┐
│ Contact / Email / WA  │ │ + New entry (kind+body) │
│ Company name (manual) │ │ Timeline (all entries,  │
│ Website (manual/auto) │ │  newest first, badges)  │
│ Pipeline value (AED)  │ └─────────────────────────┘
└───────────────────────┘
┌─ Expertise ───────────┐ ┌─ Documents ─────────────┐
│ Brands (tag input)    │ │ Upload (Trade License,  │
│ Products/Services tag │ │  VAT Cert, Other)       │
│ Notes (textarea)      │ │ List + download + del   │
└───────────────────────┘ └─────────────────────────┘
```

Details:
- **Currency**: replace "USD" label with "AED"; format via `Intl.NumberFormat('en-AE', { style:'currency', currency:'AED', maximumFractionDigits:0 })`. Update `fmtMoneyCents` in `leads-ui.ts` (and any reused call site) — grid cards reflect AED automatically.
- **Website logo**: if `website` set → render Google favicon `https://www.google.com/s2/favicons?domain=<host>&sz=64` as a clickable chip → opens site in new tab. If empty but `contact_email` has a non-free domain (not gmail/yahoo/outlook/hotmail/icloud/proton), auto-suggest the domain on save.
- **Activity log fix**: replace the single `last_activity_note` view with a scrollable timeline reading from `lead_activities` (TanStack Query `listLeadActivities`). Composer at top, list below, each entry with kind badge + timestamp + body.
- **Documents**: drag/drop or click upload to `lead-documents/{user_id}/{lead_id}/{uuid}-{filename}`. Select label (Trade License / VAT Certificate / Other) before upload. Show filename, label badge, size, signed URL download, delete. Cap 10 MB/file, accept pdf/jpg/png/webp.
- **Brands & products**: tag-input components (chip add/remove). Persist as arrays.

## 3. Quick-add dialog (already exists in `app.leads.tsx`)

- Add **Company Name (optional)** and **Website (optional)** fields between Contact Name and WhatsApp.
- Keep AI extraction tool; extend tool schema with `company_name` and `website` so Gemini fills them from screenshot when visible (still optional).
- Persist via updated `createQuickLead` server fn.

## 4. Server functions (`src/lib/leads.functions.ts`)

- Extend `updateLead` patch schema with `company_name`, `website`, `brands`, `products_services`, `notes`.
- New `listLeadActivities({ leadId })`, `addLeadActivity({ leadId, kind, body })`, `deleteLeadActivity({ id })`.
- New `listLeadDocuments({ leadId })`, `createLeadDocumentSignedUploadUrl({ leadId, fileName, label, mimeType, sizeBytes })` → returns signed upload URL + row insert id, `getLeadDocumentDownloadUrl({ id })`, `deleteLeadDocument({ id })`.
- Extend AI extract tool schema and `createQuickLead` validator with `company_name` and `website`.

## 5. Out of scope (will be follow-ups)

- The Claude/Deepgram voice agent and OCR supplier-match flow — schema lands now (brands, products_services, notes, docs) so it has the data, UI for it ships later.
- Migrating existing `pipeline_value_cents` from USD to AED values — treated as relabel only (numbers untouched per user clarification needed if they want conversion). Assumption: relabel only.

## Files touched

- migration: add columns to `leads`, new tables `lead_activities` + `lead_documents` (with GRANTs + RLS + trigger), bucket `lead-documents` + storage RLS
- `src/lib/leads.functions.ts` — new + extended server fns
- `src/lib/leads-ui.ts` — `fmtMoneyAed`, favicon helper, free-email-domain list
- `src/routes/_authenticated/app.leads.tsx` — quick-add dialog fields + AED labels on cards
- `src/routes/_authenticated/app.leads.$id.tsx` — new sections (company/website, expertise, activity timeline, documents)
- new small components: `TagInput`, `DocumentUploader`, `ActivityTimeline` under `src/components/leads/`
