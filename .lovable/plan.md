## Meetings — Nearby Scan

Build a real-time "who's around me?" view in the Meetings module that filters your prospects + leads by distance from your current location.

### User flow

1. Open Meetings → "Nearby Scan" panel.
2. Pick origin: **Use my location** (browser GPS) or **Search address** (Google Places autocomplete).
3. Adjust radius slider (1–25 km, default 5).
4. Hit **Scan** → map centers on origin with a radius circle; matching companies appear as pins and as a distance-sorted list beside the map.
5. Click a pin or list row → side panel with name, address, distance, status (Prospect / Lead + status badge), and buttons: **Open** (prospect detail), **Directions** (opens Google Maps app in new tab), **Schedule meeting** (prefills location + company).

### Data — already in place, no schema changes

- `companies.lat` / `companies.lng` populated by AI Research geocoding (24 of 27 companies already have coords).
- Leads join to companies via `leads.company_id`, so a single query covers both groups.
- Google Maps connector: server key for geocoding the address input; `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` for the in-browser map.

### Components

- `src/routes/_authenticated/app.meetings.tsx` — replace placeholder with the scan UI (origin picker, radius slider, Scan button, map+list layout, side panel).
- `src/components/meetings/NearbyMap.tsx` — loads Maps JS API async with the browser key, draws origin marker + radius circle + result pins (`google.maps.Marker`, no `mapId`/AdvancedMarker).
- `src/components/meetings/NearbyList.tsx` — sortable list (distance asc by default), status badges using existing `LEAD_STATUS_STYLES`.
- `src/components/meetings/AddressSearch.tsx` — Places API (New) `AutocompleteSuggestion.fetchAutocompleteSuggestions` for address input.

### Server functions (`src/lib/meetings.functions.ts`)

- `listNearbyCompanies({ lat, lng, radiusKm })` — auth-protected; selects companies with non-null lat/lng for the user, computes Haversine distance in JS, filters ≤ radius, returns `{ id, name, lat, lng, address, industry, distance_km, isLead, leadStatus }` sorted by distance.
- `geocodeAddress({ address })` — proxies through Maps connector gateway to resolve a typed address to lat/lng (reuses pattern in `research.functions.ts`).

### Edge cases handled

- Companies without coordinates → counted as "skipped (no location)" badge with a "Run AI Research" hint link.
- Browser GPS denied → fall back to address search with a toast.
- Empty result → friendly "No prospects within X km — try expanding the radius."
- Custom domain referrer issue → uses the connected custom browser key, not the managed one.

### Out of scope (next iteration)

- Saving a meeting from this screen actually creating a `meetings` row (button can stub to existing flow or navigate to a meeting form). Confirm if you want full meeting creation in this pass.
- Live-tracking origin as you drive (would need watchPosition).
