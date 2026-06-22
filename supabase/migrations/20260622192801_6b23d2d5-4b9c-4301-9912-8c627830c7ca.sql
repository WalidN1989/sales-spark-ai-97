
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_reseller boolean NOT NULL DEFAULT false;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_type text NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS reseller_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS end_user_project text;

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_lead_type_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_lead_type_check CHECK (lead_type IN ('direct','reseller'));

CREATE INDEX IF NOT EXISTS idx_leads_reseller_company ON public.leads(reseller_company_id);

-- Allow multiple reseller salespeople to share end-user company_id by scoping the
-- uniqueness rule to direct leads only.
DROP INDEX IF EXISTS public.leads_user_company_unique;
CREATE UNIQUE INDEX leads_user_company_unique
  ON public.leads(user_id, company_id)
  WHERE company_id IS NOT NULL AND lead_type = 'direct';
