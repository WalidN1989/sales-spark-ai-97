## Goal

When a rep is physically at a client site, they should be able to attach the exact GPS coordinates to that company in one tap from either the Lead or the Prospect screen. Once saved, the Meetings → Nearby Scan picks them up automatically (it already filters by lat/lng + radius).

Today the geocoding/edit-on-map flow exists only inside the desktop "Edit company" dialog on the Prospect page. The Lead page has no way to update the company's location at all — so leads like *Elaj MC Ajm* never show up in the nearby scan even when the rep is standing in front of them.

## What we'll build

### 1. New shared component — `PinLocationButton`
A small button + sheet/dialog usable from any card.

- Tap → request `navigator.geolocation.getCurrentPosition` (with accuracy).
- Show a mini Google Map with a draggable pin centred on the GPS fix.
- Show the accuracy radius ("±18 m") as a footnote so the rep knows how trustworthy the fix is.
- "Save this as the company location" → calls `updateCompany({ id, patch: { lat, lng } })`.
- Optional secondary action: "Use address instead" → falls back to the existing `geocodeAddress` flow (re-uses logic from `EditCompanyDialog`).
- Toast confirms: *"Location pinned — Elaj Medical Centre LLC will now appear in Nearby Scan."*

### 2. Lead detail page (`app.leads.$id.tsx`)
- Add a **"Pin location"** action in the header row next to the company name / WhatsApp / Email buttons (and a compact icon-only variant for mobile).
- Resolves the lead's `company_id` and saves lat/lng on that company (so prospect + lead share one source of truth).
- Show a tiny status line under the company name: `📍 Location set` or `📍 No location — pin it`.

### 3. Prospect detail page (`app.prospects.$id.tsx`)
- Add the same **"Pin location"** quick-action next to the existing "Edit" button (mobile-friendly).
- Keeps the full `EditCompanyDialog` for in-office edits; this is the one-tap field version.
- Show the same status line under the address.

### 4. Meetings — small UX polish
- After a successful pin save, invalidate the meetings query so a rep who immediately switches to Meetings sees their just-pinned client appear in results.
- No change to scan logic itself — it already finds any company with lat/lng inside the radius.

## Files to touch

- **new** `src/components/location/PinLocationButton.tsx` — button + sheet, GPS + draggable map, save handler.
- `src/routes/_authenticated/app.leads.$id.tsx` — mount `PinLocationButton` in header; pass `companyId` and current `lat/lng`.
- `src/routes/_authenticated/app.prospects.$id.tsx` — mount `PinLocationButton` next to Edit.
- `src/components/prospects/EditCompanyDialog.tsx` — extract the existing `MiniMapPicker` so `PinLocationButton` can reuse it (no behaviour change to the dialog).
- No DB / server-fn changes — `updateCompany` already accepts `lat`/`lng`.

## Out of scope (confirm if you want these too)

- Auto-pinning on lead creation from the mobile "Add lead" flow.
- Showing distance-from-me on each lead card in the list views.

If both of those would help, I'll fold them into the same pass.
