-- Per-lead team chat: a message thread between the people working a lead
-- (its assignee, its owner, and managers). Visibility + posting are gated by
-- can_access_lead, the same rule used for shared reminders. Streamed over
-- Realtime so a reply appears live on the other person's screen.
CREATE TABLE IF NOT EXISTS public.lead_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.lead_messages TO authenticated;
GRANT ALL ON public.lead_messages TO service_role;

-- Read any message on a lead you can access.
DROP POLICY IF EXISTS lead_messages_select ON public.lead_messages;
CREATE POLICY lead_messages_select ON public.lead_messages
  FOR SELECT TO authenticated
  USING (public.can_access_lead(lead_id));

-- Post as yourself, only on a lead you can access.
DROP POLICY IF EXISTS lead_messages_insert ON public.lead_messages;
CREATE POLICY lead_messages_insert ON public.lead_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.can_access_lead(lead_id));

CREATE INDEX IF NOT EXISTS idx_lead_messages_lead
  ON public.lead_messages(lead_id, created_at);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
