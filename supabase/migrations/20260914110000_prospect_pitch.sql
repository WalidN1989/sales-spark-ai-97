-- Store the pitch email on the prospect (company) so it persists and is NOT
-- regenerated/overwritten until the user asks. create-prospect can ship a
-- ready-made pitch (pitch_subject/pitch_body) with a new lead.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS pitch_subject text,
  ADD COLUMN IF NOT EXISTS pitch_body text,
  ADD COLUMN IF NOT EXISTS pitch_at timestamptz;
