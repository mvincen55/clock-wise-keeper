-- Doctor name for the FOF's AI-written treatment summary ("Dr. Scott
-- will..."). De-identified practice configuration.
ALTER TABLE public.fof_settings
  ADD COLUMN doctor_name text NOT NULL DEFAULT 'Dr. Scott';
