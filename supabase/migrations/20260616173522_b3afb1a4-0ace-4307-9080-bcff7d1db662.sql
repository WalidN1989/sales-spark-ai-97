ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS update_companies_updated_at ON public.companies;
CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill from latest activity_log entry (if any) so existing rows sort sensibly
UPDATE public.companies c
SET updated_at = GREATEST(
  c.created_at,
  COALESCE((SELECT MAX(a.logged_at) FROM public.activity_log a WHERE a.company_id = c.id), c.created_at)
);

-- Bump companies.updated_at whenever a related activity is logged
CREATE OR REPLACE FUNCTION public.bump_company_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NOT NULL THEN
    UPDATE public.companies SET updated_at = now() WHERE id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activity_log_bumps_company ON public.activity_log;
CREATE TRIGGER activity_log_bumps_company
AFTER INSERT ON public.activity_log
FOR EACH ROW
EXECUTE FUNCTION public.bump_company_updated_at();
