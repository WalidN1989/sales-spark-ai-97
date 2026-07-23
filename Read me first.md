# Read Me First — Project Handoff Brief

> **Audience:** Claude Code (or any developer) starting a session on a new machine.
> Read this before touching anything. It explains where the project stands, how it
> is wired, and the working rules agreed with Walid.

_Last updated: 2026-07-17 (office PC session)._

---

## 1. What this project is

**Sales Insights** (repo `sales-spark-ai-97`) — a sales CRM for a company selling
biometric devices, access control, time attendance, signature pads (Wacom STU),
ID card printers and related software/accessories, mostly in the UAE/GCC market.

- **Stack:** TanStack Start + React 19, Tailwind 4, shadcn/Radix UI, TanStack Query,
  Supabase (Lovable Cloud) for DB/auth/storage, deployed to Cloudflare via Lovable.
- **Built with Lovable:** this repo is two-way synced with the Lovable project.
  The `.env` in the repo root is committed by Lovable on purpose (publishable keys only).
- **Modules:** Prospects, Qualifying, Leads, Inquiries, Products, Meetings, Notes,
  Learning, Sales, Visual Match, Settings (users/roles/import). Auth-gated behind
  `/login`; multi-user with roles (admin / manager / sales_rep) and owner-only RLS
  on `leads` (each user sees only their own leads).

## 2. ⚠️ Critical working rules

1. **Pushing to `main` = deploying live.** Lovable syncs GitHub `main` and publishes.
   Never push without Walid's explicit go-ahead. Workflow: build → verify locally →
   commit locally → show Walid → push only when approved.
2. **Git identity on Walid's machines:** `etopseoexpert-web` (added as collaborator
   on `WalidN1989/sales-spark-ai-97`). If a new machine lacks access, add it as a
   collaborator or sign in appropriately.
3. **Run locally with Bun:** `bun install`, `bun run dev` (port 8080),
   `bun x tsc --noEmit` to typecheck, `bun run build` for a production check.
   The dev server works out of the box because `.env` is in the repo.
4. You cannot log into the app yourself — ask Walid to log in when visual
   verification with real data is needed.

## 3. What was just built (2026-07-17): the Sales Command Center

The Leads and Prospects modules were redesigned from pretty-but-slow card grids
into high-density operational tables (ClickUp/Linear-style density, ~25–40 rows
per screen). Objective: a salesperson reviews 100 leads in minutes without
opening records.

### Commits
- `d36f7a2` — Leads redesigned into the Command Center table.
- `c2a1313` — One row per **company** (not per contact) + Prospects table + SSR fix.

### Key files
| File | Role |
|---|---|
| `src/components/leads/CommandCenter.tsx` | The whole Leads table: columns, virtualization, filters, saved views, bulk bar, keyboard nav, hover preview, inline editors. Exports `FacetFilter` (shared) and `CommandLead` type. |
| `src/lib/leads-command.ts` | Pure helpers: auto lead health, pipeline stages, derived next actions, relative dates, feature detection. |
| `src/components/prospects/ProspectsTable.tsx` | Prospects in the same table style. |
| `src/lib/leads.functions.ts` | Server functions — now `select("*")`, plus `bulkUpdateLeads`, `bulkDeleteLeads`, `generateLeadAiSummary` (Lovable AI gateway, Gemini Flash). |
| `supabase/migrations/20260717110000_sales_command_center.sql` | **The migration that unlocks editing** (see §4). |
| `src/routes/_authenticated/app.leads.tsx` | Slim route: renders `LeadsCommandCenter` + the untouched WhatsApp Quick-Add dialog. |

### Behaviour decisions (agreed with Walid)
- **One row per company.** Companies with 10–20 contacts collapse into a single row
  showing the primary contact (`is_primary`, else oldest) and a `+N` chip that opens
  the existing group/reseller page. Row aggregates: most advanced stage, highest
  priority, soonest due date, summed value, latest activity.
- **Inline edits fan out** to every contact of the company (stage, priority, due,
  next action) so contacts never drift apart. Bulk selection expands the same way.
- **Lead Health is never manual** — computed from activity recency + status + score
  (`computeHealth`): 🔥 Hot / 🟢 Active / 🟡 Warm / 🔴 Cold.
- **Next Action is never empty** — manual value or an auto-suggestion derived from
  stage/health (shown italic).
- **Dashboard cards (Hot Leads / Pipeline Value / Hot Ratio) were removed** on
  purpose — analytics belong in Analytics, the Leads page is for execution.
- Old card components were deleted; group/reseller/lead-detail routes are untouched.

### Lead page redesign — the "Sales Notebook" (2026-07-17, later session)

The lead detail + company pages were rebuilt around one philosophy: the page is
a **sales notebook**, not a dashboard. It answers three questions only — Who is
this? · What happened? · What next? — and pushes everything else out of the way.

Key files:
| File | Role |
|---|---|
| `src/components/leads/LeadWorkspace.tsx` | Shared notebook: identity header, **Activity Journal** (merged, day-grouped feed with type-filter chips), **Add Activity** dialog (Type → Note → Outcome → Next follow-up), searchable Contacts drawer, Next Follow-up box, derived follow-up recommendation, collapsible Company Information. |
| `src/routes/_authenticated/app.leads.group.$companyId.tsx` | Company workspace (multi-contact). Merged journal across all contacts. Replaced the old carousel/compare view. |
| `src/routes/_authenticated/app.leads.$id.tsx` | Single-contact workspace. Edit form / Documents / Inquiries / AI Respond moved into collapsible `Section`s. |
| `src/lib/leads-command.ts` | Added `ACTIVITY_KIND_META`, `OUTCOME_META`, `dayLabel`, `followUpRecommendation`. |
| `src/lib/leads.functions.ts` | `listCompanyActivities` (merged feed); `addLeadActivity` now takes `outcome` + optional follow-up and schedules it on the lead atomically. |
| `supabase/migrations/20260717150000_activity_journal.sql` | Adds activity kinds (whatsapp/quotation/visit) + `outcome` column. |

**Prospect detail** (`app.prospects.$id.tsx`) was rebuilt on the same
`LeadWorkspace`: identity + merged Activity Journal + contacts + follow-up, with
AI Research / Pitch Email / Respond / Market Insight / Lookalikes moved into
collapsible `Section`s and the company profile in `companyInfo`. Contact-less
prospects are supported via `resolveAnchor` (lazily creates a primary lead on the
first logged activity). Company notes merge into the journal (notes rail removed).

**Workspace refinements (later 2026-07-17):** company notes dedupe title/body so
they render once; **Company Information is always expanded** (no longer
collapsible); the Add Activity dialog is roomier (`max-w-2xl`, 6-row note, tinted
type tiles, `Ctrl+Enter` to save); pressing **A** anywhere on a Lead/Prospect
workspace opens the Add Activity dialog (guarded against inputs/open menus).

**Qualifying** (`app.qualifying.tsx`) was modernised to the command-center list
style (compact search + status filter chips replacing the big stat cards, sticky
dense table). It's a triage list of competitors, not an entity with contacts, so
it has no Activity Journal of its own — a qualified target's notebook lives on the
Lead/Prospect it converts into.

Notes on decisions:
- **Activity is the one history.** Every call/WhatsApp/meeting/email/visit/note/
  quotation is a journal entry with a type; the feed reads like a conversation.
- **Health/next-action stays computed** (from the command-center work); the
  notebook's recommendation box is honest derivation, **not** an AI call.
- The group page's contacts drawer navigates to a contact's own page; the single
  page shows just that contact's activities. Both share the same layout.
- `addLeadActivity` retries without `outcome` if the column is missing, so it
  works before the activity_journal migration is applied.

### Reminders / notifications (2026-07-17)

A header **notification bell** (top-right, desktop top bar + mobile header) with a
badge, a stacked notification **panel** (Due now / Upcoming / Done), and a
center-screen **popup** that fires when a reminder's time arrives (blurred
backdrop; Snooze 5m / Open / Done; clicking the backdrop defers it but keeps it
in the bell). Clicking a reminder navigates to its linked lead or prospect.

- `supabase/migrations/20260717170000_reminders.sql` — `reminders` table (title,
  note, remind_at, entity_type/id/label, status) + owner RLS (applied).
- `src/lib/reminders.functions.ts` — list/create/setStatus/snooze/delete.
- `src/components/reminders/NotificationCenter.tsx` — bell + panel + popup +
  30s poller (mounted in `app.tsx` shell).
- `src/components/reminders/SetReminderDialog.tsx` — set a reminder for a date +
  time; opened from the workspace Next Follow-up box ("Set a reminder"), passed a
  `reminderEntity` ({type,id,label}) by each route.
- Firing is **client-side** (a poller compares `remind_at` to now); there's no
  server cron / web-push. An OS Notification is shown too if the user granted
  permission, but the in-app popup is the primary surface.

## 4. ✅ DB migrations — all applied (confirmed 2026-07-23)

All four migrations have been run in Lovable Cloud, so every feature is fully live:

1. `20260717110000_sales_command_center.sql` — `pipeline_stage`, `next_action`,
   `next_action_due`, `priority`, `ai_summary`, `assigned_to` on `leads`.
2. `20260717150000_activity_journal.sql` — activity kinds
   (whatsapp/quotation/visit) + the `outcome` column.
3. `20260717170000_reminders.sql` — the `reminders` table + owner RLS.
4. `20260723120000_followup_outcomes.sql` — `no_response` / `ignoring` outcomes.

**If you add a migration:** push it, then paste its SQL into the Lovable chat (or
Cloud → SQL editor) and run it. Lovable regenerates
`src/integrations/supabase/types.ts` and commits to `main` afterwards, so always
`git pull --rebase` before your next change.

The UI still feature-detects (`hasCommandColumns`, and `listReminders` /
`listCompanyActivities` degrade to empty) so a missing column never hard-fails —
keep that pattern for new columns.

## 5. Open item #2: known limitations / natural next steps

Not commitments — just where the design points next:

- **Assigned To** exists in the DB migration but is hidden in the UI: RLS is
  owner-only (`leads_owner_all`), so cross-user assignment needs an RLS/policy
  rethink first (manager/admin visibility).
- **Lead health signals** currently use last activity + status + score. The spec's
  richer signals (email opens, WhatsApp replies, quotation views) need event
  tracking that doesn't exist yet.
- **AI summaries** are on-demand per row (✨ button). Could be batched/scheduled.
- **Saved views** live in `localStorage` (per browser). Could move to DB if Walid
  wants them shared across devices.
- The old **Qualifying** module wasn't touched; Walid may want the same table
  treatment there next.

## 6. How to verify changes locally (quick recipe)

```
bun install
bun x tsc --noEmit        # typecheck
bun run build             # production build must pass
bun run dev               # http://localhost:8080 — ask Walid to log in
```

Keyboard map on the tables: ↑↓ navigate · Enter open · Space select ·
Shift+Click range · Ctrl+K search · Ctrl+L add lead · Ctrl+I add company.

## 7. Context files worth reading

- `strategy-notes.md` — Walid's product vision ("Lead Engine": capture → enrich →
  lookalikes → expand; demand signals; product reverse-index). The thinking layer.
- `.lovable/plan.md` — Lovable's own running plan notes.
- `supabase/migrations/` — full schema history (28 migrations).
