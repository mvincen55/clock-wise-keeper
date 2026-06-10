
-- ============================================================
-- PART A: Schedule-table triggers + helper
-- ============================================================

-- Helper: bounded recompute for a single user. Applies:
--   * skip if user has no punches
--   * lower-bound at earliest punch/time-entry date
--   * upper-bound at today in the user's timezone
CREATE OR REPLACE FUNCTION public._recompute_schedule_window(
  p_user_id uuid,
  p_start date,
  p_end date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
  v_today date;
  v_earliest date;
  v_start date;
  v_end date;
BEGIN
  IF p_user_id IS NULL OR p_start IS NULL THEN RETURN; END IF;

  v_tz := public.get_user_timezone(p_user_id);
  v_today := (now() AT TIME ZONE v_tz)::date;

  -- earliest data point for this user
  SELECT LEAST(
    (SELECT MIN(entry_date) FROM public.time_entries WHERE user_id = p_user_id),
    (SELECT MIN(te.entry_date) FROM public.punches p
       JOIN public.time_entries te ON te.id = p.time_entry_id
      WHERE te.user_id = p_user_id)
  ) INTO v_earliest;

  -- no data -> nothing to recompute
  IF v_earliest IS NULL THEN RETURN; END IF;

  v_start := GREATEST(p_start, v_earliest);
  v_end := LEAST(COALESCE(p_end, v_today), v_today);

  IF v_start > v_end THEN RETURN; END IF;

  PERFORM public.recompute_attendance_range(p_user_id, v_start, v_end);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._recompute_schedule_window(uuid,date,date) FROM anon, authenticated, PUBLIC;

-- ----- schedule_versions -----
CREATE OR REPLACE FUNCTION public.trigger_recompute_from_schedule_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_start date;
  v_end date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.user_id IS NOT NULL THEN
      PERFORM public._recompute_schedule_window(OLD.user_id, OLD.effective_start_date, OLD.effective_end_date);
    END IF;
    -- also recompute for any assignment-linked employees
    PERFORM public._recompute_schedule_window(e.user_id, OLD.effective_start_date, OLD.effective_end_date)
    FROM public.schedule_assignments sa
    JOIN public.employees e ON e.id = sa.employee_id
    WHERE sa.schedule_version_id = OLD.id;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NOT NULL THEN
      PERFORM public._recompute_schedule_window(NEW.user_id, NEW.effective_start_date, NEW.effective_end_date);
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: union of OLD and NEW ranges
  v_start := LEAST(OLD.effective_start_date, NEW.effective_start_date);
  v_end := GREATEST(
    COALESCE(OLD.effective_end_date, 'infinity'::date),
    COALESCE(NEW.effective_end_date, 'infinity'::date)
  );
  IF v_end = 'infinity'::date THEN v_end := NULL; END IF;

  IF NEW.user_id IS NOT NULL THEN
    PERFORM public._recompute_schedule_window(NEW.user_id, v_start, v_end);
  END IF;
  -- assignment-linked employees too
  PERFORM public._recompute_schedule_window(e.user_id, v_start, v_end)
  FROM public.schedule_assignments sa
  JOIN public.employees e ON e.id = sa.employee_id
  WHERE sa.schedule_version_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_from_schedule_version ON public.schedule_versions;
CREATE TRIGGER trg_recompute_from_schedule_version
AFTER INSERT OR UPDATE OR DELETE ON public.schedule_versions
FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_from_schedule_version();

-- ----- schedule_weekdays -----
CREATE OR REPLACE FUNCTION public.trigger_recompute_from_schedule_weekday()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version_id uuid;
  v_start date;
  v_end date;
  v_owner uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_version_id := OLD.schedule_version_id;
  ELSE
    v_version_id := NEW.schedule_version_id;
  END IF;

  SELECT sv.user_id, sv.effective_start_date, sv.effective_end_date
    INTO v_owner, v_start, v_end
  FROM public.schedule_versions sv
  WHERE sv.id = v_version_id;

  IF v_owner IS NOT NULL THEN
    PERFORM public._recompute_schedule_window(v_owner, v_start, v_end);
  END IF;

  PERFORM public._recompute_schedule_window(e.user_id, v_start, v_end)
  FROM public.schedule_assignments sa
  JOIN public.employees e ON e.id = sa.employee_id
  WHERE sa.schedule_version_id = v_version_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_from_schedule_weekday ON public.schedule_weekdays;
CREATE TRIGGER trg_recompute_from_schedule_weekday
AFTER INSERT OR UPDATE OR DELETE ON public.schedule_weekdays
FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_from_schedule_weekday();

-- ----- schedule_assignments -----
CREATE OR REPLACE FUNCTION public.trigger_recompute_from_schedule_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_start date;
  v_end date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT e.user_id INTO v_user FROM public.employees e WHERE e.id = OLD.employee_id;
    IF v_user IS NOT NULL THEN
      PERFORM public._recompute_schedule_window(v_user, OLD.effective_start, OLD.effective_end);
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT e.user_id INTO v_user FROM public.employees e WHERE e.id = NEW.employee_id;
    IF v_user IS NOT NULL THEN
      PERFORM public._recompute_schedule_window(v_user, NEW.effective_start, NEW.effective_end);
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  v_start := LEAST(OLD.effective_start, NEW.effective_start);
  v_end := GREATEST(
    COALESCE(OLD.effective_end, 'infinity'::date),
    COALESCE(NEW.effective_end, 'infinity'::date)
  );
  IF v_end = 'infinity'::date THEN v_end := NULL; END IF;

  -- If employee_id changed, recompute both
  IF OLD.employee_id IS DISTINCT FROM NEW.employee_id THEN
    SELECT e.user_id INTO v_user FROM public.employees e WHERE e.id = OLD.employee_id;
    IF v_user IS NOT NULL THEN
      PERFORM public._recompute_schedule_window(v_user, OLD.effective_start, OLD.effective_end);
    END IF;
  END IF;

  SELECT e.user_id INTO v_user FROM public.employees e WHERE e.id = NEW.employee_id;
  IF v_user IS NOT NULL THEN
    PERFORM public._recompute_schedule_window(v_user, v_start, v_end);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_from_schedule_assignment ON public.schedule_assignments;
CREATE TRIGGER trg_recompute_from_schedule_assignment
AFTER INSERT OR UPDATE OR DELETE ON public.schedule_assignments
FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_from_schedule_assignment();

-- ============================================================
-- PART B: One-time snapshot + historical backfill
-- ============================================================

-- 1) Snapshot (do not drop)
DROP TABLE IF EXISTS public.attendance_day_status_backup_pre_schedule_fix;
CREATE TABLE public.attendance_day_status_backup_pre_schedule_fix AS
  SELECT * FROM public.attendance_day_status;

-- Lock the backup down (audit-only, service_role).
REVOKE ALL ON public.attendance_day_status_backup_pre_schedule_fix FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.attendance_day_status_backup_pre_schedule_fix TO service_role;
ALTER TABLE public.attendance_day_status_backup_pre_schedule_fix ENABLE ROW LEVEL SECURITY;
-- no policies = no client access; service_role bypasses RLS.

-- 2) Per-employee backfill loop
DO $$
DECLARE
  r record;
  v_earliest date;
  v_today date;
  v_tz text;
BEGIN
  FOR r IN
    SELECT DISTINCT e.user_id
    FROM public.employees e
    WHERE e.user_id IS NOT NULL
  LOOP
    v_tz := public.get_user_timezone(r.user_id);
    v_today := (now() AT TIME ZONE v_tz)::date;

    SELECT LEAST(
      (SELECT MIN(entry_date) FROM public.time_entries WHERE user_id = r.user_id),
      (SELECT MIN(te.entry_date) FROM public.punches p
         JOIN public.time_entries te ON te.id = p.time_entry_id
        WHERE te.user_id = r.user_id)
    ) INTO v_earliest;

    IF v_earliest IS NOT NULL AND v_earliest <= v_today THEN
      PERFORM public.recompute_attendance_range(r.user_id, v_earliest, v_today);
    END IF;
  END LOOP;
END $$;

-- 3) Purge stray future rows (in case any existed prior to this fix)
DELETE FROM public.attendance_day_status a
USING (
  SELECT DISTINCT user_id, ((now() AT TIME ZONE public.get_user_timezone(user_id))::date) AS today
  FROM public.attendance_day_status
) t
WHERE a.user_id = t.user_id AND a.entry_date > t.today;
