-- Lock down direct client access to the attendance recompute engine.
REVOKE EXECUTE ON FUNCTION public.recompute_attendance_range(uuid, date, date) FROM authenticated, anon, public;

-- Authorized entry point for clients: self, or an admin/manager of the target's org.
CREATE OR REPLACE FUNCTION public.request_attendance_recompute(
  p_user_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_org_id uuid;
  v_days int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Missing arguments' USING ERRCODE = '22023';
  END IF;
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'end_date must be on or after start_date' USING ERRCODE = '22023';
  END IF;

  v_days := (p_end_date - p_start_date);
  IF v_days > 400 THEN
    RAISE EXCEPTION 'Range too large (max 400 days)' USING ERRCODE = '22023';
  END IF;

  IF p_user_id <> v_caller THEN
    SELECT e.org_id INTO v_org_id FROM public.employees e WHERE e.user_id = p_user_id LIMIT 1;
    IF v_org_id IS NULL OR NOT public.is_org_admin(v_org_id) THEN
      RAISE EXCEPTION 'Not authorized to recompute attendance for this user' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN public.recompute_attendance_range(p_user_id, p_start_date, p_end_date);
END;
$$;

REVOKE ALL ON FUNCTION public.request_attendance_recompute(uuid, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_attendance_recompute(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_attendance_recompute(uuid, date, date) TO service_role;