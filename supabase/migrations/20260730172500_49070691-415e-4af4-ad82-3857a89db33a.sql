CREATE TABLE public.message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL DEFAULT auth.uid(),
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_attachments_mime_allowed CHECK (
    mime_type IN ('image/png','image/jpeg','image/webp','image/gif','application/pdf')
  ),
  CONSTRAINT message_attachments_size_limit CHECK (size_bytes > 0 AND size_bytes <= 20971520)
);

GRANT SELECT, INSERT, DELETE ON public.message_attachments TO authenticated;
GRANT ALL ON public.message_attachments TO service_role;

ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants read conversation attachments"
ON public.message_attachments FOR SELECT TO authenticated
USING (public.is_conv_participant(conversation_id));

CREATE POLICY "Participants add their own attachments"
ON public.message_attachments FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND public.is_conv_participant(conversation_id)
  AND storage_path = org_id::text || '/' || conversation_id::text || '/' || split_part(storage_path, '/', 3)
);

CREATE POLICY "Uploader deletes own attachment"
ON public.message_attachments FOR DELETE TO authenticated
USING (uploaded_by = auth.uid() AND public.is_conv_participant(conversation_id));

CREATE INDEX idx_message_attachments_message ON public.message_attachments(message_id);
CREATE INDEX idx_message_attachments_conversation ON public.message_attachments(conversation_id);

CREATE TRIGGER update_message_attachments_updated_at
BEFORE UPDATE ON public.message_attachments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage: participant-only access, paths are <org_id>/<conversation_id>/<file>
CREATE POLICY "Participants read message files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND public.is_conv_participant(((storage.foldername(name))[2])::uuid)
);

CREATE POLICY "Participants upload message files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'message-attachments'
  AND owner = auth.uid()
  AND array_length(storage.foldername(name), 1) = 2
  AND public.is_conv_participant(((storage.foldername(name))[2])::uuid)
);

CREATE POLICY "Uploader deletes message files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND owner = auth.uid()
  AND public.is_conv_participant(((storage.foldername(name))[2])::uuid)
);