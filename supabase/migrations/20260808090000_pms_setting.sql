-- Canonical Practice Management System setting. One office-wide value on
-- org_practice_settings (member-read / admin-write RLS already covers it)
-- that any feature may consult — Broken Appointments' capture assistant is
-- the first consumer. Business configuration only: which PMS the office
-- runs, never anything about a patient.
ALTER TABLE public.org_practice_settings
  ADD COLUMN IF NOT EXISTS pms_system text NOT NULL DEFAULT 'not_configured'
    CHECK (pms_system IN (
      'dentrix', 'open_dental', 'eaglesoft', 'curve', 'denticon',
      'other', 'not_configured'
    ));
