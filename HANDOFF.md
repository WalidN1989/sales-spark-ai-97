# HANDOFF — Sales Insights CRM (`sales-spark-ai-97`)

Detailed handoff so another agent/dev (Codex) can take control. Read this top to
bottom before touching code. Companion docs: `MULTI_USER.md`, `COMPETITOR_ANALYSIS.md`,
`PAYMENT_FOLLOWUP.md`, `Read me first.md`, `strategy-notes.md`.

---

## 1. What this is

A B2B sales CRM for **eTOP** (UAE seller of biometric devices, access control,
time & attendance, Wacom signature pads, ID-card printers, EID readers, canteen/
meal management, visitor management). Live at **`leads.deepinsights.space`**.

Feeds from AI agents (Grok "Head of Lead Gen", "Canteen Leads", "WhatsApp Leads",
ICP research) that push prospects/leads/quotes in via edge-function webhooks.

## 2. Stack & platform

- **TanStack Start** 1.167 + **React 19** + **Vite** + **Tailwind 4** + shadcn/Radix.
- **TanStack Router** (file-based, `src/routes/…`, tree auto-generated into
  `src/routeTree.gen.ts` at build) + **TanStack Query**.
- **Server functions**: `createServerFn({method}).middleware([requireSupabaseAuth]).handler(...)`
  — run on the server (Nitro → Cloudflare build). `context.supabase` is the
  **RLS-scoped** client for the signed-in user; `context.userId` is their id.
- **Supabase**: Postgres + RLS + Auth + Edge Functions (Deno). Service-role
  client `supabaseAdmin` from `src/integrations/supabase/client.server.ts`
  (bypasses RLS — server-only, never import in client code).
- **Managed by Lovable** (project `bb73389e-…`). Repo is `WalidN1989/sales-spark-ai-97`.
- **Toolchain**: Bun is installed but NOT on PATH — use `node_modules/.bin/`:
  - Typecheck: `node_modules/.bin/tsc --noEmit`
  - Build: `node_modules/.bin/vite build` (also regenerates `routeTree.gen.ts`)
  - Lint hooks rule: `node_modules/.bin/eslint <file> --rule '{"react-hooks/rules-of-hooks":"error"}'`

## 3. Deployment model — CRITICAL NUANCES

Pushing to `main` on GitHub is NOT a full deploy. Three separate things:

1. **Frontend + server functions** → Lovable **auto-syncs** from GitHub on push. Live in ~1–2 min.
2. **SQL migrations** → **do NOT auto-run.** The user must run them in Lovable →
   Cloud → **SQL editor**, or ask the Lovable chat to run pending migrations.
   Migration files under `supabase/migrations/` are the source of truth but are
   applied manually. When shipping a schema change, ALWAYS give the user the SQL
   to run. Make migrations idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`,
   `CREATE OR REPLACE`) so re-runs are safe.
3. **Edge functions** → do NOT auto-deploy. Ask Lovable chat: *"Deploy the
   Supabase edge function `<name>`."* Verify: wrong key → 401, right key → 200;
   undeployed → **404**.

**Generated types**: `src/integrations/supabase/types.ts` is Lovable-generated.
New columns/tables are NOT in it until Lovable regenerates. Pattern used
throughout for new tables/columns: cast the client — `const sb = (ctx) => ctx.supabase as any`
or `(context.supabase as any).from("new_table")` with an
`// eslint-disable-next-line @typescript-eslint/no-explicit-any`. This keeps tsc
green until types are regenerated.

## 4. Git / commit conventions

- Work on `main` (Lovable's branch). Commit + `git pull --rebase --autostash` + push.
- End commit messages with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- PR descriptions end with:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- Windows line endings: git warns "LF will be replaced by CRLF" — harmless.

---

## 5. Multi-user / team model (see `MULTI_USER.md` for full design)

**One company now**, `org_id` on rows for future multi-tenant. Roles reuse the
existing `app_role` enum: `admin` / `manager` / `sales_rep`.

Key tables & helpers (migrations `20260907140000_multiuser_foundation.sql`,
`20260907150000_multiuser_phase2_assignment.sql`):
- `organizations`, `org_members(org_id,user_id,role,status,…)`.
- SECURITY DEFINER SQL helpers: `current_org_id()`, `is_org_manager(uid)`
  (true for admin/manager, includes `is_admin`), `shares_org(a,b)`,
  `can_access_lead(lead_id)`.
- `handle_new_user` trigger: first signup → `admin`, others → `sales_rep`;
  a second trigger `add_member_on_signup` adds new users to the single org.
- `leads.assigned_to` (uuid) + `leads.org_id`. Lead RLS: `is_org_manager OR
  assigned_to = auth.uid() OR user_id = auth.uid()`. Children
  (`lead_activities`, `lead_documents`, `lead_purchases`, `whatsapp_messages`)
  gate on `can_access_lead(lead_id)`.

**Visibility model** (per-user with manager oversight):
| Data | Rep sees | Manager/admin |
|---|---|---|
| Leads | assigned to them (or own) | all; filter by assignee |
| Reminders | **only own** (personal — `listReminders` filters `user_id = me`) | only own |
| Payments | own (`created_by`) | all; "view by user" filter |
| Notes | own (private) | read all; "view by user" filter |
| Tasks | assigned/created by them | all |
| Sales, Meetings, Prospects, Qualifying, Competitors, ICP, Forecast, Payments | — (manager-only modules) | all |

**User management** (`src/lib/users.functions.ts`, `app.settings.users.tsx`,
admin-only tab): `listUsers` reads **auth.users** (not profiles) and merges
profiles/roles/permissions so accounts always show. `createTeamMember` makes a
login (email + temp password, no OAuth). Guardrails: cannot demote/deactivate the
**last admin** or yourself; `setUserStatus` off = real Twilio-style **ban**
(auth ban), not just a flag. `setUserRole` syncs `org_members.role`.

## 6. Access control — the module registry (`src/lib/permissions.ts`)

**`APP_MODULES`** is the single source of truth. It drives (a) the sidebar
(`app.tsx` nav), (b) the per-user Module access panel in User management, and (c)
a route guard in `app.tsx` (bounces a user out of a module page they can't access;
RLS already blocks the data). Each entry: `{ key, label, path, defaultRep }`.
**Convention: new modules get `defaultRep: false`** (hidden from reps until granted).

`can(module, tab)` in `src/hooks/use-access.tsx`: explicit per-user permission
wins, else the registry default; **managers/admins bypass (see everything)**.
`getMyAccess` (`permissions.functions.ts`) returns `{ userId, roles, isAdmin,
isManager, permissions }`.

**`FEATURE_FLAGS`** = in-page sub-sections (not sidebar modules), hidden from reps
by default, toggled per-user in the "Feature access" block of User management:
`lead_documents`, `lead_inquiries`, `lead_ai`, `prospect_research`,
`prospect_pitch`, `prospect_respond`, `prospect_market`, `prospect_lookalikes`.
Gated in the pages via `can("<flag>")` (unknown keys default hidden for reps).

`MODULES` (older) drives the "Advanced: tab-level permissions" accordion for
`prospects`/`sales`/`meetings` only.

---

## 7. Module-by-module (routes + lib + tables)

Core lead/prospect model: **Prospect = a company** (`companies` table).
**Lead = a contact/deal** (`leads`, many per company, grouped by company in the
UI via `groupKeyFor`). A lead links to its company by `company_id` or
`prospect_id`. Leads have `is_converted` (see below).

- **Prospects** — `app.prospects.*`, `companies.functions.ts`. Manager-only.
  Detail has sub-sections (AI Research, Pitch Email, Respond, Market Insight,
  Lookalikes) gated by `prospect_*` feature flags. Hunter "Find Contacts"
  (`hunter.functions.ts`) pulls contacts as leads with `is_converted=false`.
  A 🔥 **Convert to Lead** button (`convertProspectToLead`) flips them to real
  leads. `promote-prospect-to-lead` also exists.
- **Leads** — `app.leads.tsx` + `CommandCenter.tsx` (dense virtualized grid,
  one row per company), `app.leads.$id.tsx` (detail), `leads.functions.ts`.
  `listLeads` returns only `is_converted = true` (research contacts stay on the
  prospect). "Assigned to" column/filter + bulk assign (managers; excludes self).
  Import: **"Import"** button (`ImportLeadsDialog` + `importMyLeads`) — CSV/Excel,
  company name is the ONLY required field; stamps `user_id + assigned_to = importer`.
  **Export is admin-only.**
  **Creator = assignee:** every lead-creation path stamps
  `assigned_to = context.userId` at insert so a new lead is owned by whoever
  made it (never lands Unassigned). Paths: `createQuickLead` + `importMyLeads`
  + `getOrCreatePrimaryLeadForCompany` (prospect→lead convert) in
  `leads.functions.ts`, and `saveMatchAsLead` in `visual-match.functions.ts`.
  If you add a new lead-insert path, set `assigned_to` too. Reassign an
  account's leads with `UPDATE leads SET assigned_to = <new> WHERE assigned_to
  = <old>`. NOTE: most owner FKs are `ON DELETE CASCADE` — deleting an
  auth user deletes their owned rows; **deactivate** (org_members.status /
  Active toggle) instead of deleting unless you first move `user_id` ownership.
- **WhatsApp** — `app.whatsapp.index.tsx`, `whatsapp.functions.ts`,
  `whatsapp-inbound` edge fn, table `whatsapp_messages`. Twilio. Two-pane chat.
  Inbound webhook matches sender to a lead by last ~9 digits, stores + logs to
  journal. Outbound via Twilio REST (`sendWhatsappMessage`). **Needs secrets
  (see §9) + webhook URL to go live** — works empty until then.
- **Forecast** — `app.forecast.tsx` (frontend only, reads `listLeads`).
  Weighted pipeline = value × per-stage win-rate; funnel; by-rep; by-product;
  top deals. **Editable stage weights** persisted in `localStorage` (`forecast:weights`).
- **Tasks** — `app.tasks.tsx`, `tasks.functions.ts`, table `tasks`. Rep-scoped
  to-dos, optional link to a lead.
- **Product ICP** — `app.icp.*`, `icp.functions.ts`, `IcpEditor.tsx`, table
  `icp_profiles`. Manager-only. Per-product Ideal Customer Profile (industries,
  headcount, personas, use cases, existing customers, competitor URLs). Seeded
  with 3 products (`20260909110000_icp_seed.sql`). **`20260911100000_icp_owner.sql`
  adds a trigger that forces every card's `user_id` to a single ICP owner** so
  the research agent (which reads one account) sees all cards. Read API:
  `list-icp-profiles` edge fn.
- **Payment Follow-up** — `app.payments.*`, `payments.functions.ts`, tables
  `payment_followups` + `payment_followup_activities` (see `PAYMENT_FOLLOWUP.md`).
  **Per-user** (owner = `created_by`); manager sees all + "view by user" filter.
  Detail shows **"Sales agent"** (resolved from `created_by`). **Assign** button
  (`assignPaymentFollowup`) reassigns (sets `created_by` + logs a note).
- **Competitor Analysis** — `app.competitors.*`, `competitors.functions.ts`
  (see `COMPETITOR_ANALYSIS.md`). Manager-only. 7 `competitor_*` tables.
- **Notes** — `app.notes.tsx`, `notes.functions.ts`, `notes`/`note_attachments`.
  Per-user private; managers can read all + filter by user.
- **Sales** — `app.sales.tsx`, `sales.functions.ts`. Manager-only; shared
  imported dataset with rep attribution in columns (`rep_walid`, `rep_javid`).
- **Meetings** — `app.meetings.tsx`. Manager-only; actually a **nearby-company
  scanner** (Google Maps), not a meeting list.
- **Qualifying / Inquiries / Products / Learning / Visual Match** — see their
  route + `*.functions.ts` files.
- **Settings** — `app.settings.*` (My company, Import data, User management).
  Manager-only module.

**Activity Journal**: reads `lead_activities` (keyed by `lead_id`). Rule agreed
with the owner: only **real touches** are journaled (manual entries, follow-ups,
quotes, inbound WhatsApp) — **API bookkeeping is NOT** (Hunter import + email
verify were removed from the journal).

## 8. Edge functions / agent APIs (`supabase/functions/`)

Two auth styles, all `verify_jwt = false` (see `supabase/config.toml`):
- **`x-api-key`** header. `create-prospect`, `log-quote-activity`,
  `list-icp-profiles` use **`PROSPECT_WEBHOOK_KEY`** + owner `PROSPECT_WEBHOOK_USER_ID`.
  Competitor fns use `COMPETITOR_RESEARCH_API_KEY`; payment fns use
  `PAYMENT_FOLLOWUP_API_KEY`. A shared **`AGENT_API_KEY`** is now also accepted
  by several (added by the external agent work — grep for `AGENT_API_KEY`).
- **`whatsapp-inbound`** uses a URL `?token=WHATSAPP_INBOUND_TOKEN`.

Notable: `create-prospect` (fuzzy company-name dedupe via normalize + Levenshtein
in `namesMatch`; phone-splitting into WhatsApp+Phone; blank-lead back-fill).
A broader **agent-facing REST layer** exists (`agent-describe`, `list-prospects`,
`get-prospect`, `update-prospect`, `log-prospect-activity`,
`prospect-activity-summary`, `promote-prospect-to-lead`, `list-leads`, `get-lead`,
`update-lead`, `get-competitor-research`, `list-competitor-catalog`, plus
`_shared/`) — added OUTSIDE this Claude session (Lovable/Grok work, migration
`20260914100000_agent_modules.sql`). **Read those files directly for specifics** —
they are not documented here.

## 9. Secrets (Lovable Cloud → Secrets)

Referenced by code: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`PROSPECT_WEBHOOK_KEY`, `PROSPECT_WEBHOOK_USER_ID`, `AGENT_API_KEY`,
`COMPETITOR_RESEARCH_API_KEY`, `PAYMENT_FOLLOWUP_API_KEY`, `HUNTER_API_KEY`,
`FIRECRAWL_API_KEY`, `SERPAPI_KEY`, `GOOGLE_MAPS_API_KEY`, `ANTHROPIC_API_KEY`,
`LOVABLE_API_KEY`, and — for WhatsApp, add when Twilio is live —
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`,
`WHATSAPP_INBOUND_TOKEN`.

## 10. Standard workflow for a change

1. Edit code. 2. `node_modules/.bin/tsc --noEmit` (0 errors).
3. `node_modules/.bin/vite build` (also regenerates the route tree if you added a
   route — build BEFORE tsc when adding routes). 4. Commit + rebase + push.
5. If a migration: give the user the idempotent SQL to run. 6. If an edge
   function: tell the user to have Lovable deploy it by name. 7. If a new secret:
   list it for the user to add.

## 11. Gotchas learned (do not repeat)

- **Rules of Hooks**: never call `useX` after an early `return`. This caused
  React error #310 (blank page) on the prospect detail — fixed by moving hooks
  above the guards. Lint with the rules-of-hooks rule when editing big components.
- **Frontend can ship ahead of a migration** → runtime "column/relation does not
  exist". Read paths degrade gracefully (catch `relation does not exist` → `[]`),
  but writes error. Always remind the user to run the migration.
- **Admin role is the single point of failure**: only an `admin` sees Settings →
  User management and manager-only modules. If it's missing, restore via SQL:
  `insert into public.user_roles (user_id, role) select id,'admin'::public.app_role
  from auth.users where email='…' on conflict do nothing;`
- **profiles can be empty** for accounts created oddly → `listUsers` now reads
  auth.users to be robust.
- **PostgREST schema cache**: after DDL, if a column "isn't found", run
  `NOTIFY pgrst, 'reload schema';`.
- Auth is **email/password only** — Google OAuth and self-signup were removed
  (`/signup` route deleted; onboarding is admin-invite only).

## 12. Outstanding / next

- **WhatsApp**: run `20260914100000_whatsapp_messages.sql`, deploy `whatsapp-inbound`,
  add the 4 Twilio secrets, point Twilio's inbound webhook to
  `…/functions/v1/whatsapp-inbound?token=<WHATSAPP_INBOUND_TOKEN>`. Optional:
  a Grok-callable (x-api-key) WhatsApp **send** endpoint for automated follow-ups.
- **ICP research loop**: `list-icp-profiles` deployed → Grok polls, refines ICPs,
  finds lookalikes, pushes to Prospects via `create-prospect`. Stage 2 = a write
  endpoint for Grok to enrich cards back.
- Confirm all pending migrations are applied in the live DB (several were added
  across sessions; the newest are `…_icp_owner`, `…_agent_modules`,
  `…_whatsapp_messages`).
