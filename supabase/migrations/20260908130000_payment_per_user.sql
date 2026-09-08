-- Payment follow-ups are PER-USER: each user sees only their own, and a manager
-- sees everyone's (and can filter by user in the UI). Supersedes the
-- manager-only policy from 20260908110000. Keyed on the existing created_by.

-- Give existing rows (seed / webhook, created_by NULL) a definite owner: the
-- admin. They stay visible to the manager either way.
UPDATE public.payment_followups
SET created_by = (SELECT user_id FROM public.user_roles WHERE role = 'admin' ORDER BY created_at LIMIT 1)
WHERE created_by IS NULL;

DROP POLICY IF EXISTS payment_followups_manager_all ON public.payment_followups;
DROP POLICY IF EXISTS payment_followups_auth_all ON public.payment_followups;

CREATE POLICY payment_followups_select ON public.payment_followups
  FOR SELECT TO authenticated
  USING (public.is_org_manager(auth.uid()) OR created_by = auth.uid());

CREATE POLICY payment_followups_insert ON public.payment_followups
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR public.is_org_manager(auth.uid()));

CREATE POLICY payment_followups_update ON public.payment_followups
  FOR UPDATE TO authenticated
  USING (public.is_org_manager(auth.uid()) OR created_by = auth.uid())
  WITH CHECK (public.is_org_manager(auth.uid()) OR created_by = auth.uid());

CREATE POLICY payment_followups_delete ON public.payment_followups
  FOR DELETE TO authenticated
  USING (public.is_org_manager(auth.uid()) OR created_by = auth.uid());

-- Activities follow the parent item's access.
CREATE OR REPLACE FUNCTION public.can_access_payment(_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.payment_followups p
    WHERE p.id = _id AND (public.is_org_manager(auth.uid()) OR p.created_by = auth.uid())
  )
$$;

DROP POLICY IF EXISTS payment_followup_activities_manager_all ON public.payment_followup_activities;
DROP POLICY IF EXISTS payment_followup_activities_auth_all ON public.payment_followup_activities;

CREATE POLICY payment_followup_activities_access ON public.payment_followup_activities
  FOR ALL TO authenticated
  USING (public.can_access_payment(followup_id))
  WITH CHECK (public.can_access_payment(followup_id));
