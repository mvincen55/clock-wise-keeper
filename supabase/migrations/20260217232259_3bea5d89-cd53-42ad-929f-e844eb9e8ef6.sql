
-- Replace the day_off_type enum values
ALTER TYPE public.day_off_type RENAME TO day_off_type_old;

CREATE TYPE public.day_off_type AS ENUM ('scheduled_with_notice', 'unscheduled', 'office_closed', 'other');

-- Update existing rows to map old values
UPDATE public.days_off SET type = 'other' WHERE type::text NOT IN ('scheduled_with_notice', 'unscheduled', 'office_closed', 'other');

-- Alter column to use new enum
ALTER TABLE public.days_off
  ALTER COLUMN type DROP DEFAULT,
  ALTER COLUMN type TYPE public.day_off_type USING (
    CASE type::text
      WHEN 'pto' THEN 'scheduled_with_notice'::public.day_off_type
      WHEN 'sick' THEN 'unscheduled'::public.day_off_type
      WHEN 'holiday' THEN 'office_closed'::public.day_off_type
      ELSE 'other'::public.day_off_type
    END
  ),
  ALTER COLUMN type SET DEFAULT 'scheduled_with_notice'::public.day_off_type;

DROP TYPE public.day_off_type_old;
