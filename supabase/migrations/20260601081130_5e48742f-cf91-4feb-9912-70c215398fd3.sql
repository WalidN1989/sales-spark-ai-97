
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.leads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  contact_person text,
  contact_email text,
  whatsapp text,
  status text NOT NULL DEFAULT 'warm' CHECK (status IN ('hot','warm','cold','frozen','dead')),
  pipeline_value_cents bigint NOT NULL DEFAULT 0,
  last_activity_kind text,
  last_activity_at timestamptz,
  last_activity_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY leads_owner_all ON public.leads
  FOR ALL TO authenticated
  USING ((user_id = auth.uid()) OR is_admin(auth.uid()))
  WITH CHECK ((user_id = auth.uid()) OR is_admin(auth.uid()));

CREATE TRIGGER update_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_leads_user ON public.leads(user_id);
CREATE INDEX idx_leads_company ON public.leads(company_id);
