# Sales Insights — Phase 1 (Foundation)

A B2B sales intelligence app. This first build delivers the spine the rest of the spec depends on: auth, roles, granular permissions, and the Company entity (the hub every other module links to).

## Scope of this build

In scope:
1. Lovable Cloud (Supabase) backend with RLS-isolated per-user data
2. Email/password + Google sign-in
3. Roles: `admin`, `manager`, `sales_rep` (stored in a separate `user_roles` table — never on profiles)
4. Granular permissions: per-user, per-module, per-tab toggles
5. App shell: sidebar nav, role-aware menu, mobile-responsive
6. **Prospects module — manual flow only**
   - List view (search, filter)
   - Add Company: form + "Paste from clipboard" → Lovable AI (Gemini) extracts fields (company, domain, contact, email, phone, industry, country) → user reviews and saves
   - Company Profile page with tabs: Overview · Contacts · Sales (placeholder) · Activity Log · Pitch Email (placeholder)
   - Activity log: manual notes/calls/visits
7. **Settings module**
   - My Company profile (name, industry, products/services, strengths, target niche) — used later as Claude/Gemini system context
   - User Management: invite/list users, assign role, toggle module + tab permissions per user
8. Empty shells for Sales and Meetings modules (gated by permissions) so navigation is consistent

Deferred to follow-up turns:
- Firecrawl crawl + Google Maps geocoding
- Perplexity deep research + Hunter.io contact discovery
- AI pitch email generation + Copy
- Sales CSV upload, transactions table, graph
- Meetings scheduled list + Nearby Scan (Google Maps)
- Export to PDF/Excel, team analytics, notifications

## Permission model

Two storage layers, both server-enforced:
- `user_roles` table: `(user_id, role)` — drives default capabilities and admin-only UI
- `user_permissions` table: `(user_id, module, tab, enabled)` — per-user overrides for module + tab visibility

A `has_permission(user_id, module, tab)` SECURITY DEFINER function combines role defaults + overrides. Used in RLS policies, server functions, and a `usePermission()` client hook to hide/show UI. Admin always returns true.

## Data model (Phase 1 tables)

- `profiles` (id, full_name, email, status, created_at)
- `user_roles` (id, user_id, role enum)
- `user_permissions` (id, user_id, module, tab, enabled)
- `my_company` (id, user_id unique, company_name, industry, products_services, strengths, target_niche)
- `companies` (id, user_id, name, domain, country, industry, contact_person, email, phone, address, lat, lng, research_data jsonb, last_research_at, created_at)
- `activity_log` (id, company_id, user_id, type, content, logged_at)
- Stubs (empty, RLS on): `sales`, `meetings`

All tables: RLS enabled, owner-only policies via `auth.uid() = user_id`. Admin bypass via `has_role(auth.uid(), 'admin')`.

## Technical notes

- Stack: TanStack Start + Lovable Cloud (Supabase) + Tailwind + shadcn/ui
- `_authenticated` layout route protects all app routes; `/login` and `/signup` are public
- Clipboard parsing: `createServerFn` calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with tool-calling to return a typed object. No client-side AI calls, no API keys requested from you.
- Mobile-first layout from day one (Meetings module needs it later)
- Design: clean, neutral SaaS look — will confirm palette/typography once you see it and we can refine

## File layout (high level)

```text
src/routes/
  __root.tsx                    # providers + auth state listener
  index.tsx                     # marketing/landing or redirect to /app
  login.tsx, signup.tsx
  _authenticated.tsx            # auth guard
  _authenticated/
    app.tsx                     # app shell (sidebar + outlet)
    app.prospects.tsx           # list
    app.prospects.new.tsx       # add company (form + paste)
    app.prospects.$id.tsx       # profile (tabs)
    app.sales.tsx               # placeholder, perm-gated
    app.meetings.tsx            # placeholder, perm-gated
    app.settings.tsx            # layout
    app.settings.my-company.tsx
    app.settings.users.tsx      # admin only
src/lib/
  permissions.functions.ts      # has_permission helpers
  companies.functions.ts        # CRUD + clipboard extract
  users.functions.ts            # admin user mgmt
```

## After this build

You'll be able to: sign in, create users, assign roles + permissions, set up your own company profile, add prospects manually or via clipboard paste with AI-extracted fields, view/edit their profile, and log activity. The next turn we'll wire Firecrawl + Google Maps for address auto-fill and geocoding, then layer in Perplexity + Hunter.io + the Claude/Gemini pitch email.