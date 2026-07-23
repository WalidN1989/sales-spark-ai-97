-- Closing a follow-up loop needs two more outcomes: the customer isn't
-- responding, or is actively ignoring us.
ALTER TABLE public.lead_activities DROP CONSTRAINT IF EXISTS lead_activities_outcome_check;
ALTER TABLE public.lead_activities
  ADD CONSTRAINT lead_activities_outcome_check
  CHECK (outcome IS NULL OR outcome IN
    ('interested','waiting','not_interested','need_quotation','need_followup',
     'decision_pending','lost','won','no_response','ignoring'));
