
-- 1. Add explainability columns to attendance_day_status
ALTER TABLE public.attendance_day_status
  ADD COLUMN IF NOT EXISTS status_code text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS status_reasons jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS recompute_version integer NOT NULL DEFAULT 1;

-- 2. Enforce no overlapping schedule versions per user (unique constraint on user + date range)
-- We use a trigger-based approach since exclusion constraints on date ranges need btree_gist
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.schedule_versions
  DROP CONSTRAINT IF EXISTS no_overlapping_schedule_versions;

ALTER TABLE public.schedule_versions
  ADD CONSTRAINT no_overlapping_schedule_versions
  EXCLUDE USING gist (
    user_id WITH =,
    daterange(effective_start_date, COALESCE(effective_end_date, '9999-12-31'::date), '[]') WITH &&
  );

-- 3. Replace recompute_attendance_range with precedence-aware version
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
  v_recompute_version constant int := 2;
BEGIN
  v_tz := public.get_user_timezone(p_user_id);

  cur_date := p_start_date;
  
  WHILE cur_date <= p_end_date LOOP
    -- Reset all flags
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
    
    -- ═══════════════════════════════════════════════════
    -- STEP 1: Resolve schedule for this date
    -- ═══════════════════════════════════════════════════
    SELECT * INTO v_sched FROM public.get_schedule_for_date(p_user_id, cur_date);
    IF FOUND AND v_sched.enabled THEN
      v_is_scheduled := true;
      v_sched_start := v_sched.start_time;
      v_sched_end := v_sched.end_time;
      v_grace := COALESCE(v_sched.grace_minutes, 0);
      v_threshold := COALESCE(v_sched.threshold_minutes, 1);
      v_apply_remote := COALESCE(v_sched.apply_to_remote, false);
    ELSE
      -- Fallback to legacy work_schedule
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
    
    -- ═══════════════════════════════════════════════════
    -- STEP 2: Check office closure
    -- ═══════════════════════════════════════════════════
    v_is_closed := EXISTS (
      SELECT 1 FROM public.office_closures 
      WHERE user_id = p_user_id AND closure_date = cur_date
    );
    -- Also check legacy days_off type=office_closed
    IF NOT v_is_closed THEN
      v_is_closed := EXISTS (
        SELECT 1 FROM public.days_off 
        WHERE user_id = p_user_id 
          AND date_start <= cur_date AND date_end >= cur_date
          AND type = 'office_closed'
      );
    END IF;
    
    -- ═══════════════════════════════════════════════════
    -- STEP 3: Check day off (non-closure types)
    -- ═══════════════════════════════════════════════════
    SELECT d.type INTO v_day_off_type
    FROM public.days_off d
    WHERE d.user_id = p_user_id 
      AND d.date_start <= cur_date AND d.date_end >= cur_date
      AND d.type != 'office_closed'
    LIMIT 1;
    
    v_has_day_off := v_day_off_type IS NOT NULL;
    
    -- ═══════════════════════════════════════════════════
    -- STEP 4: Get time entry and punch data
    -- ═══════════════════════════════════════════════════
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
        
        -- Get earliest IN punch matching entry_date in local TZ
        SELECT p.punch_time, 
               p.punch_time AT TIME ZONE v_tz,
               (p.punch_time AT TIME ZONE v_tz)::time
          INTO v_first_in, v_first_in_local, v_first_in_local_time
          FROM public.punches p 
          WHERE p.time_entry_id = v_entry.id 
            AND p.punch_type = 'in'
            AND (p.punch_time AT TIME ZONE v_tz)::date = cur_date
          ORDER BY p.punch_time ASC LIMIT 1;
        
        -- Fallback if no date-matched IN punch
        IF v_first_in IS NULL THEN
          SELECT p.punch_time,
                 p.punch_time AT TIME ZONE v_tz,
                 (p.punch_time AT TIME ZONE v_tz)::time
            INTO v_first_in, v_first_in_local, v_first_in_local_time
            FROM public.punches p 
            WHERE p.time_entry_id = v_entry.id AND p.punch_type = 'in'
            ORDER BY p.punch_time ASC LIMIT 1;
        END IF;
        
        -- Get last OUT punch local time
        SELECT (p.punch_time AT TIME ZONE v_tz)::time
          INTO v_last_out_local_time
          FROM public.punches p
          WHERE p.time_entry_id = v_entry.id AND p.punch_type = 'out'
          ORDER BY p.punch_time DESC LIMIT 1;
        
        -- Incomplete check
        IF v_punch_count % 2 != 0 THEN
          v_is_incomplete := true;
        ELSE
          SELECT p.punch_type INTO v_last_type FROM public.punches p 
            WHERE p.time_entry_id = v_entry.id ORDER BY p.seq DESC LIMIT 1;
          IF v_last_type = 'in' THEN v_is_incomplete := true; END IF;
        END IF;
      END IF;
    END IF;
    
    -- ═══════════════════════════════════════════════════
    -- STEP 5: PRECEDENCE LOGIC (the truth table)
    -- ═══════════════════════════════════════════════════
    
    -- PRIORITY 1: Office closure beats everything
    IF v_is_closed THEN
      v_status_code := 'closure';
      v_is_absent := false;
      v_is_late := false;
      v_is_incomplete := false;
      -- Keep has_punches for "worked on closure" diagnostics
      
    -- PRIORITY 2: Planned day off (scheduled, medical, other) beats fault flags
    ELSIF v_has_day_off AND v_day_off_type IN ('scheduled_with_notice', 'medical_leave', 'other') THEN
      v_status_code := 'day_off';
      v_is_absent := false;
      v_is_late := false;
      v_is_incomplete := false;
      -- Keep has_punches for "worked on PTO day" detection
      
    -- PRIORITY 3: Unscheduled day off — still a problem day
    ELSIF v_has_day_off AND v_day_off_type = 'unscheduled' THEN
      v_status_code := 'absent';
      v_is_absent := true;
      v_is_late := false;
      v_is_incomplete := false;
      
    -- PRIORITY 4: No schedule for this date
    ELSIF NOT v_is_scheduled THEN
      v_status_code := 'unscheduled';
      v_is_absent := false;
      v_is_late := false;
      v_is_incomplete := false;
      
    -- PRIORITY 5: Evaluate punches against schedule
    ELSE
      -- No punches = absent
      IF NOT v_has_punches THEN
        v_is_absent := true;
        v_status_code := 'absent';
      ELSE
        -- Timezone suspect detection (skip if all verified)
        IF NOT v_all_verified AND v_first_in_local_time IS NOT NULL AND v_sched_start IS NOT NULL THEN
          IF (v_first_in_local_time < '03:00:00'::time OR v_first_in_local_time > '23:00:00'::time) THEN
            v_sched_start_minutes := EXTRACT(HOUR FROM v_sched_start) * 60 + EXTRACT(MINUTE FROM v_sched_start);
            v_actual_minutes := EXTRACT(HOUR FROM v_first_in_local_time) * 60 + EXTRACT(MINUTE FROM v_first_in_local_time);
            IF ABS(v_actual_minutes - v_sched_start_minutes) > 480 THEN
              v_tz_suspect := true;
            END IF;
          END IF;
        END IF;
        
        -- Late detection (skip if timezone suspect)
        IF NOT v_tz_suspect AND v_sched_start IS NOT NULL AND v_first_in_local_time IS NOT NULL THEN
          IF NOT v_is_remote OR v_apply_remote THEN
            v_diff_min := CEIL(EXTRACT(EPOCH FROM (
              v_first_in_local_time - (v_sched_start + (v_grace * interval '1 minute'))::time
            )) / 60);
            IF v_diff_min >= v_threshold THEN
              v_is_late := true;
              v_minutes_late := v_diff_min;
            END IF;
          END IF;
        END IF;
        
        -- Determine status_code
        IF v_tz_suspect THEN
          v_status_code := 'timezone_suspect';
        ELSIF v_is_late AND v_is_incomplete THEN
          v_status_code := 'late';  -- late takes priority in code
        ELSIF v_is_late THEN
          v_status_code := 'late';
        ELSIF v_is_incomplete THEN
          v_status_code := 'incomplete';
        ELSIF v_is_remote THEN
          v_status_code := 'remote_ok';
        ELSE
          v_status_code := 'ok';
        END IF;
      END IF;
    END IF;
    
    -- ═══════════════════════════════════════════════════
    -- STEP 6: Build status_reasons (explainability)
    -- ═══════════════════════════════════════════════════
    v_status_reasons := jsonb_build_object(
      'schedule_start', v_sched_start,
      'schedule_end', v_sched_end,
      'first_punch', v_first_in_local_time,
      'last_punch', v_last_out_local_time,
      'grace_minutes', v_grace,
      'computed_minutes_late', v_minutes_late,
      'computed_minutes_worked', v_total_minutes,
      'timezone', v_tz,
      'timezone_suspect', v_tz_suspect,
      'day_off_type', v_day_off_type,
      'punch_count', v_punch_count,
      'is_scheduled', v_is_scheduled,
      'recomputed_at', now()
    );
    
    -- ═══════════════════════════════════════════════════
    -- STEP 7: Tardy upsert (only when schedule-evaluated)
    -- ═══════════════════════════════════════════════════
    IF v_is_late AND v_first_in IS NOT NULL AND v_sched_start IS NOT NULL THEN
      INSERT INTO public.tardies (
        user_id, entry_date, time_entry_id,
        expected_start_time, actual_start_time, minutes_late, timezone_suspect
      ) VALUES (
        p_user_id, cur_date, v_entry.id,
        v_sched_start, v_first_in, v_minutes_late, false
      )
      ON CONFLICT (user_id, entry_date) DO UPDATE SET
        time_entry_id = EXCLUDED.time_entry_id,
        expected_start_time = EXCLUDED.expected_start_time,
        actual_start_time = EXCLUDED.actual_start_time,
        minutes_late = EXCLUDED.minutes_late,
        timezone_suspect = false,
        updated_at = now();
    ELSIF v_tz_suspect AND v_first_in IS NOT NULL AND v_sched_start IS NOT NULL THEN
      INSERT INTO public.tardies (
        user_id, entry_date, time_entry_id,
        expected_start_time, actual_start_time, minutes_late, timezone_suspect
      ) VALUES (
        p_user_id, cur_date, v_entry.id,
        v_sched_start, v_first_in, 0, true
      )
      ON CONFLICT (user_id, entry_date) DO UPDATE SET
        time_entry_id = EXCLUDED.time_entry_id,
        expected_start_time = EXCLUDED.expected_start_time,
        actual_start_time = EXCLUDED.actual_start_time,
        minutes_late = 0,
        timezone_suspect = true,
        updated_at = now();
    ELSE
      DELETE FROM public.tardies 
        WHERE user_id = p_user_id AND entry_date = cur_date 
        AND approval_status = 'unreviewed';
    END IF;
    
    -- Tardy status lookup
    SELECT t.approval_status INTO v_tardy_status FROM public.tardies t 
      WHERE t.user_id = p_user_id AND t.entry_date = cur_date LIMIT 1;
    IF v_tardy_status IS NULL THEN v_tardy_status := 'unreviewed'; END IF;
    
    -- ═══════════════════════════════════════════════════
    -- STEP 8: Upsert attendance_day_status
    -- ═══════════════════════════════════════════════════
    INSERT INTO public.attendance_day_status (
      user_id, entry_date, schedule_expected_start, schedule_expected_end,
      is_scheduled_day, office_closed, has_punches, is_remote,
      is_absent, is_incomplete, is_late, minutes_late,
      tardy_approval_status, has_edits, has_day_comment, has_day_off, 
      timezone_suspect, status_code, status_reasons, recompute_version, computed_at
    ) VALUES (
      p_user_id, cur_date, v_sched_start, v_sched_end,
      v_is_scheduled, v_is_closed, v_has_punches, v_is_remote,
      v_is_absent, v_is_incomplete, v_is_late, v_minutes_late,
      v_tardy_status, v_has_edits, v_has_day_comment, v_has_day_off, 
      v_tz_suspect, v_status_code, v_status_reasons, v_recompute_version, now()
    )
    ON CONFLICT (user_id, entry_date) DO UPDATE SET
      schedule_expected_start = EXCLUDED.schedule_expected_start,
      schedule_expected_end = EXCLUDED.schedule_expected_end,
      is_scheduled_day = EXCLUDED.is_scheduled_day,
      office_closed = EXCLUDED.office_closed,
      has_punches = EXCLUDED.has_punches,
      is_remote = EXCLUDED.is_remote,
      is_absent = EXCLUDED.is_absent,
      is_incomplete = EXCLUDED.is_incomplete,
      is_late = EXCLUDED.is_late,
      minutes_late = EXCLUDED.minutes_late,
      tardy_approval_status = EXCLUDED.tardy_approval_status,
      has_edits = EXCLUDED.has_edits,
      has_day_comment = EXCLUDED.has_day_comment,
      has_day_off = EXCLUDED.has_day_off,
      timezone_suspect = EXCLUDED.timezone_suspect,
      status_code = EXCLUDED.status_code,
      status_reasons = EXCLUDED.status_reasons,
      recompute_version = EXCLUDED.recompute_version,
      computed_at = now();
    
    v_row_count := v_row_count + 1;
    cur_date := cur_date + 1;
  END LOOP;
  
  RETURN v_row_count;
END;
$function$;

-- ═══════════════════════════════════════════════════
-- EXPORT VIEWS
-- ═══════════════════════════════════════════════════

-- v_timesheet_day: one row per date, fully resolved
CREATE OR REPLACE VIEW public.v_timesheet_day AS
SELECT
  ads.user_id,
  ads.entry_date,
  ads.schedule_expected_start,
  ads.schedule_expected_end,
  ads.status_code,
  ads.is_scheduled_day,
  ads.office_closed,
  ads.has_day_off,
  ads.is_remote,
  ads.is_absent,
  ads.is_incomplete,
  ads.is_late,
  ads.minutes_late,
  ads.has_edits,
  ads.timezone_suspect,
  ads.tardy_approval_status,
  ads.status_reasons,
  te.total_minutes,
  te.entry_comment,
  te.is_remote AS entry_is_remote,
  (SELECT (p.punch_time AT TIME ZONE COALESCE(ads.status_reasons->>'timezone', 'America/New_York'))::time
   FROM public.punches p WHERE p.time_entry_id = te.id AND p.punch_type = 'in'
   ORDER BY p.punch_time ASC LIMIT 1) AS first_in,
  (SELECT (p.punch_time AT TIME ZONE COALESCE(ads.status_reasons->>'timezone', 'America/New_York'))::time
   FROM public.punches p WHERE p.time_entry_id = te.id AND p.punch_type = 'out'
   ORDER BY p.punch_time DESC LIMIT 1) AS last_out,
  (SELECT COUNT(*) FROM public.punches p WHERE p.time_entry_id = te.id AND p.is_edited = true) AS edit_count,
  d.type AS day_off_type,
  d.notes AS day_off_notes
FROM public.attendance_day_status ads
LEFT JOIN public.time_entries te ON te.user_id = ads.user_id AND te.entry_date = ads.entry_date
LEFT JOIN public.days_off d ON d.user_id = ads.user_id 
  AND d.date_start <= ads.entry_date AND d.date_end >= ads.entry_date
  AND d.type != 'office_closed';

-- v_exceptions: only rows where status_code != 'ok'
CREATE OR REPLACE VIEW public.v_exceptions AS
SELECT
  ads.user_id,
  ads.entry_date,
  ads.status_code,
  ads.status_reasons,
  ads.minutes_late,
  ads.tardy_approval_status,
  ads.timezone_suspect,
  t.reason_text AS tardy_reason,
  CASE
    WHEN ads.status_code = 'absent' THEN 'Add day off or enter punches'
    WHEN ads.status_code = 'late' THEN 'Review tardy – approve or add reason'
    WHEN ads.status_code = 'incomplete' THEN 'Add missing out punch'
    WHEN ads.status_code = 'timezone_suspect' THEN 'Verify timezone or confirm punch times'
    ELSE 'Review'
  END AS suggested_action
FROM public.attendance_day_status ads
LEFT JOIN public.tardies t ON t.user_id = ads.user_id AND t.entry_date = ads.entry_date
WHERE ads.status_code NOT IN ('ok', 'closure', 'day_off', 'unscheduled', 'remote_ok');

-- v_pto_ledger: weekly rows
CREATE OR REPLACE VIEW public.v_pto_ledger AS
SELECT
  pl.user_id,
  pl.period_start,
  pl.period_end,
  pl.worked_hours_raw,
  pl.worked_hours_capped,
  pl.tier_rate,
  pl.weekly_cap,
  pl.calculated_accrual,
  pl.accrual_credited,
  pl.pto_taken_hours,
  pl.running_balance,
  CASE WHEN pl.worked_hours_raw > pl.weekly_cap THEN true ELSE false END AS cap_applied
FROM public.pto_ledger_weeks pl;

-- v_audit_trail: readable audit events
CREATE OR REPLACE VIEW public.v_audit_trail AS
SELECT
  ae.user_id,
  ae.created_at AS event_timestamp,
  ae.event_type,
  ae.related_date,
  ae.related_entry_id,
  ae.event_details->>'reason' AS reason_comment,
  ae.event_details->>'old_value' AS before_value,
  ae.event_details->>'new_value' AS after_value,
  ae.event_details
FROM public.audit_events ae;

-- RLS for views is inherited from base tables, but we need policies on the views
-- Views automatically use the RLS of underlying tables, so no additional policies needed.

-- Enable RLS awareness (views use invoker's permissions by default in Supabase)
