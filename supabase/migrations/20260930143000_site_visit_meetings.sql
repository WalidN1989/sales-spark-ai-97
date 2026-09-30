-- Structured site visits are stored on the activity journal so the lead history
-- and manager meeting calendar always reference the same record.
ALTER TABLE public.lead_activities
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS meeting_contact_name text,
  ADD COLUMN IF NOT EXISTS meeting_contact_phone text,
  ADD COLUMN IF NOT EXISTS meeting_contact_email text,
  ADD COLUMN IF NOT EXISTS meeting_state text,
  ADD COLUMN IF NOT EXISTS meeting_address text,
  ADD COLUMN IF NOT EXISTS meeting_company_url text,
  ADD COLUMN IF NOT EXISTS meeting_contact_url text;

CREATE INDEX IF NOT EXISTS idx_lead_activities_site_visits
  ON public.lead_activities (scheduled_at, assigned_to)
  WHERE kind = 'visit';

ALTER TABLE public.lead_activities
  DROP CONSTRAINT IF EXISTS lead_activities_source_module_check;
ALTER TABLE public.lead_activities
  ADD CONSTRAINT lead_activities_source_module_check
  CHECK (source_module IS NULL OR source_module IN ('lead', 'prospect'));

-- Existing free-text visits remain readable. New visit records must contain
-- enough information for the manager's meeting calendar.
ALTER TABLE public.lead_activities
  DROP CONSTRAINT IF EXISTS lead_activities_visit_details_check;
ALTER TABLE public.lead_activities
  ADD CONSTRAINT lead_activities_visit_details_check CHECK (
    kind <> 'visit' OR (
      scheduled_at IS NOT NULL
      AND assigned_to IS NOT NULL
      AND source_module IS NOT NULL
      AND NULLIF(BTRIM(meeting_contact_name), '') IS NOT NULL
      AND (
        NULLIF(BTRIM(meeting_contact_phone), '') IS NOT NULL
        OR NULLIF(BTRIM(meeting_contact_email), '') IS NOT NULL
      )
      AND NULLIF(BTRIM(meeting_state), '') IS NOT NULL
      AND NULLIF(BTRIM(meeting_address), '') IS NOT NULL
      AND NULLIF(BTRIM(meeting_company_url), '') IS NOT NULL
      AND NULLIF(BTRIM(meeting_contact_url), '') IS NOT NULL
    )
  ) NOT VALID;
