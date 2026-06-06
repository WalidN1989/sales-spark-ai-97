
-- Phase 1: Hunter enrichment columns on leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS seniority text,
  ADD COLUMN IF NOT EXISTS hunter_confidence integer,
  ADD COLUMN IF NOT EXISTS phone text;

-- Phase 4: Inquiries
CREATE TABLE IF NOT EXISTS public.inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  product text,
  target_value_cents bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost','cancelled')),
  won_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inquiries TO authenticated;
GRANT ALL ON public.inquiries TO service_role;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inquiries_owner_all" ON public.inquiries
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR is_admin(auth.uid()));
CREATE TRIGGER update_inquiries_updated_at
  BEFORE UPDATE ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_inquiries_user ON public.inquiries(user_id);

CREATE TABLE IF NOT EXISTS public.inquiry_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  inquiry_id uuid NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'competitor',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inquiry_id, lead_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inquiry_leads TO authenticated;
GRANT ALL ON public.inquiry_leads TO service_role;
ALTER TABLE public.inquiry_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inquiry_leads_owner_all" ON public.inquiry_leads
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_inquiry_leads_inquiry ON public.inquiry_leads(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_inquiry_leads_lead ON public.inquiry_leads(lead_id);

CREATE TABLE IF NOT EXISTS public.inquiry_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  inquiry_id uuid NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'note' CHECK (kind IN ('note','update','status','won','lost')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inquiry_activities TO authenticated;
GRANT ALL ON public.inquiry_activities TO service_role;
ALTER TABLE public.inquiry_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inquiry_activities_owner_all" ON public.inquiry_activities
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_inquiry_activities_inquiry ON public.inquiry_activities(inquiry_id);
