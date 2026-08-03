ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS context_path text,
  ADD COLUMN IF NOT EXISTS context_label text;