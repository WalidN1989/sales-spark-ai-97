
CREATE POLICY respond_uploads_owner_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'respond-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY respond_uploads_owner_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'respond-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY respond_uploads_owner_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'respond-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY respond_uploads_owner_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'respond-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
