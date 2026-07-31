ALTER TABLE public.org_practice_settings
  ADD COLUMN IF NOT EXISTS owners_clock_in boolean NOT NULL DEFAULT false;