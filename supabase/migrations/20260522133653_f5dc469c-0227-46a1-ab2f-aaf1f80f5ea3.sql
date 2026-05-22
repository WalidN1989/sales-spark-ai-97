
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_permission(UUID, TEXT, TEXT) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
