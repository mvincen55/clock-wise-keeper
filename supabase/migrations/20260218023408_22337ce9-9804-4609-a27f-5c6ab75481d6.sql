
-- Add unique constraint on attendance_day_status for upsert support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_day_status_user_id_entry_date_key'
  ) THEN
    ALTER TABLE public.attendance_day_status ADD CONSTRAINT attendance_day_status_user_id_entry_date_key UNIQUE (user_id, entry_date);
  END IF;
END $$;

-- Add has_day_off column if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance_day_status' AND column_name='has_day_off') THEN
    ALTER TABLE public.attendance_day_status ADD COLUMN has_day_off boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Create the deterministic recompute function
CREATE OR REPLACE FUNCTION public.recompute_attendance_range(p_user_id uuid, p_start_date date, p_end_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    
    -- 7. Tardy status
    SELECT t.approval_status INTO v_tardy_status FROM public.tardies t 
      WHERE t.user_id = p_user_id AND t.entry_date = cur_date LIMIT 1;
    IF v_tardy_status IS NULL THEN v_tardy_status := 'unreviewed'; END IF;
    
    -- 8. Upsert
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
$$;

-- TRIGGERS

-- Punch trigger
CREATE OR REPLACE FUNCTION public.trigger_recompute_from_punch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_entry_date date;
  v_user_id uuid;
  v_entry_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN v_entry_id := OLD.time_entry_id;
  ELSE v_entry_id := NEW.time_entry_id;
  END IF;
  
  SELECT te.entry_date, te.user_id INTO v_entry_date, v_user_id
    FROM public.time_entries te WHERE te.id = v_entry_id;
  
  IF v_entry_date IS NOT NULL AND v_user_id IS NOT NULL THEN
    PERFORM public.recompute_attendance_range(v_user_id, v_entry_date, v_entry_date);
  END IF;
  
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_punch ON public.punches;
CREATE TRIGGER trg_recompute_punch
AFTER INSERT OR UPDATE OR DELETE ON public.punches
FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_from_punch();

-- Time entry trigger
CREATE OR REPLACE FUNCTION public.trigger_recompute_from_time_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_attendance_range(OLD.user_id, OLD.entry_date, OLD.entry_date);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_attendance_range(NEW.user_id, NEW.entry_date, NEW.entry_date);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_time_entry ON public.time_entries;
CREATE TRIGGER trg_recompute_time_entry
AFTER INSERT OR UPDATE OR DELETE ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_from_time_entry();

-- Days off trigger
CREATE OR REPLACE FUNCTION public.trigger_recompute_from_days_off()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_attendance_range(OLD.user_id, OLD.date_start, OLD.date_end);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_attendance_range(NEW.user_id, NEW.date_start, NEW.date_end);
    IF TG_OP = 'UPDATE' AND (OLD.date_start <> NEW.date_start OR OLD.date_end <> NEW.date_end) THEN
      PERFORM public.recompute_attendance_range(NEW.user_id, OLD.date_start, OLD.date_end);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_days_off ON public.days_off;
CREATE TRIGGER trg_recompute_days_off
AFTER INSERT OR UPDATE OR DELETE ON public.days_off
FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_from_days_off();

-- Office closure trigger
CREATE OR REPLACE FUNCTION public.trigger_recompute_from_closure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_attendance_range(OLD.user_id, OLD.closure_date, OLD.closure_date);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_attendance_range(NEW.user_id, NEW.closure_date, NEW.closure_date);
    IF TG_OP = 'UPDATE' AND OLD.closure_date <> NEW.closure_date THEN
      PERFORM public.recompute_attendance_range(NEW.user_id, OLD.closure_date, OLD.closure_date);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_closure ON public.office_closures;
CREATE TRIGGER trg_recompute_closure
AFTER INSERT OR UPDATE OR DELETE ON public.office_closures
FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_from_closure();

-- Tardy trigger
CREATE OR REPLACE FUNCTION public.trigger_recompute_from_tardy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_attendance_range(OLD.user_id, OLD.entry_date, OLD.entry_date);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_attendance_range(NEW.user_id, NEW.entry_date, NEW.entry_date);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_tardy ON public.tardies;
CREATE TRIGGER trg_recompute_tardy
AFTER INSERT OR UPDATE OR DELETE ON public.tardies
FOR EACH ROW EXECUTE FUNCTION public.trigger_recompute_from_tardy();
