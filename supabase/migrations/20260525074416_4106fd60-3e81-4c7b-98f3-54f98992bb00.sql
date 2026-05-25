GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, text) TO authenticated, anon;

-- Dedup key for CSV re-imports (NULLs treated as distinct, which is fine — we coalesce in app)
CREATE UNIQUE INDEX IF NOT EXISTS sales_dedup_idx
  ON public.sales (user_id, order_date, order_ref, value, product);