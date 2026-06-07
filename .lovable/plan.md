## Mobile + Layout Fixes

### 1. Meetings — Nearby Scan (mobile)

Issues observed in the screenshots:
- Radius slider row overflows the card on mobile (the "5" km label is clipped off-screen).
- After Scan, the side-by-side `lg:grid-cols-[1fr_360px]` map+results layout still overflows on narrow widths and the map/list ordering feels wrong on mobile.
- User wants the **Results list above the map** on mobile.

Changes in `src/routes/_authenticated/app.meetings.tsx`:
- Stack the controls vertically on mobile: GPS button full-width, address search on its own row, radius slider on its own row, Scan button full-width. Keep current horizontal layout on `sm:`/`md:` and up.
- Make the radius row a flex column on mobile so the "X km" label sits cleanly above the slider; ensure no horizontal overflow (`min-w-0`, `w-full` on slider container).
- Reorder the map + results on mobile using `flex flex-col` with `order-*` utilities: Results card first, map card second on mobile; revert to current map-left / results-right two-column grid at `lg:`.
- Reduce map height on mobile (e.g. `h-[320px] md:h-[500px]`) in `NearbyMap.tsx` to avoid pushing list way down.
- Keep desktop layout exactly as-is.

### 2. Grouped Lead view — desktop grid (no horizontal scroll)

Issue: the carousel in `src/routes/_authenticated/app.leads.group.$companyId.tsx` uses `flex gap-2 overflow-x-auto` with fixed `w-56` cards, producing the right-edge scroll bar shown in the annotated screenshot.

Changes:
- Replace the horizontal-scroll `Carousel` container with a responsive **CSS grid** on `sm:` and up (`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2`), so all lead mini-cards wrap onto multiple rows.
- Drop the fixed `w-56`/`shrink-0`/`snap-*` classes from each card; let them fill the grid cell (`w-full`).
- Keep a horizontal scroll fallback **only on mobile** (`flex overflow-x-auto sm:grid ...`) since horizontal swipe is acceptable on phones; or just use the grid everywhere — simpler and consistent.
- Remove the right-edge gradient overlay (`absolute right-0 ... bg-gradient-to-l`) since there is no longer horizontal overflow.
- Selection/compare behavior and ring styling stay identical.

### 3. Out of scope

- No changes to server functions, data, or the underlying Maps integration.
- Other modules ("breaking on some other modules") — not specific enough to act on; if you can point me to which other pages are broken on mobile, I'll fix those in a follow-up.

### Files touched

- `src/routes/_authenticated/app.meetings.tsx` — responsive stacking + reorder.
- `src/components/meetings/NearbyMap.tsx` — responsive map height.
- `src/routes/_authenticated/app.leads.group.$companyId.tsx` — replace carousel with responsive grid, remove gradient overlay.
