## Goal
Turn the current Space-triggered command palette into an "infome.co.mz"-style landscape mega-menu: the search bar snaps to the top of the header, and results fan out underneath in horizontal columns per module, with a small recent-search history on the left.

## What changes

### 1. New MegaSearch component (replaces `CommandPalette` UI)
- Trigger unchanged: SPACE anywhere (except inputs), the mobile top search button, and Ctrl/Cmd+K.
- Overlay layout:
  - Full-width panel anchored to the top of the viewport (docks over the app header). Dim/blur rest of the page (same backdrop pattern the current `CommandDialog` uses).
  - Row 1: large search input, centered, with a close (×) button. Placeholder: "Search anything — companies, leads, products, notes, activity…"
  - Row 2 (results area) — two regions:
    - Left rail (~200px, hidden on mobile): **Recent searches** (last 8 keywords, click to re-run, small × to remove one, "Clear all"). Persisted in `localStorage` under `search:history`.
    - Right area: **horizontal landscape grid of module columns** — Prospects, Leads, Products, Notes, Activity/Meetings. Each column has a header (icon + label + count) and a vertical list of up to ~8 matches with a subtle "View all N" link at the bottom that navigates to the module's list page pre-filtered by the keyword.
  - Empty state (no keyword): show Recent searches on the left + "Quick actions" (Add company / Add lead / Open Notes) filling the right area as cards, matching the mega-menu vibe.

### 2. Fuzzy search across more than names
- Add `fuse.js` (tiny, no native deps) for client-side fuzzy matching.
- Data sources loaded once on open (reuse existing server fns, no new backend):
  - `listCompanies` → keys: name, domain, industry, contact_person, product_service, notes/summary fields already returned.
  - `listLeads` → keys: contact_person, contact_email, company_name, companies.name, products_services, brands, plus any `notes`/`comments` field on the lead row.
  - `listProducts` → keys: name, brand, part_number, category, description.
  - `listNotes({})` (new call; already supports empty filters) → keys: title, body_text, tags. Each note result links to its owning entity (`entity_type` + `entity_id` → route to prospect/lead/sale/meeting).
  - Meetings via `listMeetings` (if present) → title, location, notes.
- Fuse config: `threshold: 0.35`, `ignoreLocation: true`, `minMatchCharLength: 2`, weighted keys (name/title higher than body). This gives real fuzzy behavior (partial words, typos, mid-string matches) instead of the current prefix-only `value` matching.
- Debounced (120ms) as the user types; results re-grouped by module for the landscape layout.

### 3. Notes & activity coverage
- Notes column shows title + 1-line body snippet with the matched keyword highlighted; clicking opens the parent entity (prospect/lead/etc.) so the mirrored company-notes rail is already in context.
- Activity column shows matches from meetings + note timestamps ("comments/activity metric"), so a keyword from a call log or note body surfaces here too.

### 4. Recent search history
- Store `{ query, ts }` list in `localStorage`, capped at 20, dedup on insert, most-recent first.
- Show top 8 as chips/list items in the left rail; also show as suggestions in the empty state.
- "Clear all" and per-item remove.

### 5. Positioning + keyboard
- On SPACE the panel mounts with the input already focused and docked to the top (`top-0`, full width, max-w-6xl centered). Results render below in the landscape grid.
- Arrow keys move within a column; Left/Right jump between columns; Enter opens the highlighted item; Esc closes.
- Mobile: single column stack (module sections stacked vertically) since landscape doesn't fit; history collapses into a "Recent" chip row above results.

### 6. Files touched
- `src/components/CommandPalette.tsx` — rewrite as `MegaSearch` (keep the export name so `_authenticated.tsx` doesn't change), or add new component and swap the import. Keep existing shortcut wiring (`shortcut:open-search`, Ctrl+I, Ctrl+L).
- `src/lib/search-history.ts` (new) — tiny localStorage helper.
- `package.json` — add `fuse.js`.
- No server/DB changes. No changes to notes sync logic.

## Technical notes
- Reuses existing server functions; adds one call to `listNotes({})` on open. All queries `enabled: open` and cached by react-query, so reopening is instant.
- Fuse indexes are memoized per dataset via `useMemo`.
- Landscape grid: `grid grid-cols-2 lg:grid-cols-5 gap-4` inside the results panel; each column is a `Card` with a scrollable inner list (`max-h-[60vh] overflow-y-auto`).
- Highlighting uses Fuse's `matches` output to wrap matched substrings in `<mark>` styled with `bg-primary/20`.

## Out of scope
- No server-side full-text search index (Postgres FTS) — client-side fuzzy over the already-fetched lists is sufficient at current data volumes and keeps latency near zero. Can be revisited if datasets grow past ~5k rows per module.
