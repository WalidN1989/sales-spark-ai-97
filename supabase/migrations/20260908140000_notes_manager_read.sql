-- Let a manager READ every note (and its attachments) for oversight — the
-- "pick a user and see what's happening" view. Creating/editing/deleting stays
-- own-only; managers only gain read visibility. Depends on is_org_manager()
-- (Phase 1 migration).

DROP POLICY IF EXISTS notes_select_own_or_shared ON public.notes;
CREATE POLICY notes_select_own_or_shared ON public.notes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR visibility = 'shared' OR public.is_org_manager(auth.uid()));

DROP POLICY IF EXISTS note_attach_select ON public.note_attachments;
CREATE POLICY note_attach_select ON public.note_attachments
  FOR SELECT TO authenticated
  USING (
    public.is_org_manager(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = note_id AND (n.user_id = auth.uid() OR n.visibility = 'shared')
    )
  );
