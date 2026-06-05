# CRM Phase 5 — Respond, Learning & Products

Three new capabilities, all manual (no automation, no sending, no schedulers). All data is per-user (RLS scoped to `auth.uid()`), backed by Lovable Cloud, and uses Lovable AI Gateway for generation + OCR.

---

## 1. Database (one migration)

New tables in `public`, each with `user_id uuid`, timestamps, RLS, and GRANTs to `authenticated` + `service_role`.

- **products** — `brand`, `name`, `part_number` (indexed, upper-cased), `category`, `cost_price_cents`, `selling_price_cents`, `margin_l1_pct`, `margin_l2_pct`, `currency` (default `AED`), `warranty`, `stock_status`, `notes`.
- **learning_entries** — `category` enum (`writing_style` | `business_rule` | `objection` | `negotiation`), `title`, `content`, `situation` (nullable, for objections), `tags text[]`, `engine` (nullable), `original_input` (nullable), `ai_response` (nullable), `final_response` (nullable), `company_id` (nullable FK to companies).
- **responses** — `company_id` FK, `engine` text, `input_text`, `input_notes`, `ocr_text`, `attachments jsonb` (image refs), `detected_part_numbers text[]`, `draft` text, `final` text, `created_at`. Used for "Save to Activity Log" history & "Save to Learning" source.

Indexes: `products(user_id, upper(part_number))`, `learning_entries(user_id, category)`, `responses(user_id, company_id)`.

RLS: all policies `auth.uid() = user_id`. No anon grants.

## 2. Server functions

New files in `src/lib/`:

- **products.functions.ts** — `listProducts`, `getProduct`, `upsertProduct`, `deleteProduct`, `matchProductsByText(text)` → extracts `[A-Z0-9]{6,}` tokens, queries products by part_number IN (...).
- **learning.functions.ts** — `listLearning({category?})`, `upsertLearning`, `deleteLearning`, `searchLearningForContext(companyId, engine, inputText)` → returns top ~8 entries (filter by category relevance + tag overlap; simple text match, no embeddings this phase).
- **respond.functions.ts**
  - `ocrImage({ storagePath })` — calls Lovable AI (`google/gemini-2.5-flash`) with the image as a data URL, returns extracted text.
  - `generateResponse({ companyId, engine, inputText, notes, ocrText })`:
    1. Load company + recent activity_log (last 10) + my_company.
    2. `matchProductsByText(inputText + ocrText)` → product context block.
    3. `searchLearningForContext(...)` → knowledge block (writing style examples, relevant rules, objection scripts).
    4. Call `google/gemini-3-flash-preview` with system prompt tuned per `engine` (10 presets) + structured tool call returning `{ subject?, body }`.
    5. Insert row into `responses` (status `draft`).
    6. Return `{ responseId, draft, matchedProducts, usedLearning }`.
  - `saveResponseToActivityLog({ responseId, finalText })` → updates `responses.final` + inserts activity_log note.
  - `saveResponseToLearning({ responseId, title, category, tags })` → inserts learning_entry with original_input/ai_response/final_response/engine.

Storage: a private bucket `respond-uploads` for screenshots (user-scoped path `{userId}/{uuid}.png`).

## 3. Frontend

### Respond tab (Prospect detail)
New file `src/components/respond/RespondTab.tsx`, wired into `app.prospects.$id.tsx` as a 6th tab "Respond".

Layout:
- **Engine** dropdown (10 options listed in spec).
- **Input text** — large textarea.
- **Screenshots** — multi-file dropzone (uses existing supabase client to upload to `respond-uploads`); each tile shows OCR status + extracted text preview. OCR runs on upload via `ocrImage`.
- **Notes** — small textarea.
- Detected part numbers chip row (live, derived from inputText + ocrText).
- **Generate Response** button → calls `generateResponse`.
- **Draft** editable textarea (prefilled), with **Copy**, **Save to Activity Log**, **Save to Learning** (opens small dialog for title/category/tags).
- Shows "Used products" and "Used knowledge" collapsibles so the user sees what context the AI received.

### Learning module
- Sidebar entry "Learning" → route `src/routes/_authenticated/app.learning.tsx` (list with category tabs + search) and `app.learning.$id.tsx` (edit).
- Form fields adapt per category (Writing Style / Business Rule / Objection / Negotiation).
- "New entry" button. Tag input reuses `src/components/leads/TagInput.tsx`.

### Products module
- Sidebar entry "Products" → `app.products.tsx` (table: brand, name, part number, category, selling price, margin L1/L2, stock) with search + filters.
- `app.products.new.tsx` and `app.products.$id.tsx` for create/edit.
- Margin shown computed from cost vs selling.

Sidebar update: extend nav in `src/routes/_authenticated/app.tsx` with the two new items (icons `GraduationCap`, `Package`). Permissions reuse the existing `useAccess` patterns; default both modules visible to all roles, add `prospects.respond` capability gate.

## 4. AI prompts (engine presets)

A single `src/lib/respond-engines.ts` exports `{ id, label, systemPrompt }[]` for the 10 engines (Initial Inquiry, General Reply, Follow Up, No Response, Negotiation, Bluffing, Payment Terms, Credit Request, Delivery Concern, Competitor Threat). Each prompt instructs: keep it concise, mirror tone, reference matched products with part numbers, apply any business rules verbatim, no fabrications.

## 5. Out of scope (per user)

- No email sending, no scheduling, no background jobs.
- No embeddings / vector search this phase (simple keyword + tag match).
- No bulk product import (single add/edit only — CSV import can come later).

## Technical notes

- Lovable AI Gateway via `LOVABLE_API_KEY`; OCR uses Gemini vision with image_url content parts.
- Part-number regex: `/\b[A-Z]{2,}[A-Z0-9]{3,}\b/g`, uppercased, de-duplicated, then matched against `products.part_number` (case-insensitive).
- All server fns use `requireSupabaseAuth`; no admin client needed.
- Storage bucket created in the same migration with RLS limiting access to `auth.uid()` folder prefix.
- No edits to auto-generated files (`client.ts`, `types.ts` regenerates after migration).
