
-- Use SECURITY INVOKER (user already owns leads row via RLS)
CREATE OR REPLACE FUNCTION public.lead_activities_rollup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.leads
     SET last_activity_kind = NEW.kind,
         last_activity_note = NEW.body,
         last_activity_at   = NEW.created_at,
         updated_at         = now()
   WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$;

-- Storage RLS on lead-documents bucket
CREATE POLICY "lead_documents_read_own"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'lead-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "lead_documents_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'lead-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "lead_documents_update_own"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'lead-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "lead_documents_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'lead-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
