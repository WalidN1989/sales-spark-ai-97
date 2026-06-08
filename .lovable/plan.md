# Plan

## 1. Prospect address editing + geocoding verification

**Prospect detail page (`app.prospects.$id.tsx`)**
- Add an "Edit" button in the header next to Find Contacts / Delete.
- Opens a dialog (reusing the same field set as `app.prospects.new.tsx`) with all editable fields: name, domain, country, industry, contact, email, phone, product_service, **address**, and (new) manual **lat/lng override**.
- Address row gets a "Verify on map" action that calls the existing `geocodeAddress` server fn and shows:
  - resolved formatted address
  - a small inline Google Map preview pin (reuse Maps JS loader from `NearbyMap`)
  - "Confidence" footnote = distance between geocoded point and any previously stored lat/lng (or just shows "Approximate — confirm pin") so the user can judge accuracy
  - "Use this location" button → writes lat/lng into the form
- Optional manual override: drag the pin or paste coordinates to force exact lat/lng (covers cases like AUS where the postal address geocodes to the PO Box, not the campus).

**Create flow (`app.prospects.new.tsx`)**
- Same "Verify on map" affordance below the Address textarea — pre-flight the geocode before save so prospects start with accurate coordinates.

**Server (`companies.functions.ts`)**
- Add `updateCompany` serverFn (auth-protected, zod-validated, same shape as create) that accepts `lat`/`lng` overrides and skips auto-geocode when they are provided.

## 2. Global keyboard shortcuts

New `src/hooks/use-global-shortcuts.tsx` mounted once in `_authenticated` layout. Bindings (ignored when typing in inputs/textareas/contenteditable):
- **Space** → open a global Command palette (cmdk) searching prospects + leads + inquiries by name/domain/industry/contact. Enter navigates to the record. Esc closes.
- **Ctrl/Cmd + C** → navigate to `/app/prospects/new` (Add Company).  
  ⚠️ Note: Ctrl+C is the OS copy shortcut. I will only hijack it when no text is selected and focus is not in an input; otherwise copy works normally. If you'd prefer a non-conflicting key (e.g. `Ctrl+Shift+C` or just `C`), say the word.
- **Ctrl/Cmd + L** → navigate to `/app/leads` then open Add Lead dialog (same caveat — browsers use Ctrl+L for address bar; we can intercept but it's flaky. Recommend `Ctrl+Shift+L` or `L`. Will use `Ctrl+L` as requested and add a fallback bare `L`.)

**Remove from UI**
- Prospects page: remove top search Input (search now lives in the Space palette) and remove the "Add company" button.
- Leads page: remove the "Add Lead" button.
- Add a tiny "Shortcuts" hint (kbd chips) under each page header so the keys are discoverable.

## 3. Meetings — auto-scan, drop address search

`app.meetings.tsx` / `NearbyMap.tsx`:
- Remove the address search input + Set button entirely (scope is Prospects+Leads only, as you noted).
- On mount: auto-call `navigator.geolocation.getCurrentPosition` → set origin → auto-trigger `listNearbyCompanies` with default 5 km. Show a loading state; if permission denied, show a single "Enable location" CTA.
- Keep the radius slider and a manual "Rescan" button.

## 4. Leads grouped card overflow

`app.leads.tsx` (lead group cards on the index — the "+8 more" / right-edge clipping in your screenshot):
- The contact chip row currently uses a horizontal flex that overflows on narrow widths.
- Switch to `flex-wrap` with a max of 2 rows and an "+N more" pill that opens the group page. No horizontal scroll on the card, no clipped chips.

## Out of scope
- Drag-to-position pin polish beyond basic Google Maps marker dragging.
- Changing Lovable-managed Maps key / billing.

## Files touched
- `src/routes/_authenticated/app.prospects.$id.tsx` (edit dialog + verify)
- `src/routes/_authenticated/app.prospects.new.tsx` (verify on create)
- `src/routes/_authenticated/app.prospects.index.tsx` (remove search + add button)
- `src/routes/_authenticated/app.leads.tsx` (remove add button, wrap chips)
- `src/routes/_authenticated/app.meetings.tsx` (auto-scan, remove search)
- `src/components/meetings/NearbyMap.tsx` (small reusable export for mini-map)
- `src/lib/companies.functions.ts` (updateCompany)
- `src/hooks/use-global-shortcuts.tsx` (new)
- `src/routes/_authenticated.tsx` (mount shortcuts + palette)

**One decision needed before I build:** confirm the Ctrl+C / Ctrl+L bindings (they fight browser/OS shortcuts) — or switch to `Ctrl+Shift+C` / `Ctrl+Shift+L`?
