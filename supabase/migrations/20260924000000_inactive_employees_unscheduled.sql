-- A person who is no longer active has no schedule.
--
-- The attendance engine reads schedules through get_schedule_for_date, which
-- looked only at schedule assignments and never at employees.employment_status.
-- Archiving a person (employment_status inactive or terminated) left their
-- assignment open, so every scheduled day after they left kept recomputing as
-- absent, counted in Team Attendance, and reached Attention as a nameless row
-- (Attention names people from the active roster). Two archived people carried
-- 26 such days.
--
-- Now:
--  - get_schedule_for_date returns nothing for a login whose employee records
--    are all inactive or terminated, so the engine records those days as
--    unscheduled. A login with no employee record at all keeps the old
--    behaviour.
--  - a change of employment_status recomputes the person's recent window, so
--    the rows change the moment someone is archived or restored.
--  - the recent window is recomputed once here for everyone not active today.

CREATE OR REPLACE FUNCTION public.get_schedule_for_date(p_user_id uuid, p_date date)
RETURNS TABLE(
  version_id uuid, version_name text,
  effective_start_date date, effective_end_date date,
  apply_to_remote boolean, timezone text,
  weekday smallint, enabled boolean,
  start_time time, end_time time,
  grace_minutes integer, threshold_minutes integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result record;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.org_members target
      WHERE target.user_id = p_user_id
        AND target.status = 'active'
        AND public.is_org_admin(target.org_id)
    ) THEN
      RETURN;
    END IF;
  END IF;

  -- Not active any more: no schedule on any date. A login without an employee
  -- record is left as before.
  IF EXISTS (SELECT 1 FROM public.employees e WHERE e.user_id = p_user_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.employees e
       WHERE e.user_id = p_user_id AND e.employment_status = 'active'
     ) THEN
    RETURN;
  END IF;

  SELECT
    sv.id AS version_id, sv.name AS version_name,
    sv.effective_start_date, sv.effective_end_date,
    sv.apply_to_remote, sv.timezone,
    sw.weekday, sw.enabled,
    sw.start_time, sw.end_time,
    sw.grace_minutes, sw.threshold_minutes
  INTO v_result
  FROM public.employees e
  JOIN public.schedule_assignments sa ON sa.employee_id = e.id
  JOIN public.schedule_versions sv ON sv.id = sa.schedule_version_id
  JOIN public.schedule_weekdays sw ON sw.schedule_version_id = sv.id
  WHERE e.user_id = p_user_id
    AND sa.effective_start <= p_date
    AND (sa.effective_end IS NULL OR sa.effective_end >= p_date)
    AND sv.effective_start_date <= p_date
    AND (sv.effective_end_date IS NULL OR sv.effective_end_date >= p_date)
    AND sw.weekday = EXTRACT(DOW FROM p_date)::SMALLINT
  ORDER BY sa.effective_start DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_result.version_id, v_result.version_name,
      v_result.effective_start_date, v_result.effective_end_date,
      v_result.apply_to_remote, v_result.timezone,
      v_result.weekday, v_result.enabled,
      v_result.start_time, v_result.end_time,
      v_result.grace_minutes, v_result.threshold_minutes;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    sv.id, sv.name,
    sv.effective_start_date, sv.effective_end_date,
    sv.apply_to_remote, sv.timezone,
    sw.weekday, sw.enabled,
    sw.start_time, sw.end_time,
    sw.grace_minutes, sw.threshold_minutes
  FROM public.schedule_versions sv
  JOIN public.schedule_weekdays sw ON sw.schedule_version_id = sv.id
  WHERE sv.user_id = p_user_id
    AND sv.effective_start_date <= p_date
    AND (sv.effective_end_date IS NULL OR sv.effective_end_date >= p_date)
    AND sw.weekday = EXTRACT(DOW FROM p_date)::SMALLINT
  ORDER BY sv.effective_start_date DESC
  LIMIT 1;
END;
$function$;

-- Archiving or restoring someone re-reads their recent window right away.
CREATE OR REPLACE FUNCTION public.trigger_recompute_from_employment_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    PERFORM public._recompute_attendance_range_internal(NEW.user_id, current_date - 90, current_date + 30);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.trigger_recompute_from_employment_status() FROM anon, authenticated, PUBLIC;
DROP TRIGGER IF EXISTS trg_recompute_employment_status ON public.employees;
CREATE TRIGGER trg_recompute_employment_status
AFTER UPDATE OF employment_status ON public.employees
FOR EACH ROW WHEN (OLD.employment_status IS DISTINCT FROM NEW.employment_status)
EXECUTE FUNCTION public.trigger_recompute_from_employment_status();

-- Backfill: everyone not active today gets their recent window re-read, so
-- days already recorded as absent after they left become unscheduled.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT e.user_id
      FROM public.employees e
     WHERE e.user_id IS NOT NULL
       AND e.employment_status <> 'active'
       AND NOT EXISTS (
         SELECT 1 FROM public.employees a
         WHERE a.user_id = e.user_id AND a.employment_status = 'active'
       )
  LOOP
    PERFORM public._recompute_attendance_range_internal(r.user_id, current_date - 90, current_date + 30);
  END LOOP;
END $$;
