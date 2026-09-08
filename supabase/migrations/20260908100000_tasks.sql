-- Multi-user Phase 3 — Tasks (simple to-dos assigned to staff, optionally
-- linked to a lead). Depends on Phase 1 (is_org_manager) — run pending
-- migrations in order.

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  title text NOT NULL,
  notes text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  company_name text,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON public.tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_lead ON public.tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_org ON public.tasks(org_id);

-- A rep sees tasks assigned to (or created by) them; a manager sees all.
CREATE POLICY tasks_select ON public.tasks
  FOR SELECT TO authenticated
  USING (public.is_org_manager(auth.uid()) OR assigned_to = auth.uid() OR created_by = auth.uid());

-- You always record yourself as creator; a rep can only assign to themselves,
-- a manager can assign to anyone.
CREATE POLICY tasks_insert ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (public.is_org_manager(auth.uid()) OR assigned_to = auth.uid() OR assigned_to IS NULL)
  );

CREATE POLICY tasks_update ON public.tasks
  FOR UPDATE TO authenticated
  USING (public.is_org_manager(auth.uid()) OR assigned_to = auth.uid() OR created_by = auth.uid())
  WITH CHECK (public.is_org_manager(auth.uid()) OR assigned_to = auth.uid() OR created_by = auth.uid());

CREATE POLICY tasks_delete ON public.tasks
  FOR DELETE TO authenticated
  USING (public.is_org_manager(auth.uid()) OR created_by = auth.uid());

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
