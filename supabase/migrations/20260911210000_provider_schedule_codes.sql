-- Provider schedule identifiers belong to the office roster, not a day's column positions.
ALTER TABLE public.org_providers ADD COLUMN IF NOT EXISTS schedule_code text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_providers_schedule_code_format' AND conrelid = 'public.org_providers'::regclass) THEN
    ALTER TABLE public.org_providers ADD CONSTRAINT org_providers_schedule_code_format CHECK (schedule_code IS NULL OR schedule_code ~ '^(DR|HY|HYG)[0-9]{1,4}$');
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS org_providers_schedule_code_unique ON public.org_providers (org_id, schedule_code) WHERE schedule_code IS NOT NULL;
