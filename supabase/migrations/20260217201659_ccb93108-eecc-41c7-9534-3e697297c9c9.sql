
-- Create storage bucket for PDF imports
INSERT INTO storage.buckets (id, name, public) VALUES ('imports', 'imports', false);

-- Users can upload to their own folder
CREATE POLICY "Users upload own imports" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'imports' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can read their own uploads
CREATE POLICY "Users read own imports" ON storage.objects
FOR SELECT USING (bucket_id = 'imports' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can delete their own uploads
CREATE POLICY "Users delete own imports" ON storage.objects
FOR DELETE USING (bucket_id = 'imports' AND auth.uid()::text = (storage.foldername(name))[1]);
