
-- PART A: Enable pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- PART C: Log table
CREATE TABLE IF NOT EXISTS public.attendance_sweep_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  employees_processed integer NOT NULL DEFAULT 0,
  employees_failed integer NOT NULL DEFAULT 0,
  error_details jsonb
);

GRANT ALL ON public.attendance_sweep_log TO service_role;

ALTER TABLE public.attendance_sweep_log ENABLE ROW LEVEL SECURITY;

-- Only org owners can read; service_role bypasses RLS automatically
CREATE POLICY "Org owners can read sweep log"
ON public.attendance_sweep_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = auth.uid()
      AND status = 'active'
      AND role = 'owner'
  )
);

-- PART B: Sweep function
CREATE OR REPLACE FUNCTION public.sweep_attendance(p_days integer DEFAULT 90)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
  v_emp record;
  v_earliest date;
  v_tz text;
  v_today date;
  v_start date;
  v_end date;
  v_processed int := 0;
  v_failed int := 0;
  v_errors jsonb := '[]'::jsonb;
BEGIN
  INSERT INTO public.attendance_sweep_log (started_at)
  VALUES (now())
  RETURNING id INTO v_log_id;

  FOR v_emp IN
    SELECT id, user_id
    FROM public.employees
    WHERE employment_status = 'active'
      AND user_id IS NOT NULL
  LOOP
    BEGIN
      SELECT MIN(entry_date) INTO v_earliest
      FROM public.time_entries
      WHERE user_id = v_emp.user_id;

      IF v_earliest IS NULL THEN
        CONTINUE;
      END IF;

      v_tz := public.get_user_timezone(v_emp.user_id);
      v_today := (now() AT TIME ZONE v_tz)::date;
      v_start := GREATEST(v_today - p_days, v_earliest);
      v_end := v_today;

      IF v_start > v_end THEN
        CONTINUE;
      END IF;

      PERFORM public.recompute_attendance_range(v_emp.user_id, v_start, v_end);
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object(
        'employee_id', v_emp.id,
        'user_id', v_emp.user_id,
        'error', SQLERRM,
        'sqlstate', SQLSTATE
      );
    END;
  END LOOP;

  UPDATE public.attendance_sweep_log
  SET finished_at = now(),
      employees_processed = v_processed,
      employees_failed = v_failed,
      error_details = CASE WHEN v_failed = 0 THEN NULL ELSE v_errors END
  WHERE id = v_log_id;

  RETURN v_log_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sweep_attendance(integer) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.sweep_attendance(integer) TO service_role;

-- PART D: Schedule
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nightly-attendance-sweep') THEN
    PERFORM cron.unschedule('nightly-attendance-sweep');
  END IF;
  PERFORM cron.schedule(
    'nightly-attendance-sweep',
    '30 7 * * *',
    $cron$SELECT public.sweep_attendance(90);$cron$
  );
END $$;
