
-- Update recompute function to auto-upsert tardies when lateness is detected
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
  v_is_absent boolean;
  v_is_incomplete boolean;
  v_is_late boolean;
  v_minutes_late int;
  v_has_edits boolean;
  v_has_day_comment boolean;
  v_tardy_status text;
  v_row_count int := 0;
  v_expected_dt timestamp;
  v_diff_min int;
  v_last_type text;
BEGIN
  cur_date := p_start_date;
  
  WHILE cur_date <= p_end_date LOOP
    v_is_scheduled := false;
    v_sched_start := null;
    v_sched_end := null;
    v_grace := 0;
    v_threshold := 1;
    v_apply_remote := false;
    
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
    v_punch_count := 0;
    v_is_incomplete := false;
    
    IF v_entry.id IS NOT NULL THEN
      v_is_remote := COALESCE(v_entry.is_remote, false);
      v_has_day_comment := v_entry.entry_comment IS NOT NULL AND v_entry.entry_comment <> '';
      
      SELECT COUNT(*) INTO v_punch_count FROM public.punches WHERE time_entry_id = v_entry.id;
      v_has_punches := v_punch_count > 0;
      
      IF v_has_punches THEN
        v_has_edits := EXISTS (SELECT 1 FROM public.punches WHERE time_entry_id = v_entry.id AND is_edited = true);
        
        SELECT p.punch_time INTO v_first_in FROM public.punches p 
          WHERE p.time_entry_id = v_entry.id AND p.punch_type = 'in' 
          ORDER BY p.punch_time ASC LIMIT 1;
        
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
    
    -- 6. Late
    v_is_late := false;
    v_minutes_late := 0;
    IF v_has_punches AND v_is_scheduled AND NOT v_is_closed AND v_sched_start IS NOT NULL AND v_first_in IS NOT NULL THEN
      IF NOT v_is_remote OR v_apply_remote THEN
        v_expected_dt := (cur_date + v_sched_start) + (v_grace * interval '1 minute');
        v_diff_min := CEIL(EXTRACT(EPOCH FROM (v_first_in - v_expected_dt)) / 60);
        IF v_diff_min >= v_threshold THEN
          v_is_late := true;
          v_minutes_late := v_diff_min;
        END IF;
      END IF;
    END IF;
    
    -- 7. Tardy: auto-upsert into tardies table when late is detected
    IF v_is_late AND v_first_in IS NOT NULL AND v_sched_start IS NOT NULL THEN
      INSERT INTO public.tardies (
        user_id, entry_date, time_entry_id,
        expected_start_time, actual_start_time, minutes_late
      ) VALUES (
        p_user_id, cur_date, v_entry.id,
        v_sched_start, v_first_in, v_minutes_late
      )
      ON CONFLICT (user_id, entry_date) DO UPDATE SET
        time_entry_id = EXCLUDED.time_entry_id,
        expected_start_time = EXCLUDED.expected_start_time,
        actual_start_time = EXCLUDED.actual_start_time,
        minutes_late = EXCLUDED.minutes_late,
        updated_at = now();
    ELSE
      -- Not late: remove any stale tardy for this date
      DELETE FROM public.tardies WHERE user_id = p_user_id AND entry_date = cur_date;
    END IF;
    
    -- 8. Tardy status (re-read after upsert)
    SELECT t.approval_status INTO v_tardy_status FROM public.tardies t 
      WHERE t.user_id = p_user_id AND t.entry_date = cur_date LIMIT 1;
    IF v_tardy_status IS NULL THEN v_tardy_status := 'unreviewed'; END IF;
    
    -- 9. Upsert attendance_day_status
    INSERT INTO public.attendance_day_status (
      user_id, entry_date, schedule_expected_start, schedule_expected_end,
      is_scheduled_day, office_closed, has_punches, is_remote,
      is_absent, is_incomplete, is_late, minutes_late,
      tardy_approval_status, has_edits, has_day_comment, has_day_off, computed_at
    ) VALUES (
      p_user_id, cur_date, v_sched_start, v_sched_end,
      v_is_scheduled, v_is_closed, v_has_punches, v_is_remote,
      v_is_absent, v_is_incomplete, v_is_late, v_minutes_late,
      v_tardy_status, v_has_edits, v_has_day_comment, v_has_day_off, now()
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
      computed_at = now();
    
    v_row_count := v_row_count + 1;
    cur_date := cur_date + 1;
  END LOOP;
  
  RETURN v_row_count;
END;
$function$;

-- We need to temporarily disable the tardy trigger to avoid infinite recursion
-- (recompute inserts tardy -> trigger calls recompute -> loop)
DROP TRIGGER IF EXISTS trg_recompute_from_tardy ON public.tardies;

-- Recreate with a guard: only fire on approval_status/reason changes, not on insert/minutes changes from recompute
CREATE OR REPLACE FUNCTION public.trigger_recompute_from_tardy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only recompute when approval status or resolved changes (user actions),
  -- not when recompute itself upserts the tardy row
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_attendance_range(OLD.user_id, OLD.entry_date, OLD.entry_date);
    RETURN OLD;
  END IF;
  
  IF TG_OP = 'UPDATE' THEN
    -- Only fire if approval-related fields changed
    IF OLD.approval_status IS DISTINCT FROM NEW.approval_status
       OR OLD.resolved IS DISTINCT FROM NEW.resolved
       OR OLD.reason_text IS DISTINCT FROM NEW.reason_text THEN
      PERFORM public.recompute_attendance_range(NEW.user_id, NEW.entry_date, NEW.entry_date);
    END IF;
    RETURN NEW;
  END IF;
  
  -- INSERT from recompute - don't re-trigger
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_recompute_from_tardy
  AFTER UPDATE ON public.tardies
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recompute_from_tardy();
