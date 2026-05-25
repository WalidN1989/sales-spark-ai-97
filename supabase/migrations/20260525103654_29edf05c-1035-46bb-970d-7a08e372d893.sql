ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS invoice_no text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS rep_walid numeric,
  ADD COLUMN IF NOT EXISTS rep_javid numeric,
  ADD COLUMN IF NOT EXISTS vat numeric,
  ADD COLUMN IF NOT EXISTS source_sheet text;

DROP INDEX IF EXISTS public.sales_dedup_idx;

CREATE UNIQUE INDEX IF NOT EXISTS sales_dedup_invoice_idx
  ON public.sales (user_id, order_date, invoice_no)
  WHERE invoice_no IS NOT NULL;
