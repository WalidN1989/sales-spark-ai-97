
CREATE TABLE public.visual_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_path text NOT NULL,
  label text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  match_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visual_searches TO authenticated;
GRANT ALL ON public.visual_searches TO service_role;

ALTER TABLE public.visual_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own visual searches"
  ON public.visual_searches FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER visual_searches_updated_at
  BEFORE UPDATE ON public.visual_searches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_visual_searches_user_created ON public.visual_searches(user_id, created_at DESC);

CREATE TABLE public.visual_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id uuid NOT NULL REFERENCES public.visual_searches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position int NOT NULL,
  title text,
  source text,
  source_domain text,
  link text NOT NULL,
  thumbnail_url text,
  saved_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  saved_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visual_matches TO authenticated;
GRANT ALL ON public.visual_matches TO service_role;

ALTER TABLE public.visual_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own visual matches"
  ON public.visual_matches FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_visual_matches_search ON public.visual_matches(search_id, position);

-- Storage policies on the visual-match-uploads bucket (user-scoped folder)
CREATE POLICY "Users read their own visual-match uploads"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'visual-match-uploads'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users upload to their own visual-match folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'visual-match-uploads'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete their own visual-match uploads"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'visual-match-uploads'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
