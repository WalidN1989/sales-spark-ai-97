
CREATE TYPE public.note_entity_type AS ENUM ('prospect','lead','sale','meeting','standalone');
CREATE TYPE public.note_visibility AS ENUM ('private','shared');

CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  body_text text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  pinned boolean NOT NULL DEFAULT false,
  visibility public.note_visibility NOT NULL DEFAULT 'private',
  entity_type public.note_entity_type NOT NULL DEFAULT 'standalone',
  entity_id uuid,
  ai_summary text,
  ai_summary_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notes_user_idx ON public.notes(user_id);
CREATE INDEX notes_entity_idx ON public.notes(entity_type, entity_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes_select_own_or_shared" ON public.notes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR visibility = 'shared');
CREATE POLICY "notes_insert_own" ON public.notes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "notes_update_own" ON public.notes FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notes_delete_own" ON public.notes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE public.note_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX note_attachments_note_idx ON public.note_attachments(note_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.note_attachments TO authenticated;
GRANT ALL ON public.note_attachments TO service_role;
ALTER TABLE public.note_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "note_attach_select" ON public.note_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id AND (n.user_id = auth.uid() OR n.visibility = 'shared')));
CREATE POLICY "note_attach_insert" ON public.note_attachments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.notes n WHERE n.id = note_id AND n.user_id = auth.uid()));
CREATE POLICY "note_attach_delete" ON public.note_attachments FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notes_set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER notes_updated_at BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.notes_set_updated_at();
