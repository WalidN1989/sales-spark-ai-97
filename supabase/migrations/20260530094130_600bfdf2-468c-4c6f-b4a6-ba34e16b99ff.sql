ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS market_seed_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS market_insight jsonb,
  ADD COLUMN IF NOT EXISTS market_insight_at timestamptz;