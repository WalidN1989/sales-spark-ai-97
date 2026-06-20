ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS mobile text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'warm',
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_status_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_status_check
  CHECK (status IN ('hot','warm','cold','won','lost'));