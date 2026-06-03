
## Goal

Make Leads feel like Prospects: a card grid for the list, a full-page detail view when you click a lead (no more cramped right-side panel), and a collapsible sidebar so the work area can breathe.

## 1. Leads list → grid (app.leads.tsx)

Keep the header (title + Add Lead) and the 3 stat cards (Hot Leads / Pipeline Value / Hot Ratio) as they are now.

Replace the "Priority Queue" stacked list with a responsive card grid (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3`, gap-4), mirroring the Prospects grid styling.

Each lead card shows:
- Top row: contact initials avatar + name + status pill (HOT/WARM/COLD/FROZEN/DEAD) in top-right, colored like today
- Company line (`@ Company` or "WhatsApp lead")
- Email (muted) and WhatsApp number (muted) if present
- Pipeline value (if > 0)
- Last activity snippet (italic, truncated) + "Xd ago"
- Footer row: WhatsApp button (green, opens wa.me link, stopPropagation) and Email button (stopPropagation)
- Whole card is clickable → navigates to `/app/leads/$id`

Remove the right-side Sheet entirely from the list page.

## 2. Full-page Lead detail (new route)

New file: `src/routes/_authenticated/app.leads.$id.tsx`, styled like `app.prospects.$id.tsx`.

Layout:
- Back link + Delete button at top
- Header card: avatar, contact name, company name link (if linked to a prospect, link back to `/app/prospects/$id`), status pill row (clickable to change status), WhatsApp + Email buttons, pipeline value
- Editable fields section (contact name, email, WhatsApp, pipeline value) — same fields that were in the Sheet, now laid out as a proper form with breathing room
- Activity log section: dropdown (Note/Email/Call/Meeting) + textarea + "Log entry" button, then a list of past entries (reuses last_activity_* for now; full history could come later)

Server functions: `listLeads` already returns enough. Add a `getLead(id)` server fn that returns single lead with company join. Reuse existing `updateLead` and `deleteLead`.

## 3. Collapsible sidebar (app.tsx)

Add a collapse/expand control to the desktop sidebar:
- Toggle button (Chevron icon) in the sidebar header, persists state in `localStorage` (`sidebar:collapsed`)
- Collapsed width: `w-16` (icon-only), expanded: `w-64`
- When collapsed: hide labels, hide brand text (keep icon), center nav icons, tooltip on hover via `title` attr
- Smooth `transition-[width]`
- Mobile (Sheet) behavior unchanged

## Technical notes

- Routes: add `src/routes/_authenticated/app.leads.$id.tsx` — `routeTree.gen.ts` regenerates automatically.
- Navigation from list card: `<Link to="/app/leads/$id" params={{ id: lead.id }}>` wrapper; inner action buttons use `e.stopPropagation()` + `e.preventDefault()`.
- Status pills + WhatsApp link helper extracted into a small shared module `src/lib/leads-ui.ts` (statusStyles map, waHref function) so list and detail both use them.
- No DB migration needed. No changes to extraction/quick-add flow.

## Out of scope

- Full multi-entry activity history table (still single last_activity_* fields). Can be a follow-up if you want a real timeline like Prospects.
