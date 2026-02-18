
-- Fix views to use SECURITY INVOKER
ALTER VIEW public.v_timesheet_day SET (security_invoker = on);
ALTER VIEW public.v_exceptions SET (security_invoker = on);
ALTER VIEW public.v_pto_ledger SET (security_invoker = on);
ALTER VIEW public.v_audit_trail SET (security_invoker = on);

-- Drop constraint first, then move extension
ALTER TABLE public.schedule_versions DROP CONSTRAINT IF EXISTS no_overlapping_schedule_versions;
DROP EXTENSION IF EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS btree_gist SCHEMA extensions;

-- Re-add constraint
ALTER TABLE public.schedule_versions
  ADD CONSTRAINT no_overlapping_schedule_versions
  EXCLUDE USING gist (
    user_id WITH =,
    daterange(effective_start_date, COALESCE(effective_end_date, '9999-12-31'::date), '[]') WITH &&
  );
