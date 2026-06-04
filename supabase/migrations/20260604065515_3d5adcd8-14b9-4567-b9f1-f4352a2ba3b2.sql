
-- Extend leads with company info, expertise, notes
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS brands TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS products_services TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Activity log (multi-entry)
CREATE TABLE IF NOT EXISTS public.lead_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('note','email','call','meeting','log')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON public.lead_activities(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_activities_user ON public.lead_activities(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_activities TO authenticated;
GRANT ALL ON public.lead_activities TO service_role;

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_activities_owner_all" ON public.lead_activities
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- Trigger to roll up last_activity_* on parent lead
CREATE OR REPLACE FUNCTION public.lead_activities_rollup()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.leads
     SET last_activity_kind = NEW.kind,
         last_activity_note = NEW.body,
         last_activity_at   = NEW.created_at,
         updated_at         = now()
   WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_activities_rollup_trg ON public.lead_activities;
CREATE TRIGGER lead_activities_rollup_trg
AFTER INSERT ON public.lead_activities
FOR EACH ROW EXECUTE FUNCTION public.lead_activities_rollup();

-- Documents
CREATE TABLE IF NOT EXISTS public.lead_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  label TEXT NOT NULL CHECK (label IN ('trade_license','vat_certificate','other')),
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_documents_lead ON public.lead_documents(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_documents_user ON public.lead_documents(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_documents TO authenticated;
GRANT ALL ON public.lead_documents TO service_role;

ALTER TABLE public.lead_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_documents_owner_all" ON public.lead_documents
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));
