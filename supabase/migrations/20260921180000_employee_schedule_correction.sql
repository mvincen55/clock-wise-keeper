-- In-place schedule corrections were four separate client writes: the version
-- row, each weekday row, the assignment row, then the correction log. The
-- form showed the ASSIGNMENT's dates but the save copied them onto the
-- VERSION, so a version whose stored range no longer matched its assignment
-- (closed on Sep 6 by a self-service version starting Sep 7 that never
-- received an assignment, while the first assignment stayed open) was silently
-- reopened and collided with the newer version:
--   conflicting key value violates exclusion constraint
--   "no_overlapping_schedule_versions"
-- and the Team page could not even show the schedule it collided with.
--
-- One transactional RPC now performs the correction:
--   * the acting manager's office is checked against the employee's, exactly
--     as create_employee_schedule does;
--   * the corrected range is validated against every OTHER version of the
--     employee with the same inclusive-day rule as the constraint, before
--     anything is written, and the rejection names the other schedule's dates;
--   * the version, its weekday rules, and its assignment are written together
--     or not at all. A version with no assignment receives one, and an earlier
--     assignment that drifted past its own closed version is brought back to
--     its version's dates, so the two tables agree again;
--   * the correction log row is written in the same transaction.
-- The recompute triggers on the three schedule tables recalculate attendance
-- for the affected days as before.
--
-- DEPLOY NOTES (GitHub merges deploy nothing in this repo): apply this
-- migration BEFORE publishing the frontend that calls it. Probes:
-- supabase/tests/employee_schedule_probes.sql (final section).

CREATE OR REPLACE FUNCTION public.correct_employee_schedule(
  p_version_id uuid, p_start date, p_end date, p_name text,
  p_apply_to_remote boolean, p_weekdays jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE
  v public.schedule_versions;
  e public.employees;
  other record;
  d jsonb;
  v_range daterange;
  v_old jsonb;
  v_assignments integer;
BEGIN
  SELECT * INTO v FROM public.schedule_versions WHERE id=p_version_id FOR UPDATE;
  IF NOT FOUND OR v.employee_id IS NULL THEN
    RAISE EXCEPTION 'This schedule could not be found' USING ERRCODE='22023';
  END IF;
  SELECT * INTO e FROM public.employees WHERE id=v.employee_id AND org_id=v.org_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_org_admin(e.org_id) THEN
    RAISE EXCEPTION 'Only an office owner or manager can correct schedules' USING ERRCODE='42501';
  END IF;
  IF p_start IS NULL OR p_end < p_start THEN
    RAISE EXCEPTION 'End date must be on or after start date' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_weekdays) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Weekday rules are required' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_weekdays) w WHERE (w->>'enabled')::boolean) THEN
    RAISE EXCEPTION 'At least one weekday must be enabled' USING ERRCODE='22023';
  END IF;
  v_range := daterange(p_start, coalesce(p_end,'9999-12-31'::date), '[]');

  -- The same inclusive-day rule as no_overlapping_schedule_versions, applied
  -- before any write so the manager learns WHICH schedule is in the way.
  SELECT s.effective_start_date, s.effective_end_date INTO other
    FROM public.schedule_versions s
   WHERE s.employee_id=e.id AND s.id<>v.id
     AND daterange(s.effective_start_date, coalesce(s.effective_end_date,'9999-12-31'::date), '[]') && v_range
   ORDER BY s.effective_start_date LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'These dates overlap another schedule for this employee (% to %). Edit or remove that schedule first.',
      to_char(other.effective_start_date,'FMMon FMDD, YYYY'),
      coalesce(to_char(other.effective_end_date,'FMMon FMDD, YYYY'),'present')
      USING ERRCODE='22023';
  END IF;

  v_old := jsonb_build_object(
    'name', v.name,
    'effective_start_date', v.effective_start_date,
    'effective_end_date', v.effective_end_date,
    'apply_to_remote', v.apply_to_remote,
    'weekdays', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'weekday', w.weekday, 'enabled', w.enabled, 'start_time', w.start_time, 'end_time', w.end_time,
        'grace_minutes', w.grace_minutes, 'threshold_minutes', w.threshold_minutes) ORDER BY w.weekday), '[]'::jsonb)
      FROM public.schedule_weekdays w WHERE w.schedule_version_id=v.id),
    'assignments', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'effective_start', a.effective_start, 'effective_end', a.effective_end) ORDER BY a.effective_start), '[]'::jsonb)
      FROM public.schedule_assignments a WHERE a.schedule_version_id=v.id));

  UPDATE public.schedule_versions
     SET name=nullif(trim(p_name),''), effective_start_date=p_start, effective_end_date=p_end,
         apply_to_remote=coalesce(p_apply_to_remote,false)
   WHERE id=v.id;

  FOR d IN SELECT * FROM jsonb_array_elements(p_weekdays) LOOP
    UPDATE public.schedule_weekdays
       SET enabled=(d->>'enabled')::boolean,
           start_time=coalesce((d->>'start_time')::time, start_time),
           end_time=coalesce((d->>'end_time')::time, end_time),
           grace_minutes=greatest(0,coalesce((d->>'grace_minutes')::integer,0)),
           threshold_minutes=1
     WHERE schedule_version_id=v.id AND weekday=(d->>'weekday')::smallint;
    IF NOT FOUND THEN
      INSERT INTO public.schedule_weekdays (schedule_version_id,weekday,enabled,start_time,end_time,grace_minutes,threshold_minutes)
      VALUES (v.id,(d->>'weekday')::smallint,(d->>'enabled')::boolean,
              coalesce((d->>'start_time')::time,'08:00'::time), coalesce((d->>'end_time')::time,'17:00'::time),
              greatest(0,coalesce((d->>'grace_minutes')::integer,0)),1);
    END IF;
  END LOOP;

  -- Assignments mirror their versions. Another assignment of this employee
  -- that still reaches into the corrected range belongs to a version that does
  -- not (the check above would have raised otherwise): it drifted, so bring it
  -- back to its own version's dates before this version's assignment moves.
  BEGIN
    FOR other IN
      SELECT a.id, s.effective_start_date, s.effective_end_date
        FROM public.schedule_assignments a
        JOIN public.schedule_versions s ON s.id=a.schedule_version_id
       WHERE a.employee_id=e.id AND s.id<>v.id
         AND daterange(a.effective_start, coalesce(a.effective_end,'9999-12-31'::date), '[]') && v_range
    LOOP
      UPDATE public.schedule_assignments
         SET effective_start=other.effective_start_date, effective_end=other.effective_end_date
       WHERE id=other.id;
    END LOOP;

    UPDATE public.schedule_assignments SET effective_start=p_start, effective_end=p_end
     WHERE schedule_version_id=v.id;
    GET DIAGNOSTICS v_assignments = ROW_COUNT;
    IF v_assignments = 0 THEN
      INSERT INTO public.schedule_assignments (org_id,employee_id,schedule_version_id,effective_start,effective_end)
      VALUES (e.org_id,e.id,v.id,p_start,p_end);
    END IF;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'This employee''s schedule history no longer lines up with its schedules. Remove the schedule that is not needed and try again.'
      USING ERRCODE='22023';
  END;

  INSERT INTO public.schedule_correction_log (version_id, org_id, employee_id, edited_by, old_values, new_values)
  VALUES (v.id, e.org_id, e.id, auth.uid(), v_old, jsonb_build_object(
    'name', nullif(trim(p_name),''),
    'effective_start_date', p_start,
    'effective_end_date', p_end,
    'apply_to_remote', coalesce(p_apply_to_remote,false),
    'weekdays', p_weekdays,
    'assignment_effective_start', p_start,
    'assignment_effective_end', p_end));

  RETURN v.id;
END $$;
REVOKE ALL ON FUNCTION public.correct_employee_schedule(uuid,date,date,text,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.correct_employee_schedule(uuid,date,date,text,boolean,jsonb) TO authenticated,service_role;
