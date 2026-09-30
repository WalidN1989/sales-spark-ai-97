CREATE TABLE public.whatsapp_agent_settings (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  approved_numbers text[] NOT NULL DEFAULT '{}',
  agent_name text NOT NULL DEFAULT 'eTOP Office Assistant',
  personality text NOT NULL DEFAULT 'Professional, calm, concise and commercially aware.',
  response_rules text NOT NULL DEFAULT 'Answer only from CRM facts. Be direct. State clearly when information is unavailable. Include dates, assignees, status and priority when relevant.',
  knowledge text NOT NULL DEFAULT 'You assist eTOP management with prospects, leads, meetings, quotations, priorities, assignments and follow-ups.',
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_agent_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_agent_settings TO authenticated;
GRANT ALL ON public.whatsapp_agent_settings TO service_role;

CREATE POLICY whatsapp_agent_settings_manager_select ON public.whatsapp_agent_settings
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND public.is_org_manager(auth.uid()));

CREATE POLICY whatsapp_agent_settings_manager_insert ON public.whatsapp_agent_settings
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND public.is_org_manager(auth.uid()));

CREATE POLICY whatsapp_agent_settings_manager_update ON public.whatsapp_agent_settings
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.is_org_manager(auth.uid()))
  WITH CHECK (org_id = public.current_org_id() AND public.is_org_manager(auth.uid()));

INSERT INTO public.whatsapp_agent_settings (org_id, approved_numbers)
SELECT id, ARRAY['971501335775']
FROM public.organizations
ORDER BY created_at
LIMIT 1
ON CONFLICT (org_id) DO UPDATE
SET approved_numbers = (
  SELECT ARRAY(SELECT DISTINCT value FROM unnest(
    public.whatsapp_agent_settings.approved_numbers || EXCLUDED.approved_numbers
  ) AS value)
), updated_at = now();