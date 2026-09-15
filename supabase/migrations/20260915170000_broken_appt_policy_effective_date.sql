-- Broken Appointments: the signed policy's start date.
--
-- Governing Rule 5 of the office's cancellation policy (effective 8/4/2026):
-- broken appointments before the effective date never count toward the
-- ladder and receive no retroactive letters, but a patient with any skips
-- Rung 1. NULL = the office has set no transition rule (every break counts).
-- De-identified configuration only.
ALTER TABLE public.broken_appt_settings
  ADD COLUMN IF NOT EXISTS policy_effective_date date;
