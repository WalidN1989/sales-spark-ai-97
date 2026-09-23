-- Admin-controlled module concealment for experiments and work in progress.
-- Hidden modules disappear from navigation for everyone. Admins retain direct
-- access from Settings; all other roles are denied at the application route.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS hidden_modules text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.organizations.hidden_modules IS
  'Application module keys hidden from navigation and inaccessible to non-admin users.';
