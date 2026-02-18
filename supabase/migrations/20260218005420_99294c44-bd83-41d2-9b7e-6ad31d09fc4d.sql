
-- Add punch editing tracking columns
ALTER TABLE public.punches
  ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_punch_time timestamptz,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS edited_by uuid;

-- Add indexes for punch editing queries
CREATE INDEX IF NOT EXISTS idx_punches_is_edited ON public.punches (time_entry_id, is_edited);
