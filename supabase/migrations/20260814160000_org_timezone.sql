-- ============================================================
-- PHASE 6: TIMEZONE GENERICIZATION
-- (Time Clock Legitimacy Hardening — see audits/time-clock-preflight.md)
--
--   1. The office gets a timezone: org_practice_settings.timezone
--      (IANA name, default America/New_York), editable in office
--      settings and surfaced during onboarding.
--   2. employees.timezone becomes NULLABLE with no default: NULL means
--      "inherit the office timezone". It used to be NOT NULL DEFAULT
--      'America/New_York', which would have masked any org setting
--      forever — every row that still holds the old default flips to
--      NULL (inherit). A non-null value is now an EXPLICIT per-person
--      override.
--   3. get_user_timezone resolves: explicit user timezone if set, else
--      the org timezone, else the legacy fallbacks, else the default.
--      _record_punch_internal already takes its entry-dating timezone
--      from this function (the Phase 1 plug-in point), so server-side
--      punch dating follows the office setting with no further change.
--
-- Frontend in the same PR: the app's display timezone stops being a
-- hardcoded constant — a module-level setter fed once from org context
-- (chosen over threading a parameter through ~50 call sites), synced
-- on shell mount. entry_date derivation on the client remained
-- display-only after Phase 1; the RPC owns entry dating.
--
-- DEPLOY NOTES (GitHub merges deploy nothing in this repo):
--   * Apply this migration, then publish the frontend. No edge
--     functions change (process-location-event resolves dates through
--     _record_punch_internal since Phase 1).
--   * Verification probes: supabase/tests/org_timezone_probes.sql
-- ============================================================

ALTER TABLE public.org_practice_settings
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/New_York';

ALTER TABLE public.employees
  ALTER COLUMN timezone DROP NOT NULL,
  ALTER COLUMN timezone DROP DEFAULT;

-- Rows holding the old column default carry no information — they were
-- never a deliberate choice. NULL = inherit the office timezone (which
-- itself defaults to the same value, so nothing changes today).
UPDATE public.employees
   SET timezone = NULL
 WHERE timezone = 'America/New_York';

CREATE OR REPLACE FUNCTION public.get_user_timezone(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- Explicit per-person override, when set.
    (SELECT e.timezone FROM public.employees e WHERE e.user_id = p_user_id AND e.timezone IS NOT NULL LIMIT 1),
    -- The office timezone.
    (SELECT ops.timezone
       FROM public.employees e
       JOIN public.org_practice_settings ops ON ops.org_id = e.org_id
      WHERE e.user_id = p_user_id
      LIMIT 1),
    -- Legacy fallbacks, kept for accounts predating the org setting.
    (SELECT sv.timezone FROM public.schedule_versions sv
     WHERE sv.user_id = p_user_id
     ORDER BY sv.effective_start_date DESC LIMIT 1),
    (SELECT ps.timezone FROM public.pto_settings ps WHERE ps.user_id = p_user_id),
    'America/New_York'
  );
$$;
