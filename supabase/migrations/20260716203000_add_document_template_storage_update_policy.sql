-- Allow authenticated users to replace only their own template files.
-- Required by storage upload(..., { upsert: true }) when the object already exists.
DROP POLICY IF EXISTS "Users update own templates" ON storage.objects;

CREATE POLICY "Users update own templates"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'document-templates'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'document-templates'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
