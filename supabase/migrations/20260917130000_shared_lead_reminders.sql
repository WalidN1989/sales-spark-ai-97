-- Shared reminders: a reminder attached to a LEAD becomes visible to everyone
-- who can access that lead (its assignee, its owner, and managers) — not just
-- the person who created it. Personal ('general') and prospect reminders stay
-- private to their owner (the existing reminders_owner_all policy). Write stays
-- owner-only; this adds SELECT visibility only. Multiple permissive policies OR
-- together, so this widens read without touching the owner policy.
DO $$ BEGIN
  CREATE POLICY reminders_shared_lead_select ON public.reminders
    FOR SELECT TO authenticated
    USING (
      entity_type = 'lead'
      AND entity_id IS NOT NULL
      AND public.can_access_lead(entity_id)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
