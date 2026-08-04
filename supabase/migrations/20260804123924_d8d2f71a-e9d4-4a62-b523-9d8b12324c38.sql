-- Security hardening required by the production publish gate.
--
-- Attendance recomputation is a privileged write operation. Keep the existing
-- calculation body private, and expose the historical function name only as a
-- guarded wrapper so callers cannot choose an arbitrary employee.

DO $$
BEGIN
  IF to_regprocedure('public._recompute_attendance_range_internal(uuid,date,date)') IS NULL THEN
    ALTER FUNCTION public.recompute_attendance_range(uuid, date, date)
      RENAME TO _recompute_attendance_range_internal;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._recompute_attendance_range_internal(uuid, date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._recompute_attendance_range_internal(uuid, date, date)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recompute_attendance_range(
  p_user_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_jwt_role text := COALESCE(auth.role(), '');
  v_org_id uuid;
  v_range_days integer;
BEGIN
  IF p_user_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Missing attendance recompute arguments'
      USING ERRCODE = '22023';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'end_date must be on or after start_date'
      USING ERRCODE = '22023';
  END IF;

  v_range_days := p_end_date - p_start_date;
  IF v_range_days > 400 THEN
    RAISE EXCEPTION 'Attendance recompute range is limited to 400 days'
      USING ERRCODE = '22023';
  END IF;

  SELECT e.org_id INTO v_org_id
  FROM public.employees e
  WHERE e.user_id = p_user_id
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Attendance employee not found'
      USING ERRCODE = '22023';
  END IF;

  -- Direct database maintenance and service-role jobs are trusted system
  -- paths. Normal authenticated requests may recompute only themselves or a
  -- member of an office they actively administer.
  IF session_user IN ('postgres', 'supabase_admin') OR v_jwt_role = 'service_role' THEN
    NULL;
  ELSIF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = '42501';
  ELSIF p_user_id = v_caller THEN
    NULL;
  ELSIF NOT public.is_org_admin(v_org_id) THEN
    RAISE EXCEPTION 'Not authorized to recompute attendance for this employee'
      USING ERRCODE = '42501';
  END IF;

  RETURN public._recompute_attendance_range_internal(
    p_user_id,
    p_start_date,
    p_end_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_attendance_range(uuid, date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_attendance_range(uuid, date, date)
  TO service_role;

COMMENT ON FUNCTION public.recompute_attendance_range(uuid, date, date) IS
  'Guarded attendance recomputation entry point. Employee self-service, office admins, service-role jobs, and trusted database maintenance only.';
COMMENT ON FUNCTION public._recompute_attendance_range_internal(uuid, date, date) IS
  'Private attendance calculation body. Invoke through recompute_attendance_range or request_attendance_recompute.';