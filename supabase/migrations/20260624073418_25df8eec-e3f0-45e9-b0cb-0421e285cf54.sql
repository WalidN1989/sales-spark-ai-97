
-- 1) competitor_profiles
CREATE TABLE public.competitor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain_norm text NOT NULL,
  name text NOT NULL,
  website text,
  country text,
  description text,
  phone text,
  mobile text,
  email text,
  contact_person text,
  address text,
  lat double precision,
  lng double precision,
  socials jsonb NOT NULL DEFAULT '{}'::jsonb,
  research_data jsonb,
  last_enriched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain_norm)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_profiles TO authenticated;
GRANT ALL ON public.competitor_profiles TO service_role;
ALTER TABLE public.competitor_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "competitor_profiles_owner_all" ON public.competitor_profiles
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE TRIGGER update_competitor_profiles_updated_at
  BEFORE UPDATE ON public.competitor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) competitor_contacts
CREATE TABLE public.competitor_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  competitor_id uuid NOT NULL REFERENCES public.competitor_profiles(id) ON DELETE CASCADE,
  email text,
  first_name text,
  last_name text,
  position text,
  phone text,
  linkedin_url text,
  confidence integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_contacts TO authenticated;
GRANT ALL ON public.competitor_contacts TO service_role;
ALTER TABLE public.competitor_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "competitor_contacts_owner_all" ON public.competitor_contacts
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- 3) lead_purchases (what a won/hot lead bought)
CREATE TABLE public.lead_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  brand text,
  model_no text,
  model_name text,
  description text,
  url text,
  price_cents bigint,
  currency text DEFAULT 'AED',
  image_path text,
  datasheet_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_purchases TO authenticated;
GRANT ALL ON public.lead_purchases TO service_role;
ALTER TABLE public.lead_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_purchases_owner_all" ON public.lead_purchases
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE TRIGGER update_lead_purchases_updated_at
  BEFORE UPDATE ON public.lead_purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_lead_purchases_lead ON public.lead_purchases(lead_id);

-- 4) qualifying_targets
CREATE TABLE public.qualifying_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  source_lead_purchase_id uuid REFERENCES public.lead_purchases(id) ON DELETE SET NULL,
  competitor_id uuid NOT NULL REFERENCES public.competitor_profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','researching','contacted','no_response','interested','not_fit','converted')),
  notes text,
  last_activity_at timestamptz,
  last_activity_note text,
  converted_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_company_id, competitor_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qualifying_targets TO authenticated;
GRANT ALL ON public.qualifying_targets TO service_role;
ALTER TABLE public.qualifying_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qualifying_targets_owner_all" ON public.qualifying_targets
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE TRIGGER update_qualifying_targets_updated_at
  BEFORE UPDATE ON public.qualifying_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_qualifying_targets_user ON public.qualifying_targets(user_id);
CREATE INDEX idx_qualifying_targets_status ON public.qualifying_targets(user_id, status);
