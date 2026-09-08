-- Intentional prospect → lead conversion. Contacts captured via Hunter are
-- research contacts on a prospect, NOT active leads — they should stay in the
-- Prospect module until someone deliberately converts them. A new is_converted
-- flag drives this: the Leads pipeline shows only converted leads.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS is_converted boolean NOT NULL DEFAULT true;

-- Existing Hunter-captured contacts move back to "prospect contact" state.
UPDATE public.leads SET is_converted = false WHERE source = 'hunter.io';

CREATE INDEX IF NOT EXISTS idx_leads_is_converted ON public.leads(is_converted);
