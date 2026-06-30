## Visual Match — standalone module (v1)

A new mobile-first module at `/app/visual-match`. Upload, paste a URL, or take a live photo → we send it to **SerpApi's Google Lens endpoint** and render a results grid mirroring the Google Lens "Visual matches" layout (your reference screenshot). Each match links out to its source (LinkedIn, Bayut, company sites, etc.) and can be saved as a Prospect or Lead in one click.

Built fully isolated from existing modules so we can prove the workflow first, then wire integration points later.

---

### How it works (in plain language)

1. You open `/app/visual-match` on your phone.
2. You either upload from gallery, paste an image URL, or tap **Take photo** to use the rear camera.
3. We upload that image to a private storage bucket and ask SerpApi to run Google Lens on it.
4. Within 2–5 seconds you see a grid of visual matches: thumbnail, source title, source domain, link.
5. Each match has 3 buttons: **Open source**, **Save as Prospect**, **Save as Lead**.
6. Every search is saved to your **History** tab with the uploaded photo + all results, so you can revisit a banking-street walk from yesterday.

### What it CAN'T do (honest)

- **No LinkedIn API**, so when a match comes from LinkedIn we can only show what the public Google Lens result returned (title like "Mohammed Walid N. — WACOM Solutions") and a link. We cannot fetch the full LinkedIn profile programmatically.
- **Candid street photos** (face only, no professional headshot online) give weaker results than reused headshots. This is a SerpApi/Google Lens limitation, not ours.
- This is **photo matching**, not face recognition. If we later want true face match (find someone whose photo is only on Instagram under a different crop), we'd add FaceCheck.ID as a second provider in v2.

---

### Setup needed from you

1. **SerpApi account & key** — sign up at serpapi.com (free tier = 100 searches/month, paid from $50/mo for 5000). After you confirm, I'll request the key via `add_secret` as `SERPAPI_KEY`.

---

### Technical section

**New secret**
- `SERPAPI_KEY` (requested via add_secret after you confirm)

**New Storage bucket**
- `visual-match-uploads` (private). RLS: user can read/write their own folder `{userId}/...`.
- SerpApi needs a publicly fetchable image URL. We mint a short-lived **signed URL** (60s) and pass it as `image_url` to the Lens endpoint — the file itself stays private.

**New tables**

```sql
create table public.visual_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_path text not null,           -- path in visual-match-uploads bucket
  label text,                          -- optional user-given label ("Bur Dubai banks 30 Jun")
  status text not null default 'pending', -- pending | done | error
  error text,
  match_count int default 0,
  created_at timestamptz default now()
);

create table public.visual_matches (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.visual_searches(id) on delete cascade,
  user_id uuid not null,
  position int not null,
  title text,
  source text,            -- e.g. "LinkedIn", "Bayut", "Property Finder"
  source_domain text,
  link text not null,
  thumbnail_url text,
  saved_lead_id uuid references public.leads(id) on delete set null,
  saved_company_id uuid references public.companies(id) on delete set null,
  created_at timestamptz default now()
);
```

Both tables get standard GRANTs (`authenticated`, `service_role`), RLS enabled, and `user_id = auth.uid()` policies — same pattern used elsewhere in the project.

**New server functions** (`src/lib/visual-match.functions.ts`)
- `createVisualSearch({ imagePath, label })` — creates a `visual_searches` row, mints signed URL, calls SerpApi Google Lens (`engine=google_lens`), parses `visual_matches[]`, inserts `visual_matches` rows, returns the full payload.
- `listVisualSearches()` — history feed, newest first.
- `getVisualSearch({ id })` — one search + its matches.
- `deleteVisualSearch({ id })` — also deletes the uploaded image.
- `saveMatchAsProspect({ matchId, name?, notes? })` — creates a `companies` row (name from match title, source URL as website), links via `saved_company_id`.
- `saveMatchAsLead({ matchId, name, ... })` — creates a `leads` row (and parent company if needed), links via `saved_lead_id`. Reuses existing `LeadPurchaseDialog`/lead-creation flow where possible.

**New route files**
- `src/routes/_authenticated/app.visual-match.tsx` — index: capture/upload form + recent searches grid.
- `src/routes/_authenticated/app.visual-match.$searchId.tsx` — search detail: original image at top, matches grid below.

**New components**
- `src/components/visual-match/ImageCapture.tsx` — three tabs: **Upload**, **Camera** (uses `<input type="file" accept="image/*" capture="environment">` — works on iOS Safari and Android Chrome with no extra libs), **URL paste**.
- `src/components/visual-match/MatchCard.tsx` — thumbnail, title, source pill, three action buttons.
- `src/components/visual-match/SaveAsDialog.tsx` — pre-fills name/website from the match, lets you confirm before creating the prospect/lead.

**Nav**
- Add "Visual Match" entry to the sidebar/nav (camera icon) under existing tools.

**SerpApi call shape**
```
GET https://serpapi.com/search.json
  ?engine=google_lens
  &url={signed_image_url}
  &api_key={SERPAPI_KEY}
  &hl=en
  &country=ae
```
Response field used: `visual_matches[]` → `{ position, title, link, source, source_icon, thumbnail }`.

**Mobile-first UI**
- Single column, large tap targets, sticky bottom action bar on the detail page, results grid is 2-col on mobile / 3–4 on desktop. No horizontal scroll.

**Integration with existing modules (v1 hook)**
- Only `saveMatchAsProspect` / `saveMatchAsLead`. After saving, we navigate to the newly created prospect/lead page so you continue in your familiar flow. No other module is modified.

### Out of scope for v1 (queued for v2)
- FaceCheck.ID provider for true face match
- Auto-extract LinkedIn name/title/company from match snippet
- Bulk capture (10 photos in a row from a walk → one history entry)
- Geo-tag each search with current GPS to plot on the Meetings map
