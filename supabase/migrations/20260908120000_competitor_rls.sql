-- SECURITY FIX: the competitor_* tables were also created with
-- FOR ALL TO authenticated USING (true), exposing them to every signed-in user.
-- Competitor Analysis is a manager module, so restrict all of it to
-- managers/admins. Depends on is_org_manager() (Phase 1 migration).

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'competitor_companies', 'competitor_products', 'competitor_research',
    'competitor_feature_rows', 'competitor_strengths', 'competitor_weaknesses', 'competitor_gaps'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_auth_all', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_manager_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.is_org_manager(auth.uid())) WITH CHECK (public.is_org_manager(auth.uid()))',
      t || '_manager_all', t);
  END LOOP;
END $$;
