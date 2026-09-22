-- Each schedule capture records where the provider's day actually sat on the
-- grid: when the first patient was seated, when the last patient left, and the
-- visible availability window (booked or open). Minutes from midnight, office
-- time. Aggregates only — no appointment, no patient, no schedule text — so the
-- office's real hours can be learned from its own captures instead of asked
-- for, and the Reports Analyst can read the schedule beside the time clock.

ALTER TABLE public.provider_day_metrics
  ADD COLUMN IF NOT EXISTS first_patient_minute integer,
  ADD COLUMN IF NOT EXISTS last_patient_minute integer,
  ADD COLUMN IF NOT EXISTS available_start_minute integer,
  ADD COLUMN IF NOT EXISTS available_end_minute integer;

COMMENT ON COLUMN public.provider_day_metrics.first_patient_minute IS 'Start of the first visible appointment, minutes from midnight office time; null when none was visible.';
COMMENT ON COLUMN public.provider_day_metrics.last_patient_minute IS 'End of the last visible appointment, minutes from midnight office time; null when none was visible.';
COMMENT ON COLUMN public.provider_day_metrics.available_start_minute IS 'First row that was the provider''s to book (booked or open), minutes from midnight office time.';
COMMENT ON COLUMN public.provider_day_metrics.available_end_minute IS 'End of the last row that was the provider''s to book (booked or open), minutes from midnight office time.';

DO $$ BEGIN
  ALTER TABLE public.provider_day_metrics
    ADD CONSTRAINT provider_day_metrics_observed_day_check CHECK (
      (first_patient_minute IS NULL OR first_patient_minute BETWEEN 0 AND 1440)
      AND (last_patient_minute IS NULL OR last_patient_minute BETWEEN 0 AND 1440)
      AND (available_start_minute IS NULL OR available_start_minute BETWEEN 0 AND 1440)
      AND (available_end_minute IS NULL OR available_end_minute BETWEEN 0 AND 1440)
      AND (first_patient_minute IS NULL OR last_patient_minute IS NULL OR first_patient_minute < last_patient_minute)
      AND (available_start_minute IS NULL OR available_end_minute IS NULL OR available_start_minute < available_end_minute)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Learning hours reads one team member's captured days, newest first.
CREATE INDEX IF NOT EXISTS provider_day_metrics_employee_date_idx
  ON public.provider_day_metrics (org_id, employee_id, business_date DESC);
