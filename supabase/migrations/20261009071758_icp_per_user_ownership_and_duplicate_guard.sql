-- Product ICP ownership belongs to the creator. Admins/managers retain full
-- visibility through the existing RLS policy; ordinary users see only rows
-- where user_id = auth.uid().

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Retire the legacy single-owner behavior. The application already inserts
-- context.userId, so newly-created rows now remain with their creator.
DROP TRIGGER IF EXISTS icp_profiles_set_owner ON public.icp_profiles;
DROP FUNCTION IF EXISTS public.icp_profiles_set_owner();
DROP FUNCTION IF EXISTS public.icp_owner_id();

-- Resolve Javid by the trusted profiles table and fail safely if the account is
-- missing or ambiguous. Never infer ownership from editable JWT metadata.
DO $$
DECLARE
  javid_id uuid;
  matches integer;
BEGIN
  SELECT count(*)
  INTO matches
  FROM public.profiles
  WHERE lower(trim(coalesce(full_name, ''))) LIKE 'javid%'
     OR lower(trim(coalesce(full_name, ''))) LIKE 'javed%'
     OR lower(coalesce(email, '')) LIKE 'javid@%'
     OR lower(coalesce(email, '')) LIKE 'javed@%';

  IF matches <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Javid/Javed profile, found %', matches;
  END IF;

  SELECT id INTO javid_id
  FROM public.profiles
  WHERE lower(trim(coalesce(full_name, ''))) LIKE 'javid%'
     OR lower(trim(coalesce(full_name, ''))) LIKE 'javed%'
     OR lower(coalesce(email, '')) LIKE 'javid@%'
     OR lower(coalesce(email, '')) LIKE 'javed@%'
  LIMIT 1;

  UPDATE public.icp_profiles
  SET user_id = javid_id
  WHERE lower(name) IN (
    'canteen management system',
    'eid reader software',
    'ubio biometric access control & time attendance'
  );
END $$;

-- Canonical key removes case, spaces, punctuation and symbols. This blocks
-- exact semantic spellings such as "EID Reader", "eid-reader" and
-- "EID  Reader" from being listed more than once.
CREATE OR REPLACE FUNCTION public.icp_normalize_name(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(lower(trim(coalesce(value, ''))), '[^a-z0-9]+', '', 'g')
$$;

ALTER TABLE public.icp_profiles ADD COLUMN IF NOT EXISTS name_key text;
UPDATE public.icp_profiles SET name_key = public.icp_normalize_name(name);
ALTER TABLE public.icp_profiles ALTER COLUMN name_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS icp_profiles_name_key_unique
  ON public.icp_profiles(name_key);

-- Also stop small wording changes that evade the canonical key. A deliberately
-- conservative threshold catches near-duplicates without merging unrelated
-- product categories.
CREATE OR REPLACE FUNCTION public.icp_profiles_prevent_duplicates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  conflicting_name text;
BEGIN
  NEW.name_key := public.icp_normalize_name(NEW.name);
  IF length(NEW.name_key) < 3 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Product ICP name is too short.';
  END IF;

  SELECT p.name INTO conflicting_name
  FROM public.icp_profiles p
  WHERE p.id IS DISTINCT FROM NEW.id
    AND (
      p.name_key = NEW.name_key
      OR similarity(p.name_key, NEW.name_key) >= 0.72
      OR (length(p.name_key) >= 8 AND length(NEW.name_key) >= 8
          AND (p.name_key LIKE '%' || NEW.name_key || '%'
               OR NEW.name_key LIKE '%' || p.name_key || '%'))
    )
  ORDER BY similarity(p.name_key, NEW.name_key) DESC
  LIMIT 1;

  IF conflicting_name IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = format('A Product ICP named "%s" already exists or is too similar.', conflicting_name),
      DETAIL = 'Use the existing Product ICP instead of creating another category.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS icp_profiles_duplicate_guard ON public.icp_profiles;
CREATE TRIGGER icp_profiles_duplicate_guard
  BEFORE INSERT OR UPDATE OF name ON public.icp_profiles
  FOR EACH ROW EXECUTE FUNCTION public.icp_profiles_prevent_duplicates();

-- Keep access explicit for Supabase Data API projects where new-object grants
-- are no longer automatic.
GRANT EXECUTE ON FUNCTION public.icp_normalize_name(text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.icp_profiles_prevent_duplicates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.icp_profiles_prevent_duplicates() TO authenticated, service_role;
