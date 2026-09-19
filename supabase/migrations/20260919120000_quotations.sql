-- Quotations module — build a client-ready quotation from products + quantity,
-- optionally linked to a lead. Mirrors the tasks/whatsapp RLS pattern
-- (org + created_by/assigned_to, manager sees all, lead-linked rows visible to
-- whoever can access the lead). Depends on Phase 1 (is_org_manager) and Phase 2
-- (can_access_lead) — run pending migrations in order. Never USING(true).

CREATE SEQUENCE IF NOT EXISTS public.quotation_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  quote_number bigint NOT NULL DEFAULT nextval('public.quotation_number_seq'),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  company_name text,
  contact_name text,
  currency text NOT NULL DEFAULT 'AED',
  exchange_rate numeric NOT NULL DEFAULT 1,        -- 1 AED = exchange_rate * currency (frozen at save time)
  vat_rate numeric NOT NULL DEFAULT 5,             -- percent
  ddp jsonb NOT NULL DEFAULT '{}'::jsonb,          -- { enabled, boq_fixed, per_kg, per_unit, weight } in AED
  items_total_cents bigint NOT NULL DEFAULT 0,     -- final customer totals, expressed in `currency`
  vat_cents bigint NOT NULL DEFAULT 0,
  grand_total_cents bigint NOT NULL DEFAULT 0,
  category text,                                   -- Wacom / TNA & ACS / Consumables / Turnstile & Speed Gates / Other
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected')),
  notes text,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quotation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  part_number text,
  description text,
  qty numeric NOT NULL DEFAULT 1,
  unit_price_cents bigint NOT NULL DEFAULT 0,      -- BASE price in AED (pre-DDP, pre-conversion)
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_items TO authenticated;
GRANT ALL ON public.quotations TO service_role;
GRANT ALL ON public.quotation_items TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.quotation_number_seq TO authenticated;

CREATE INDEX IF NOT EXISTS idx_quotations_org ON public.quotations(org_id);
CREATE INDEX IF NOT EXISTS idx_quotations_lead ON public.quotations(lead_id);
CREATE INDEX IF NOT EXISTS idx_quotations_created_by ON public.quotations(created_by);
CREATE INDEX IF NOT EXISTS idx_quotations_assigned_to ON public.quotations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_quotations_category ON public.quotations(category);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quote ON public.quotation_items(quotation_id);

-- quotations: a rep sees their own (created or assigned) plus any linked to a
-- lead they can access; a manager sees all.
CREATE POLICY quotations_select ON public.quotations
  FOR SELECT TO authenticated
  USING (
    public.is_org_manager(auth.uid())
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR (lead_id IS NOT NULL AND public.can_access_lead(lead_id))
  );

-- You always record yourself as creator; a rep can only assign to themselves,
-- a manager can assign to anyone.
CREATE POLICY quotations_insert ON public.quotations
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (public.is_org_manager(auth.uid()) OR assigned_to = auth.uid() OR assigned_to IS NULL)
  );

CREATE POLICY quotations_update ON public.quotations
  FOR UPDATE TO authenticated
  USING (public.is_org_manager(auth.uid()) OR created_by = auth.uid() OR assigned_to = auth.uid())
  WITH CHECK (public.is_org_manager(auth.uid()) OR created_by = auth.uid() OR assigned_to = auth.uid());

CREATE POLICY quotations_delete ON public.quotations
  FOR DELETE TO authenticated
  USING (public.is_org_manager(auth.uid()) OR created_by = auth.uid());

-- quotation_items: access is inherited from the parent quotation.
CREATE POLICY quotation_items_all ON public.quotation_items
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_id
      AND (
        public.is_org_manager(auth.uid())
        OR q.created_by = auth.uid()
        OR q.assigned_to = auth.uid()
        OR (q.lead_id IS NOT NULL AND public.can_access_lead(q.lead_id))
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_id
      AND (
        public.is_org_manager(auth.uid())
        OR q.created_by = auth.uid()
        OR q.assigned_to = auth.uid()
        OR (q.lead_id IS NOT NULL AND public.can_access_lead(q.lead_id))
      )
  ));

CREATE TRIGGER quotations_updated_at
  BEFORE UPDATE ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
