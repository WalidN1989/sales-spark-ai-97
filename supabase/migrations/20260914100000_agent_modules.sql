-- Module registry for the Agent Access Layer.
--
-- Every module an agent may read or write is a row here, and agent-describe
-- serves this table verbatim. That is what makes a future module reachable
-- without a change on the agent's side: add the row, ship the functions it
-- names, and Grok discovers it on its next describe call. A module missing from
-- this table is, by definition, not finished.

CREATE TABLE IF NOT EXISTS public.agent_modules (
  id text PRIMARY KEY,                          -- stable slug: prospects, leads, ...
  title text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','deprecated')),
  capabilities text[] NOT NULL DEFAULT '{}',    -- list, get, create, update, log_activity, summary ...
  edge_functions jsonb NOT NULL DEFAULT '{}',   -- capability -> function name
  key_header text NOT NULL DEFAULT 'x-api-key',
  legacy_key_name text,                         -- older module secret still accepted
  notes text,
  sort_order int NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_modules ENABLE ROW LEVEL SECURITY;
-- Agents read this through agent-describe (service role). Signed-in staff may
-- read it too, for an admin note in the UI; nobody edits it from the browser.
GRANT SELECT ON public.agent_modules TO authenticated;
GRANT ALL ON public.agent_modules TO service_role;
DROP POLICY IF EXISTS agent_modules_read ON public.agent_modules;
CREATE POLICY agent_modules_read ON public.agent_modules FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS agent_modules_updated_at ON public.agent_modules;
CREATE TRIGGER agent_modules_updated_at
  BEFORE UPDATE ON public.agent_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.agent_modules (id, title, capabilities, edge_functions, legacy_key_name, notes, sort_order) VALUES
  ('prospects', 'Prospects',
   ARRAY['list','get','create','update','log_activity','activity_summary','promote_to_lead'],
   '{"list":"list-prospects","get":"get-prospect","create":"create-prospect","update":"update-prospect","log_activity":"log-prospect-activity","log_quote":"log-quote-activity","activity_summary":"prospect-activity-summary","promote_to_lead":"promote-prospect-to-lead"}',
   'PROSPECT_WEBHOOK_KEY',
   'Companies table. Dedupe on create is by fuzzy company name. Activity is logged on the company''s primary lead.', 10),
  ('leads', 'Leads',
   ARRAY['list','get','update','log_activity'],
   '{"list":"list-leads","get":"get-lead","update":"update-lead","log_activity":"log-prospect-activity"}',
   'PROSPECT_WEBHOOK_KEY',
   'Pipeline rows under a prospect. Create one with promote-prospect-to-lead. log-prospect-activity accepts lead_id.', 20),
  ('icp_profiles', 'Product ICP',
   ARRAY['list'],
   '{"list":"list-icp-profiles"}',
   'PROSPECT_WEBHOOK_KEY',
   'Read-only for agents; cards are maintained in the UI.', 30),
  ('payment_followups', 'Payment Follow-up',
   ARRAY['list','upsert','update','log_activity','needing_reminder'],
   '{"list":"list-payment-followups","upsert":"upsert-payment-followups","update":"manage-payment-followup","log_activity":"log-payment-followup-activity","needing_reminder":"payment-followups-needing-reminder"}',
   'PAYMENT_FOLLOWUP_API_KEY',
   'Dedupe key: company + category + reference.', 40),
  ('competitor_analysis', 'Competitor Analysis',
   ARRAY['list','get','create','update','catalog'],
   '{"list":"list-competitor-research","get":"get-competitor-research","create":"create-competitor-research","update":"manage-competitor-research","catalog":"list-competitor-catalog"}',
   'COMPETITOR_RESEARCH_API_KEY',
   'create-competitor-research also upserts the competitor company and product it names.', 50)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  capabilities = EXCLUDED.capabilities,
  edge_functions = EXCLUDED.edge_functions,
  legacy_key_name = EXCLUDED.legacy_key_name,
  notes = EXCLUDED.notes,
  sort_order = EXCLUDED.sort_order;
