-- Multi-user Phase 2 — Lead assignment + rep-scoped RLS.
--
-- After this, a sales_rep sees ONLY leads assigned to them (or that they own),
-- plus those leads' activities/documents/purchases. A manager/admin still sees
-- everything in the org. Reminders stay personal (Phase 1). Prospects/companies
-- remain manager-owned and are unchanged here.

-- 1) Assignment + org columns on leads.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON public.leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_org ON public.leads(org_id);

-- Backfill org_id to the single organization; leave assigned_to NULL
-- (unassigned = manager-only until the manager assigns it).
UPDATE public.leads
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

-- 2) Can the current user see this lead? SECURITY DEFINER so child-table
--    policies can call it without tripping RLS recursion on leads.
CREATE OR REPLACE FUNCTION public.can_access_lead(_lead_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = _lead_id
      AND (
        public.is_org_manager(auth.uid())
        OR l.assigned_to = auth.uid()
        OR l.user_id = auth.uid()
      )
  )
$$;

-- 3) leads — replace the single owner-or-admin policy with assignment-aware ones.
DROP POLICY IF EXISTS leads_owner_all ON public.leads;

CREATE POLICY leads_select ON public.leads
  FOR SELECT TO authenticated
  USING (
    public.is_org_manager(auth.uid())
    OR assigned_to = auth.uid()
    OR user_id = auth.uid()
  );

CREATE POLICY leads_insert ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_manager(auth.uid()) OR user_id = auth.uid());

CREATE POLICY leads_update ON public.leads
  FOR UPDATE TO authenticated
  USING (
    public.is_org_manager(auth.uid())
    OR assigned_to = auth.uid()
    OR user_id = auth.uid()
  )
  WITH CHECK (
    public.is_org_manager(auth.uid())
    OR assigned_to = auth.uid()
    OR user_id = auth.uid()
  );

CREATE POLICY leads_delete ON public.leads
  FOR DELETE TO authenticated
  USING (public.is_org_manager(auth.uid()) OR user_id = auth.uid());

-- 4) lead_activities — visible for any lead the user can access; editable only
--    by the author (or a manager).
DROP POLICY IF EXISTS lead_activities_owner_all ON public.lead_activities;

CREATE POLICY lead_activities_select ON public.lead_activities
  FOR SELECT TO authenticated
  USING (public.can_access_lead(lead_id));

CREATE POLICY lead_activities_insert ON public.lead_activities
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_access_lead(lead_id));

CREATE POLICY lead_activities_modify ON public.lead_activities
  FOR UPDATE TO authenticated
  USING (public.can_access_lead(lead_id) AND (user_id = auth.uid() OR public.is_org_manager(auth.uid())))
  WITH CHECK (public.can_access_lead(lead_id) AND (user_id = auth.uid() OR public.is_org_manager(auth.uid())));

CREATE POLICY lead_activities_remove ON public.lead_activities
  FOR DELETE TO authenticated
  USING (public.can_access_lead(lead_id) AND (user_id = auth.uid() OR public.is_org_manager(auth.uid())));

-- 5) lead_documents + lead_purchases — follow the parent lead's access.
DROP POLICY IF EXISTS lead_documents_owner_all ON public.lead_documents;
CREATE POLICY lead_documents_access ON public.lead_documents
  FOR ALL TO authenticated
  USING (public.can_access_lead(lead_id))
  WITH CHECK (public.can_access_lead(lead_id));

DROP POLICY IF EXISTS lead_purchases_owner_all ON public.lead_purchases;
CREATE POLICY lead_purchases_access ON public.lead_purchases
  FOR ALL TO authenticated
  USING (public.can_access_lead(lead_id))
  WITH CHECK (public.can_access_lead(lead_id));
