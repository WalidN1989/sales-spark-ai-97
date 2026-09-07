# Multi-user / team module — architecture & rollout

Turns the single-operator app into a **one-company, multi-user** workspace with a
manager → staff hierarchy, shared lead pool + assignment, and a tasks module.
Built so it can later become full multi-tenant SaaS **without rework** (every
org-scoped row carries `org_id`).

## Decisions (locked)

1. **Tenancy** — one company now (eTOP). `org_id` added everywhere so multiple
   isolated companies can be switched on later.
2. **Leads** — one shared pool. The manager **assigns** each lead to a rep. A rep
   sees **only leads assigned to them**; the manager sees all.
3. **Tasks** — both: assign a **whole lead** to a rep, *and* a separate **Tasks**
   list of discrete to-dos (call X, send quote) linked to a lead, each with a due
   date + status.

## Roles (reuse existing `app_role` enum)

- `admin` / `manager` → **manager**: sees everything in the org, assigns work,
  manages staff. (You are already `admin`.)
- `sales_rep` → **staff**: sees only work assigned to them; cannot see other
  staff, the manager, or unassigned leads.

Visibility is enforced in **Postgres RLS**, not the UI — a rep cannot query
another rep's rows even with a crafted request.

## Visibility model

| Row | Manager | Rep |
|-----|---------|-----|
| Lead (assigned to rep A) | ✓ | only rep A |
| Lead (unassigned) | ✓ | ✗ |
| Lead activity / reminder / task | ✓ | follows the parent lead's assignment |
| Task (assigned to rep A) | ✓ | only rep A |
| Team member list | ✓ (all) | only self |
| **Reminder / follow-up** | only own | only own |

### Reminders are strictly personal

A reminder belongs to the person who set it and shows **only** on that person's
follow-up panel — the manager's reminders never appear on a rep's screen, and a
rep's reminders never appear on the manager's (no `is_admin` bleed on the
personal panel). Enforced today in `listReminders` (filters `user_id = me`).
Future *Advanced*: a reminder can be shared with others who are "part of the
conversation" — opt-in, not now.

## Rollout phases

**Phase 1 — Foundation (this migration).** `organizations` + `org_members`
tables, helper functions (`current_org_id`, `is_org_manager`), backfill your org
+ existing users, auto-join new signups to the org. Non-breaking: you keep full
visibility via the existing `is_admin` check; nothing else changes yet.

**Phase 1b — User management UI.** Settings → Team page: list staff, add a staff
member (edge function creates the auth user + a temp password to share), change
role, activate/deactivate.

**Phase 2 — Assignment + rep visibility.** Add `assigned_to` (+ `org_id`) to
leads and the child tables, rewrite their RLS to the table above, add an "Assign
to" control on the Leads table + a manager activity view.

**Phase 3 — Tasks module.** `tasks` table (title, notes, lead_id, assigned_to,
due_date, status, priority) + a Tasks board. RLS: assignee sees own, manager sees
all.

## Deploy order (each phase)

1. Run the phase migration in Supabase (via Lovable).
2. Deploy any new edge functions by name (Lovable does not auto-deploy them).
3. Verify, then proceed to the next phase.
