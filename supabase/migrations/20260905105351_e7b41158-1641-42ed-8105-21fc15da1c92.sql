CREATE TABLE IF NOT EXISTS public.competitor_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  aka text[] NOT NULL DEFAULT '{}',
  website text,
  hq_country text,
  regions text[] NOT NULL DEFAULT '{}',
  positioning text,
  software_strength text CHECK (software_strength IS NULL OR software_strength IN ('low','medium','high')),
  hardware_brands text[] NOT NULL DEFAULT '{}',
  is_distributor boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_competitor_companies_name
  ON public.competitor_companies (lower(name));

CREATE TABLE IF NOT EXISTS public.competitor_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.competitor_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('visitor_management','time_attendance','meal_management','access_control','turnstile','other')),
  product_url text,
  datasheet_url text,
  deployment text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','watch','irrelevant')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_competitor_products_unique
  ON public.competitor_products (company_id, lower(name), category);

CREATE TABLE IF NOT EXISTS public.competitor_research (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  our_product_id uuid,
  our_product_name text,
  our_product_url text,
  competitor_company_id uuid REFERENCES public.competitor_companies(id) ON DELETE SET NULL,
  competitor_product_id uuid REFERENCES public.competitor_products(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('visitor_management','time_attendance','meal_management','access_control','turnstile','other')),
  summary text,
  sources jsonb NOT NULL DEFAULT '[]',
  researched_at timestamptz,
  researcher text,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  raw_html_artifact_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_competitor_research_category ON public.competitor_research (category, status, researched_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_research_company ON public.competitor_research (competitor_company_id);

CREATE TABLE IF NOT EXISTS public.competitor_feature_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_id uuid NOT NULL REFERENCES public.competitor_research(id) ON DELETE CASCADE,
  capability text NOT NULL,
  our_assessment text,
  their_assessment text,
  leader text CHECK (leader IS NULL OR leader IN ('us','them','even','unknown')),
  sort_order int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_competitor_feature_rows_research ON public.competitor_feature_rows (research_id, sort_order);

CREATE TABLE IF NOT EXISTS public.competitor_strengths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_id uuid NOT NULL REFERENCES public.competitor_research(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('us','them')),
  point text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_competitor_strengths_research ON public.competitor_strengths (research_id, sort_order);

CREATE TABLE IF NOT EXISTS public.competitor_weaknesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_id uuid NOT NULL REFERENCES public.competitor_research(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('us','them')),
  point text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_competitor_weaknesses_research ON public.competitor_weaknesses (research_id, sort_order);

CREATE TABLE IF NOT EXISTS public.competitor_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_id uuid NOT NULL REFERENCES public.competitor_research(id) ON DELETE CASCADE,
  title text NOT NULL,
  why_it_hurts text,
  recommended_action text,
  priority text NOT NULL DEFAULT 'p1' CHECK (priority IN ('p0','p1','p2')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','wont_do')),
  owner text,
  sort_order int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_competitor_gaps_research ON public.competitor_gaps (research_id, sort_order);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'competitor_companies','competitor_products','competitor_research',
    'competitor_feature_rows','competitor_strengths','competitor_weaknesses','competitor_gaps'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_auth_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t || '_auth_all', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

DO $$
DECLARE
  co_id uuid := '11111111-1111-1111-1111-111111111111';
  prod_id uuid := '22222222-2222-2222-2222-222222222222';
  res_id uuid := '33333333-3333-3333-3333-333333333333';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.competitor_research WHERE id = res_id) THEN
    INSERT INTO public.competitor_companies (id, name, aka, website, hq_country, regions, positioning, software_strength, hardware_brands, is_distributor, notes)
    VALUES (co_id, 'Endless Data', ARRAY['ZKTeco Dubai'], 'https://www.zkteco-dubai.com/', 'UAE',
      ARRAY['UAE','KSA','Africa'], 'Authorized ZKTeco distributor with strong custom software capability', 'high',
      ARRAY['ZKTeco'], true, '20+ years; HRMS/ERP integrations (Odoo, Adrenalin). Can upsell ZKBio CVSecurity.')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.competitor_products (id, company_id, name, category, product_url, deployment, status)
    VALUES (prod_id, co_id, 'GuestFlow', 'visitor_management', 'https://www.zkteco-dubai.com/guestflow.html',
      ARRAY['cloud','on_prem'], 'active')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.competitor_research (id, title, our_product_name, our_product_url, competitor_company_id, competitor_product_id, category, summary, sources, researched_at, researcher, status)
    VALUES (res_id, 'eTOP VMS vs GuestFlow (Endless Data)', 'eTOP Visitor Management',
      'https://www.etopme.ae/visitor-management-software/', co_id, prod_id, 'visitor_management',
      'eTOP wins on UAE visitor experience (Emirates ID depth, pre-reg/QR, badges, Wacom, bilingual, vertical stories). Endless/GuestFlow wins on channel power (ZKTeco), software/integration reputation, contractor/permanent-card workflows, and compliance/headcount framing. Closing gaps 2-5 is the fastest path to neutralize them in UAE RFPs without needing to own the ZKTeco brand.',
      '[{"label":"eTOP VMS page","url":"https://www.etopme.ae/visitor-management-software/","type":"website"},{"label":"GuestFlow page","url":"https://www.zkteco-dubai.com/guestflow.html","type":"website"},{"label":"GuestFlow datasheet","url":"","type":"datasheet"}]'::jsonb,
      '2026-09-05T05:40:00Z', 'Product Research agent', 'published')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.competitor_feature_rows (research_id, capability, our_assessment, their_assessment, leader, sort_order) VALUES
      (res_id, 'Emirates ID / Passport', 'Strong: chip + barcode + passport MRZ OCR; framed as UAE must-have', 'Emirates ID reader integration confirmed', 'us', 1),
      (res_id, 'Pre-registration', 'Host pre-reg + email/SMS + QR', 'Touchless / QR mentioned; invitation flow less detailed publicly', 'us', 2),
      (res_id, 'Self-service kiosk journey', 'Full 9-step journey documented', 'Web UI for multi-entry security desks', 'us', 3),
      (res_id, 'Badge printing / photo', 'Photo capture, branded / color-coded badges', 'Modern/touchless; permanent cards emphasized over print badges', 'us', 4),
      (res_id, 'Permanent / reusable visitor cards', 'Not prominently productized on site', 'Core feature for contractors / repeat guests + RFID', 'them', 5),
      (res_id, 'Blacklist / watchlist', 'Real-time blacklist / watchlist screening', 'Blacklist with reason + start/end dates', 'even', 6),
      (res_id, 'Host notifications', 'Email / SMS / mobile app', 'Auto host alert on arrival', 'even', 7),
      (res_id, 'Digital NDA / signatures', 'Wacom digital signature integration', 'Not highlighted in public materials', 'us', 8),
      (res_id, 'Access control / zones', 'ACS + zones; ZKTeco, UBio/Nitgen, CAME/Ozak', 'ZKTeco biometric / RFID / ACS; native distributor channel', 'them', 9),
      (res_id, 'Safety / OSHA / evacuation', 'Safety induction; remote evacuation list in cloud story', 'OSHA + ISO 45001 headcount / emergency tracking as headline', 'them', 10),
      (res_id, 'Bilingual (AR/EN)', 'Explicit Arabic & English UI', 'Multilingual claimed; AR/EN not as UAE-specific pitch', 'us', 11),
      (res_id, 'Deployment', 'Cloud primary; on-prem / hybrid for regulated', 'Cloud or on-prem (ASP.NET Core + SQL Server)', 'even', 12),
      (res_id, 'Software / integration muscle', 'API-ready; ERP/HR mentioned', 'Strong custom software + HRMS/ERP (Odoo, Adrenalin)', 'them', 13),
      (res_id, 'Platform upsell', 'Adjacent time attendance / turnstile portfolio', 'Can upsell ZKBio CVSecurity (full security suite)', 'them', 14);

    INSERT INTO public.competitor_strengths (research_id, side, point, sort_order) VALUES
      (res_id, 'us', 'UAE-native visitor journey: Emirates ID + passport OCR as the core sales story', 1),
      (res_id, 'us', 'Richer guest experience: pre-reg QR, kiosk flow, photo badges, Wacom NDA/safety signing', 2),
      (res_id, 'us', 'Vertical playbooks (corporate, hospitals, schools, hotels, JAFZA/KIZAD, residential)', 3),
      (res_id, 'us', 'Explicit Arabic/English bilingual UI', 4),
      (res_id, 'us', 'Multi-vendor ACS story (not only ZKTeco) - useful when buyer wants choice', 5),
      (res_id, 'them', 'Authorized ZKTeco distributor - owns the hardware brand channel buyers trust', 1),
      (res_id, 'them', 'In-house software strength + proven HRMS/ERP integration track record', 2),
      (res_id, 'them', 'Compliance/safety positioning: OSHA, ISO 45001, emergency headcounts', 3),
      (res_id, 'them', 'Permanent visitor / contractor cards + RFID - strong for industrial sites', 4),
      (res_id, 'them', 'Broader geography (MENA + Africa) and ZKBio CVSecurity bundling', 5);

    INSERT INTO public.competitor_weaknesses (research_id, side, point, sort_order) VALUES
      (res_id, 'us', 'Permanent/reusable visitor credentials under-sold vs GuestFlow', 1),
      (res_id, 'us', 'OSHA / ISO / emergency-headcount narrative weaker than competitor datasheet', 2),
      (res_id, 'us', 'Less public technical architecture detail for IT evaluators', 3),
      (res_id, 'us', 'Regional story more UAE-centric; less Africa/KSA footprint messaging', 4),
      (res_id, 'them', 'Visitor journey marketing thinner (less badge/photo/NDA polish)', 1),
      (res_id, 'them', 'Public license cue ("3 users per license") can scare enterprise buyers', 2),
      (res_id, 'them', 'Arabic/English UAE UX not as explicitly productized', 3),
      (res_id, 'them', 'GuestFlow alone is narrower than CVSecurity; may force upsell conversation', 4);

    INSERT INTO public.competitor_gaps (research_id, title, why_it_hurts, recommended_action, priority, status, sort_order) VALUES
      (res_id, 'ZKTeco channel asymmetry', 'Endless is the authorized distributor; hardware-led deals default to them, GuestFlow rides along', 'Position eTOP as hardware-agnostic + best UAE ID/UX layer; publish reference architectures with ZKTeco and alternatives', 'p0', 'open', 1),
      (res_id, 'Compliance / evacuation module gap', 'GuestFlow leads RFPs asking for OSHA/ISO headcount & emergency mustering', 'Productize live on-site headcount / evacuation roster; put ISO 45001 language on datasheet & demos', 'p0', 'open', 2),
      (res_id, 'Permanent visitor / contractor workflow', 'Industrial & facilities buyers need reusable RFID/cards for contractors', 'Ship & market permanent visitor profiles + reusable cards as a named feature', 'p1', 'open', 3),
      (res_id, 'Integration / software narrative', 'Endless''s known software + HRMS/ERP integrations raise trust for complex deals', 'Publish integration list (ERP/HR/ACS), API docs, and 2-3 named case studies', 'p1', 'open', 4),
      (res_id, 'Datasheet / IT-buyer artifact gap', 'GuestFlow has a crisp 2-page sheet; eTOP page is long-form marketing', 'Create a 1-2 page eTOP VMS datasheet: modules, architecture, hardware BOM, compliance checklist', 'p1', 'open', 5),
      (res_id, 'Platform upsell story', 'Endless can expand into full ZKBio CVSecurity; visitor becomes an entry wedge', 'Package eTOP VMS with time attendance + turnstile + meal/visitor stack as one workplace-security OS', 'p2', 'open', 6);
  END IF;
END $$;