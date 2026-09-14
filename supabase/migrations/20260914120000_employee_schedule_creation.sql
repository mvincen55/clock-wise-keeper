-- Schedule ownership follows the employee, including before their first login.
ALTER TABLE public.schedule_versions DROP CONSTRAINT IF EXISTS no_overlapping_schedule_versions;
ALTER TABLE public.schedule_versions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.schedule_versions ADD CONSTRAINT no_overlapping_schedule_versions
  EXCLUDE USING gist (employee_id WITH =,
    daterange(effective_start_date, COALESCE(effective_end_date, '9999-12-31'::date), '[]') WITH &&)
  WHERE (employee_id IS NOT NULL);
ALTER TABLE public.schedule_versions ADD CONSTRAINT no_overlapping_legacy_schedule_versions
  EXCLUDE USING gist (user_id WITH =,
    daterange(effective_start_date, COALESCE(effective_end_date, '9999-12-31'::date), '[]') WITH &&)
  WHERE (employee_id IS NULL);

CREATE OR REPLACE FUNCTION public.enforce_schedule_employee_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.employees;
BEGIN
  IF NEW.employee_id IS NOT NULL THEN
    SELECT * INTO e FROM public.employees WHERE id=NEW.employee_id;
    IF NOT FOUND OR e.org_id IS DISTINCT FROM NEW.org_id THEN
      RAISE EXCEPTION 'Employee does not belong to this organization' USING ERRCODE='23514';
    END IF;
    NEW.user_id := e.user_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER schedule_employee_identity BEFORE INSERT OR UPDATE ON public.schedule_versions
FOR EACH ROW EXECUTE FUNCTION public.enforce_schedule_employee_identity();

UPDATE public.schedule_versions s SET user_id=e.user_id FROM public.employees e
WHERE e.id=s.employee_id AND e.org_id=s.org_id AND s.user_id IS DISTINCT FROM e.user_id;

CREATE OR REPLACE FUNCTION public.link_employee_schedule_to_login()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.schedule_versions SET user_id=NEW.user_id
  WHERE employee_id=NEW.id AND org_id=NEW.org_id AND user_id IS DISTINCT FROM NEW.user_id;
  RETURN NEW;
END $$;
CREATE TRIGGER link_employee_schedule_to_login AFTER UPDATE OF user_id ON public.employees
FOR EACH ROW WHEN (NEW.user_id IS DISTINCT FROM OLD.user_id)
EXECUTE FUNCTION public.link_employee_schedule_to_login();

-- A single visible grace setting. Retain the legacy column for older clients
-- and the attendance engine, fixed at one minute. Preserve existing cutoffs.
CREATE OR REPLACE FUNCTION public.normalize_schedule_grace()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  NEW.grace_minutes := greatest(0, coalesce(NEW.grace_minutes,0))
    + greatest(0, coalesce(NEW.threshold_minutes,1)-1);
  NEW.threshold_minutes := 1;
  RETURN NEW;
END $$;
CREATE TRIGGER normalize_schedule_grace BEFORE INSERT OR UPDATE ON public.schedule_weekdays
FOR EACH ROW EXECUTE FUNCTION public.normalize_schedule_grace();
CREATE TRIGGER normalize_work_schedule_grace BEFORE INSERT OR UPDATE ON public.work_schedule
FOR EACH ROW EXECUTE FUNCTION public.normalize_schedule_grace();
UPDATE public.schedule_weekdays SET threshold_minutes=threshold_minutes WHERE threshold_minutes<>1;
UPDATE public.work_schedule SET threshold_minutes=threshold_minutes WHERE threshold_minutes<>1;

-- Closing old history and creating its replacement must succeed together.
-- Invoker rights retain table RLS; the explicit check restricts this to admins.
CREATE OR REPLACE FUNCTION public.create_employee_schedule(
  p_employee_id uuid, p_start date, p_end date, p_name text,
  p_apply_to_remote boolean, p_weekdays jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE e public.employees; v_id uuid;
BEGIN
  SELECT * INTO e FROM public.employees WHERE id=p_employee_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_org_admin(e.org_id) THEN
    RAISE EXCEPTION 'Only an office owner or manager can assign schedules' USING ERRCODE='42501';
  END IF;
  IF p_start IS NULL OR p_end < p_start THEN
    RAISE EXCEPTION 'End date must be on or after start date' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_weekdays) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Weekday rules are required' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_weekdays) d WHERE (d->>'enabled')::boolean) THEN
    RAISE EXCEPTION 'At least one weekday must be enabled' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schedule_versions s WHERE s.employee_id=e.id AND s.org_id=e.org_id
      AND s.effective_start_date>=p_start AND s.effective_start_date<=coalesce(p_end,'9999-12-31'::date))
    OR EXISTS (SELECT 1 FROM public.schedule_assignments a WHERE a.employee_id=e.id AND a.org_id=e.org_id
      AND a.effective_start>=p_start AND a.effective_start<=coalesce(p_end,'9999-12-31'::date)) THEN
    RAISE EXCEPTION 'This date range overlaps existing schedule history. Edit the overlapping schedule first.' USING ERRCODE='22023';
  END IF;
  UPDATE public.schedule_assignments SET effective_end=p_start-1
    WHERE employee_id=e.id AND org_id=e.org_id AND effective_start<p_start
      AND (effective_end IS NULL OR effective_end>=p_start);
  UPDATE public.schedule_versions SET effective_end_date=p_start-1
    WHERE employee_id=e.id AND org_id=e.org_id AND effective_start_date<p_start
      AND (effective_end_date IS NULL OR effective_end_date>=p_start);
  INSERT INTO public.schedule_versions (org_id,employee_id,user_id,name,effective_start_date,effective_end_date,apply_to_remote,timezone,week_start_day)
    VALUES (e.org_id,e.id,e.user_id,nullif(trim(p_name),''),p_start,p_end,coalesce(p_apply_to_remote,false),coalesce(e.timezone,'America/New_York'),1)
    RETURNING id INTO v_id;
  INSERT INTO public.schedule_weekdays (schedule_version_id,weekday,enabled,start_time,end_time,grace_minutes,threshold_minutes)
    SELECT v_id,(d->>'weekday')::smallint,(d->>'enabled')::boolean,(d->>'start_time')::time,(d->>'end_time')::time,
      greatest(0,coalesce((d->>'grace_minutes')::integer,0)),1
    FROM jsonb_array_elements(p_weekdays) d;
  INSERT INTO public.schedule_assignments (org_id,employee_id,schedule_version_id,effective_start,effective_end)
    VALUES (e.org_id,e.id,v_id,p_start,p_end);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.create_employee_schedule(uuid,date,date,text,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_employee_schedule(uuid,date,date,text,boolean,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.enforce_schedule_employee_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_employee_schedule_to_login() FROM PUBLIC;
