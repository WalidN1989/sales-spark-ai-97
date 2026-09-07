-- Multi-user Phase 1 — Organizations + membership foundation.
--
-- Non-breaking: existing tables and their RLS are untouched. You keep full
-- visibility through the existing is_admin() check; new signups auto-join your
-- one organization as sales_rep. Assignment + rep-scoped RLS come in Phase 2.

-- 1) Organizations (one row now; the app is org-scoped for future multi-tenant).
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 2) Membership: which users belong to an org, with their role + status.
CREATE TABLE IF NOT EXISTS public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'sales_rep',
  status public.user_status NOT NULL DEFAULT 'active',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.org_members(org_id);

-- 3) Helper functions (SECURITY DEFINER so they bypass RLS and can't recurse
--    into the policies that call them).
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.org_members
  WHERE user_id = auth.uid() AND status = 'active'
  ORDER BY created_at LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_org_manager(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = _uid AND status = 'active' AND role IN ('admin','manager')
  ) OR public.is_admin(_uid)
$$;

-- Is _target visible to _viewer? True if the viewer manages the org, or it's
-- the viewer's own membership. Used by Phase 2 child-row policies too.
CREATE OR REPLACE FUNCTION public.shares_org(_viewer uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members a
    JOIN public.org_members b ON a.org_id = b.org_id
    WHERE a.user_id = _viewer AND b.user_id = _target AND a.status = 'active'
  )
$$;

-- 4) RLS: organizations — members can read their org; owner/manager can update.
DROP POLICY IF EXISTS organizations_member_select ON public.organizations;
CREATE POLICY organizations_member_select ON public.organizations
  FOR SELECT TO authenticated
  USING (id = public.current_org_id() OR owner_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS organizations_manager_update ON public.organizations;
CREATE POLICY organizations_manager_update ON public.organizations
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (owner_id = auth.uid() OR public.is_admin(auth.uid()));

-- 5) RLS: org_members — a rep sees only their own row; a manager sees everyone
--    in the org and can add/change/remove members.
DROP POLICY IF EXISTS org_members_select ON public.org_members;
CREATE POLICY org_members_select ON public.org_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_manager(auth.uid()));

DROP POLICY IF EXISTS org_members_manager_write ON public.org_members;
CREATE POLICY org_members_manager_write ON public.org_members
  FOR ALL TO authenticated
  USING (public.is_org_manager(auth.uid()))
  WITH CHECK (public.is_org_manager(auth.uid()));

-- 6) Backfill: one organization owned by the existing admin, with every current
--    user as a member (mapping their existing user_roles role).
DO $$
DECLARE
  admin_id uuid;
  new_org uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.organizations) THEN
    RETURN; -- already seeded
  END IF;

  SELECT user_id INTO admin_id FROM public.user_roles WHERE role = 'admin'
  ORDER BY created_at LIMIT 1;
  IF admin_id IS NULL THEN
    SELECT id INTO admin_id FROM auth.users ORDER BY created_at LIMIT 1;
  END IF;
  IF admin_id IS NULL THEN
    RETURN; -- no users yet; handle_new_user will seed on first signup
  END IF;

  INSERT INTO public.organizations (name, owner_id)
  VALUES ('eTOP', admin_id)
  RETURNING id INTO new_org;

  INSERT INTO public.org_members (org_id, user_id, role, status, invited_by)
  SELECT
    new_org,
    p.id,
    COALESCE(
      (SELECT r.role FROM public.user_roles r
       WHERE r.user_id = p.id
       ORDER BY (r.role = 'admin') DESC, (r.role = 'manager') DESC LIMIT 1),
      'sales_rep'
    ),
    'active',
    admin_id
  FROM public.profiles p
  ON CONFLICT (org_id, user_id) DO NOTHING;
END $$;

-- 7) New signups auto-join the (single) organization as sales_rep, in addition
--    to the existing profile + user_roles seeding in handle_new_user.
CREATE OR REPLACE FUNCTION public.add_member_on_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  the_org uuid;
  the_role public.app_role;
BEGIN
  SELECT id INTO the_org FROM public.organizations ORDER BY created_at LIMIT 1;

  -- No org yet → this is the very first user; create the org and make them owner.
  IF the_org IS NULL THEN
    INSERT INTO public.organizations (name, owner_id)
    VALUES ('eTOP', NEW.id)
    RETURNING id INTO the_org;
    the_role := 'admin';
  ELSE
    the_role := COALESCE(
      (SELECT r.role FROM public.user_roles r WHERE r.user_id = NEW.id
       ORDER BY (r.role = 'admin') DESC LIMIT 1),
      'sales_rep'
    );
  END IF;

  INSERT INTO public.org_members (org_id, user_id, role, status)
  VALUES (the_org, NEW.id, the_role, 'active')
  ON CONFLICT (org_id, user_id) DO NOTHING;

  RETURN NEW;
END $$;

-- Runs after the existing on_auth_user_created (handle_new_user) has inserted
-- the profile + role. A separate trigger keeps that function untouched.
DROP TRIGGER IF EXISTS on_auth_user_created_add_member ON auth.users;
CREATE TRIGGER on_auth_user_created_add_member
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.add_member_on_signup();
