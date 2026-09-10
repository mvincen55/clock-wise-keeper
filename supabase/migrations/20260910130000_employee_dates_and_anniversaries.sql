ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS real_hire_date date;
COMMENT ON COLUMN public.employees.real_hire_date IS 'Confirmed actual employment start date for milestone anniversaries. NULL means unknown; never substitute an import start date.';
-- An employee can have editable PTO policy before an authentication account is linked.
ALTER TABLE public.pto_settings ALTER COLUMN user_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pto_settings_employee_uidx ON public.pto_settings(employee_id);

ALTER TABLE public.pto_snapshots ALTER COLUMN user_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pto_snapshots_employee_date_uidx ON public.pto_snapshots(employee_id,snapshot_date);

CREATE TABLE IF NOT EXISTS public.employee_anniversary_reminders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
 employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
 recipient_user_id uuid NOT NULL,
 anniversary_date date NOT NULL,
 milestone_years int NOT NULL CHECK (milestone_years IN (1,5,10,15,20)),
 reminder_days int NOT NULL CHECK (reminder_days IN (30,7,0)),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(employee_id,recipient_user_id,anniversary_date,reminder_days)
);
ALTER TABLE public.employee_anniversary_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anniversary_admin_read ON public.employee_anniversary_reminders;
CREATE POLICY anniversary_admin_read ON public.employee_anniversary_reminders FOR SELECT TO authenticated USING(public.is_org_admin(org_id));
GRANT SELECT ON public.employee_anniversary_reminders TO authenticated;

CREATE OR REPLACE FUNCTION public.send_employee_anniversary_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $fn$
DECLARE v_today date := (now() AT TIME ZONE 'America/New_York')::date; v_count int;
BEGIN
 WITH upcoming AS (
  SELECT e.id employee_id,e.org_id,e.display_name,m.y milestone_years,
         (e.real_hire_date + make_interval(years=>m.y))::date anniversary_date
  FROM public.employees e CROSS JOIN (VALUES(1),(5),(10),(15),(20)) m(y)
  WHERE e.real_hire_date IS NOT NULL AND e.employment_status='active'
 ), due AS (
  SELECT u.*,om.user_id recipient_user_id,
         CASE WHEN u.anniversary_date=v_today THEN 0 WHEN u.anniversary_date-v_today<=7 THEN 7 ELSE 30 END reminder_days
  FROM upcoming u JOIN public.org_members om ON om.org_id=u.org_id
  WHERE om.status='active' AND om.role IN ('owner','manager')
    AND u.anniversary_date BETWEEN v_today AND v_today+30
 ), claimed AS (
  INSERT INTO public.employee_anniversary_reminders(org_id,employee_id,recipient_user_id,anniversary_date,milestone_years,reminder_days)
  SELECT org_id,employee_id,recipient_user_id,anniversary_date,milestone_years,reminder_days FROM due
  ON CONFLICT(employee_id,recipient_user_id,anniversary_date,reminder_days) DO NOTHING
  RETURNING *
 )
 INSERT INTO public.notifications(org_id,recipient_user_id,notification_type,title,message,related_table,related_id)
 SELECT c.org_id,c.recipient_user_id,'employee_anniversary',
        e.display_name || ': ' || c.milestone_years || '-year work anniversary',
        'Work anniversary ' || CASE WHEN c.anniversary_date=v_today THEN 'today' ELSE 'on ' || to_char(c.anniversary_date,'Mon FMDD, YYYY') END || '. Based on the confirmed real start date. Plan recognition with the management team.',
        'employees',c.employee_id
 FROM claimed c JOIN public.employees e ON e.id=c.employee_id;
 GET DIAGNOSTICS v_count = ROW_COUNT;
 RETURN v_count;
END;
$fn$;
REVOKE ALL ON FUNCTION public.send_employee_anniversary_reminders() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.send_employee_anniversary_reminders() TO service_role;
SELECT cron.schedule('employee-anniversaries-daily','0 13 * * *','SELECT public.send_employee_anniversary_reminders();');
