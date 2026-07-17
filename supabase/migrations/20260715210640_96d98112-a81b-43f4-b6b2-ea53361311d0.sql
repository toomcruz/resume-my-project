
-- Storage RLS: files stored under `<user_id>/...` — only owner accesses their files
CREATE POLICY "Users read own attendance images" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attendance-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users insert own attendance images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attendance-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own attendance images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'attendance-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users read own templates" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'document-templates' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users insert own templates" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'document-templates' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own templates" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'document-templates' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users read own generated docs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'generated-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users insert own generated docs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'generated-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own generated docs" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'generated-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
