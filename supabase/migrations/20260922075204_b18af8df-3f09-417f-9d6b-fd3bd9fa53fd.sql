-- Reliable ElevenLabs ingestion for Reception.
-- Provider retries and manual reconciliation must resolve to one conversation
-- and one copy of each transcript turn.

ALTER TABLE public.reception_conversations
  ADD COLUMN IF NOT EXISTS provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS call_successful boolean,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz;

DROP INDEX IF EXISTS public.idx_reception_external;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reception_external
  ON public.reception_conversations(external_provider, external_conversation_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reception_message_external
  ON public.reception_messages(conversation_id, external_message_id);

-- Lightweight receipt ledger: useful when diagnosing provider retries or a
-- malformed event without losing the original delivery details.
CREATE TABLE IF NOT EXISTS public.reception_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_type text NOT NULL,
  external_conversation_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received','processed','ignored','failed')),
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_reception_webhook_events_lookup
  ON public.reception_webhook_events(provider, external_conversation_id, received_at DESC);

ALTER TABLE public.reception_webhook_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.reception_webhook_events TO service_role;