-- ============================================================
-- PHASE 3: VOID, NOT DELETE
-- (Time Clock Legitimacy Hardening — see audits/time-clock-preflight.md)
--
-- FLSA retention is 2 years for time cards and 3 for payroll records.
-- Punch rows get voided, never destroyed:
--   1. punches gains voided_at / voided_by / void_reason. A voided
--      punch keeps its seq (never renumbered) and stays on the record;
--      it just stops counting.
--   2. Every computation ignores voided rows: the pairing recompute
--      (trigger_recompute_from_punch), the attendance internal
--      (_recompute_attendance_range_internal — punch count, edits,
--      verification, first-in, last-out, incomplete check), and the
--      punch RPC core (_record_punch_internal — alternation and
--      midnight continuation read the last NON-VOIDED punch; seq
--      assignment still takes MAX over ALL punches so a new punch can
--      never collide with a voided one's seq).
--   3. BEFORE DELETE triggers on punches and time_entries raise
--      unconditionally — service role included, same posture as the
--      Phase 2 audit triggers. The ON DELETE CASCADE FK from
--      time_entries stays as-is and simply becomes unreachable.
--
-- Also in this phase (frontend + edge function, same PR):
--   * The punch editor's delete becomes a void (reason required);
--     the client .delete() path is gone, and the client seq re-sort
--     loop is removed (renumbering returns in Phase 4's RPC, assigned
--     past MAX(seq) so it can never collide with voided seqs).
--   * confirm-import's overwrite re-import voids instead of deleting,
--     and ALL import punch inserts now take seq starting at
--     MAX(existing seq)+1 — this also fixes a Phase 1 regression where
--     merge-strategy imports could collide with the new unique index
--     and silently drop punches.
--
-- DEPLOY NOTES (GitHub merges deploy nothing in this repo):
--   * Apply this migration, then deploy confirm-import, then publish
--     the frontend. Ordering is soft this time: old clients keep
--     working except punch deletion, which errors honestly instead of
--     destroying rows.
--   * Verification probes: supabase/tests/void_not_delete_probes.sql
-- ============================================================

ALTER TABLE public.punches
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS void_reason text;

-- ------------------------------------------------------------
-- 1. No row destruction. One guard for both time-record tables.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.time_records_no_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'TIME_RECORD_DELETE_FORBIDDEN: % rows are never deleted — void punches instead (voided_at/voided_by/void_reason)', TG_TABLE_NAME
    USING ERRCODE = '42501',
          HINT = 'FLSA retention: time records are corrected by voiding and re-recording, not by destruction.';
END;
$$;

DROP TRIGGER IF EXISTS trg_punches_no_delete ON public.punches;
CREATE TRIGGER trg_punches_no_delete
BEFORE DELETE ON public.punches
FOR EACH ROW EXECUTE FUNCTION public.time_records_no_delete();

DROP TRIGGER IF EXISTS trg_time_entries_no_delete ON public.time_entries;
CREATE TRIGGER trg_time_entries_no_delete
BEFORE DELETE ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.time_records_no_delete();

-- ------------------------------------------------------------
-- 2. Pairing recompute ignores voided punches.
--    (Body from 20260707182446 with the voided filter added.)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_recompute_from_punch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_date date;
  v_user_id uuid;
  v_entry_id uuid;
  v_total_min int;
BEGIN
  IF TG_OP = 'DELETE' THEN v_entry_id := OLD.time_entry_id;
  ELSE v_entry_id := NEW.time_entry_id;
  END IF;

  SELECT te.entry_date, te.user_id INTO v_entry_date, v_user_id
    FROM public.time_entries te WHERE te.id = v_entry_id;

  -- Recompute total_minutes from paired in/out sequence (non-voided only)
  IF v_entry_id IS NOT NULL THEN
    WITH ordered AS (
      SELECT punch_type, punch_time,
             row_number() OVER (ORDER BY seq, punch_time) AS rn
        FROM public.punches
       WHERE time_entry_id = v_entry_id
         AND voided_at IS NULL
    ),
    paired AS (
      SELECT a.punch_time AS in_time, b.punch_time AS out_time
        FROM ordered a
        JOIN ordered b ON b.rn = a.rn + 1
       WHERE a.punch_type = 'in' AND b.punch_type = 'out' AND a.rn % 2 = 1
    )
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (out_time - in_time)) / 60)::int, 0)
      INTO v_total_min FROM paired;

    UPDATE public.time_entries
       SET total_minutes = v_total_min
     WHERE id = v_entry_id;
  END IF;

  IF v_entry_date IS NOT NULL AND v_user_id IS NOT NULL THEN
    PERFORM public.recompute_attendance_range(v_user_id, v_entry_date, v_entry_date);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- ------------------------------------------------------------
-- 3. The punch RPC core reads the last NON-VOIDED punch everywhere
--    (alternation, today-entry check, midnight continuation); seq
--    assignment still spans ALL punches so it can never collide with a
--    voided punch's kept seq. Full replace; only the three last-punch
--    lookups changed from 20260814120000.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._record_punch_internal(
  p_employee_id uuid,
  p_action text,
  p_source text DEFAULT 'manual',
  p_punch_time timestamptz DEFAULT NULL,
  p_low_confidence boolean DEFAULT false,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_actor uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp record;
  v_now timestamptz;
  v_tz text;
  v_today date;
  v_entry_date date;
  v_entry_id uuid;
  v_today_entry_id uuid;
  v_yday_entry_id uuid;
  v_last_type public.punch_type;
  v_yday_last_type public.punch_type;
  v_yday_last_time timestamptz;
  v_seq integer;
  v_punch record;
  v_punch_type public.punch_type;
  v_event_type text;
BEGIN
  IF p_action NOT IN ('clock_in', 'clock_out') THEN
    RAISE EXCEPTION 'PUNCH_BAD_ACTION: unknown action "%"', p_action USING ERRCODE = '22023';
  END IF;

  SELECT e.id, e.org_id, e.user_id INTO v_emp
    FROM public.employees e
   WHERE e.id = p_employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PUNCH_NO_EMPLOYEE: employee record not found' USING ERRCODE = '22023';
  END IF;
  IF v_emp.user_id IS NULL THEN
    RAISE EXCEPTION 'PUNCH_UNLINKED_EMPLOYEE: employee has no linked account' USING ERRCODE = '22023';
  END IF;

  v_punch_type := CASE WHEN p_action = 'clock_in' THEN 'in'::public.punch_type ELSE 'out'::public.punch_type END;
  v_now := date_trunc('minute', COALESCE(p_punch_time, now()));
  v_tz := COALESCE(public.get_user_timezone(v_emp.user_id), 'America/New_York');
  v_today := (v_now AT TIME ZONE v_tz)::date;
  v_entry_date := v_today;

  IF p_action = 'clock_out' THEN
    SELECT te.id INTO v_today_entry_id
      FROM public.time_entries te
     WHERE te.employee_id = p_employee_id AND te.entry_date = v_today;

    IF v_today_entry_id IS NOT NULL THEN
      SELECT p.punch_type INTO v_last_type
        FROM public.punches p
       WHERE p.time_entry_id = v_today_entry_id
         AND p.voided_at IS NULL
       ORDER BY p.seq DESC
       LIMIT 1;
    END IF;

    IF v_today_entry_id IS NOT NULL AND v_last_type = 'in' THEN
      v_entry_id := v_today_entry_id;
    ELSE
      SELECT te.id INTO v_yday_entry_id
        FROM public.time_entries te
       WHERE te.employee_id = p_employee_id AND te.entry_date = v_today - 1;

      IF v_yday_entry_id IS NOT NULL THEN
        SELECT p.punch_type, p.punch_time INTO v_yday_last_type, v_yday_last_time
          FROM public.punches p
         WHERE p.time_entry_id = v_yday_entry_id
           AND p.voided_at IS NULL
         ORDER BY p.seq DESC
         LIMIT 1;

        IF v_yday_last_type = 'in' AND v_now - v_yday_last_time < interval '16 hours' THEN
          v_entry_id := v_yday_entry_id;
          v_entry_date := v_today - 1;
        END IF;
      END IF;

      IF v_entry_id IS NULL THEN
        IF v_today_entry_id IS NOT NULL THEN
          v_entry_id := v_today_entry_id;
        ELSE
          RAISE EXCEPTION 'PUNCH_NO_OPEN_IN: no open clock-in to close' USING ERRCODE = 'P0001';
        END IF;
      END IF;
    END IF;
  END IF;

  IF v_entry_id IS NULL THEN
    INSERT INTO public.time_entries (user_id, org_id, employee_id, entry_date, source)
    VALUES (v_emp.user_id, v_emp.org_id, p_employee_id, v_entry_date, p_source::public.source_type)
    ON CONFLICT (employee_id, entry_date) DO NOTHING
    RETURNING id INTO v_entry_id;

    IF v_entry_id IS NULL THEN
      SELECT te.id INTO v_entry_id
        FROM public.time_entries te
       WHERE te.employee_id = p_employee_id AND te.entry_date = v_entry_date;
    END IF;
  END IF;

  PERFORM 1 FROM public.time_entries WHERE id = v_entry_id FOR UPDATE;

  v_last_type := NULL;
  SELECT p.punch_type INTO v_last_type
    FROM public.punches p
   WHERE p.time_entry_id = v_entry_id
     AND p.voided_at IS NULL
   ORDER BY p.seq DESC
   LIMIT 1;

  IF p_action = 'clock_in' AND v_last_type = 'in' THEN
    RAISE EXCEPTION 'PUNCH_ALREADY_IN: already clocked in' USING ERRCODE = 'P0001';
  END IF;
  IF p_action = 'clock_out' AND (v_last_type IS NULL OR v_last_type = 'out') THEN
    RAISE EXCEPTION 'PUNCH_NO_OPEN_IN: no open clock-in to close' USING ERRCODE = 'P0001';
  END IF;

  -- Seq spans ALL punches, voided included: voided punches keep their
  -- seq and new punches must never collide with them.
  SELECT COALESCE(MAX(p.seq), -1) + 1 INTO v_seq
    FROM public.punches p
   WHERE p.time_entry_id = v_entry_id;

  PERFORM set_config('purple.punch_audited', '1', true);

  INSERT INTO public.punches (
    time_entry_id, org_id, employee_id, seq, punch_type, punch_time,
    source, low_confidence, location_lat, location_lng
  ) VALUES (
    v_entry_id, v_emp.org_id, p_employee_id, v_seq, v_punch_type, v_now,
    p_source::public.source_type, COALESCE(p_low_confidence, false), p_lat, p_lng
  )
  RETURNING * INTO v_punch;

  PERFORM set_config('purple.punch_audited', '0', true);

  v_event_type := CASE
    WHEN p_source = 'auto_location' THEN 'auto_' || v_punch_type::text
    ELSE p_action
  END;

  INSERT INTO public.audit_events (
    user_id, org_id, employee_id, actor_id, event_type,
    action_type, target_table, target_id, after_json,
    event_details, related_date, related_entry_id
  ) VALUES (
    v_emp.user_id, v_emp.org_id, p_employee_id, COALESCE(p_actor, auth.uid()), v_event_type,
    'insert', 'punches', v_punch.id, to_jsonb(v_punch),
    jsonb_build_object(
      'punch_time', v_now,
      'seq', v_seq,
      'source', p_source,
      'target_employee_id', p_employee_id,
      'low_confidence', COALESCE(p_low_confidence, false)
    ),
    v_entry_date, v_entry_id
  );

  RETURN jsonb_build_object(
    'entry_id', v_entry_id,
    'punch_id', v_punch.id,
    'seq', v_seq,
    'punch_time', v_now,
    'entry_date', v_entry_date,
    'punch_type', v_punch_type
  );
END;
$$;

-- Grants are unchanged by CREATE OR REPLACE, but restate the intent so
-- this file stands alone if replayed on a fresh database.
REVOKE EXECUTE ON FUNCTION public._record_punch_internal(uuid, text, text, timestamptz, boolean, double precision, double precision, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._record_punch_internal(uuid, text, text, timestamptz, boolean, double precision, double precision, uuid)
  TO service_role;

-- ------------------------------------------------------------
-- 4. Attendance internal ignores voided punches: punch count,
--    edit/verification flags, first-in, last-out, incomplete check.
--    Full body from 20260720144829 (renamed by 20260804122000);
--    only the punch reads changed.
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

    -- STEP 4: Get time entry and punch data (voided punches never count)
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

REVOKE ALL ON FUNCTION public._recompute_attendance_range_internal(uuid, date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._recompute_attendance_range_internal(uuid, date, date)
  TO service_role;
