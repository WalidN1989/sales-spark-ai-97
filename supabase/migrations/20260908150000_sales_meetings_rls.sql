-- Align Sales and Meetings with the rest: a user sees their own rows, a manager
-- sees all. (Previously owner-or-admin; is_org_manager also covers the manager
-- role.) Sales rows are all owned by the importer, so in practice this means
-- managers see the company dataset and reps see none — which is why both are
-- manager-only modules in the sidebar. Depends on is_org_manager (Phase 1).

DROP POLICY IF EXISTS sales_owner_all ON public.sales;
CREATE POLICY sales_owner_all ON public.sales
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_org_manager(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_org_manager(auth.uid()));

DROP POLICY IF EXISTS meetings_owner_all ON public.meetings;
CREATE POLICY meetings_owner_all ON public.meetings
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_org_manager(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_org_manager(auth.uid()));
