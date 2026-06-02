ALTER TABLE public.leads ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_user_id_company_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS leads_user_company_unique
  ON public.leads (user_id, company_id) WHERE company_id IS NOT NULL;