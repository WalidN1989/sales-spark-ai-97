
CREATE POLICY "note_att_obj_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'note-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "note_att_obj_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'note-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "note_att_obj_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'note-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
