-- Product ICP playbook. One row per product/service, holding its Ideal Customer
-- Profile (industries, headcount, buyer personas, use cases), the existing
-- customers who bought it, and the competitor pages promoting the same thing.
-- This is the reference data Grok will later research against (find competitor
-- businesses + leads for each ICP). Manager/owner-scoped.

CREATE TABLE IF NOT EXISTS public.icp_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  name text NOT NULL,                          -- product / service name
  category text,                               -- Software / Hardware / Solution…
  summary text,                                -- short description
  industries text[] NOT NULL DEFAULT '{}',     -- core industries / verticals
  headcount text,                              -- target headcount / system setup
  personas jsonb NOT NULL DEFAULT '[]',        -- [{ title, description }]
  use_cases jsonb NOT NULL DEFAULT '[]',       -- [{ title, description }]
  customers jsonb NOT NULL DEFAULT '[]',       -- [{ name, segment }]
  competitors jsonb NOT NULL DEFAULT '[]',     -- [{ name, url }]
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.icp_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.icp_profiles TO authenticated;
GRANT ALL ON public.icp_profiles TO service_role;

CREATE INDEX IF NOT EXISTS idx_icp_profiles_owner ON public.icp_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_icp_profiles_org ON public.icp_profiles(org_id);

-- Owner or manager (strategic reference data — managers maintain it).
DROP POLICY IF EXISTS icp_profiles_access ON public.icp_profiles;
CREATE POLICY icp_profiles_access ON public.icp_profiles
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_org_manager(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_org_manager(auth.uid()));

DROP TRIGGER IF EXISTS icp_profiles_updated_at ON public.icp_profiles;
CREATE TRIGGER icp_profiles_updated_at
  BEFORE UPDATE ON public.icp_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
