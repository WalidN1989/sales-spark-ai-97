# Plan: Company-scoped Notes on Leads group + Note UX upgrades

## 1. Notes rail on Leads group page (company-level)

File: `src/routes/_authenticated/app.leads.group.$companyId.tsx`

- Wrap the existing content in a 2-col grid on `lg`: main content + sticky right rail `340px`.
- Render `<EntityNotesRail entityType="prospect" entityId={companyId} title="Notes" />`.
- Using `entity_type="prospect"` + the company id keeps notes in sync with the Prospect detail page and the per-lead detail page (which already falls back to the company id when present). Result: all three surfaces (Prospects detail, Leads detail, Leads group/company card) read/write the same set of notes per company.

## 2. EntityNotesRail UX upgrades

File: `src/components/notes/EntityNotesRail.tsx`

### a. Auto-growing composer
- Replace fixed `min-h-[80px]` textarea with an auto-resize textarea: on input, set `el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'`.
- Cap growth at `60vh` then enable internal scroll, so the composer expands as the user types without inner scrollbars in normal use.

### b. Full text display with "more…" toggle
- Remove the `line-clamp-6` always-on truncation.
- Track per-note expanded state. Default: show full text up to ~12 lines via a measured collapsed container (`max-h-[14rem] overflow-hidden` with fade mask).
- If the note's rendered height exceeds the collapsed cap, show a tiny `more…` / `less` text button at the bottom-right of the card.

### c. Image attachments (paste + upload)
- Add a small `Paperclip` button next to Save in the composer and on each existing note card.
- Composer Ctrl/Cmd+V paste handler: if `clipboardData.items` contains an image, upload it.
- Upload flow (mirrors existing `NoteDetailView`):
  1. If composing a brand-new note, first `upsertNote` to get an id, then upload.
  2. `supabase.storage.from('note-attachments').upload(path, file)` where path = `${userId}/${noteId}/${timestamp}-${name}`.
  3. `recordNoteAttachment` server fn to register the row.
  4. Invalidate `["note-attachments", noteId]`.
- Per-note attachments query: `useQuery(["note-attachments", note.id], listNoteAttachments)` — only fetched when the user clicks the attachment chip on a card (lazy) to avoid N requests.

### d. Attachment "tiny footprint" indicator
- Each note shows a small badge `📎 N` when it has attachments (fetch attachment counts via a lightweight query or include in the note row; for simplicity, lazy-fetch on first hover/expand).
- Clicking the badge expands an inline strip of thumbnails inside the card; clicking a thumbnail opens the existing `NoteAttachmentLightbox`.

## 3. Out of scope
- No schema changes — `note_attachments` table and `note-attachments` bucket already exist.
- No changes to notes server functions; all needed endpoints (`upsertNote`, `listNoteAttachments`, `recordNoteAttachment`) already exist.
- Prospect/Lead detail pages keep working unchanged — they consume the same upgraded `EntityNotesRail`.

## Technical notes
- Attachment count: to avoid extra round-trips, do a single `useQuery` per visible note only when expanded; on the composer "Attach", we lazy-create the note row first when `editingId`/new draft, so the attachment can be linked.
- Auto-resize uses an uncontrolled `ref` callback + `onInput`; reset height to `auto` before measuring `scrollHeight` so it can shrink.
- Paste handler only intercepts when `clipboardData.items[i].kind === 'file'` and `type.startsWith('image/')`; otherwise default text paste continues.
