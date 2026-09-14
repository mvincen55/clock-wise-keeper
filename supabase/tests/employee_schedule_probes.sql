-- Disposable empty PostgreSQL database only; also exercised with PGlite.
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;
CREATE TABLE public.employees(id uuid PRIMARY KEY,org_id uuid,user_id uuid,timezone text);
CREATE FUNCTION public.is_org_admin(o uuid) RETURNS boolean LANGUAGE sql AS $$
  SELECT o::text = current_setting('test.org',true) AND current_setting('test.admin',true)='true'
$$;
CREATE TABLE public.schedule_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid,employee_id uuid REFERENCES employees(id),user_id uuid NOT NULL,name text,effective_start_date date NOT NULL,effective_end_date date,apply_to_remote boolean,timezone text,week_start_day integer);
ALTER TABLE schedule_versions ADD CONSTRAINT no_overlapping_schedule_versions EXCLUDE USING gist(user_id WITH =,daterange(effective_start_date,coalesce(effective_end_date,'9999-12-31'::date),'[]') WITH &&);
CREATE TABLE public.schedule_weekdays(id uuid DEFAULT gen_random_uuid(),schedule_version_id uuid REFERENCES schedule_versions(id),weekday smallint CHECK(weekday BETWEEN 0 AND 6),enabled boolean,start_time time,end_time time,grace_minutes integer,threshold_minutes integer,UNIQUE(schedule_version_id,weekday));
CREATE TABLE public.work_schedule(grace_minutes integer,threshold_minutes integer);
CREATE TABLE public.schedule_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid,employee_id uuid,schedule_version_id uuid REFERENCES schedule_versions(id),effective_start date,effective_end date);
ALTER TABLE schedule_assignments ADD CONSTRAINT no_overlapping_schedule_assignments EXCLUDE USING gist(employee_id WITH =,daterange(effective_start,coalesce(effective_end,'9999-12-31'::date),'[]') WITH &&);
INSERT INTO employees VALUES
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010',NULL,'America/New_York'),
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010',NULL,'America/New_York'),
 ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000020',NULL,'America/New_York');
INSERT INTO schedule_versions(org_id,employee_id,user_id,effective_start_date,effective_end_date) VALUES
 ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000099','2026-01-01','2026-02-01');
INSERT INTO work_schedule VALUES(5,3);
\ir ../migrations/20260914120000_employee_schedule_creation.sql
SET test.org='00000000-0000-0000-0000-000000000010';
SET test.admin='true';
DO $$
DECLARE a uuid; b uuid; rules jsonb='[{"weekday":1,"enabled":true,"start_time":"08:25","end_time":"17:00","grace_minutes":5}]';
BEGIN
  ASSERT (SELECT user_id IS NULL FROM schedule_versions), 'legacy manager identity repaired';
  ASSERT (SELECT grace_minutes=7 AND threshold_minutes=1 FROM work_schedule), 'existing late cutoff preserved';
  a:=create_employee_schedule('00000000-0000-0000-0000-000000000001','2026-08-24',NULL,'Training',false,rules);
  b:=create_employee_schedule('00000000-0000-0000-0000-000000000002','2026-08-24',NULL,'Training',false,rules);
  ASSERT (SELECT count(*)=2 FROM schedule_assignments), 'two pending employees may share dates';
  ASSERT (SELECT bool_and(user_id IS NULL) FROM schedule_versions), 'no manager login borrowed';
  BEGIN
    PERFORM create_employee_schedule('00000000-0000-0000-0000-000000000001','2026-08-24',NULL,'Duplicate',false,rules);
    RAISE EXCEPTION 'duplicate accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    INSERT INTO schedule_versions(org_id,employee_id,effective_start_date) VALUES ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','2026-08-25');
    RAISE EXCEPTION 'direct overlap accepted';
  EXCEPTION WHEN exclusion_violation THEN NULL; END;
  BEGIN
    PERFORM create_employee_schedule('00000000-0000-0000-0000-000000000001','2026-09-14',NULL,'Invalid',false,'[{"weekday":9,"enabled":true,"start_time":"08:25","end_time":"17:00"}]');
    RAISE EXCEPTION 'invalid weekday accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  ASSERT (SELECT effective_end_date IS NULL FROM schedule_versions WHERE id=a), 'failed replacement retains old version';
  ASSERT (SELECT effective_end IS NULL FROM schedule_assignments WHERE schedule_version_id=a), 'failed replacement retains old assignment';
  ASSERT (SELECT count(*)=3 FROM schedule_versions), 'failed replacement leaves no orphan';
  PERFORM create_employee_schedule('00000000-0000-0000-0000-000000000001','2026-09-14',NULL,'New',false,rules);
  ASSERT (SELECT effective_end_date='2026-09-13' FROM schedule_versions WHERE id=a), 'replacement closes previous version';
  ASSERT (SELECT effective_end='2026-09-13' FROM schedule_assignments WHERE schedule_version_id=a), 'replacement closes previous assignment';
  ASSERT (SELECT effective_end_date IS NULL FROM schedule_versions WHERE id=b), 'other employee history unchanged';
  UPDATE employees SET user_id='00000000-0000-0000-0000-000000000011' WHERE id='00000000-0000-0000-0000-000000000001';
  ASSERT (SELECT bool_and(user_id='00000000-0000-0000-0000-000000000011') FROM schedule_versions WHERE employee_id='00000000-0000-0000-0000-000000000001'), 'login acceptance links schedules';
  BEGIN
    PERFORM create_employee_schedule('00000000-0000-0000-0000-000000000003','2026-09-14',NULL,'Wrong office',false,rules);
    RAISE EXCEPTION 'cross office accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('test.admin','false',true);
  BEGIN
    PERFORM create_employee_schedule('00000000-0000-0000-0000-000000000002','2026-10-01',NULL,'Not admin',false,rules);
    RAISE EXCEPTION 'non admin accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'All employee schedule probes passed';
END $$;
-- Reproduce the live manager/creator RLS mismatch before applying the fix.
SET test.admin='true';
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY manager_read ON employees FOR SELECT TO authenticated USING(is_org_admin(org_id));
GRANT SELECT,UPDATE ON employees TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON schedule_versions,schedule_weekdays,schedule_assignments TO authenticated;
ALTER TABLE schedule_assignments ENABLE ROW LEVEL SECURITY;
SET ROLE authenticated;
DO $$ BEGIN
 ASSERT (SELECT count(*)=2 FROM employees),'manager can read office employees';
 ASSERT (SELECT count(*)=0 FROM (SELECT id FROM employees FOR UPDATE) e),'manager has no general employee update policy';
 BEGIN
 PERFORM create_employee_schedule('00000000-0000-0000-0000-000000000001','2026-10-01',NULL,'Before fix',false,'[{"weekday":1,"enabled":true,"start_time":"08:00","end_time":"17:00"}]');
 RAISE EXCEPTION 'expected old manager restriction'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
\ir ../migrations/20260914220000_manager_schedule_authorization.sql
SET ROLE authenticated;
DO $$ DECLARE v uuid; BEGIN
 v:=create_employee_schedule('00000000-0000-0000-0000-000000000001','2026-10-01',NULL,'Manager version',false,'[{"weekday":1,"enabled":true,"start_time":"08:00","end_time":"17:00"}]');
 ASSERT (SELECT count(*)=1 FROM schedule_assignments WHERE schedule_version_id=v),'non-creator manager can create and assign';
 UPDATE schedule_assignments SET effective_end='2026-10-31' WHERE schedule_version_id=v;
 ASSERT (SELECT effective_end='2026-10-31' FROM schedule_assignments WHERE schedule_version_id=v),'manager can correct an assignment in place';
 ASSERT (SELECT count(*)=0 FROM (SELECT id FROM employees FOR UPDATE) e),'fix does not widen general employee update permission';
 BEGIN
 UPDATE schedule_assignments SET employee_id='00000000-0000-0000-0000-000000000003' WHERE schedule_version_id=v;
 RAISE EXCEPTION 'cross-office assignment accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('test.admin','false',true);
 BEGIN
 PERFORM create_employee_schedule('00000000-0000-0000-0000-000000000001','2026-11-01',NULL,'Employee attempt',false,'[{"weekday":1,"enabled":true,"start_time":"08:00","end_time":"17:00"}]');
 RAISE EXCEPTION 'ordinary employee authorized'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
