ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pipeline_stage text,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS next_action_due date,
  ADD COLUMN IF NOT EXISTS priority text,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS assigned_to uuid;

DO $$ BEGIN
  ALTER TABLE public.leads ADD CONSTRAINT leads_pipeline_stage_check
    CHECK (pipeline_stage IS NULL OR pipeline_stage IN
      ('prospect','qualified','meeting','quotation','negotiation','purchase_order','won','lost'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.leads ADD CONSTRAINT leads_priority_check
    CHECK (priority IS NULL OR priority IN ('critical','high','medium','low'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE public.leads
SET pipeline_stage = CASE
  WHEN status = 'won' THEN 'won'
  WHEN status = 'dead' THEN 'lost'
  WHEN status = 'hot' THEN 'qualified'
  ELSE 'prospect' END
WHERE pipeline_stage IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON public.leads (pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_leads_next_action_due ON public.leads (next_action_due);
CREATE INDEX IF NOT EXISTS idx_leads_priority ON public.leads (priority);