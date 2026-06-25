
-- 1) Drop the unique constraint that blocks multiple Direct contacts per company.
DROP INDEX IF EXISTS public.leads_user_company_unique;

-- 2) Primary contact flag on leads (one per company).
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

-- Backfill: the oldest lead per (user_id, company_id) becomes primary.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, company_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.leads
  WHERE company_id IS NOT NULL
)
UPDATE public.leads l
SET is_primary = true
FROM ranked r
WHERE l.id = r.id AND r.rn = 1;

-- Same backfill for leads scoped by prospect_id (Hunter-imported with company_id=null).
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, prospect_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.leads
  WHERE company_id IS NULL AND prospect_id IS NOT NULL
)
UPDATE public.leads l
SET is_primary = true
FROM ranked r
WHERE l.id = r.id AND r.rn = 1;

-- 3) Cached competitor outreach email on qualifying_targets.
ALTER TABLE public.qualifying_targets
  ADD COLUMN IF NOT EXISTS cached_email_subject text,
  ADD COLUMN IF NOT EXISTS cached_email_body    text,
  ADD COLUMN IF NOT EXISTS cached_email_at      timestamptz;
