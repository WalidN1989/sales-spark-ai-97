ALTER TABLE public.responses ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.responses ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE;
ALTER TABLE public.responses DROP CONSTRAINT IF EXISTS responses_target_check;
ALTER TABLE public.responses ADD CONSTRAINT responses_target_check CHECK (company_id IS NOT NULL OR lead_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS responses_lead_id_idx ON public.responses(lead_id);