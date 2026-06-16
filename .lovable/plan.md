
## Scope

A pass over Prospects, Leads, Notes and the lead/prospect detail screens. Each item below maps to your numbered points.

---

### A. Mobile — kill all horizontal scrolling

Symptom: Leads list & sidebar plus the Prospect/Lead detail header scroll sideways on mobile. Prospects list is fine until you open one.

- Wrap the main app shell content in `min-w-0 overflow-x-hidden` so no descendant can force the viewport wider.
- `app.leads.tsx`:
  - Hot/Pipeline/Hot-ratio stat row: switch to single column on mobile, 3-up from `sm:` upward.
  - Group cards: chip row of avatars uses `flex-wrap` + `min-w-0` + `truncate` on names so the row no longer overflows.
  - Header sort row: stack vertically on mobile.
- `app.prospects.$id.tsx` & `app.leads.$id.tsx` headers (the "Back / Pin location / Find Contacts / Edit / Delete" row):
  - Promote to `grid grid-cols-[auto_1fr] sm:flex` with the action cluster as `flex flex-wrap gap-1 justify-end`, all buttons `shrink-0`.
  - Company name `<CardTitle>`: add `truncate` + `break-words` and reduce to `text-xl sm:text-2xl`.
- Tabs row (`Activity log / AI research / …`): wrap in a `overflow-x-auto` scroller (intentional, scoped) instead of letting it push the page.

### B. Prospects detail — "Edit" button on mobile

The Edit button already exists on desktop; ensure it stays visible on mobile (icon-only fallback) so addresses can be corrected after creation. Same for Pin location.

### C. Recency bubble — recently-interacted cards float to top

In `app.prospects.index.tsx` and `app.leads.tsx`:
- Default Prospects sort = `updated_at DESC` (newest activity / edit first). Add a small "Recent" pill on cards updated < 24 h.
- Leads: change default `sortKey` to `"updated"` so any new activity bubbles the card up. Status sort stays as an option.

### D. Notes module — side detail with sticky metrics panel

Rework `NotesWorkspace` layout:

```
┌──────────────┬────────────────────────────────┬──────────────┐
│ List rail    │ Note detail (title + body)     │ Metrics /    │
│ (search +    │                                │ chat / AI    │
│  cards)      │                                │ panel        │
└──────────────┴────────────────────────────────┴──────────────┘
```

- On `lg:` and up: 3-column flex (list 280 px / detail flex-1 / metrics 320 or 480 px).
- Metrics panel becomes a sticky right column instead of bottom; toggle button switches between **Medium (320 px)** and **Large (480 px)**; remember in `localStorage`.
- On mobile: metrics opens as a `Sheet` from the right.
- Keep the existing AI summary content; just relocate.

### E. Activity countdown badge

Add a "time since last activity" pill on every Prospect and Lead card (and on the detail header):
- Format: `2d 4h`, `3w`, `2mo`, etc. Color graduates green → amber → red as it ages.
- Resets only when a new activity is logged (driven by `last_activity_at` / `updated_at`).
- Component `<StaleBadge since={iso} />` placed top-right inside each card.

### F. Lead/Prospect detail clean-up + comments/activity sync

- Tighten the header card (one row identity, second row contact links).
- Activity composer:
  - Allow **paste (Ctrl+V) of images** directly into the textarea.
  - Drop-zone for **PDF / Excel / CSV / images** (re-uses existing `lead-documents` bucket; add a parallel `company-documents` flow for prospects — same shape).
  - Attached files render as chips above the "Log entry" button.
- **Cross-sync activity**: when a Lead is linked to a Company (prospect), both views read from the same merged feed:
  - New server fn `listMergedActivities({ companyId })` that unions `activity_log` (prospects) + `lead_activities` for any lead with that `company_id`, ordered by timestamp.
  - Posting from either side writes to its native table and tags `company_id`, so both lists pick it up.

### G. WhatsApp `@mention` hyperlink in notes

In the Note / activity textarea on the **Lead** page:
- Typing `@` opens a tiny popover listing matching WhatsApp numbers for that lead (and grouped leads under the same company).
- Pick one → inserts `@+9715xxxxxxx` token.
- On render, the activity body parses `@+digits` and renders a green WhatsApp chip linking to `https://wa.me/<digits>`.

### H. Copy-all emails (Outlook-friendly)

On the Lead group view (`app.leads.group.$companyId.tsx`) and the Find-Contacts dialog:
- Add a **"Copy all emails"** button + per-row checkboxes (default = all checked).
- Output format = `email1, email2, email3` (comma + single space, no trailing comma). Toast: "Copied N emails".

### I. Prospect → Lead promotion carries `phone` / WhatsApp

In `promoteToLead`:
- Select `phone` (and `whatsapp` if column exists on `companies`) along with the other fields.
- Insert into `leads`: `whatsapp = company.phone ?? company.whatsapp`.
- Backfill: for existing leads where `whatsapp` is null but the linked company has a phone, expose a one-shot "Sync from company" button on the Lead edit form. (No automatic mass update.)

### J. Remove that broken countdown sticker on Prospect cards

The yellow "This time running out 00:04:59:02" card in your screenshot is not intentional UI in our codebase — it appears to be a browser-extension overlay (Honey/coupon style) on your machine, not something the app renders. Plan ignores it; if you actually want a countdown, the **StaleBadge** in step E covers the use case.

---

## Out of scope (will not touch unless you say so)

- Re-skinning the global Sales Insights navbar.
- Changing the data model of `lead_activities` / `activity_log` (we add a merged read, not a unification).
- Realtime push (cross-sync is on refetch + on action invalidation).

## Order of execution

1. Mobile fixes (A, B) — fastest perceived improvement.
2. Promote-to-lead carry-forward (I) — small but high impact.
3. Copy-all emails (H).
4. Recency sort + StaleBadge (C, E).
5. Activity composer + cross-sync + WhatsApp @mention (F, G).
6. Notes layout rework (D).

Confirm and I'll start with step 1.
