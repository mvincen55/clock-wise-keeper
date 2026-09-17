-- ============================================================
-- TARDIES DEFAULT TO UNAPPROVED; EMPLOYEES ASK TO BE EXCUSED
--
-- Office policy (owner, Sep 2026): a late arrival is unexcused unless a
-- manager excuses it. The old default status 'unreviewed' read as
-- neutral, so every automatically detected tardy now lands as
-- 'unapproved'. What 'unreviewed' used to carry — "no person has decided
-- yet" — moves to reviewed_at / reviewed_by, stamped by every manager
-- decision. The attendance engine's cleanup (a day that is no longer
-- late drops its automatic tardy) keys on that stamp instead of the
-- status, and attendance_day_status mirrors it as tardy_reviewed for the
-- dashboard's "needs a look" counts.
--
-- Employees ask a manager to excuse a tardy through
-- tardy_approval_requests (one waiting request per tardy). The table is
-- written only through RPCs; clients read it under RLS.
--   request_tardy_approval(p_tardy_id, p_reason)            employee
--   decide_tardy_approval_request(p_request_id, p_approve, p_note) manager
--   review_tardy(p_tardy_id, p_status, p_reason)             manager, direct
-- Each decision updates the tardy in the same transaction, and the
-- existing AFTER UPDATE trigger on tardies re-syncs attendance_day_status.
--
-- Order matters inside this file: the engine and the reason rule are
-- replaced BEFORE the backfill, so the recomputes the backfill triggers
-- already apply the new cleanup rule (stale automatic tardies on days
-- that are no longer late disappear as part of this migration).
--
-- DEPLOY NOTES (GitHub merges apply nothing in this repo): apply this
-- migration, then publish the frontend. Older clients keep working —
-- they never set approval_status when inserting.
-- Verification probes: supabase/tests/tardy_approval_probes.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columns: who decided, and when; the dashboard mirror
-- ------------------------------------------------------------
ALTER TABLE public.tardies
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE public.attendance_day_status
  ADD COLUMN IF NOT EXISTS tardy_reviewed boolean NOT NULL DEFAULT false;

-- ------------------------------------------------------------
-- 2. A reason is required once a person has decided (or excused) the
--    tardy — never for the automatic row the engine writes.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_tardy_reason()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.approval_status = 'approved' OR NEW.reviewed_at IS NOT NULL THEN
    IF NEW.reason_text IS NULL OR length(trim(NEW.reason_text)) = 0 THEN
      RAISE EXCEPTION 'reason_text is required when a tardy is approved or reviewed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_tardy_reason ON public.tardies;
CREATE TRIGGER trg_validate_tardy_reason
  BEFORE INSERT OR UPDATE ON public.tardies
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_tardy_reason();

-- ------------------------------------------------------------
-- 3. Employees still only touch their own reason; the decision stamps
--    join the locked columns.
-- ------------------------------------------------------------
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
     OR NEW.reviewed_by     IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at     IS DISTINCT FROM OLD.reviewed_at
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

-- ------------------------------------------------------------
-- 4. The attendance engine: same body as 20260910121000, with the
--    cleanup keyed on reviewed_at and tardy_reviewed mirrored.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._recompute_attendance_range_internal(p_user_id uuid, p_start_date date, p_end_date date)
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
  v_tardy_reviewed boolean;
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
  v_recompute_version constant int := 4;
  v_employee_id uuid;
  v_org_id uuid;
BEGIN
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

    SELECT d.type INTO v_day_off_type
    FROM public.days_off d
    WHERE d.user_id = p_user_id
      AND d.date_start <= cur_date AND d.date_end >= cur_date
      AND d.type != 'office_closed'
    LIMIT 1;
    v_has_day_off := v_day_off_type IS NOT NULL;

    SELECT * INTO v_entry FROM public.time_entries te
    WHERE te.user_id = p_user_id AND te.employee_id = v_employee_id AND te.entry_date = cur_date LIMIT 1;

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

      SELECT COUNT(*) INTO v_punch_count FROM public.punches
        WHERE time_entry_id = v_entry.id AND voided_at IS NULL;
      v_has_punches := v_punch_count > 0;

      IF v_has_punches THEN
        v_has_edits := EXISTS (
          SELECT 1 FROM public.punches
          WHERE time_entry_id = v_entry.id AND voided_at IS NULL AND is_edited = true
        );

        SELECT NOT EXISTS (
          SELECT 1 FROM public.punches
          WHERE time_entry_id = v_entry.id AND voided_at IS NULL AND time_verified = false
        ) INTO v_all_verified;

        SELECT p.punch_time,
               p.punch_time AT TIME ZONE v_tz,
               (p.punch_time AT TIME ZONE v_tz)::time
          INTO v_first_in, v_first_in_local, v_first_in_local_time
          FROM public.punches p
          WHERE p.time_entry_id = v_entry.id
            AND p.voided_at IS NULL
            AND p.punch_type = 'in'
            AND (p.punch_time AT TIME ZONE v_tz)::date = cur_date
          ORDER BY p.punch_time ASC LIMIT 1;

        IF v_first_in IS NULL THEN
          SELECT p.punch_time,
                 p.punch_time AT TIME ZONE v_tz,
                 (p.punch_time AT TIME ZONE v_tz)::time
            INTO v_first_in, v_first_in_local, v_first_in_local_time
            FROM public.punches p
            WHERE p.time_entry_id = v_entry.id AND p.voided_at IS NULL AND p.punch_type = 'in'
            ORDER BY p.punch_time ASC LIMIT 1;
        END IF;

        SELECT (p.punch_time AT TIME ZONE v_tz)::time
          INTO v_last_out_local_time
          FROM public.punches p
          WHERE p.time_entry_id = v_entry.id AND p.voided_at IS NULL AND p.punch_type = 'out'
          ORDER BY p.punch_time DESC LIMIT 1;

        IF v_punch_count % 2 != 0 THEN
          v_is_incomplete := true;
        ELSE
          SELECT p.punch_type INTO v_last_type FROM public.punches p
            WHERE p.time_entry_id = v_entry.id AND p.voided_at IS NULL
            ORDER BY p.seq DESC LIMIT 1;
          IF v_last_type = 'in' THEN v_is_incomplete := true; END IF;
        END IF;
      END IF;
    END IF;

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

    v_status_reasons := jsonb_build_object(
      'schedule_start', v_sched_start, 'schedule_end', v_sched_end,
      'first_punch', v_first_in_local_time, 'last_punch', v_last_out_local_time,
      'grace_minutes', v_grace, 'computed_minutes_late', v_minutes_late,
      'computed_minutes_worked', v_total_minutes, 'timezone', v_tz,
      'timezone_suspect', v_tz_suspect, 'day_off_type', v_day_off_type,
      'punch_count', v_punch_count, 'is_scheduled', v_is_scheduled,
      'recomputed_at', now()
    );

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
      -- A day that is no longer late drops its automatic tardy. A row a
      -- manager has decided (reviewed_at set) is a record and stays.
      DELETE FROM public.tardies
        WHERE user_id = p_user_id AND entry_date = cur_date
        AND reviewed_at IS NULL AND approval_status <> 'approved';
    END IF;

    v_tardy_status := NULL;
    v_tardy_reviewed := false;
    SELECT t.approval_status, (t.reviewed_at IS NOT NULL)
      INTO v_tardy_status, v_tardy_reviewed
      FROM public.tardies t
      WHERE t.user_id = p_user_id AND t.entry_date = cur_date LIMIT 1;
    -- 'unreviewed' here still means "no tardy row for this day".
    IF v_tardy_status IS NULL THEN v_tardy_status := 'unreviewed'; v_tardy_reviewed := false; END IF;

    INSERT INTO public.attendance_day_status (
      user_id, org_id, employee_id, entry_date,
      schedule_expected_start, schedule_expected_end,
      is_scheduled_day, office_closed, has_punches, is_remote,
      is_absent, is_incomplete, is_late, minutes_late,
      tardy_approval_status, tardy_reviewed, has_edits, has_day_comment, has_day_off,
      timezone_suspect, status_code, status_reasons, recompute_version, computed_at
    ) VALUES (
      p_user_id, v_org_id, COALESCE(v_employee_id, p_user_id::uuid), cur_date,
      v_sched_start, v_sched_end,
      v_is_scheduled, v_is_closed, v_has_punches, v_is_remote,
      v_is_absent, v_is_incomplete, v_is_late, v_minutes_late,
      v_tardy_status, v_tardy_reviewed, v_has_edits, v_has_day_comment, v_has_day_off,
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
      tardy_reviewed = EXCLUDED.tardy_reviewed,
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

-- ------------------------------------------------------------
-- 5. Backfill, then the new default and the tighter status set.
--    Decided rows keep their decision (stamped from approved_at, else
--    the last update). Untouched 'unreviewed' rows become 'unapproved'
--    with no stamp; the recompute each one triggers applies the new
--    cleanup rule.
-- ------------------------------------------------------------
UPDATE public.tardies
   SET reviewed_at = COALESCE(approved_at, updated_at),
       reviewed_by = approved_by
 WHERE approval_status IN ('approved', 'unapproved')
   AND reviewed_at IS NULL;

UPDATE public.tardies
   SET approval_status = 'unapproved'
 WHERE approval_status = 'unreviewed';

ALTER TABLE public.tardies ALTER COLUMN approval_status SET DEFAULT 'unapproved';
ALTER TABLE public.tardies DROP CONSTRAINT IF EXISTS tardies_approval_status_check;
ALTER TABLE public.tardies
  ADD CONSTRAINT tardies_approval_status_check
  CHECK (approval_status IN ('approved', 'unapproved'));

-- ------------------------------------------------------------
-- 6. Approval requests: one waiting request per tardy, RPC-only writes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tardy_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  tardy_id uuid NOT NULL REFERENCES public.tardies(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  requested_by uuid NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) >= 1),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tardy_approval_requests_one_pending_uidx
  ON public.tardy_approval_requests(tardy_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_tardy_approval_requests_org_status
  ON public.tardy_approval_requests(org_id, status);
CREATE INDEX IF NOT EXISTS idx_tardy_approval_requests_requested_by
  ON public.tardy_approval_requests(requested_by);

ALTER TABLE public.tardy_approval_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employees and admins read tardy approval requests" ON public.tardy_approval_requests;
CREATE POLICY "Employees and admins read tardy approval requests"
  ON public.tardy_approval_requests FOR SELECT TO authenticated
  USING (auth.uid() = requested_by OR public.is_org_admin(org_id));

REVOKE INSERT, UPDATE, DELETE ON public.tardy_approval_requests FROM authenticated, anon;
GRANT SELECT ON public.tardy_approval_requests TO authenticated;
GRANT ALL ON public.tardy_approval_requests TO service_role;

DROP TRIGGER IF EXISTS update_tardy_approval_requests_updated_at ON public.tardy_approval_requests;
CREATE TRIGGER update_tardy_approval_requests_updated_at
  BEFORE UPDATE ON public.tardy_approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- 7. The employee asks. Their explanation becomes the tardy's reason,
--    and every active owner and manager is told.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_tardy_approval(p_tardy_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_t record;
  v_req_id uuid;
  v_name text;
  v_mgr record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Tell your manager what happened before asking for approval' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_t FROM public.tardies WHERE id = p_tardy_id FOR UPDATE;
  IF NOT FOUND OR v_t.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Tardy not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_t.approval_status = 'approved' THEN
    RAISE EXCEPTION 'This late arrival is already approved' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tardy_approval_requests
              WHERE tardy_id = p_tardy_id AND status = 'pending') THEN
    RAISE EXCEPTION 'A request for this late arrival is already waiting on a manager' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.tardy_approval_requests (org_id, employee_id, tardy_id, entry_date, requested_by, reason)
  VALUES (v_t.org_id, v_t.employee_id, v_t.id, v_t.entry_date, auth.uid(), trim(p_reason))
  RETURNING id INTO v_req_id;

  UPDATE public.tardies SET reason_text = trim(p_reason) WHERE id = p_tardy_id;

  SELECT COALESCE(NULLIF(e.preferred_name, ''), e.display_name, 'A team member')
    INTO v_name FROM public.employees e WHERE e.id = v_t.employee_id;

  FOR v_mgr IN
    SELECT m.user_id FROM public.org_members m
     WHERE m.org_id = v_t.org_id AND m.status = 'active'
       AND m.role IN ('owner', 'manager') AND m.user_id <> auth.uid()
  LOOP
    INSERT INTO public.notifications
      (org_id, recipient_user_id, actor_user_id, notification_type, title, message, related_table, related_id)
    VALUES
      (v_t.org_id, v_mgr.user_id, auth.uid(), 'tardy_request_new', 'Tardy approval requested',
       format('%s asked you to excuse a late arrival on %s', COALESCE(v_name, 'A team member'), to_char(v_t.entry_date, 'Mon FMDD')),
       'tardy_approval_requests', v_req_id);
  END LOOP;

  RETURN v_req_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_tardy_approval(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_tardy_approval(uuid, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 8. A manager decides a waiting request. The tardy follows in the
--    same transaction; the employee is told.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_tardy_approval_request(p_request_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_r record;
  v_note text := NULLIF(trim(COALESCE(p_note, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_r FROM public.tardy_approval_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_org_admin(v_r.org_id) THEN
    RAISE EXCEPTION 'Only an office owner or manager can decide a tardy approval request' USING ERRCODE = '42501';
  END IF;
  IF v_r.status <> 'pending' THEN
    RAISE EXCEPTION 'This request was already decided' USING ERRCODE = '22023';
  END IF;
  IF NOT p_approve AND v_note IS NULL THEN
    RAISE EXCEPTION 'Say why the request is denied' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tardy_approval_requests
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'denied' END,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
   WHERE id = p_request_id;

  UPDATE public.tardies
     SET approval_status = CASE WHEN p_approve THEN 'approved' ELSE 'unapproved' END,
         approved_by = CASE WHEN p_approve THEN auth.uid() END,
         approved_at = CASE WHEN p_approve THEN now() END,
         reviewed_by = auth.uid(), reviewed_at = now(),
         reason_text = COALESCE(NULLIF(trim(COALESCE(reason_text, '')), ''), v_r.reason)
   WHERE id = v_r.tardy_id;

  IF v_r.requested_by <> auth.uid() THEN
    INSERT INTO public.notifications
      (org_id, recipient_user_id, actor_user_id, notification_type, title, message, related_table, related_id)
    VALUES
      (v_r.org_id, v_r.requested_by, auth.uid(),
       CASE WHEN p_approve THEN 'tardy_request_approved' ELSE 'tardy_request_denied' END,
       CASE WHEN p_approve THEN 'Late arrival excused' ELSE 'Late arrival not excused' END,
       format('Your late arrival on %s was %s%s', to_char(v_r.entry_date, 'Mon FMDD'),
              CASE WHEN p_approve THEN 'approved' ELSE 'denied' END,
              CASE WHEN v_note IS NULL THEN '' ELSE ': ' || v_note END),
       'tardy_approval_requests', p_request_id);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decide_tardy_approval_request(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_tardy_approval_request(uuid, boolean, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 9. A manager decides straight from the tardy (the Review button). A
--    waiting request is answered by the same decision.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_tardy(p_tardy_id uuid, p_status text, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_t record;
  v_req record;
  v_approve boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('approved', 'unapproved') THEN
    RAISE EXCEPTION 'Unknown decision "%"', p_status USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A reason is required to review a tardy' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_t FROM public.tardies WHERE id = p_tardy_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tardy not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_org_admin(v_t.org_id) THEN
    RAISE EXCEPTION 'Only an office owner or manager can review a tardy' USING ERRCODE = '42501';
  END IF;
  v_approve := p_status = 'approved';

  UPDATE public.tardies
     SET approval_status = p_status,
         approved_by = CASE WHEN v_approve THEN auth.uid() END,
         approved_at = CASE WHEN v_approve THEN now() END,
         reviewed_by = auth.uid(), reviewed_at = now(),
         reason_text = trim(p_reason)
   WHERE id = p_tardy_id;

  FOR v_req IN
    SELECT * FROM public.tardy_approval_requests
     WHERE tardy_id = p_tardy_id AND status = 'pending' FOR UPDATE
  LOOP
    UPDATE public.tardy_approval_requests
       SET status = CASE WHEN v_approve THEN 'approved' ELSE 'denied' END,
           reviewed_by = auth.uid(), reviewed_at = now(), review_note = trim(p_reason)
     WHERE id = v_req.id;

    IF v_req.requested_by <> auth.uid() THEN
      INSERT INTO public.notifications
        (org_id, recipient_user_id, actor_user_id, notification_type, title, message, related_table, related_id)
      VALUES
        (v_req.org_id, v_req.requested_by, auth.uid(),
         CASE WHEN v_approve THEN 'tardy_request_approved' ELSE 'tardy_request_denied' END,
         CASE WHEN v_approve THEN 'Late arrival excused' ELSE 'Late arrival not excused' END,
         format('Your late arrival on %s was %s: %s', to_char(v_req.entry_date, 'Mon FMDD'),
                CASE WHEN v_approve THEN 'approved' ELSE 'denied' END, trim(p_reason)),
         'tardy_approval_requests', v_req.id);
    END IF;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_tardy(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_tardy(uuid, text, text) TO authenticated, service_role;
