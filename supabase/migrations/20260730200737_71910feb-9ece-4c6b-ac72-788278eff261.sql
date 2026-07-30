CREATE POLICY "Support attachments: members upload to their org folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'support-attachments'
    AND public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Support attachments: owner or admin reads"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND (
      owner = auth.uid()
      OR public.is_org_admin(((storage.foldername(name))[1])::uuid)
    )
  );