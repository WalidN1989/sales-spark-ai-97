-- One owner for every Product ICP card.
--
-- The research agent reads cards through list-icp-profiles, which filters on
-- user_id = PROSPECT_WEBHOOK_USER_ID. The three seeded cards carry that id. A
-- card created from the UI carried the logged-in user's id instead, so the UI
-- (manager sees all) showed four cards while the agent saw three.
--
-- Rule from now on: every icp_profiles row belongs to the ICP owner, whoever
-- inserts it. The owner is the account the seeded cards already belong to
-- (falling back to the earliest admin, which is how the seed chose it), so the
-- webhook owner and the DB owner stay the same id without an env value in the
-- database. A BEFORE INSERT trigger enforces it, so no UI or agent code path
-- can create a card the agent cannot read.

-- 0) Diagnostic. Run this SELECT first and keep the output: it shows which rows
--    will move. `owner` must equal PROSPECT_WEBHOOK_USER_ID in the Edge Function
--    secrets; if it does not, stop and say so before running the rest.
--
--   SELECT p.name, p.user_id,
--          (SELECT user_id FROM public.icp_profiles ORDER BY created_at, id LIMIT 1) AS owner,
--          p.user_id = (SELECT user_id FROM public.icp_profiles ORDER BY created_at, id LIMIT 1) AS matches_owner
--   FROM public.icp_profiles p ORDER BY p.created_at;

-- 1) The canonical ICP owner.
CREATE OR REPLACE FUNCTION public.icp_owner_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT user_id FROM public.icp_profiles ORDER BY created_at, id LIMIT 1),
    (SELECT user_id FROM public.user_roles WHERE role = 'admin' ORDER BY created_at LIMIT 1)
  )
$$;

-- 2) Every new card lands under that owner, whoever inserted it. RLS WITH CHECK
--    is evaluated on the row after this trigger runs, and managers pass it via
--    is_org_manager, which is who maintains ICP cards.
CREATE OR REPLACE FUNCTION public.icp_profiles_set_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  owner uuid := public.icp_owner_id();
BEGIN
  IF owner IS NOT NULL THEN
    NEW.user_id := owner;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS icp_profiles_set_owner ON public.icp_profiles;
CREATE TRIGGER icp_profiles_set_owner
  BEFORE INSERT ON public.icp_profiles
  FOR EACH ROW EXECUTE FUNCTION public.icp_profiles_set_owner();

-- 3) Backfill: move any card that sits under another account. Only user_id
--    changes; industries, personas, use cases, customers and competitors are
--    untouched. Idempotent: a second run updates nothing.
UPDATE public.icp_profiles
SET user_id = public.icp_owner_id()
WHERE user_id IS DISTINCT FROM public.icp_owner_id();

-- 4) Check. Every row now matches the owner, and the count is what the UI shows.
--
--   SELECT count(*) AS total,
--          count(*) FILTER (WHERE user_id = public.icp_owner_id()) AS under_owner
--   FROM public.icp_profiles;
