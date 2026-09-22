-- Reception foundation: one durable customer conversation shared by voice,
-- WhatsApp and email. Provider webhooks can attach messages later without
-- changing the CRM workflow or UI.

CREATE TABLE IF NOT EXISTS public.reception_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT public.current_org_id()
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'voice'
    CHECK (channel IN ('voice','whatsapp','email','manual')),
  direction text NOT NULL DEFAULT 'inbound'
    CHECK (direction IN ('inbound','outbound')),
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','active','qualified','handed_off','closed')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  inquiry_type text NOT NULL DEFAULT 'general'
    CHECK (inquiry_type IN ('product','service','general')),
  contact_name text,
  company_name text,
  phone text,
  whatsapp text,
  email text,
  follow_up_number text,
  follow_up_number_confirmed boolean NOT NULL DEFAULT false,
  product_interest text,
  service_interest text,
  summary text,
  location text,
  recording_url text,
  recording_duration_seconds int NOT NULL DEFAULT 0 CHECK (recording_duration_seconds >= 0),
  ai_status text NOT NULL DEFAULT 'not_run'
    CHECK (ai_status IN ('not_run','processing','ready','failed')),
  ai_provider text,
  ai_plan jsonb,
  ai_analyzed_at timestamptz,
  external_provider text,
  external_conversation_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  handed_off_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reception_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.reception_conversations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('voice','whatsapp','email','internal','system')),
  direction text NOT NULL CHECK (direction IN ('in','out','internal')),
  sender_role text NOT NULL CHECK (sender_role IN ('customer','agent','staff','system')),
  content text NOT NULL,
  subject text,
  delivery_status text NOT NULL DEFAULT 'recorded'
    CHECK (delivery_status IN ('draft','queued','sent','delivered','failed','recorded')),
  external_message_id text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reception_org_status
  ON public.reception_conversations(org_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_reception_assigned
  ON public.reception_conversations(assigned_to, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_reception_external
  ON public.reception_conversations(external_provider, external_conversation_id)
  WHERE external_conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reception_messages_conversation
  ON public.reception_messages(conversation_id, created_at);

DROP TRIGGER IF EXISTS reception_conversations_updated_at ON public.reception_conversations;
CREATE TRIGGER reception_conversations_updated_at
  BEFORE UPDATE ON public.reception_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.reception_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reception_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reception_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reception_messages TO authenticated;
GRANT ALL ON public.reception_conversations TO service_role;
GRANT ALL ON public.reception_messages TO service_role;

DROP POLICY IF EXISTS reception_conversations_access ON public.reception_conversations;
CREATE POLICY reception_conversations_access ON public.reception_conversations
  FOR ALL TO authenticated
  USING (
    org_id = public.current_org_id()
    AND (public.is_org_manager(auth.uid()) OR owner_id = auth.uid() OR assigned_to = auth.uid())
  )
  WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS reception_messages_access ON public.reception_messages;
CREATE POLICY reception_messages_access ON public.reception_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reception_conversations c
      WHERE c.id = conversation_id
        AND c.org_id = public.current_org_id()
        AND (public.is_org_manager(auth.uid()) OR c.owner_id = auth.uid() OR c.assigned_to = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reception_conversations c
      WHERE c.id = conversation_id
        AND c.org_id = public.current_org_id()
        AND (public.is_org_manager(auth.uid()) OR c.owner_id = auth.uid() OR c.assigned_to = auth.uid())
    )
  );

-- Keep conversation ordering accurate whenever a transcript/message arrives.
CREATE OR REPLACE FUNCTION public.touch_reception_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.reception_conversations
  SET last_message_at = NEW.created_at, updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reception_messages_touch_conversation ON public.reception_messages;
CREATE TRIGGER reception_messages_touch_conversation
  AFTER INSERT ON public.reception_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_reception_conversation();
