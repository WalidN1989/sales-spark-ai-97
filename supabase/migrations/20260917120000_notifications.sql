-- In-app notifications (realtime toasts). One row per recipient per event.
-- The app's browser client subscribes to INSERTs where user_id = auth.uid()
-- (RLS below) and flashes a toast. Rows are written by server functions using
-- the service role (so an actor can create a notification addressed to another
-- user — assignment, reminders, etc.), which bypasses RLS.

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- recipient
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,        -- who caused it
  type text NOT NULL,            -- 'lead_assigned' | 'reminder' | 'meeting' | …
  title text NOT NULL,
  body text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- A user sees and updates (mark-read) only their own notifications. No INSERT
-- policy: writes go through the service role in server functions.
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON public.notifications(user_id, created_at DESC);

-- Stream inserts over Realtime. Guarded so re-running is safe.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
