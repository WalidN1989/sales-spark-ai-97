CREATE TABLE IF NOT EXISTS public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  note text,
  remind_at timestamptz NOT NULL,
  entity_type text NOT NULL DEFAULT 'general'
    CHECK (entity_type IN ('lead', 'prospect', 'general')),
  entity_id uuid,
  entity_label text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminders TO authenticated;
GRANT ALL ON public.reminders TO service_role;

CREATE INDEX IF NOT EXISTS idx_reminders_user_status
  ON public.reminders (user_id, status, remind_at);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

DO $mig$ BEGIN
  CREATE POLICY reminders_owner_all ON public.reminders
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;