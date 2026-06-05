
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS hunter_last_sync timestamptz,
  ADD COLUMN IF NOT EXISTS employee_count int,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS enrichment_status text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS prospect_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS email_status text,
  ADD COLUMN IF NOT EXISTS email_score int,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS lead_score int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_score_manual_override boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_leads_prospect ON public.leads(prospect_id);
CREATE INDEX IF NOT EXISTS idx_leads_user_email ON public.leads(user_id, contact_email);
CREATE INDEX IF NOT EXISTS idx_leads_user_whatsapp ON public.leads(user_id, whatsapp);
