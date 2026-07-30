ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;