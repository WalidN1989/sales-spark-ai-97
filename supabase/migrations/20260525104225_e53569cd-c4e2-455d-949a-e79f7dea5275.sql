DROP INDEX IF EXISTS public.sales_dedup_invoice_idx;
UPDATE public.sales SET invoice_no = '__missing__:' || id::text WHERE invoice_no IS NULL;
ALTER TABLE public.sales ALTER COLUMN invoice_no SET NOT NULL;
ALTER TABLE public.sales ADD CONSTRAINT sales_user_date_invoice_unique UNIQUE (user_id, order_date, invoice_no);