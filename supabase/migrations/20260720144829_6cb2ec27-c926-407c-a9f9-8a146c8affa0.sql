-- Employee-experience + integrity pass (applied live via Lovable MCP on 2026-07-20,
-- mirrored here so repo migrations match the live schema).
--
-- Model: employees self-serve LOW-RISK workflow fields on their OWN rows
-- (remote flag, daily comment, tardy reason, missing-shift resolution);
-- punch times / totals / approvals stay locked and flow through
-- correction requests. Column discipline is enforced by BEFORE UPDATE
-- guard triggers, which bypass for admins and for SECURITY DEFINER
-- server-side recompute (current_user is not 'authenticated' there).
--
-- Also tightens legacy "Own ... ALL" policies on the INPUTS to attendance
-- computation (schedules, closures, payroll) so employees cannot alter the
-- data their tardiness/absence is judged against.

-- ============================================================
-- 1. attendance_exceptions: employees resolve their own exceptions
-- ============================================================
CREATE POLICY "Employees update own attendance_exceptions"
  ON public.attendance_exceptions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.guard_employee_exception_update()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Bypass for service role / SECURITY DEFINER contexts and org admins
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  IF public.is_org_admin(NEW.org_id) THEN RETURN NEW; END IF;
  IF NEW.user_id       IS DISTINCT FROM OLD.user_id
     OR NEW.org_id     IS DISTINCT FROM OLD.org_id
     OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
     OR NEW.exception_date IS DISTINCT FROM OLD.exception_date
     OR NEW.type       IS DISTINCT FROM OLD.type THEN
    RAISE EXCEPTION 'Employees may only update exception status/reason/resolution';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_employee_exception_update ON public.attendance_exceptions;
CREATE TRIGGER trg_guard_employee_exception_update
BEFORE UPDATE ON public.attendance_exceptions
FOR EACH ROW EXECUTE FUNCTION public.guard_employee_exception_update();

-- ============================================================
-- 2. tardies: employees may supply/update the REASON on their own rows;
--    everything else (minutes, approval, resolution) is admin/server-only
-- ============================================================
CREATE POLICY "Employees update own tardies"
  ON public.tardies FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.guard_employee_tardy_update()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  IF public.is_org_admin(NEW.org_id) THEN RETURN NEW; END IF;
  IF NEW.user_id            IS DISTINCT FROM OLD.user_id
     OR NEW.org_id          IS DISTINCT FROM OLD.org_id
     OR NEW.employee_id     IS DISTINCT FROM OLD.employee_id
     OR NEW.entry_date      IS DISTINCT FROM OLD.entry_date
     OR NEW.time_entry_id   IS DISTINCT FROM OLD.time_entry_id
     OR NEW.expected_start_time IS DISTINCT FROM OLD.expected_start_time
     OR NEW.actual_start_time   IS DISTINCT FROM OLD.actual_start_time
     OR NEW.minutes_late    IS DISTINCT FROM OLD.minutes_late
     OR NEW.approval_status IS DISTINCT FROM OLD.approval_status
     OR NEW.approved_by     IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at     IS DISTINCT FROM OLD.approved_at
     OR NEW.resolved        IS DISTINCT FROM OLD.resolved
     OR NEW.timezone_suspect IS DISTINCT FROM OLD.timezone_suspect THEN
    RAISE EXCEPTION 'Employees may only update the tardy reason';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_employee_tardy_update ON public.tardies;
CREATE TRIGGER trg_guard_employee_tardy_update
BEFORE UPDATE ON public.tardies
FOR EACH ROW EXECUTE FUNCTION public.guard_employee_tardy_update();

-- ============================================================
-- 3. time_entries: employees may update is_remote / entry_comment on their
--    own rows; totals, dates, and identity columns stay locked
-- ============================================================
CREATE POLICY "Employees update own time_entries"
  ON public.time_entries FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.guard_employee_time_entry_update()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- SECURITY DEFINER recompute (trigger_recompute_from_punch) and service
  -- role run as a non-'authenticated' role and pass straight through.
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  IF public.is_org_admin(NEW.org_id) THEN RETURN NEW; END IF;
  IF NEW.user_id          IS DISTINCT FROM OLD.user_id
     OR NEW.org_id        IS DISTINCT FROM OLD.org_id
     OR NEW.employee_id   IS DISTINCT FROM OLD.employee_id
     OR NEW.entry_date    IS DISTINCT FROM OLD.entry_date
     OR NEW.total_minutes IS DISTINCT FROM OLD.total_minutes
     OR NEW.source        IS DISTINCT FROM OLD.source
     OR NEW.employee_name IS DISTINCT FROM OLD.employee_name
     OR NEW.employee_code IS DISTINCT FROM OLD.employee_code
     OR NEW.raw_total_hhmm IS DISTINCT FROM OLD.raw_total_hhmm
     OR NEW.raw_text      IS DISTINCT FROM OLD.raw_text
     OR NEW.notes         IS DISTINCT FROM OLD.notes
     OR NEW.created_by    IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Employees may only update the remote flag and daily comment';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_employee_time_entry_update ON public.time_entries;
CREATE TRIGGER trg_guard_employee_time_entry_update
BEFORE UPDATE ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_employee_time_entry_update();

-- ============================================================
-- 4. Integrity tightening: attendance-computation inputs become read-only
--    for employees (admins manage them)
-- ============================================================

-- work_schedule (legacy fallback read by recompute; no org_id column)
DROP POLICY IF EXISTS "Own work_schedule" ON public.work_schedule;
CREATE POLICY "Own work_schedule select"
  ON public.work_schedule FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Org admin work_schedule"
  ON public.work_schedule FOR ALL
  USING (EXISTS (SELECT 1 FROM public.employees e
                 WHERE e.user_id = work_schedule.user_id AND public.is_org_admin(e.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.employees e
                      WHERE e.user_id = work_schedule.user_id AND public.is_org_admin(e.org_id)));

-- schedule_versions / schedule_weekdays ("Org admin ..." ALL policies already exist)
DROP POLICY IF EXISTS "Own schedule_versions" ON public.schedule_versions;
CREATE POLICY "Own schedule_versions select"
  ON public.schedule_versions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Own schedule_weekdays" ON public.schedule_weekdays;
CREATE POLICY "Own schedule_weekdays select"
  ON public.schedule_weekdays FOR SELECT
  USING (public.user_owns_schedule_version(schedule_version_id));

-- office_closures: org-wide read for members, admin-managed writes
DROP POLICY IF EXISTS "Own office_closures" ON public.office_closures;
CREATE POLICY "Members read closures"
  ON public.office_closures FOR SELECT
  USING (auth.uid() = user_id OR (org_id IS NOT NULL AND public.is_org_member(org_id)));

-- payroll_summaries / payroll_settings: employees read own, admins manage
DROP POLICY IF EXISTS "Own payroll_summaries" ON public.payroll_summaries;
CREATE POLICY "Own payroll_summaries select"
  ON public.payroll_summaries FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Own payroll_settings" ON public.payroll_settings;
CREATE POLICY "Own payroll_settings select"
  ON public.payroll_settings FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- 4b. org_members: members may see WHO their org's admins are (active
--     owner/manager rows only). Request flows (correction/PTO/change)
--     look these up to notify managers — with own-row-only visibility the
--     lookup returned empty and no notification was ever created.
-- ============================================================
CREATE POLICY "Members see org admin memberships"
  ON public.org_members FOR SELECT
  USING (public.is_org_member(org_id) AND role IN ('owner','manager') AND status = 'active');

-- ============================================================
-- 5. recompute_attendance_range: office closures apply ORG-WIDE
--    (STEP 2 now also matches closures created by an admin for the org,
--    so each employee no longer needs a personal copy of the holiday list)
-- ============================================================
-- Full function body is replaced; the only change from the previous version
-- is the v_is_closed lookup in STEP 2.
CREATE OR REPLACE FUNCTION public.recompute_attendance_range(p_user_id uuid, p_start_date date, p_end_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cur_date date;
  v_sched record;
  v_is_scheduled boolean;
  v_sched_start time;
  v_sched_end time;
  v_grace int;
  v_threshold int;
  v_apply_remote boolean;
  v_is_closed boolean;
  v_has_day_off boolean;
  v_day_off_type text;
  v_entry record;
  v_punch_count int;
  v_has_punches boolean;
  v_is_remote boolean;
  v_first_in timestamptz;
  v_first_in_local timestamp;
  v_first_in_local_time time;
  v_last_out_local_time time;
  v_is_absent boolean;
  v_is_incomplete boolean;
  v_is_late boolean;
  v_minutes_late int;
  v_has_edits boolean;
  v_has_day_comment boolean;
  v_tardy_status text;
  v_row_count int := 0;
  v_diff_min int;
  v_last_type text;
  v_tz text;
  v_tz_suspect boolean;
  v_sched_start_minutes int;
  v_actual_minutes int;
  v_all_verified boolean;
  v_status_code text;
  v_status_reasons jsonb;
  v_total_minutes int;
  v_recompute_version constant int := 3;
  v_employee_id uuid;
  v_org_id uuid;
BEGIN
  -- Resolve employee_id and org_id from user_id
  SELECT e.id, e.org_id INTO v_employee_id, v_org_id
  FROM public.employees e
  WHERE e.user_id = p_user_id
  LIMIT 1;

  v_tz := public.get_user_timezone(p_user_id);

  cur_date := p_start_date;

  WHILE cur_date <= p_end_date LOOP
    v_is_scheduled := false;
    v_sched_start := null;
    v_sched_end := null;
    v_grace := 0;
    v_threshold := 1;
    v_apply_remote := false;
    v_tz_suspect := false;
    v_all_verified := false;
    v_is_absent := false;
    v_is_incomplete := false;
    v_is_late := false;
    v_minutes_late := 0;
    v_status_code := 'ok';
    v_status_reasons := '{}'::jsonb;
    v_total_minutes := 0;
    v_day_off_type := null;
    v_last_out_local_time := null;

    -- STEP 1: Resolve schedule
    SELECT * INTO v_sched FROM public.get_schedule_for_date(p_user_id, cur_date);
    IF FOUND AND v_sched.enabled THEN
      v_is_scheduled := true;
      v_sched_start := v_sched.start_time;
      v_sched_end := v_sched.end_time;
      v_grace := COALESCE(v_sched.grace_minutes, 0);
      v_threshold := COALESCE(v_sched.threshold_minutes, 1);
      v_apply_remote := COALESCE(v_sched.apply_to_remote, false);
    ELSE
      SELECT * INTO v_sched FROM public.work_schedule ws
        WHERE ws.user_id = p_user_id AND ws.weekday = EXTRACT(DOW FROM cur_date)::smallint
        LIMIT 1;
      IF FOUND AND v_sched.enabled THEN
        v_is_scheduled := true;
        v_sched_start := v_sched.start_time;
        v_sched_end := v_sched.end_time;
        v_grace := COALESCE(v_sched.grace_minutes, 0);
        v_threshold := COALESCE(v_sched.threshold_minutes, 1);
        v_apply_remote := COALESCE(v_sched.apply_to_remote, false);
      END IF;
    END IF;

    -- STEP 2: Check office closure (own rows OR org-wide rows)
    v_is_closed := EXISTS (
      SELECT 1 FROM public.office_closures
      WHERE closure_date = cur_date
        AND (user_id = p_user_id OR (v_org_id IS NOT NULL AND org_id = v_org_id))
    );
    IF NOT v_is_closed THEN
      v_is_closed := EXISTS (
        SELECT 1 FROM public.days_off
        WHERE user_id = p_user_id
          AND date_start <= cur_date AND date_end >= cur_date
          AND type = 'office_closed'
      );
    END IF;

    -- STEP 3: Check day off
    SELECT d.type INTO v_day_off_type
    FROM public.days_off d
    WHERE d.user_id = p_user_id
      AND d.date_start <= cur_date AND d.date_end >= cur_date
      AND d.type != 'office_closed'
    LIMIT 1;
    v_has_day_off := v_day_off_type IS NOT NULL;

    -- STEP 4: Get time entry and punch data
    SELECT * INTO v_entry FROM public.time_entries te
    WHERE te.user_id = p_user_id AND te.entry_date = cur_date LIMIT 1;

    v_has_punches := false;
    v_is_remote := false;
    v_has_day_comment := false;
    v_has_edits := false;
    v_first_in := null;
    v_first_in_local := null;
    v_first_in_local_time := null;
    v_punch_count := 0;

    IF v_entry.id IS NOT NULL THEN
      v_is_remote := COALESCE(v_entry.is_remote, false);
      v_has_day_comment := v_entry.entry_comment IS NOT NULL AND v_entry.entry_comment <> '';
      v_total_minutes := COALESCE(v_entry.total_minutes, 0);

      SELECT COUNT(*) INTO v_punch_count FROM public.punches WHERE time_entry_id = v_entry.id;
      v_has_punches := v_punch_count > 0;

      IF v_has_punches THEN
        v_has_edits := EXISTS (SELECT 1 FROM public.punches WHERE time_entry_id = v_entry.id AND is_edited = true);

        SELECT NOT EXISTS (
          SELECT 1 FROM public.punches WHERE time_entry_id = v_entry.id AND time_verified = false
        ) INTO v_all_verified;

        SELECT p.punch_time,
               p.punch_time AT TIME ZONE v_tz,
               (p.punch_time AT TIME ZONE v_tz)::time
          INTO v_first_in, v_first_in_local, v_first_in_local_time
          FROM public.punches p
          WHERE p.time_entry_id = v_entry.id
            AND p.punch_type = 'in'
            AND (p.punch_time AT TIME ZONE v_tz)::date = cur_date
          ORDER BY p.punch_time ASC LIMIT 1;

        IF v_first_in IS NULL THEN
          SELECT p.punch_time,
                 p.punch_time AT TIME ZONE v_tz,
                 (p.punch_time AT TIME ZONE v_tz)::time
            INTO v_first_in, v_first_in_local, v_first_in_local_time
            FROM public.punches p
            WHERE p.time_entry_id = v_entry.id AND p.punch_type = 'in'
            ORDER BY p.punch_time ASC LIMIT 1;
        END IF;

        SELECT (p.punch_time AT TIME ZONE v_tz)::time
          INTO v_last_out_local_time
          FROM public.punches p
          WHERE p.time_entry_id = v_entry.id AND p.punch_type = 'out'
          ORDER BY p.punch_time DESC LIMIT 1;

        IF v_punch_count % 2 != 0 THEN
          v_is_incomplete := true;
        ELSE
          SELECT p.punch_type INTO v_last_type FROM public.punches p
            WHERE p.time_entry_id = v_entry.id ORDER BY p.seq DESC LIMIT 1;
          IF v_last_type = 'in' THEN v_is_incomplete := true; END IF;
        END IF;
      END IF;
    END IF;

    -- STEP 5: PRECEDENCE LOGIC
    IF v_is_closed THEN
      v_status_code := 'closure'; v_is_absent := false; v_is_late := false; v_is_incomplete := false;
    ELSIF v_has_day_off AND v_day_off_type IN ('scheduled_with_notice', 'medical_leave', 'other') THEN
      v_status_code := 'day_off'; v_is_absent := false; v_is_late := false; v_is_incomplete := false;
    ELSIF v_has_day_off AND v_day_off_type = 'unscheduled' THEN
      v_status_code := 'absent'; v_is_absent := true; v_is_late := false; v_is_incomplete := false;
    ELSIF NOT v_is_scheduled THEN
      v_status_code := 'unscheduled'; v_is_absent := false; v_is_late := false; v_is_incomplete := false;
    ELSE
      IF NOT v_has_punches THEN
        v_is_absent := true; v_status_code := 'absent';
      ELSE
        IF NOT v_all_verified AND v_first_in_local_time IS NOT NULL AND v_sched_start IS NOT NULL THEN
          IF (v_first_in_local_time < '03:00:00'::time OR v_first_in_local_time > '23:00:00'::time) THEN
            v_sched_start_minutes := EXTRACT(HOUR FROM v_sched_start) * 60 + EXTRACT(MINUTE FROM v_sched_start);
            v_actual_minutes := EXTRACT(HOUR FROM v_first_in_local_time) * 60 + EXTRACT(MINUTE FROM v_first_in_local_time);
            IF ABS(v_actual_minutes - v_sched_start_minutes) > 480 THEN v_tz_suspect := true; END IF;
          END IF;
        END IF;

        IF NOT v_tz_suspect AND v_sched_start IS NOT NULL AND v_first_in_local_time IS NOT NULL THEN
          IF NOT v_is_remote OR v_apply_remote THEN
            v_diff_min := CEIL(EXTRACT(EPOCH FROM (
              v_first_in_local_time - (v_sched_start + (v_grace * interval '1 minute'))::time
            )) / 60);
            IF v_diff_min >= v_threshold THEN v_is_late := true; v_minutes_late := v_diff_min; END IF;
          END IF;
        END IF;

        IF v_tz_suspect THEN v_status_code := 'timezone_suspect';
        ELSIF v_is_late THEN v_status_code := 'late';
        ELSIF v_is_incomplete THEN v_status_code := 'incomplete';
        ELSIF v_is_remote THEN v_status_code := 'remote_ok';
        ELSE v_status_code := 'ok'; END IF;
      END IF;
    END IF;

    -- STEP 6: status_reasons
    v_status_reasons := jsonb_build_object(
      'schedule_start', v_sched_start, 'schedule_end', v_sched_end,
      'first_punch', v_first_in_local_time, 'last_punch', v_last_out_local_time,
      'grace_minutes', v_grace, 'computed_minutes_late', v_minutes_late,
      'computed_minutes_worked', v_total_minutes, 'timezone', v_tz,
      'timezone_suspect', v_tz_suspect, 'day_off_type', v_day_off_type,
      'punch_count', v_punch_count, 'is_scheduled', v_is_scheduled,
      'recomputed_at', now()
    );

    -- STEP 7: Tardy upsert
    IF v_is_late AND v_first_in IS NOT NULL AND v_sched_start IS NOT NULL THEN
      INSERT INTO public.tardies (
        user_id, org_id, employee_id, entry_date, time_entry_id,
        expected_start_time, actual_start_time, minutes_late, timezone_suspect
      ) VALUES (
        p_user_id, v_org_id, COALESCE(v_employee_id, p_user_id::uuid), cur_date, v_entry.id,
        v_sched_start, v_first_in, v_minutes_late, false
      )
      ON CONFLICT (user_id, entry_date) DO UPDATE SET
        time_entry_id = EXCLUDED.time_entry_id,
        expected_start_time = EXCLUDED.expected_start_time,
        actual_start_time = EXCLUDED.actual_start_time,
        minutes_late = EXCLUDED.minutes_late,
        timezone_suspect = false, updated_at = now();
    ELSIF v_tz_suspect AND v_first_in IS NOT NULL AND v_sched_start IS NOT NULL THEN
      INSERT INTO public.tardies (
        user_id, org_id, employee_id, entry_date, time_entry_id,
        expected_start_time, actual_start_time, minutes_late, timezone_suspect
      ) VALUES (
        p_user_id, v_org_id, COALESCE(v_employee_id, p_user_id::uuid), cur_date, v_entry.id,
        v_sched_start, v_first_in, 0, true
      )
      ON CONFLICT (user_id, entry_date) DO UPDATE SET
        time_entry_id = EXCLUDED.time_entry_id,
        expected_start_time = EXCLUDED.expected_start_time,
        actual_start_time = EXCLUDED.actual_start_time,
        minutes_late = 0, timezone_suspect = true, updated_at = now();
    ELSE
      DELETE FROM public.tardies
        WHERE user_id = p_user_id AND entry_date = cur_date
        AND approval_status = 'unreviewed';
    END IF;

    SELECT t.approval_status INTO v_tardy_status FROM public.tardies t
      WHERE t.user_id = p_user_id AND t.entry_date = cur_date LIMIT 1;
    IF v_tardy_status IS NULL THEN v_tardy_status := 'unreviewed'; END IF;

    -- STEP 8: Upsert attendance_day_status with org_id + employee_id
    INSERT INTO public.attendance_day_status (
      user_id, org_id, employee_id, entry_date,
      schedule_expected_start, schedule_expected_end,
      is_scheduled_day, office_closed, has_punches, is_remote,
      is_absent, is_incomplete, is_late, minutes_late,
      tardy_approval_status, has_edits, has_day_comment, has_day_off,
      timezone_suspect, status_code, status_reasons, recompute_version, computed_at
    ) VALUES (
      p_user_id, v_org_id, COALESCE(v_employee_id, p_user_id::uuid), cur_date,
      v_sched_start, v_sched_end,
      v_is_scheduled, v_is_closed, v_has_punches, v_is_remote,
      v_is_absent, v_is_incomplete, v_is_late, v_minutes_late,
      v_tardy_status, v_has_edits, v_has_day_comment, v_has_day_off,
      v_tz_suspect, v_status_code, v_status_reasons, v_recompute_version, now()
    )
    ON CONFLICT (user_id, entry_date) DO UPDATE SET
      org_id = EXCLUDED.org_id, employee_id = EXCLUDED.employee_id,
      schedule_expected_start = EXCLUDED.schedule_expected_start,
      schedule_expected_end = EXCLUDED.schedule_expected_end,
      is_scheduled_day = EXCLUDED.is_scheduled_day,
      office_closed = EXCLUDED.office_closed,
      has_punches = EXCLUDED.has_punches, is_remote = EXCLUDED.is_remote,
      is_absent = EXCLUDED.is_absent, is_incomplete = EXCLUDED.is_incomplete,
      is_late = EXCLUDED.is_late, minutes_late = EXCLUDED.minutes_late,
      tardy_approval_status = EXCLUDED.tardy_approval_status,
      has_edits = EXCLUDED.has_edits, has_day_comment = EXCLUDED.has_day_comment,
      has_day_off = EXCLUDED.has_day_off, timezone_suspect = EXCLUDED.timezone_suspect,
      status_code = EXCLUDED.status_code, status_reasons = EXCLUDED.status_reasons,
      recompute_version = EXCLUDED.recompute_version, computed_at = now();

    v_row_count := v_row_count + 1;
    cur_date := cur_date + 1;
  END LOOP;

  RETURN v_row_count;
END;
$function$;
