-- Make assignment the sole visibility control for reps, so a manager can
-- REVOKE a lead from a rep simply by reassigning it (e.g. back to themselves):
-- the rep then loses the lead AND its activities / chat / reminders (data stays
-- in the DB — only hidden from them). Managers/admins still see everything.
--
-- Before: a rep saw a lead if assigned_to = them OR user_id (owner) = them, so
-- reassigning a lead the rep had created did NOT hide it. We drop the owner
-- clause for reps. First backfill assigned_to = user_id on any unassigned lead
-- so no one loses a lead they can currently see.

UPDATE public.leads
SET assigned_to = user_id
WHERE assigned_to IS NULL AND user_id IS NOT NULL;

-- can_access_lead governs activities, documents, purchases, chat, and shared
-- reminders — so dropping the owner clause here hides ALL of a revoked lead's
-- history from the rep in one place.
CREATE OR REPLACE FUNCTION public.can_access_lead(_lead_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = _lead_id
      AND (
        public.is_org_manager(auth.uid())
        OR l.assigned_to = auth.uid()
      )
  )
$$;

-- Rep visibility + edit + delete now key off assignment only. Insert still keys
-- off user_id so a rep can create (auto-assign then makes them the assignee).
DROP POLICY IF EXISTS leads_select ON public.leads;
CREATE POLICY leads_select ON public.leads
  FOR SELECT TO authenticated
  USING (public.is_org_manager(auth.uid()) OR assigned_to = auth.uid());

DROP POLICY IF EXISTS leads_update ON public.leads;
CREATE POLICY leads_update ON public.leads
  FOR UPDATE TO authenticated
  USING (public.is_org_manager(auth.uid()) OR assigned_to = auth.uid())
  WITH CHECK (public.is_org_manager(auth.uid()) OR assigned_to = auth.uid());

DROP POLICY IF EXISTS leads_delete ON public.leads;
CREATE POLICY leads_delete ON public.leads
  FOR DELETE TO authenticated
  USING (public.is_org_manager(auth.uid()) OR assigned_to = auth.uid());
