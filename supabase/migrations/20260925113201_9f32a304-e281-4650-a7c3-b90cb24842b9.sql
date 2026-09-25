CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  from_number text,
  to_number text,
  body text,
  media_url text,
  message_sid text,
  status text,
  error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;

CREATE INDEX IF NOT EXISTS idx_wa_lead ON public.whatsapp_messages(lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wa_created ON public.whatsapp_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_sid ON public.whatsapp_messages(message_sid);

DROP POLICY IF EXISTS whatsapp_messages_access ON public.whatsapp_messages;
CREATE POLICY whatsapp_messages_access ON public.whatsapp_messages
  FOR ALL TO authenticated
  USING (public.is_org_manager(auth.uid()) OR (lead_id IS NOT NULL AND public.can_access_lead(lead_id)))
  WITH CHECK (public.is_org_manager(auth.uid()) OR (lead_id IS NOT NULL AND public.can_access_lead(lead_id)));