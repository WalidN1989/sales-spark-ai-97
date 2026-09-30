-- Website links remain available for enrichment but are no longer mandatory
-- when staff schedule a site visit.
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
    )
  ) NOT VALID;
