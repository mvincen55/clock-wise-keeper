
-- Add time_verified flag to punches table
ALTER TABLE public.punches
  ADD COLUMN IF NOT EXISTS time_verified boolean NOT NULL DEFAULT false;

-- Update recompute to respect time_verified
-- The recompute function's suspect logic should skip days where ALL punches are time_verified
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
  v_entry record;
  v_punch_count int;
  v_has_punches boolean;
  v_is_remote boolean;
  v_first_in timestamptz;
  v_first_in_local timestamp;
  v_first_in_local_time time;
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
BEGIN
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
    
    -- 1. Resolve schedule
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
    
    -- 2. Check office closure
    v_is_closed := EXISTS (SELECT 1 FROM public.office_closures WHERE user_id = p_user_id AND closure_date = cur_date);
    
    -- 3. Check day off coverage
    v_has_day_off := EXISTS (SELECT 1 FROM public.days_off WHERE user_id = p_user_id AND date_start <= cur_date AND date_end >= cur_date);
    
    -- 4. Get time entry
    SELECT * INTO v_entry FROM public.time_entries te WHERE te.user_id = p_user_id AND te.entry_date = cur_date LIMIT 1;
    
    v_has_punches := false;
    v_is_remote := false;
    v_has_day_comment := false;
    v_has_edits := false;
    v_first_in := null;
    v_first_in_local := null;
    v_first_in_local_time := null;
    v_punch_count := 0;
    v_is_incomplete := false;
    
    IF v_entry.id IS NOT NULL THEN
      v_is_remote := COALESCE(v_entry.is_remote, false);
      v_has_day_comment := v_entry.entry_comment IS NOT NULL AND v_entry.entry_comment <> '';
      
      SELECT COUNT(*) INTO v_punch_count FROM public.punches WHERE time_entry_id = v_entry.id;
      v_has_punches := v_punch_count > 0;
      
      IF v_has_punches THEN
        v_has_edits := EXISTS (SELECT 1 FROM public.punches WHERE time_entry_id = v_entry.id AND is_edited = true);
        
        -- Check if ALL punches for this entry are time_verified
        SELECT NOT EXISTS (
          SELECT 1 FROM public.punches WHERE time_entry_id = v_entry.id AND time_verified = false
        ) INTO v_all_verified;
        
        -- Get earliest IN punch where LOCAL DATE matches entry_date
        SELECT p.punch_time, 
               p.punch_time AT TIME ZONE v_tz,
               (p.punch_time AT TIME ZONE v_tz)::time
          INTO v_first_in, v_first_in_local, v_first_in_local_time
          FROM public.punches p 
          WHERE p.time_entry_id = v_entry.id 
            AND p.punch_type = 'in'
            AND (p.punch_time AT TIME ZONE v_tz)::date = cur_date
          ORDER BY p.punch_time ASC LIMIT 1;
        
        -- Fallback
        IF v_first_in IS NULL THEN
          SELECT p.punch_time,
                 p.punch_time AT TIME ZONE v_tz,
                 (p.punch_time AT TIME ZONE v_tz)::time
            INTO v_first_in, v_first_in_local, v_first_in_local_time
            FROM public.punches p 
            WHERE p.time_entry_id = v_entry.id AND p.punch_type = 'in'
            ORDER BY p.punch_time ASC LIMIT 1;
        END IF;
        
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
    
    -- 5. Absent
    v_is_absent := v_is_scheduled AND NOT v_is_closed AND NOT v_has_day_off AND NOT v_has_punches;
    
    -- 6. Timezone suspect detection — SKIP if all punches are time_verified
    IF NOT v_all_verified AND v_first_in_local_time IS NOT NULL AND v_sched_start IS NOT NULL THEN
      IF (v_first_in_local_time < '03:00:00'::time OR v_first_in_local_time > '23:00:00'::time) THEN
        v_sched_start_minutes := EXTRACT(HOUR FROM v_sched_start) * 60 + EXTRACT(MINUTE FROM v_sched_start);
        v_actual_minutes := EXTRACT(HOUR FROM v_first_in_local_time) * 60 + EXTRACT(MINUTE FROM v_first_in_local_time);
        IF ABS(v_actual_minutes - v_sched_start_minutes) > 480 THEN
          v_tz_suspect := true;
        END IF;
      END IF;
    END IF;
    
    -- 7. Late (skip if timezone_suspect)
    v_is_late := false;
    v_minutes_late := 0;
    IF NOT v_tz_suspect AND v_has_punches AND v_is_scheduled AND NOT v_is_closed 
       AND v_sched_start IS NOT NULL AND v_first_in_local_time IS NOT NULL THEN
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
    
    -- 8. Tardy upsert
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
    
    -- 9. Tardy status
    SELECT t.approval_status INTO v_tardy_status FROM public.tardies t 
      WHERE t.user_id = p_user_id AND t.entry_date = cur_date LIMIT 1;
    IF v_tardy_status IS NULL THEN v_tardy_status := 'unreviewed'; END IF;
    
    -- 10. Upsert attendance_day_status
    INSERT INTO public.attendance_day_status (
      user_id, entry_date, schedule_expected_start, schedule_expected_end,
      is_scheduled_day, office_closed, has_punches, is_remote,
      is_absent, is_incomplete, is_late, minutes_late,
      tardy_approval_status, has_edits, has_day_comment, has_day_off, timezone_suspect, computed_at
    ) VALUES (
      p_user_id, cur_date, v_sched_start, v_sched_end,
      v_is_scheduled, v_is_closed, v_has_punches, v_is_remote,
      v_is_absent, v_is_incomplete, v_is_late, v_minutes_late,
      v_tardy_status, v_has_edits, v_has_day_comment, v_has_day_off, v_tz_suspect, now()
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
      computed_at = now();
    
    v_row_count := v_row_count + 1;
    cur_date := cur_date + 1;
  END LOOP;
  
  RETURN v_row_count;
END;
$function$;
