CREATE TABLE public.office_attendance_settings (
 org_id uuid PRIMARY KEY REFERENCES public.orgs(id),
 grace_minutes integer NOT NULL DEFAULT 5 CHECK(grace_minutes BETWEEN 0 AND 60),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid
);
ALTER TABLE public.office_attendance_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read office attendance settings" ON public.office_attendance_settings FOR SELECT TO authenticated
 USING(public.is_org_admin(org_id) OR EXISTS(SELECT 1 FROM public.employees e WHERE e.org_id=office_attendance_settings.org_id AND e.user_id=auth.uid()));
GRANT SELECT ON public.office_attendance_settings TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.office_attendance_settings FROM authenticated,anon;
GRANT ALL ON public.office_attendance_settings TO service_role;

-- Both legacy and versioned schedules use the office setting when configured.
CREATE OR REPLACE FUNCTION public.normalize_schedule_grace()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE office_grace integer;
BEGIN
 IF TG_TABLE_NAME='schedule_weekdays' THEN
  SELECT p.grace_minutes INTO office_grace FROM public.schedule_versions v
   JOIN public.office_attendance_settings p ON p.org_id=v.org_id WHERE v.id=NEW.schedule_version_id;
 ELSE
  SELECT p.grace_minutes INTO office_grace FROM public.employees e
   JOIN public.office_attendance_settings p ON p.org_id=e.org_id WHERE e.user_id=NEW.user_id LIMIT 1;
 END IF;
 NEW.grace_minutes:=coalesce(office_grace,greatest(0,coalesce(NEW.grace_minutes,0))+greatest(0,coalesce(NEW.threshold_minutes,1)-1));
 NEW.threshold_minutes:=1;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.set_office_attendance_grace(p_org_id uuid,p_minutes integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE person record;
BEGIN
 IF NOT public.is_org_admin(p_org_id) THEN RAISE EXCEPTION 'Only an office owner or manager can change the grace period' USING ERRCODE='42501'; END IF;
 IF p_minutes IS NULL OR p_minutes<0 OR p_minutes>60 THEN RAISE EXCEPTION 'Grace must be between 0 and 60 minutes' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text,0));
 INSERT INTO public.office_attendance_settings(org_id,grace_minutes,updated_by)
 VALUES(p_org_id,p_minutes,auth.uid()) ON CONFLICT(org_id) DO UPDATE
 SET grace_minutes=excluded.grace_minutes,updated_by=excluded.updated_by,updated_at=now();
 UPDATE public.schedule_weekdays w SET grace_minutes=p_minutes,threshold_minutes=1
 FROM public.schedule_versions v WHERE v.id=w.schedule_version_id AND v.org_id=p_org_id;
 UPDATE public.work_schedule w SET grace_minutes=p_minutes,threshold_minutes=1
 WHERE EXISTS(SELECT 1 FROM public.employees e WHERE e.org_id=p_org_id AND e.user_id=w.user_id);
 -- Stored attendance must agree with the newly shared setting as well.
 FOR person IN SELECT e.user_id,min(t.entry_date) AS start_date,max(t.entry_date) AS end_date
  FROM public.employees e JOIN public.time_entries t ON t.employee_id=e.id AND t.org_id=e.org_id
  WHERE e.org_id=p_org_id AND e.user_id IS NOT NULL GROUP BY e.user_id
 LOOP
  PERFORM public._recompute_attendance_range_internal(person.user_id,person.start_date,person.end_date);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.set_office_attendance_grace(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_office_attendance_grace(uuid,integer) TO authenticated,service_role;

