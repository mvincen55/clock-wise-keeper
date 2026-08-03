ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS severity text,
  ADD COLUMN IF NOT EXISTS range_start date,
  ADD COLUMN IF NOT EXISTS range_end date;