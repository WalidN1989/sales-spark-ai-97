-- Payment Follow-up module
CREATE TABLE IF NOT EXISTS public.payment_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  prospect_id uuid,
  category text NOT NULL
    CHECK (category IN ('pending_pdc','pending_collection','pending_po_payment_advice','demo_unit','consignment')),
  reference text,
  title text NOT NULL,
  description text,
  amount_aed numeric,
  currency text NOT NULL DEFAULT 'AED',
  quantity numeric,
  unit_sku text,
  due_date date,
  sent_date date,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','waiting','partially_resolved','resolved','cancelled')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  owner text,
  last_activity_at timestamptz,
  resolved_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_followups_status_cat ON public.payment_followups (status, category);
CREATE INDEX IF NOT EXISTS idx_payment_followups_company ON public.payment_followups (company_name);
CREATE INDEX IF NOT EXISTS idx_payment_followups_due ON public.payment_followups (due_date);
CREATE INDEX IF NOT EXISTS idx_payment_followups_stale ON public.payment_followups (status, last_activity_at);

CREATE TABLE IF NOT EXISTS public.payment_followup_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  followup_id uuid NOT NULL REFERENCES public.payment_followups(id) ON DELETE CASCADE,
  activity_type text NOT NULL
    CHECK (activity_type IN ('call','whatsapp','email','visit','note','document_sent','payment_received','collection_done','other')),
  summary text NOT NULL,
  details text,
  activity_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_followup_activities_item ON public.payment_followup_activities (followup_id, activity_at DESC);

CREATE OR REPLACE FUNCTION public.payment_followup_activity_rollup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.payment_followups
     SET last_activity_at = GREATEST(COALESCE(last_activity_at, NEW.activity_at), NEW.activity_at),
         updated_at = now()
   WHERE id = NEW.followup_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS payment_followup_activity_rollup_trg ON public.payment_followup_activities;
CREATE TRIGGER payment_followup_activity_rollup_trg
AFTER INSERT ON public.payment_followup_activities
FOR EACH ROW EXECUTE FUNCTION public.payment_followup_activity_rollup();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payment_followups','payment_followup_activities'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_auth_all', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t || '_auth_all', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

INSERT INTO public.payment_followups (company_name, category, reference, title, amount_aed, quantity, unit_sku, due_date, sent_date, status, owner)
SELECT * FROM (VALUES
  ('Techsys Technology LLC', 'pending_pdc', '26391', 'Inv. 26391 PDC', 13230::numeric, NULL::numeric, NULL::text, '2026-09-18'::date, NULL::date, 'open', 'Walid'),
  ('Techsys Technology LLC', 'pending_pdc', '26390', 'Inv. 26390 PDC', 5460, NULL, NULL, '2026-09-18', NULL, 'open', 'Walid'),
  ('Techsys Technology LLC', 'pending_collection', '26391', 'Inv. 26391 — 6× STU-540 to collect', NULL, 6, 'STU-540', NULL, NULL, 'open', 'Walid'),
  ('National Bonds Corporation', 'pending_po_payment_advice', NULL, 'PI awaiting payment advice', NULL, NULL, NULL, NULL, '2026-06-22', 'open', 'Walid'),
  ('Digital Dimension Computers', 'pending_po_payment_advice', NULL, 'PI awaiting payment advice', NULL, NULL, NULL, NULL, '2026-09-03', 'open', 'Walid'),
  ('Burjeel Medical Centre Al Zeina LLC', 'pending_po_payment_advice', NULL, 'PI awaiting payment advice', NULL, NULL, NULL, NULL, '2026-08-14', 'open', 'Walid'),
  ('L&T', 'demo_unit', NULL, 'Demo — 1× Omnikey reader', NULL, 1, 'Omnikey reader', NULL, '2026-03-31', 'open', 'Walid'),
  ('L M Exchange LLC', 'demo_unit', NULL, 'Demo — 1× STU-430', NULL, 1, 'STU-430', NULL, '2025-10-13', 'open', 'Walid'),
  ('GCC Exchange / Accutrack', 'demo_unit', NULL, 'Demo — 1× STU-540 (pending advise for invoicing)', NULL, 1, 'STU-540', NULL, NULL, 'open', 'Walid'),
  ('Trios', 'consignment', NULL, 'Consignment — 2× STU-430', NULL, 2, 'STU-430', NULL, NULL, 'open', 'Walid'),
  ('Al Bareeq', 'consignment', NULL, 'Consignment — 2× STU-430', NULL, 2, 'STU-430', NULL, NULL, 'open', 'Walid'),
  ('Emsys', 'consignment', NULL, 'Consignment — 2× STU-430 & 3× STU-540', NULL, 5, 'STU-430 / STU-540', NULL, NULL, 'open', 'Walid')
) AS v
WHERE NOT EXISTS (SELECT 1 FROM public.payment_followups);