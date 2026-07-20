-- Activity Journal: richer activity types + a structured "outcome" per entry.
-- The Lead workspace treats every interaction (call, WhatsApp, meeting, email,
-- visit, note, quotation) as one chronological journal entry.

-- 1) Widen the kind CHECK to cover the new activity types.
ALTER TABLE public.lead_activities DROP CONSTRAINT IF EXISTS lead_activities_kind_check;
ALTER TABLE public.lead_activities
  ADD CONSTRAINT lead_activities_kind_check
  CHECK (kind IN ('note','email','call','meeting','log','whatsapp','quotation','visit'));

-- 2) Structured outcome (optional) — mirrors the Add Activity template.
ALTER TABLE public.lead_activities
  ADD COLUMN IF NOT EXISTS outcome text;

DO $$ BEGIN
  ALTER TABLE public.lead_activities
    ADD CONSTRAINT lead_activities_outcome_check
    CHECK (outcome IS NULL OR outcome IN
      ('interested','waiting','not_interested','need_quotation','need_followup',
       'decision_pending','lost','won'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;