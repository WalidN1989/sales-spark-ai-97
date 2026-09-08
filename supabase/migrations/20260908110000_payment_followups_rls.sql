-- SECURITY FIX: payment_followups (and its activities) were created with a
-- permissive policy — FOR ALL TO authenticated USING (true) — which exposed
-- every payment row to ANY signed-in user, including sales reps. Payment
-- follow-ups are finance data, so restrict them to managers/admins.
--
-- Depends on is_org_manager() from the Phase 1 multiuser migration — apply
-- pending migrations in order.

DROP POLICY IF EXISTS payment_followups_auth_all ON public.payment_followups;
DROP POLICY IF EXISTS payment_followup_activities_auth_all ON public.payment_followup_activities;

CREATE POLICY payment_followups_manager_all ON public.payment_followups
  FOR ALL TO authenticated
  USING (public.is_org_manager(auth.uid()))
  WITH CHECK (public.is_org_manager(auth.uid()));

CREATE POLICY payment_followup_activities_manager_all ON public.payment_followup_activities
  FOR ALL TO authenticated
  USING (public.is_org_manager(auth.uid()))
  WITH CHECK (public.is_org_manager(auth.uid()));
