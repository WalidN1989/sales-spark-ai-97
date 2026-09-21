-- Make the Quotations agent route discoverable: agent-describe serves the
-- agent_modules table, so Grok finds create-quotation on its next describe.
INSERT INTO public.agent_modules (id, title, capabilities, edge_functions, legacy_key_name, notes, sort_order) VALUES
  ('quotations', 'Quotations',
   ARRAY['create', 'price'],
   '{"create":"create-quotation","price":"create-quotation"}',
   'PROSPECT_WEBHOOK_KEY',
   'POST create-quotation. Target: lead_id | company_id | company (fuzzy-matched against every existing prospect and lead; a new prospect + lead is created only when nothing matches; 409 + candidates if ambiguous). items: [{part_number | query | description, qty, unit_price (AED, optional override)}] priced from the Products price list. currency AED|USD|OMR|QAR, vat_rate (default 5), ddp. dry_run:true = price only, writes nothing. If any line cannot be priced: 422 + suggestions, nothing written. On save: Activity Journal entry on the lead, stage -> Quotation (forward only), empty pipeline value filled, products merged, prospect converted into Leads. Response includes summary_text to show the user and url to the quote.',
   60)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  capabilities = EXCLUDED.capabilities,
  edge_functions = EXCLUDED.edge_functions,
  legacy_key_name = EXCLUDED.legacy_key_name,
  notes = EXCLUDED.notes,
  sort_order = EXCLUDED.sort_order;
